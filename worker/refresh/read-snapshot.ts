import { OperaError, type OperaReader } from '../opera/client';
import { collectPages,verifiedNextCursor } from '../opera/pagination';
import { normalizeAccount, amountCents, type AccountSnapshot } from '../opera/normalize';
type Row=Record<string,unknown>;
export function asObject(value:unknown):Row {if(!value||typeof value!=='object'||Array.isArray(value))throw new OperaError('invalid_response');return value as Row;}
function id(value:unknown):string {const v=asObject(value).id;if(typeof v!=='string'||!v)throw new OperaError('invalid_response');return v;}
export async function discoverAccountIds(reader:OperaReader,hotel:string):Promise<string[]> {
  const rows=await collectPages(async(offset,limit)=>{
    const page=asObject(await reader.accounts(offset,limit));
    if(!Array.isArray(page.accountsDetails))throw new OperaError('invalid_response',undefined,'discovery_shape');
    const rows=page.accountsDetails.map(asObject);
    if(rows.some(a=>a.hotelId!==hotel))throw new OperaError('invalid_response',undefined,'discovery_scope');
    return {rows,hasMore:page.hasMore as boolean|undefined,totalResults:page.totalResults as number|undefined,nextOffset:verifiedNextCursor(page,offset,limit)};
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
export async function readVerifiedAccount(reader:OperaReader,hotel:string,accountId:string,businessDate:string):Promise<AccountSnapshot> {
  const current=await reader.account(accountId);
  const snapshot=normalizeAccount(current,hotel,businessDate);
  if(snapshot.account.id!==accountId)throw new OperaError('invalid_response',undefined,'account_identity');
  const history=await collectPages(async(offset,limit)=>{
    const page=asObject(await reader.openHistory(accountId,offset,limit));
    if(!Array.isArray(page.details))throw new OperaError('invalid_response',undefined,'history_shape');
    const rows:{kind:'invoice'|'payment';value:Row}[]=[];
    for(const raw of page.details){const group=asObject(raw);if(group.hotelId!==hotel||id(group.accountId)!==accountId)throw new OperaError('invalid_response',undefined,'history_scope');
      for(const [field,kind]of [['invoices','invoice'],['payments','payment']] as const){if(group[field]===undefined)continue;if(!Array.isArray(group[field]))throw new OperaError('invalid_response');for(const row of group[field])rows.push({kind,value:asObject(row)});}}
    return {rows,hasMore:page.hasMore as boolean|undefined,totalResults:page.totalResults as number|undefined,nextOffset:verifiedNextCursor(page,offset,limit)};
  },r=>{const t=r.value.transactionNo;if((typeof t!=='number'&&typeof t!=='string')||String(t)==='')throw new OperaError('invalid_response');return `${r.kind}:${t}`;},20);
  const open=history.filter(r=>r.kind==='invoice'&&amountCents(r.value.balance,'THB')!==0);
  const expected=new Map(snapshot.invoices.filter(i=>i.open!==0).map(i=>[i.id,Math.round(i.open*100)]));
  if(open.length!==expected.size||open.some(r=>expected.get(String(r.value.transactionNo))!==amountCents(r.value.balance,'THB')))throw new OperaError('pagination_changed',undefined,'current_history_membership');
  return snapshot;
}
