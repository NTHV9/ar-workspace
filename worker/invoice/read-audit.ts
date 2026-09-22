import {OperaError} from '../opera/client';
import type {DocumentInvoice} from '../documents/native-invoice';
import {readInvoicePacket} from './read';
import {invoiceModel,record} from './model';

function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([k])=>k!=='links').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
function dataShape(value:unknown,depth=0):unknown {if(value===null)return 'null';if(depth>5)return typeof value;if(Array.isArray(value))return {count:value.length,item:value.length?dataShape(value[0],depth+1):null};if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='links').map(([key,v])=>[key,dataShape(v,depth+1)]));return typeof value;}
/** Control-plane, read-only diagnostic. Never returns source rows or identifiers. */
export async function auditInvoiceRead(reader:Parameters<typeof readInvoicePacket>[0],manifest:DocumentInvoice){
 if(!manifest.reservation_id||!manifest.folio_no||!manifest.folio_date){
  try{
   const scope={hotel:manifest.hotel as Parameters<typeof reader.financialTransactionDetail>[0]['hotel'],accountId:manifest.account_id,transactionId:manifest.id},a=record(record(await reader.account(manifest.account_id)).accountDetails),detail=record(await reader.financialTransactionDetail(scope));
   if(a.hotelId!==manifest.hotel||String(record(a.accountId).id)!==manifest.account_id||!Array.isArray(detail.details)||detail.details.length!==1)throw Error('scope');const d=record(detail.details[0]);if(d.hotelId!==manifest.hotel||String(record(d.accountId).id)!==manifest.account_id)throw Error('scope');
   const matches=Array.isArray(d.invoices)?d.invoices.map(record).filter(i=>String(i.transactionNo)===manifest.id&&String(i.invoiceNo)===manifest.invoice_no):[];if(matches.length!==1)throw Error('scope');
   const i=matches[0],postings=record(await reader.invoicePostings({...scope,invoiceNo:manifest.invoice_no!})),p=Array.isArray(postings.invoicePostingsDetails)?postings.invoicePostingsDetails.map(record):[];
   const transactions=p.length&&p.length<=40?record(await reader.invoiceTransactionDetails(p.map(t=>String(t.transactionNo)))):undefined;
   return {ok:false,stage:'ar-selector',error:'document_invoice_selector_missing',selectorAudit:{invoiceShape:dataShape(i),invoiceType:i.invoiceType,hasReservation:!!i.reservationId,hasFolio:!!i.folioNo,hasFolioDate:!!i.folioDate,hasWindow:!!i.internalFolioWindowID,balanceMatches:record(i.balance).amount===manifest.open,postingCount:p.length,postingsShape:dataShape(postings),transactionShape:dataShape(transactions),transactionClasses:Array.isArray(transactions?.transactions)?transactions.transactions.map(record).map(t=>({selected:p.some(row=>String(row.transactionNo)===String(t.transactionNo)),type:t.transactionType,code:t.transactionCode,deferredTax:t.deferredTax,arInvoiceMatches:String(record(t.aRInfo??{}).invoiceNo)===manifest.invoice_no,arAccountMatches:String(record(t.aRInfo??{}).accountNumber)===String(a.accountNo),debit:t.debitAmount,credit:t.creditAmount})):undefined}};
  }catch(error){return {ok:false,stage:'ar-selector',error:error instanceof OperaError?error.code:'document_probe_selector_unavailable'};}
 }
 let stage='start';const calls:Record<string,number>={},pages:Record<string,unknown>[]=[],queries:Record<string,unknown>[]=[],seen=new Map<string,string>();
 let postingCodes:Record<string,unknown>[]=[],postingRows:Record<string,unknown>[]=[],accountMetadata:Record<string,unknown>={};const netRows:Record<string,unknown>[]=[];
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
   if(key==='invoicePostingBreakdown')queries.push({window:args[1],spanDays:(Date.parse(String(args[3]))-Date.parse(String(args[2])))/86400000,offset:args[4],limit:args[5]});
   const result:unknown=await Reflect.apply(value,target,args);
   if(key==='account')accountMetadata=record(record(result).accountDetails);
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
 try{const packet=await readInvoicePacket(observed,manifest);netRows.splice(0,netRows.length,...packet.taxRows.map(record));stage='model';const model=invoiceModel(packet);
  return {ok:true,stage,calls,pages,lines:model.lines.length,gross:model.gross,vat:model.vat,outstanding:model.outstanding};
 }catch(error){const covered=new Set(netRows.map(e=>String(record(e.posting).transactionNo)));const missing=postingRows.filter(p=>!covered.has(String(p.transactionNo)));let missingDetail:unknown;
  if(error instanceof Error&&error.message==='document_invoice_tax_coverage_missing'&&missing.length&&missing.length<=40){try{const detail=record(await reader.invoiceTransactionDetails(missing.map(p=>String(p.transactionNo))));missingDetail={accountKeys:Object.keys(accountMetadata),shape:dataShape(detail),classes:Array.isArray(detail.transactions)?detail.transactions.map(record).map(t=>({selected:missing.some(p=>String(p.transactionNo)===String(t.transactionNo)),code:t.transactionCode,type:t.transactionType,deferredTax:t.deferredTax,holdingLedger:t.holdingLedgerTransaction,arInvoiceMatches:String(record(t.aRInfo??{}).invoiceNo)===manifest.invoice_no,arAccountMatches:String(record(t.aRInfo??{}).accountNumber)===String(accountMetadata.accountNo),folioMatches:String(t.folioNo)===manifest.folio_no,debit:t.debitAmount,credit:t.creditAmount,posted:t.postedAmount,subPostingsShape:dataShape(t.subPostings)})):undefined};}catch{missingDetail={unavailable:true};}}
  return {ok:false,stage,calls,pages,queries,coverage:{selected:postingRows.length,matched:postingRows.length-missing.length,missingCodes:[...new Set(missing.map(p=>p.transactionCode))]},missingDetail,postingCodes,taxClasses:[...taxClasses.values()],directGroups:directGroups(),...(error instanceof OperaError?{providerStatus:error.upstreamStatus,providerValidation:error.providerMessage}:{}),error:error instanceof OperaError?error.code:error instanceof Error&&/^document_[a-z_]+$/.test(error.message)?error.message:'invalid_response'};}
}
