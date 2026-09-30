import {describe,it,expect,vi} from 'vitest';
import {readDetailPages,sortDetailRows} from '../src/dashboard/detail-data';
import {compareValues} from '../src/table-sort';
const row=(i:number)=>({hotel:'KAT',accountId:'synthetic',accountName:'Account '+i,transactionId:String(i),invoiceNo:String(i),originalAmount:String(i),transactionDate:'2026-09-29'});
const payload=(rows:unknown[],total:number)=>({rows,total,summary:{invoiceCount:total,amount:'500.00'},coverage:{complete:true,lastSuccessAt:'2026-09-29T00:00:00Z'}});
const run=(transport:typeof fetch,signal=new AbortController().signal)=>readDetailPages('/api/dashboard/invoice-entries?hotel=KAT','invoice_entries','synthetic',signal,()=>{},transport);
describe('continuous Dashboard detail list',()=>{
 it('reads beyond fifty with fixed scope and sorts numeric values across the full list',async()=>{
  const transport=vi.fn<typeof fetch>(async input=>{const q=new URL(String(input),'https://synthetic.invalid').searchParams;expect(q.get('hotel')).toBe('KAT');expect(q.get('limit')).toBe('50');return Response.json(payload(Number(q.get('page'))===0?Array.from({length:50},(_,i)=>row(i)):Array.from({length:12},(_,i)=>row(i+50)),62));});
  const data=await run(transport);expect(data.rows).toHaveLength(62);expect(transport).toHaveBeenCalledTimes(2);
  expect(sortDetailRows(data.rows,'invoice_entries','amount',true)[0].invoiceNo).toBe('61');
  expect(sortDetailRows(data.rows,'invoice_entries','invoice',false).slice(0,3).map(r=>r.invoiceNo)).toEqual(['0','1','2']);
 });
 for(const problem of ['duplicate','total','summary','scope','short','failure'])it('rejects an incomplete or changing read: '+problem,async()=>{
  const transport=vi.fn<typeof fetch>(async input=>{
   const page=Number(new URL(String(input),'https://synthetic.invalid').searchParams.get('page'));
   if(page===0)return Response.json(payload(Array.from({length:50},(_,i)=>row(i)),51));
   if(problem==='failure')return new Response('',{status:503});
   const p=payload(problem==='short'?[]:[{...row(problem==='duplicate'?0:50),...problem==='scope'?{hotel:'TSK'}:{}}],problem==='total'?52:51);
   if(problem==='summary')p.summary.amount='501.00';return Response.json(p);
  });
  await expect(run(transport)).rejects.toThrow();
 });
 it('cancels old scope reads before requesting another page',async()=>{
  const controller=new AbortController(),transport=vi.fn<typeof fetch>(async()=>{controller.abort();return Response.json(payload(Array.from({length:50},(_,i)=>row(i)),51));});
  await expect(run(transport,controller.signal)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(1);
 });
 it('preserves unknown coverage, signed amounts and missing-last ordering in both directions',async()=>{
  const transport=vi.fn<typeof fetch>(async()=>Response.json({...payload([],0),coverage:{complete:false}}));
  expect((await run(transport)).complete).toBe(false);
  const rows=[{...row(1),originalAmount:null},{...row(2),originalAmount:'-20.00'},{...row(3),originalAmount:'100.00'}];
  expect(sortDetailRows(rows,'invoice_entries','amount',true).map(r=>r.transactionId)).toEqual(['3','2','1']);
  expect(sortDetailRows(rows,'invoice_entries','amount',false).map(r=>r.transactionId)).toEqual(['2','3','1']);
  expect(compareValues('2','10')).toBeLessThan(0);expect(compareValues(null,0,true)).toBeGreaterThan(0);
 });
 it('keeps separate sent deliveries for the same invoice',async()=>{
  const transport=vi.fn<typeof fetch>(async()=>Response.json(payload([{...row(1),delivery_id:'a'},{...row(1),delivery_id:'b'}],2)));
  const data=await readDetailPages('/api/reports/activity?hotel=KAT','sent','synthetic',new AbortController().signal,()=>{},transport);expect(data.rows).toHaveLength(2);
 });
});
