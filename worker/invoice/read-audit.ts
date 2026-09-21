import {OperaError} from '../opera/client';
import type {DocumentInvoice} from '../documents/native-invoice';
import {readInvoicePacket} from './read';
import {invoiceModel,record} from './model';

function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([k])=>k!=='links').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
/** Control-plane, read-only diagnostic. Never returns source rows or identifiers. */
export async function auditInvoiceRead(reader:Parameters<typeof readInvoicePacket>[0],manifest:DocumentInvoice){
 let stage='start';const calls:Record<string,number>={},pages:Record<string,unknown>[]=[],seen=new Map<string,string>();
 let postingCodes:Record<string,unknown>[]=[],postingRows:Record<string,unknown>[]=[];const netRows:Record<string,unknown>[]=[];
 const taxClasses=new Map<string,{code:unknown;type:unknown;count:number;omittedTaxes:number;equalNetGross:number}>();
 const directGroups=()=>{
  const groups=new Map<string,{rows:number;taxRows:number;noCheck:boolean;base:number;vat:number}>(),byId=new Map(netRows.map(e=>[String(record(e.posting).transactionNo),e]));
  for(const row of postingRows){const net=byId.get(String(row.transactionNo));if(!net||record(net.posting).transactionType==='Wrapper'||!net.postingBreakdown)continue;
   const b=record(net.postingBreakdown);if(b.taxes!==undefined)continue;
   const code=postingCodes.find(c=>c.transactionCode===row.transactionCode),isVat=code?.transactionGroup==='TAX'&&/\bvat\b/i.test(String(code.description));
   const key=JSON.stringify([row.transactionDate,row.checkNo]),group=groups.get(key)??{rows:0,taxRows:0,noCheck:!String(row.checkNo??'').trim(),base:0,vat:0};group.rows++;
   const amount=Math.round(Number(record(b.grossAmount).amount)*100);if(isVat){group.taxRows++;group.vat+=amount;}else group.base+=amount;groups.set(key,group);
  }return [...groups.values()];
 };
 const observed=new Proxy(reader,{get(target,key){
  const value=Reflect.get(target,key);
  if(typeof value!=='function')return value;
  return async(...args:unknown[])=>{
   stage=String(key);calls[stage]=(calls[stage]??0)+1;
   const result:unknown=await Reflect.apply(value,target,args);
   if(key==='invoicePostings'){const raw=record(result);postingRows=(raw.invoicePostingsDetails as unknown[]).map(record);postingCodes=(raw.trxCodesInfo as unknown[]).map(record).map(c=>({hotelId:c.hotelId,transactionCode:c.transactionCode,description:c.description,transactionGroup:c.transactionGroup}));}
   if(key==='invoicePostingBreakdown'){
    const raw=record(result),rows=Array.isArray(raw.financialPostings)?raw.financialPostings.map(record):[];
    netRows.push(...rows);
    const local=new Set<string>();let withinPage=0,acrossPages=0,changedDuplicates=0,missingIds=0;
    for(const row of rows){const id=String(record(row.posting).transactionNo??'');if(!id)missingIds++;const content=canonical(row);
     const posting=record(row.posting),breakdown=row.postingBreakdown?record(row.postingBreakdown):{},classKey=String(posting.transactionCode)+':'+String(posting.transactionType);
     const category=taxClasses.get(classKey)??{code:posting.transactionCode,type:posting.transactionType,count:0,omittedTaxes:0,equalNetGross:0};category.count++;if(breakdown.taxes===undefined)category.omittedTaxes++;if(canonical(breakdown.netAmount)===canonical(breakdown.grossAmount))category.equalNetGross++;taxClasses.set(classKey,category);
     if(local.has(id))withinPage++;else if(seen.has(id))acrossPages++;
     if(seen.has(id)&&seen.get(id)!==content)changedDuplicates++;
     local.add(id);seen.set(id,content);
    }
    pages.push({requestedOffset:args[4],offset:raw.offset,limit:raw.limit,count:raw.count,rows:rows.length,total:raw.totalResults,hasMore:raw.hasMore,withinPage,acrossPages,changedDuplicates,missingIds});
   }
   return result;
  };
 }});
 try{const packet=await readInvoicePacket(observed,manifest);stage='model';const model=invoiceModel(packet);
  return {ok:true,stage,calls,pages,lines:model.lines.length,gross:model.gross,vat:model.vat,outstanding:model.outstanding};
 }catch(error){return {ok:false,stage,calls,pages,postingCodes,taxClasses:[...taxClasses.values()],directGroups:directGroups(),error:error instanceof OperaError?error.code:error instanceof Error&&/^document_[a-z_]+$/.test(error.message)?error.message:'invalid_response'};}
}
