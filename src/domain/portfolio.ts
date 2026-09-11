import type {StageSnapshot} from './collection-policy';
export interface Account {
  hotel: string; id: string; name: string; type: string; open: number; over90: number; items: number;
  group?: string; aging?: number[]; creditLimit?: number | null; oldest?: number;
  account_no?: string | null; verification_state?: string; agingBuckets?: AgingBucket[];
  sourceWarnings?: { code: 'history_total_understated'; reported: number; observed: number; includeZero: boolean }[];
}
export interface AgingBucket { label: string; start: number | null; end: number | null; sequence: number; amount: number; debit: number; credit: number }
export interface HotelRefresh { hotel: string; status: string; last_success_at: string | null; last_attempt_at?: string | null; error_code?: string | null; run_id?: string | null }
export interface RefreshState { hotels: HotelRefresh[]; running: boolean }
export function validSourceBucket(value: unknown): value is AgingBucket {
  if(!value || typeof value!=='object')return false;
  const bucket=value as Record<string,unknown>;
  const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
  return typeof bucket.label==='string'&&bucket.label.trim().length>0&&integer(bucket.start)
    &&(bucket.end===null||(integer(bucket.end)&&bucket.end>=bucket.start))&&integer(bucket.sequence)
    &&[bucket.amount,bucket.debit,bucket.credit].every(n=>typeof n==='number'&&Number.isFinite(n));
}
export function sourceAging(rows: Account[], hotel: string): AgingBucket[] {
  const accounts=rows.filter(a=>a.hotel===hotel);
  if(!accounts.length || accounts.some(a=>!Array.isArray(a.agingBuckets)||!a.agingBuckets.length||!a.agingBuckets.every(validSourceBucket)))return [];
  const signature=(b:AgingBucket)=>JSON.stringify([b.label,b.start,b.end,b.sequence]);
  const first=accounts[0].agingBuckets!;
  if(accounts.some(a=>JSON.stringify(a.agingBuckets!.map(signature))!==JSON.stringify(first.map(signature))))return [];
  return first.map((bucket,index)=>({...bucket,amount:accounts.reduce((s,a)=>s+a.agingBuckets![index].amount,0),debit:accounts.reduce((s,a)=>s+a.agingBuckets![index].debit,0),credit:accounts.reduce((s,a)=>s+a.agingBuckets![index].credit,0)}));
}
export interface Comparison { key: string; name: string; kat: number; tsk: number; total: number; over90: number; share: number; items: number; accounts: number; members: Account[] }
export interface InvoiceWorkflow {last_reminder_policy_version?:number|null;last_reminder_stage_snapshot?:StageSnapshot|null;revision:number;credit_term:number|null;billing_required:boolean|null;first_billing_date:string|null;last_reminder_stage:string|null;last_reminder_date:string|null;due_date:string|null}
export interface Invoice { exceptions?:{held:boolean;needsReview:boolean;dispute:string;reopenedAt:string|null};exception_status?:'available'|'unavailable';workflow?:InvoiceWorkflow|null; id: string; hotel: string; accountId: string; guest: string; invoiceNo: string; folioNo: string; date: string; due: string | null; original: number; open: number; aging: string; stage: string;
 age?:number|null; collection_role?:'unverified'|'standalone'|'parent'|'child'; collection_selectable?:boolean; parent_invoice_no?:string|null; parent_invoice_id?:string|null; parent_open?:number|null; verification_state?:string;
}
export function selectableInvoice(invoice:Invoice,review=false){return review||invoice.collection_selectable===true&&['standalone','parent'].includes(invoice.collection_role??'')&&invoice.verification_state==='verified'&&invoice.open>0;}
export function selectionReason(invoice:Invoice){
 if(invoice.collection_role==='child')return `Included in parent invoice ${invoice.parent_invoice_no??'—'} · cannot collect separately`;
 if(invoice.collection_role==='unverified'||!invoice.collection_role)return 'Invoice relationship not verified · selection unavailable';
 if(invoice.verification_state!=='verified')return 'Source verification required · selection unavailable';
 if(invoice.open<=0)return 'No positive balance to collect';
 return invoice.collection_role==='parent'?'Parent invoice · contains compressed invoices':'';
}
export function filterAccounts(rows: Account[], filters: { hotel: string; type: string; search: string }) {
  return rows.filter(row => (filters.hotel === 'All' || row.hotel === filters.hotel) && (filters.type === 'All' || row.type === filters.type) && `${row.name} ${row.id}`.toLowerCase().includes(filters.search.toLowerCase()));
}
export function aggregateAccounts(rows: Account[], byType = false, identityRows: Account[] = rows): Comparison[] {
  // Account No. pairs reporting rows only. Hotel + ID remains the ledger identity.
  // Check the complete catalog so a filter cannot conceal an ambiguous number.
  const numberOf = (row:Account) => row.account_no?.trim().toUpperCase() || '';
  const seen = new Set<string>(), ambiguous = new Set<string>();
  if(!byType)for(const row of identityRows){
    const number=numberOf(row);
    if(!number)continue;
    const key=JSON.stringify([row.hotel,number]);
    if(seen.has(key))ambiguous.add(number);
    seen.add(key);
  }
  const groups = new Map<string, Comparison>();
  for (const row of rows) {
    const number=numberOf(row);
    const key = byType ? row.type : row.group ? `group:${row.group}`
      : number && !ambiguous.has(number) ? `number:${number}` : `${row.hotel}:${row.id}`;
    const value = groups.get(key) ?? { key, name: byType ? row.type : row.name, kat: 0, tsk: 0, total: 0, over90: 0, share: 0, items: 0, accounts: 0, members: [] };
    if (row.hotel === 'KAT') value.kat += row.open;
    if (row.hotel === 'TSK') value.tsk += row.open;
    value.total += row.open; value.over90 += row.over90; value.items += row.items; value.accounts++; value.members.push(row); groups.set(key, value);
  }
  const total = rows.reduce((sum,row)=>sum+row.open,0);
  return [...groups.values()].map(row=>({...row,share:total?row.total/total*100:0}));
}
export function sortRows<T>(rows: T[], key: keyof T, direction: 'asc' | 'desc'): T[] {
  return [...rows].sort((a, b) => (typeof a[key] === 'number' && typeof b[key] === 'number' ? Number(a[key]) - Number(b[key]) : String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'en', { numeric: true })) * (direction === 'asc' ? 1 : -1));
}
export function selectionTotal(rows: Pick<Invoice, 'id' | 'hotel' | 'accountId' | 'open'>[], selected: Set<string>, hotel: string, account: string) {
  return rows.filter(row => row.hotel === hotel && row.accountId === account && selected.has(row.id)).reduce((total, row) => total + row.open, 0);
}
export const money = (amount: number, compact = true) => `THB ${new Intl.NumberFormat('en', compact ? { notation: 'compact', maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
