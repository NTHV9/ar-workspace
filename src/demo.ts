import type { Account, Invoice } from './domain/portfolio';
// Fictional review data. Never written to the database or used as a live fallback.
const types = ['OTA / Agent', 'Credit Card', 'Corporate', 'Government', 'Deposit / Offset', 'Other'];
const kat = [16230000,3920000,2410000,1180000,870000,220000];
const tsk = [2610000,1240000,960000,730000,620000,500000];
const over = [5030000,780000,610000,320000,210000,90000];
export const demoAccounts: Account[] = types.flatMap((type, index) => {
  const fractions = index === 0 ? [.30,.25,.20,.15,.10] : [1];
  return fractions.flatMap((fraction, n) => ['KAT', 'TSK'].map(hotel => ({
    hotel, id: `sample-${index}-${n}`, name: `Account ${String.fromCharCode(65 + (index === 0 ? n : index + 4))} · Synthetic`, type,
    open: Math.round((hotel === 'KAT' ? kat[index] : tsk[index]) * fraction),
    over90: Math.round(over[index] * fraction * (hotel === 'KAT' ? .75 : .25)), items: Math.round((index === 0 ? 84 : 20) * fraction),
    group: `sample-group-${index}-${n}`, creditLimit: index === 0 && n === 0 ? 6000000 : 2000000, oldest: 164,
  })));
});
export const agingLabels = ['0–30', '31–60', '61–90', '91–120', '121–150', '151+'];
export const demoInvoices = (account: Account): Invoice[] => {
  const balances = [.32,.26,.12,.105,.095,.10];
  return balances.map((fraction, index) => ({
    id: `sample-invoice-${index}`, hotel: account.hotel, accountId: account.id,
    guest: `Guest ${String.fromCharCode(65+index)} · Synthetic`, invoiceNo: `INV-${10085+index*3691}`, folioNo: `FOL-${15803+index*5946}`,
    date: `2026-08-${12+index*2}`, due: index === 5 ? null : `2026-09-${11+index*3}`,
    original: Math.round(account.open * fraction * (index > 1 ? 1.2 : 1)), open: Math.round(account.open * fraction),
    aging: agingLabels[5-index], stage: ['Follow 1','Friendly','Not sent','Follow 2','Final','Not billed'][index],
  }));
};
