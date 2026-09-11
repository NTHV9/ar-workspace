import { OperaError } from './client';

export interface AgingBucket { label: string; start: number; end: number | null; sequence: number; amount: number; debit: number; credit: number }
export interface NormalizedInvoice {
  hotel: string; account_id: string; id: string; guest: string | null; invoice_no: string | null; folio_no: string | null;
  transaction_date: string; original: number; open: number; aging: string; age: number | null;
  current_amount: number; applied_amount: number; reference: string | null; reservation_id: string | null;
  folio_date: string | null; internal_folio_window_id: string | null;
  compressed: boolean | null; parent_invoice_no: string | null;
  collection_role: 'unverified'|'standalone'|'parent'|'child'; parent_invoice_id: string | null; parent_open: number | null;
}
export interface AccountSnapshot { unconfirmedInvoiceIds?:string[];
  account: { hotel: string; id: string; name: string; type: string; account_no: string | null; open: number;
    over90: number; items: number; currency: 'THB'; creditLimit: number | null; oldest: number | null;
    agingBuckets: AgingBucket[]; business_date: string; sourceWarnings?:{code:string;reported:number;observed:number;includeZero:boolean}[] };
  invoices: NormalizedInvoice[];
}
type RecordValue = Record<string, unknown>;
function invalid(stage: string): never { throw new OperaError('invalid_response', undefined, `normalize_${stage}`); }
/** Contexts are static code labels only, never IDs, values, or upstream messages. */
function field<T>(context: string, read: () => T): T {
  try { return read(); }
  catch (error) {
    if (error instanceof OperaError && error.code === 'invalid_response' && error.stage?.startsWith('normalize_')) {
      invalid(`${context}_${error.stage.slice('normalize_'.length)}`);
    }
    throw error;
  }
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('shape');
  return value as RecordValue;
}
function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid('text');
  return value;
}
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  return requiredText(value);
}
function identifier(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) invalid('identity');
    return String(value);
  }
  return requiredText(value);
}
function optionalIdentifier(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : identifier(value);
}
function date(value: unknown): string {
  const text = requiredText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) invalid('date');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) invalid('date');
  return text;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid('integer');
  return value;
}

/** Currency omission is accepted only after the enclosing summary explicitly proves THB. */
export function amountCents(value: unknown, verifiedCurrency?: 'THB'): number {
  const money = record(value);
  if (money.currencyCode === undefined ? verifiedCurrency !== 'THB' : money.currencyCode !== 'THB') invalid('currency');
  if (typeof money.amount !== 'number' || !Number.isFinite(money.amount)) invalid('money');
  const scaled = money.amount * 100;
  const cents = Math.round(scaled);
  // Tolerate only floating-point representation noise, never round actual fractional satang.
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > 1e-6) invalid('money_precision');
  return cents;
}
function sumCents(values: number[]): number {
  const result = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result)) invalid('money_range');
  return result;
}
function balances(value: unknown, currency: 'THB') {
  const balance = record(value);
  const debit = field('debit', () => amountCents(balance.debit, currency)), credit = field('credit', () => amountCents(balance.credit, currency)), total = field('total', () => amountCents(balance.total, currency));
  // Oracle aRBalanceType defines total as debit minus credit, including unapplied credits.
  if (sumCents([debit, -credit]) !== total) invalid('balance_reconciliation');
  return { debit, credit, total };
}

