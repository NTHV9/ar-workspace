import { expect, it } from 'vitest';
import { aggregateAccounts, filterAccounts, sortRows, selectionTotal } from '../src/domain/portfolio';
const rows = [
  { hotel: 'KAT', id: 'same', name: 'Example A', type: 'Agent', open: 200, over90: 20, items: 2, group: 'a' },
  { hotel: 'TSK', id: 'same', name: 'Example A', type: 'Agent', open: 100, over90: 10, items: 1, group: 'a' },
  { hotel: 'KAT', id: 'other', name: 'Example B', type: 'Corporate', open: 500, over90: 0, items: 3 },
] as const;
it('groups only by explicit reporting mapping and keeps property contributions', () => {
  const result = aggregateAccounts([...rows]);
  expect(result.find(x => x.name === 'Example A')).toMatchObject({ kat: 200, tsk: 100, total: 300 });
  expect(aggregateAccounts(rows.map(row => ({ ...row, group: undefined })))).toHaveLength(3);
});
it('filters hotel and account type before aggregation', () => {
  expect(filterAccounts([...rows], { hotel: 'TSK', type: 'Agent', search: '' })).toHaveLength(1);
});
it('sorts every row without silently truncating results', () => {
  expect(sortRows(aggregateAccounts([...rows]), 'total', 'desc').map(x => x.total)).toEqual([500, 300]);
});
it('totals only selected invoices in the active hotel and account', () => {
  const invoices = [{ id: 'i', hotel: 'KAT', accountId: 'a', open: 100 }, { id: 'i', hotel: 'TSK', accountId: 'a', open: 300 }];
  expect(selectionTotal(invoices, new Set(['i']), 'KAT', 'a')).toBe(100);
});
