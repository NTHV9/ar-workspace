import { OperaError, type OperaReader } from './client';
import { asObject } from '../refresh/read-snapshot';
import { verifiedNextCursor } from './pagination';

export async function auditHistoryWindow(reader:OperaReader,hotel:string,accountId:string,offset:number) {
  if(!Number.isSafeInteger(offset)||offset<0)throw new OperaError('invalid_request');
  const read=async(start:number,limit:number)=>{
    const p=asObject(await reader.history(accountId,start,limit));
    if(!Array.isArray(p.details))throw new OperaError('invalid_response');
    const rows:{kind:string;row:Record<string,unknown>}[]=[];
    for(const raw of p.details){const g=asObject(raw);if(g.hotelId!==hotel||asObject(g.accountId).id!==accountId)throw new OperaError('invalid_response');
      for(const kind of ['invoices','payments'])for(const value of (g[kind]??[]) as unknown[])rows.push({kind,row:asObject(value)});
    }
    return {rows,total:Number(p.totalResults)};
  };
  const initial=await read(offset,20),repeat=await read(offset,20);
  const key=(r:{kind:string;row:Record<string,unknown>})=>r.kind+':'+r.row.transactionNo;
  const original=new Set(initial.rows.map(key));const single=new Set<string>();const expanded=[];
  for(let pos=offset;pos<Math.min(offset+20,initial.total);pos++){
    const result=await read(pos,1);for(const row of result.rows)single.add(key(row));
    if(result.rows.length>1){
      const parents=result.rows.filter(r=>r.row.compressed===true);
      expanded.push({position:pos,rows:result.rows.length,compressedParents:parents.length,
        parentLinkedChildren:result.rows.filter(r=>r.row.parentInvoiceNo!==undefined&&parents.some(p=>p.row.invoiceNo===r.row.parentInvoiceNo)).length,
        transactionLinkedChildren:result.rows.filter(r=>r.row.parentInvoiceNo!==undefined&&parents.some(p=>p.row.transactionNo===r.row.parentInvoiceNo)).length,
        parentFieldPresent:result.rows.filter(r=>r.row.parentInvoiceNo!==undefined).length,
        parentZero:parents.every(p=>asObject(p.row.balance).amount===0),
        childBalancesNetZero:Math.round(result.rows.filter(r=>r.row.compressed!==true).reduce((s,r)=>s+Number(asObject(r.row.balance).amount),0)*100)===0,
        fields:[...new Set(result.rows.flatMap(r=>Object.keys(r.row)))].sort()});
    }
  }
  return {reported:initial.total,windowOffset:offset,windowRows:initial.rows.length,repeatIdentical:JSON.stringify(initial)===JSON.stringify(repeat),singleRows:single.size,
    onlyWindow:[...original].filter(k=>!single.has(k)).length,onlySingle:[...single].filter(k=>!original.has(k)).length,expanded};
}

/** Connector-only investigation: GETs only; no business publication or raw output. */
export async function auditHistory(reader:OperaReader,hotel:string,accountId:string) {
  const scan=async(limit:number)=>{
    const members=new Map<string,string>();const categories:Record<string,number>={};
    const pages:{offset:number;rows:number;invoices:number;payments:number;categories:Record<string,number>}[]=[];
    let offset=0,total:number|undefined,duplicates=0;
    for(let pageNo=0;pageNo<1000;pageNo++){
      const page=asObject(await reader.history(accountId,offset,limit));
      if(!Array.isArray(page.details)||typeof page.totalResults!=='number')throw new OperaError('invalid_response');
      if(total!==undefined&&total!==page.totalResults)throw new OperaError('pagination_changed');total=page.totalResults;
      let count=0,invoices=0,payments=0;const pageCategories:Record<string,number>={};
      for(const value of page.details){const group=asObject(value);
        if(group.hotelId!==hotel||asObject(group.accountId).id!==accountId)throw new OperaError('invalid_response');
        for(const kind of ['invoices','payments'] as const){
          if(group[kind]!==undefined&&!Array.isArray(group[kind]))throw new OperaError('invalid_response');
          for(const item of (group[kind]??[]) as unknown[]){const row=asObject(item);const txn=row.transactionNo;
            if(!['number','string'].includes(typeof txn))throw new OperaError('invalid_response');
            const key=kind+':'+txn;if(members.has(key))duplicates++;
            members.set(key,JSON.stringify(row));count++;if(kind==='invoices')invoices++;else payments++;
            const type=['Normal','Credit','OldBalance','PasserBy'].includes(String(row.invoiceType))?row.invoiceType:row.invoiceType===undefined?'absent':'other';
            const zero=row.balance?asObject(row.balance).amount===0:null;
            const category=JSON.stringify({kind,type,zero,negativeId:Number(txn)<0,transferredIn:row.transferredIn===true,transferredOut:row.transferredOut===true,compressed:row.compressed===true});
            categories[category]=(categories[category]??0)+1;pageCategories[category]=(pageCategories[category]??0)+1;
          }
        }
      }
      pages.push({offset,rows:count,invoices,payments,categories:pageCategories});
      if(page.hasMore===false)return {members,total,duplicates,pages,categories};
      if(page.hasMore!==true||!count)throw new OperaError('pagination_incomplete');
      offset=verifiedNextCursor(page,offset,limit);
    }
    throw new OperaError('pagination_incomplete');
  };
  const first=await scan(20),second=await scan(10);
  const onlyFirst=[...first.members.keys()].filter(k=>!second.members.has(k));
  const onlySecond=[...second.members.keys()].filter(k=>!first.members.has(k));
  return {reported:first.total,observed:first.members.size,secondReported:second.total,secondObserved:second.members.size,
    duplicates:first.duplicates+second.duplicates,onlyFirst:onlyFirst.length,onlySecond:onlySecond.length,
    changedRows:[...first.members].filter(([k,v])=>second.members.has(k)&&second.members.get(k)!==v).length,
    categories:first.categories,oversized20:first.pages.filter(p=>p.rows>20),oversized10:second.pages.filter(p=>p.rows>10),pages20:first.pages.length,pages10:second.pages.length};
}
