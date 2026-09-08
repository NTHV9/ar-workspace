import { OperaError, type OperaReader } from '../opera/client';
import { collectPages,verifiedNextCursor } from '../opera/pagination';
import { normalizeAccount, amountCents, type AccountSnapshot } from '../opera/normalize';
import type { PreviousInvoice } from './backend';
type Row=Record<string,unknown>;
function nextCursor(page:Row,offset:number,limit:number,rows:number) {
  // An explicitly empty final result needs no next cursor; it is not proof of any
  // individual invoice's zero balance. Missing invoices still use explicit history.
  if(rows===0&&page.totalResults===0&&page.hasMore===false)return undefined;
  return verifiedNextCursor(page,offset,limit);
}
export function asObject(value:unknown):Row {if(!value||typeof value!=='object'||Array.isArray(value))throw new OperaError('invalid_response');return value as Row;}
function id(value:unknown):string {const v=asObject(value).id;if(typeof v!=='string'||!v)throw new OperaError('invalid_response');return v;}
export async function discoverAccountIds(reader:OperaReader,hotel:string):Promise<string[]> {
  const rows=await collectPages(async(offset,limit)=>{
    const page=asObject(await reader.accounts(offset,limit));
    if(!Array.isArray(page.accountsDetails))throw new OperaError('invalid_response',undefined,'discovery_shape');
    const rows=page.accountsDetails.map(asObject);
    if(rows.some(a=>a.hotelId!==hotel))throw new OperaError('invalid_response',undefined,'discovery_scope');
    return {rows,hasMore:page.hasMore as boolean|undefined,totalResults:page.totalResults as number|undefined,nextOffset:nextCursor(page,offset,limit,rows.length)};
  },row=>id(row.accountId),20);
  return rows.map(row=>id(row.accountId));
}
export async function readBusinessDate(reader:OperaReader,hotel:string):Promise<string> {
  const result=asObject(await reader.businessDate());
  if(!Array.isArray(result.hotels))throw new OperaError('invalid_response',undefined,'business_date');
  const row=result.hotels.map(asObject).find(x=>x.hotelId===hotel);
  if(!row||typeof row.businessDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.businessDate))throw new OperaError('invalid_response',undefined,'business_date');
  return row.businessDate;
}
/** Open-history audit is additional to the retained inclZeroBalance=true history API. */
export async function readVerifiedAccount(reader:OperaReader,hotel:string,accountId:string,businessDate:string,previous:PreviousInvoice[]=[]):Promise<AccountSnapshot> {
  const current=await reader.account(accountId);
  const snapshot=normalizeAccount(current,hotel,businessDate);
  if(snapshot.account.id!==accountId)throw new OperaError('invalid_response',undefined,'account_identity');
  const readAuditHistory=async(includeZero:boolean)=>{
    let oldBalanceRows=0;
    try{return await collectPages(async(offset,limit)=>{
    const page=asObject(includeZero?await reader.history(accountId,offset,limit):await reader.openHistory(accountId,offset,limit));
    if(!Array.isArray(page.details))throw new OperaError('invalid_response',undefined,'history_shape');
    const rows:{kind:'invoice'|'payment';value:Row}[]=[];
    for(const raw of page.details){const group=asObject(raw);if(group.hotelId!==hotel||id(group.accountId)!==accountId)throw new OperaError('invalid_response',undefined,'history_scope');
      for(const [field,kind]of [['invoices','invoice'],['payments','payment']] as const){if(group[field]===undefined)continue;if(!Array.isArray(group[field]))throw new OperaError('invalid_response');for(const row of group[field]){const value=asObject(row);if(kind==='invoice'&&value.invoiceType==='OldBalance')oldBalanceRows++;rows.push({kind,value});}}}
    return {rows,hasMore:page.hasMore as boolean|undefined,totalResults:page.totalResults as number|undefined,nextOffset:nextCursor(page,offset,limit,rows.length)};
  },r=>{const t=r.value.transactionNo;if((typeof t!=='number'&&typeof t!=='string')||String(t)==='')throw new OperaError('invalid_response');return `${r.kind}:${t}`;},20);
    }catch(error){if(error instanceof OperaError)throw new OperaError(error.code,error.upstreamStatus,error.stage,error.providerMessage,{...error.diagnostics,oldBalanceRows,includeZero});throw error;}
  };
  let history=await readAuditHistory(false);
  let open=history.filter(r=>r.kind==='invoice'&&amountCents(r.value.balance,'THB')!==0);
  const expected=new Map(snapshot.invoices.filter(i=>i.open!==0).map(i=>[i.id,Math.round(i.open*100)]));
  const matches=()=>open.length===expected.size&&open.every(r=>expected.get(String(r.value.transactionNo))===amountCents(r.value.balance,'THB'));
  if(!matches()){
    // The environment's open-only filter can suppress offsetting +/- pairs.
    // Verify against all zero-inclusive pages rather than dropping current items.
    history=await readAuditHistory(true);
    open=history.filter(r=>r.kind==='invoice'&&amountCents(r.value.balance,'THB')!==0);
  }
  if(open.length!==expected.size||open.some(r=>expected.get(String(r.value.transactionNo))!==amountCents(r.value.balance,'THB'))){
    const actual=new Map(open.map(r=>[String(r.value.transactionNo),amountCents(r.value.balance,'THB')]));
    const currentOnly=[...expected].filter(([id])=>!actual.has(id)),historyOnly=[...actual].filter(([id])=>!expected.has(id));
    throw new OperaError('pagination_changed',undefined,'current_history_membership',undefined,{currentCount:expected.size,historyCount:actual.size,currentOnly:currentOnly.length,currentOnlyNegative:currentOnly.filter(([,n])=>n<0).length,historyOnly:historyOnly.length,historyOnlyNegative:historyOnly.filter(([,n])=>n<0).length,sharedBalanceMismatch:[...expected].filter(([id,n])=>actual.has(id)&&actual.get(id)!==n).length});
  }
  const present=new Set(snapshot.invoices.map(i=>i.id));
  const missing=previous.filter(i=>i.open!==0&&!present.has(i.id));
  if(missing.length){
    const numbers=missing.every(i=>i.invoice_no&&/^\d+$/.test(i.invoice_no))?[...new Set(missing.map(i=>i.invoice_no!))]:[];
    const closedCandidates=await collectPages(async(offset,limit)=>{
      const page=asObject(await reader.invoiceHistory(accountId,numbers,offset,limit));
      if(!Array.isArray(page.details))throw new OperaError('invalid_response');
      const rows:Row[]=[];
      for(const raw of page.details){const group=asObject(raw);if(group.hotelId!==hotel||id(group.accountId)!==accountId)throw new OperaError('invalid_response');if(group.invoices!==undefined&&!Array.isArray(group.invoices))throw new OperaError('invalid_response');for(const row of (group.invoices??[]) as unknown[])rows.push(asObject(row));}
      return {rows,hasMore:page.hasMore as boolean|undefined,totalResults:page.totalResults as number|undefined,nextOffset:nextCursor(page,offset,limit,rows.length)};
    },r=>String(r.transactionNo??''),20);
    const wanted=new Set(missing.map(i=>i.id));
    const closed=closedCandidates.filter(row=>wanted.has(String(row.transactionNo))&&amountCents(row.balance,'THB')===0);
    if(closed.length){
      const currentAccount=asObject(asObject(current).accountDetails);
      const normalized=normalizeAccount({accountDetails:{...currentAccount,invoices:closed}},hotel,businessDate);
      snapshot.invoices.push(...normalized.invoices);
    }
    // No match/error is never zero. Unmatched old rows remain missing with their old balance.
  }
  return snapshot;
}
