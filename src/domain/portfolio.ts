export interface Account {
  hotel: string; id: string; name: string; type: string; open: number; over90: number; items: number;
  group?: string; aging?: number[]; creditLimit?: number; oldest?: number;
}
export interface Comparison { key: string; name: string; kat: number; tsk: number; total: number; over90: number; items: number; accounts: number; members: Account[] }
export interface Invoice { id: string; hotel: string; accountId: string; guest: string; invoiceNo: string; folioNo: string; date: string; due: string | null; original: number; open: number; aging: string; stage: string }
export function filterAccounts(rows: Account[], filters: { hotel: string; type: string; search: string }) {
  return rows.filter(row => (filters.hotel === 'All' || row.hotel === filters.hotel) && (filters.type === 'All' || row.type === filters.type) && `${row.name} ${row.id}`.toLowerCase().includes(filters.search.toLowerCase()));
}
export function aggregateAccounts(rows: Account[], byType = false): Comparison[] {
  const groups = new Map<string, Comparison>();
  for (const row of rows) {
    const key = byType ? row.type : row.group ? `group:${row.group}` : `${row.hotel}:${row.id}`;
    const value = groups.get(key) ?? { key, name: byType ? row.type : row.name, kat: 0, tsk: 0, total: 0, over90: 0, items: 0, accounts: 0, members: [] };
    if (row.hotel === 'KAT') value.kat += row.open;
    if (row.hotel === 'TSK') value.tsk += row.open;
    value.total += row.open; value.over90 += row.over90; value.items += row.items; value.accounts++; value.members.push(row); groups.set(key, value);
  }
  return [...groups.values()];
}
export function sortRows<T>(rows: T[], key: keyof T, direction: 'asc' | 'desc'): T[] {
  return [...rows].sort((a, b) => (typeof a[key] === 'number' && typeof b[key] === 'number' ? Number(a[key]) - Number(b[key]) : String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'en', { numeric: true })) * (direction === 'asc' ? 1 : -1));
}
export function selectionTotal(rows: Pick<Invoice, 'id' | 'hotel' | 'accountId' | 'open'>[], selected: Set<string>, hotel: string, account: string) {
  return rows.filter(row => row.hotel === hotel && row.accountId === account && selected.has(row.id)).reduce((total, row) => total + row.open, 0);
}
export const money = (amount: number, compact = true) => `THB ${new Intl.NumberFormat('en', compact ? { notation: 'compact', maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