/** Maps only documented, needed fields. Never forwards contact data or payment-card payloads. */
export function normalizeAccount(current: unknown, hotel: string, businessDate: string): AccountSnapshot {
  field('requested_hotel', () => requiredText(hotel)); field('business_date', () => date(businessDate));
  const root = field('response', () => record(current));
  const account = field('account', () => record(root.accountDetails));
  if (account.hotelId !== hotel) invalid('hotel');
  const id = field('account_id', () => identifier(record(account.accountId).id));
  const summary = field('summary', () => record(account.summary));
  // Require a positive currency assertion; neither hotel nor a requested currency is evidence.
  field('summary_total', () => amountCents(summary.total));
  const totals = field('summary', () => balances(summary, 'THB'));
  // Some OPERA accounts provide the account total only in Summary. That total
  // has already passed explicit THB and debit/credit reconciliation above.
  const open = account.balance == null ? totals.total : field('account_balance', () => amountCents(account.balance, 'THB'));
  if (open !== totals.total) invalid('account_reconciliation');
  if (!Array.isArray(account.invoices)) invalid('invoices_missing');
  const aging = field('aging_info', () => record(account.agingInfo)).aging;
  if (!Array.isArray(aging)) invalid('aging_missing');
  const agingBuckets: AgingBucket[] = aging.map((raw) => {
    const bucket = field('aging_bucket', () => record(raw)), balance = field('aging_balance', () => balances(bucket.balanceInfo, 'THB'));
    const start = field('aging_start', () => integer(bucket.agingStartDay)), end = bucket.agingEndDay === undefined ? null : field('aging_end', () => integer(bucket.agingEndDay));
    if (end !== null && end < start) invalid('aging_range');
    return { label: field('aging_label', () => requiredText(bucket.agingBucketRange)), start, end, sequence: field('aging_sequence', () => integer(bucket.sequence)),
      amount: balance.total / 100, debit: balance.debit / 100, credit: balance.credit / 100 };
  }).sort((a, b) => a.sequence - b.sequence);
  // OPERA omits agingEndDay for its final unbounded bucket. An omission before
  // another bucket would overlap that range and cannot safely classify invoices.
  for (let index = 1; index < agingBuckets.length; index++) {
    const previous = agingBuckets[index - 1], bucket = agingBuckets[index];
    if (previous.end === null || previous.end >= bucket.start || previous.sequence === bucket.sequence) invalid('aging_range');
  }
  const seen = new Set<string>();
  const invoices = account.invoices.map((raw): NormalizedInvoice => {
    const invoice = field('invoice', () => record(raw));
    if (invoice.hotelId !== undefined && invoice.hotelId !== hotel) invalid('invoice_hotel');
    const itemId = field('invoice_transaction_no', () => identifier(invoice.transactionNo));
    if (seen.has(itemId)) invalid('duplicate_invoice');
    seen.add(itemId);
    const age = invoice.age == null ? null : field('invoice_age', () => integer(invoice.age));
    const bucket = age === null ? undefined : agingBuckets.find((b) => age >= b.start && (b.end === null || age <= b.end));
    return { hotel, account_id: id, id: itemId, guest: field('invoice_guest', () => optionalText(invoice.guestName)),
      invoice_no: field('invoice_no', () => optionalIdentifier(invoice.invoiceNo)), folio_no: field('invoice_folio_no', () => optionalIdentifier(invoice.folioNo)),
      transaction_date: field('invoice_transaction_date', () => date(invoice.transactionDate)), original: field('invoice_original', () => amountCents(invoice.originalAmount, 'THB')) / 100,
      open: field('invoice_balance', () => amountCents(invoice.balance, 'THB')) / 100,
      current_amount: field('invoice_amount', () => amountCents(invoice.amount, 'THB')) / 100, applied_amount: field('invoice_payments', () => amountCents(invoice.payments, 'THB')) / 100,
      age, aging: bucket?.label ?? 'Unknown', reference: field('invoice_reference', () => optionalText(invoice.reference)),
      reservation_id: invoice.reservationId == null ? null : field('invoice_reservation_id', () => identifier(record(invoice.reservationId).id)),
      folio_date: invoice.folioDate == null ? null : field('invoice_folio_date', () => date(invoice.folioDate)),
      internal_folio_window_id: field('invoice_internal_folio_window_id', () => optionalIdentifier(invoice.internalFolioWindowID)),
      compressed: invoice.compressed==null?null:typeof invoice.compressed==='boolean'?invoice.compressed:invalid('compressed'),
      parent_invoice_no:field('parent_invoice_no',()=>optionalIdentifier(invoice.parentInvoiceNo)),
      collection_role:'unverified',parent_invoice_id:null,parent_open:null,
    };
  });
  const outstanding = invoices.filter((invoice) => invoice.open !== 0);
  const knownAges = outstanding.flatMap((invoice) => invoice.age === null ? [] : [invoice.age]);
  return { account: { hotel, id, name: field('account_name', () => requiredText(account.accountName)), type: field('account_type', () => requiredText(account.type)),
    account_no: field('account_no', () => optionalIdentifier(account.accountNo)), open: open / 100, currency: 'THB',
    over90: sumCents(agingBuckets.filter((b) => b.start > 90).map((b) => Math.round(b.amount * 100))) / 100,
    items: outstanding.length, oldest: knownAges.length === outstanding.length && knownAges.length ? Math.max(...knownAges) : null,
    creditLimit: account.creditLimit == null ? null : field('account_credit_limit', () => amountCents(account.creditLimit, 'THB')) / 100,
    agingBuckets, business_date: businessDate }, invoices };
}
