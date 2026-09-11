import { expect,it } from 'vitest';
import { historyRootCount } from '../worker/opera/history-count';
import { collectPages } from '../worker/opera/pagination';
const parent={kind:'invoice',value:{transactionNo:1,invoiceNo:100,compressed:true}};
const child=(id:number)=>({kind:'invoice',value:{transactionNo:id,invoiceNo:100+id,parentInvoiceNo:100}});
it('counts one compressed root but retains both explicit children',async()=>{
  const rows=[parent,child(2),child(3)];
  expect(historyRootCount(rows)).toBe(1);
  expect(await collectPages(async()=>({rows,logicalCount:historyRootCount(rows),totalResults:1,hasMore:false}),r=>String(r.value.transactionNo))).toEqual(rows);
});
it('rejects unresolved or ambiguous compression links',()=>{
  expect(()=>historyRootCount([child(2)])).toThrow();
  expect(()=>historyRootCount([parent,{...parent,value:{...parent.value,transactionNo:4}},child(2)])).toThrow();
});
it('keeps unrelated payments and invoices in the count',()=>{
  expect(historyRootCount([parent,child(2),{kind:'payment',value:{transactionNo:9}}])).toBe(2);
});
it('does not accept missing roots just because detail rows match total',async()=>{
  const rows=[parent,child(2),child(3)];
  await expect(collectPages(async()=>({rows,logicalCount:1,totalResults:3,hasMore:false}),r=>String(r.value.transactionNo))).rejects.toThrow();
});
