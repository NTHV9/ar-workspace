import {OperaError,type OperaReader} from './client';
import {amountCents} from './normalize';
import {collectPages,verifiedNextCursor} from './pagination';
import {historyRootCount} from './history-count';
type Row=Record<string,unknown>;
function object(v:unknown):Row{if(!v||typeof v!=='object'||Array.isArray(v))throw new OperaError('invalid_response');return v as Row;}
export const transactionId=(r:Row)=>String(r.transactionNo??'');
/** Only compare accounting and identity fields; presentation/object-key ordering is irrelevant. */
export function invoiceFingerprint(r:Row){return JSON.stringify([transactionId(r),r.hotelId??null,String(r.invoiceNo??''),String(r.folioNo??''),r.reservationId?String(object(r.reservationId).id):null,r.transactionDate,r.folioDate??null,...['originalAmount','amount','payments','balance'].map(k=>amountCents(r[k],'THB')),String(r.parentInvoiceNo??''),r.compressed??null,r.printed===true]);}
export async function readScopedInvoiceHistory(reader:Pick<OperaReader,'invoiceHistory'>,hotel:string,accountId:string,numbers:string[]){
 return collectPages(async(offset,limit)=>{
  const p=object(await reader.invoiceHistory(accountId,numbers,offset,limit));if(!Array.isArray(p.details))throw new OperaError('invalid_response');const rows:Row[]=[];
  for(const v of p.details){const g=object(v);if(g.hotelId!==hotel||object(g.accountId).id!==accountId||g.invoices!==undefined&&!Array.isArray(g.invoices))throw new OperaError('invalid_response',undefined,'history_scope');for(const r of (g.invoices??[]) as unknown[]){const row=object(r);if(row.hotelId!==undefined&&row.hotelId!==hotel)throw new OperaError('invalid_response',undefined,'history_scope');rows.push(row);}}
  return {rows,logicalCount:historyRootCount(rows.map(value=>({kind:'invoice',value}))),hasMore:p.hasMore as boolean|undefined,totalResults:p.totalResults as number|undefined,nextOffset:rows.length===0&&p.hasMore===false&&p.totalResults===0?undefined:verifiedNextCursor(p,offset,limit)};
 },r=>transactionId(r),20);
}
export function currentFingerprint(account:Row){if(!Array.isArray(account.invoices))throw new OperaError('invalid_response');return JSON.stringify([account.hotelId,object(account.accountId).id,amountCents(account.balance??object(account.summary).total,'THB'),account.invoices.map(object).map(invoiceFingerprint).sort()]);}
/** Missing Current rows may be restored only from a complete, scoped history set. */
export function printedCandidates(account:Row,history:Row[]):Row[]{
 if(!Array.isArray(account.invoices))throw new OperaError('invalid_response');const current=account.invoices.map(object),seen=new Set(current.map(transactionId));
 const open=history.filter(r=>amountCents(r.balance,'THB')!==0),h=new Map(open.map(r=>[transactionId(r),r]));
 if(h.size!==open.length)return [];
 // All Current open rows must still exist unchanged; never repair a conflicting balance.
 if(current.some(r=>amountCents(r.balance,'THB')!==0&&(!h.has(transactionId(r))||amountCents(h.get(transactionId(r))!.balance,'THB')!==amountCents(r.balance,'THB'))))return [];
 const extra=open.filter(r=>!seen.has(transactionId(r)));
 if(!extra.length||extra.some(r=>r.printed!==true||typeof r.compressed!=='boolean'||!/^\d+$/.test(String(r.invoiceNo??''))||!transactionId(r)))return [];
 // Root balances avoid counting compressed child amounts a second time.
 const allHistory=new Map(history.map(r=>[transactionId(r),r]));
 if(allHistory.size!==history.length||current.some(r=>r.parentInvoiceNo!=null&&String(r.parentInvoiceNo)!==String(allHistory.get(transactionId(r))?.parentInvoiceNo??'')))return [];
 let total=0;for(const r of [...current,...extra].filter(r=>(allHistory.get(transactionId(r))??r).parentInvoiceNo==null)){total+=amountCents(r.balance,'THB');if(!Number.isSafeInteger(total))return [];}
 if(total!==amountCents(account.balance??object(account.summary).total,'THB'))return [];
 return extra;
}
