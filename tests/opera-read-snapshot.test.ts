import { describe, expect, it } from 'vitest';
import { OperaReader } from '../worker/opera/client';
import { readVerifiedAccount } from '../worker/refresh/read-snapshot';

const money = (amount: number) => ({ amount, currencyCode: 'THB' });
function invoice(transactionNo = 123, open = 60) {
  return { transactionNo, hotelId: 'KAT', transactionDate: '2026-05-01', originalAmount: money(100), amount: money(100),
    payments: money(100 - open), balance: money(open), age: 130, guestName: 'Synthetic guest', invoiceNo: '456' };
}
function current(invoices = [invoice()], net = 60) {
  const summary = { debit: money(60), credit: money(60 - net), total: money(net) };
  return { accountDetails: {
    hotelId: 'KAT', accountId: { id: 'account-1' }, accountName: 'Synthetic account', accountNo: 'A1', type: 'TA',
    balance: { amount: net }, summary,
    agingInfo: { aging: [{ agingBucketRange: '91+', agingStartDay: 91, sequence: 1, balanceInfo: summary }] },
    invoices, payments: [],
  } };
}
function history(invoices: ReturnType<typeof invoice>[]) {
  return { details: invoices.length ? [{ hotelId: 'KAT', accountId: { id: 'account-1' }, invoices, payments: [] }] : [],
    totalResults: invoices.length, hasMore: false, offset: invoices.length ? 20 : 0, limit: 20 };
}
function harness(raw = current(), open = history([invoice()]), closed = history([]), closedStatus = 200) {
  const requests: URL[] = [];
  const reader = new OperaReader({ origin: 'https://synthetic.example.invalid', appKey: 'synthetic-app-key', hotelId: 'KAT' },
    async () => 'synthetic-token', async (request) => {
      const url = new URL(request.url); requests.push(url);
      if (url.pathname === '/ars/v1/hotels/KAT/accounts/account-1') return Response.json(raw);
      if (url.pathname !== '/ars/v1/invoicePayments/accounts/account-1') throw new Error('Unexpected synthetic route');
      return url.searchParams.get('inclZeroBalance') === 'false' ? Response.json(open) : Response.json(closed, { status: closedStatus });
    });
  return { reader, requests };
}

describe('verified OPERA snapshot reads', () => {
  it('accepts explicitly empty final open history without inferring individual invoice zero', async () => {
    const { reader, requests } = harness(current([], 0), history([]));
    const snapshot = await readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08');
    expect(snapshot.account.open).toBe(0);
    expect(snapshot.invoices).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get('offset')).toBe('0');
  });
  it('rejects empty open history for a net-zero account that still contains positive invoices', async () => {
    const { reader } = harness(current([invoice()], 0), history([]));
    await expect(readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08')).rejects.toMatchObject({ code: 'pagination_changed', stage: 'current_history_membership' });
  });
  it('accepts matching transaction IDs and partial-payment balances', async () => {
    const { reader } = harness();
    const snapshot = await readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08');
    expect(snapshot.invoices).toHaveLength(1);
    expect(snapshot.invoices[0]).toMatchObject({ id: '123', open: 60, original: 100, applied_amount: 40 });
  });
  it.each([
    { label: 'same total with a different transaction ID', rows: [invoice(999)] },
    { label: 'same ID with a changed balance', rows: [invoice(123, 59)] },
    { label: 'an extra transaction', rows: [invoice(), invoice(999)] },
  ])('rejects $label', async ({ rows }) => {
    const { reader } = harness(current(), history(rows));
    await expect(readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08')).rejects.toMatchObject({ code: 'pagination_changed', stage: 'current_history_membership' });
  });
  it('appends a missing previous invoice only after exact transaction identity has an explicit zero', async () => {
    const { reader, requests } = harness(current([], 0), history([]), history([invoice(123, 0)]));
    const snapshot = await readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08', [{ id: '123', invoice_no: '456', open: 60 }]);
    expect(snapshot.invoices).toHaveLength(1);
    expect(snapshot.invoices[0]).toMatchObject({ id: '123', invoice_no: '456', open: 0, original: 100 });
    expect(snapshot.account.items).toBe(0);
    expect(requests[2].searchParams.get('inclZeroBalance')).toBe('true');
    expect(requests[2].searchParams.getAll('invoiceNo')).toEqual(['456']);
    expect(requests[2].searchParams.getAll('fetchInstructions')).toEqual(['Invoices']);
  });
  it.each([
    { label: 'empty history', rows: [] },
    { label: 'a different transaction with the same invoice number and zero', rows: [invoice(999, 0)] },
    { label: 'matching identity that is still positive', rows: [invoice(123, 60)] },
  ])('does not fabricate zero from $label', async ({ rows }) => {
    const previous = [{ id: '123', invoice_no: '456', open: 60 }];
    const { reader } = harness(current([], 0), history([]), history(rows));
    const snapshot = await readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08', previous);
    expect(snapshot.invoices).toEqual([]);
    expect(previous[0].open).toBe(60);
  });
  it('propagates a history provider error instead of publishing a zero balance', async () => {
    const { reader } = harness(current([], 0), history([]), history([]), 503);
    await expect(readVerifiedAccount(reader, 'KAT', 'account-1', '2026-09-08', [{ id: '123', invoice_no: '456', open: 60 }])).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
});
