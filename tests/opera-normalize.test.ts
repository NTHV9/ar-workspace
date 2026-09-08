import { describe, expect, it } from 'vitest';
import { normalizeAccount } from '../worker/opera/normalize';

const money = (amount: number) => ({ amount, currencyCode: 'THB' });
function fixture() {
  return { accountDetails: {
    hotelId: 'KAT', accountId: { id: 'account-1' }, accountName: 'Synthetic account', accountNo: 'A1', type: 'TA',
    balance: { amount: 60 }, summary: { debit: money(60), credit: money(0), total: money(60) },
    agingInfo: { aging: [{ agingBucketRange: '91+', agingStartDay: 91, agingEndDay: 9999, sequence: 1,
      balanceInfo: { debit: money(60), credit: money(0), total: money(60) } }] },
    invoices: [{ transactionNo: 123, hotelId: 'KAT', transactionDate: '2026-05-01', originalAmount: money(100), amount: money(100),
      payments: money(40), balance: money(60), age: 130, guestName: 'Synthetic guest', invoiceNo: 'INV-1' }], payments: [],
  } };
}

describe('OPERA account normalization', () => {
  it.each([
    { field: 'invoice_original_shape', mutate: (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].originalAmount = undefined!; } },
    { field: 'invoice_transaction_date_text', mutate: (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].transactionDate = ' '; } },
    { field: 'invoice_reservation_id_text', mutate: (d: ReturnType<typeof fixture>) => { Object.assign(d.accountDetails.invoices[0], { reservationId: {} }); } },
    { field: 'invoice_folio_date_text', mutate: (d: ReturnType<typeof fixture>) => { Object.assign(d.accountDetails.invoices[0], { folioDate: '' }); } },
    { field: 'account_type_text', mutate: (d: ReturnType<typeof fixture>) => { d.accountDetails.type = undefined!; } },
    { field: 'summary_debit_shape', mutate: (d: ReturnType<typeof fixture>) => { d.accountDetails.summary.debit = undefined!; } },
  ])('reports only static diagnostic context for $field', ({ field, mutate }) => {
    const data = fixture(); mutate(data);
    try { normalizeAccount(data, 'KAT', '2026-09-08'); expect.fail('Expected invalid data to be rejected'); }
    catch (error) {
      expect(error).toMatchObject({ code: 'invalid_response', stage: `normalize_${field}` });
      expect(String(error)).not.toContain('Synthetic');
      expect(String(error)).not.toContain('account-1');
    }
  });
  it('preserves an omitted final aging end as an unbounded range without deriving boundaries from labels', () => {
    const data = fixture();
    const first = data.accountDetails.agingInfo.aging[0];
    first.agingEndDay = 150;
    data.accountDetails.agingInfo.aging.push({ ...first, agingBucketRange: 'Oldest range', agingStartDay: 151, agingEndDay: undefined!, sequence: 2 });
    data.accountDetails.invoices[0].age = 20000;
    const result = normalizeAccount(data, 'KAT', '2026-09-08');
    expect(result.account.agingBuckets[1]).toMatchObject({ start: 151, end: null, label: 'Oldest range' });
    expect(result.invoices[0].aging).toBe('Oldest range');
  });
  it('rejects a missing aging end before a later range', () => {
    const data = fixture();
    const first = data.accountDetails.agingInfo.aging[0];
    first.agingEndDay = undefined!;
    data.accountDetails.agingInfo.aging.push({ ...first, agingStartDay: 151, agingEndDay: 9999, sequence: 2 });
    expect(() => normalizeAccount(data, 'KAT', '2026-09-08')).toThrow('invalid_response');
  });
  it('rejects overlapping ranges even when the final range is open ended', () => {
    const data = fixture();
    const first = data.accountDetails.agingInfo.aging[0];
    first.agingEndDay = 151;
    data.accountDetails.agingInfo.aging.push({ ...first, agingStartDay: 151, agingEndDay: undefined!, sequence: 2 });
    expect(() => normalizeAccount(data, 'KAT', '2026-09-08')).toThrow('invalid_response');
  });
  it('preserves partial payment balance and contextual missing fields without fabrication', () => {
    const result = normalizeAccount(fixture(), 'KAT', '2026-09-08');
    expect(result.account).toMatchObject({ id: 'account-1', account_no: 'A1', name: 'Synthetic account', open: 60, over90: 60, items: 1, oldest: 130, currency: 'THB' });
    expect(result.invoices[0]).toMatchObject({ id: '123', original: 100, current_amount: 100, applied_amount: 40, open: 60, age: 130, folio_no: null, reservation_id: null });
  });
  it('retains open invoices even when unapplied credits make the account zero', () => {
    const data = fixture(); data.accountDetails.balance.amount = 0; data.accountDetails.summary.credit = money(60); data.accountDetails.summary.total = money(0);
    data.accountDetails.agingInfo.aging[0].balanceInfo.credit = money(60); data.accountDetails.agingInfo.aging[0].balanceInfo.total = money(0);
    expect(normalizeAccount(data, 'KAT', '2026-09-08')).toMatchObject({ account: { open: 0, items: 1 }, invoices: [{ open: 60 }] });
  });
  it('accepts negative net account balances without clearing positive invoices', () => {
    const data = fixture(); data.accountDetails.balance.amount = -20; data.accountDetails.summary.credit = money(80); data.accountDetails.summary.total = money(-20);
    const b = data.accountDetails.agingInfo.aging[0].balanceInfo; b.credit = money(80); b.total = money(-20);
    expect(normalizeAccount(data, 'KAT', '2026-09-08').account.open).toBe(-20);
  });
  it('does not expose provider contacts, payment cards, or raw payment payloads', () => {
    const data = { ...fixture(), email: 'synthetic@example.invalid' };
    expect(JSON.stringify(normalizeAccount(data, 'KAT', '2026-09-08'))).not.toContain('example.invalid');
  });
  it.each([
    (d: ReturnType<typeof fixture>) => { d.accountDetails.hotelId = 'TSK'; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].hotelId = 'TSK'; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.accountId.id = ''; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices.push(d.accountDetails.invoices[0]); },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].transactionDate = '2026-02-30'; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].transactionDate = undefined!; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].originalAmount = undefined!; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].balance = undefined!; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].balance.amount = NaN; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].balance.amount = 0.001; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices[0].balance.currencyCode = 'USD'; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.summary.total.currencyCode = ''; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.balance.amount = 59; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.summary.credit.amount = 20; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.summary.debit = undefined!; },
    (d: ReturnType<typeof fixture>) => { d.accountDetails.invoices = undefined!; },
  ])('rejects invalid scope, identity, money, dates or missing membership (%#)', (mutate) => {
    const data = fixture(); mutate(data);
    expect(() => normalizeAccount(data, 'KAT', '2026-09-08')).toThrow('invalid_response');
  });
  it('rejects an invalid business date', () => expect(() => normalizeAccount(fixture(), 'KAT', '2026-13-01')).toThrow());
  it('preserves absent guest and age as unknown instead of inventing identity or dates', () => {
    const data = fixture(); data.accountDetails.invoices[0].guestName = undefined!; data.accountDetails.invoices[0].age = undefined!;
    expect(normalizeAccount(data, 'KAT', '2026-09-08')).toMatchObject({ account: { oldest: null }, invoices: [{ guest: null, age: null, aging: 'Unknown' }] });
  });
  it('rejects foreign currency in an optional credit limit', () => {
    const data = fixture();
    Object.assign(data.accountDetails, { creditLimit: { amount: 100, currencyCode: 'USD' } });
    expect(() => normalizeAccount(data, 'KAT', '2026-09-08')).toThrow('invalid_response');
  });
  it('handles decimal THB exactly when reconciling', () => {
    const data = fixture(); data.accountDetails.balance.amount = 0.1;
    data.accountDetails.summary = { debit: money(0.3), credit: money(0.2), total: money(0.1) };
    data.accountDetails.agingInfo.aging[0].balanceInfo = data.accountDetails.summary;
    expect(normalizeAccount(data, 'KAT', '2026-09-08').account.open).toBe(0.1);
  });
});
