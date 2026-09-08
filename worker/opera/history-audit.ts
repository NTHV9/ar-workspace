import { OperaError, type OperaReader } from './client';
import { asObject } from '../refresh/read-snapshot';
import { verifiedNextCursor } from './pagination';

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
