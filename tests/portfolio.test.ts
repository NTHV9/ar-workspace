import { expect, it } from 'vitest';
import { aggregateAccounts, filterAccounts, sortRows, selectionTotal } from '../src/domain/portfolio';
const rows = [
  { hotel: 'KAT', id: 'same', name: 'Example A', type: 'Agent', open: 200, over90: 20, items: 2, group: 'a' },
  { hotel: 'TSK', id: 'same', name: 'Example A', type: 'Agent', open: 100, over90: 10, items: 1, group: 'a' },
  { hotel: 'KAT', id: 'other', name: 'Example B', type: 'Corporate', open: 500, over90: 0, items: 3 },
] as const;
it('preserves explicit reporting mappings and never groups by name or internal ID alone', () => {
  const result = aggregateAccounts([...rows]);
  expect(result.find(x => x.name === 'Example A')).toMatchObject({ kat: 200, tsk: 100, total: 300 });
  expect(aggregateAccounts(rows.map(row => ({ ...row, group: undefined })))).toHaveLength(3);
});
const numbered = [
  {hotel:'KAT',id:'kat-1',account_no:'SYN-001',name:'Synthetic Travel',type:'Agent',open:200,over90:20,items:2},
  {hotel:'TSK',id:'tsk-9',account_no:' syn-001 ',name:'Synthetic Travel TSK',type:'Agent',open:100,over90:10,items:1},
];
it('compares matching Account No. in one row while preserving the two operational identities',()=>{
  const result=aggregateAccounts(numbered);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({kat:200,tsk:100,total:300,over90:30,items:3,accounts:2,share:100});
  expect(result[0].members).toEqual(numbered);
});
it('keeps a zero-balance counterpart present and different account numbers separate',()=>{
  const result=aggregateAccounts([numbered[0],{...numbered[1],open:0,over90:0,items:0},
    {...numbered[1],id:'tsk-10',account_no:'SYN-002',name:numbered[0].name}]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({kat:200,tsk:0,total:200,accounts:2,items:2});
});
it('does not guess a match when an Account No. occurs twice within one hotel, even after filtering',()=>{
  const catalog=[...numbered,{...numbered[0],id:'kat-2'}];
  expect(aggregateAccounts(catalog)).toHaveLength(3);
  expect(aggregateAccounts(numbered,false,catalog)).toHaveLength(2);
});
it('preserves explicit mappings ahead of automatic Account No. matching',()=>{
  expect(aggregateAccounts(numbered.map((a,i)=>({...a,group:`explicit-${i}`})))).toHaveLength(2);
});
it('keeps type totals unchanged and account totals conserved',()=>{
  const grouped=aggregateAccounts(numbered);
  expect(aggregateAccounts(numbered,true)[0]).toMatchObject({name:'Agent',total:300,accounts:2});
  expect(grouped.reduce((s,a)=>s+a.total,0)).toBe(numbered.reduce((s,a)=>s+a.open,0));
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
