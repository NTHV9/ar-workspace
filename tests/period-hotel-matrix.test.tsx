import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PeriodHotelMatrix,type MatrixColumn} from '../src/dashboard/PeriodHotelMatrix';

const hotels=['TLKL','WAKL','TLFO','TSAN'] as const;
const columns:MatrixColumn[]=[{
 key:'open',label:'All outstanding invoices',id:'metric-open',
 measures:[
  {hotel:'TSAN',count:2,amount:'-1250.50',onOpen:()=>{}},
  {hotel:'TLKL',count:0,amount:'0.00',onOpen:()=>{}},
  {hotel:'WAKL',count:null,amount:null,onOpen:()=>{},disabled:true},
 ],
 total:{count:7,amount:'1234567.89',onOpen:()=>{},countId:'combined-count',amountId:'combined-amount',note:'Net open balance'},
},{
 key:'sent',label:'Follow-up sends',id:'activity-sent',unit:'sends',
 measures:[{hotel:'TLKL',count:3,amount:'150.00',onOpen:()=>{}}],
 total:{count:null,amount:null,onOpen:()=>{},disabled:true,note:'Source unavailable'},
}];

function render(showTotals=false){
 return renderToStaticMarkup(<PeriodHotelMatrix title="Outstanding by hotel" description="Closing date balances" hotels={hotels} columns={columns} showTotals={showTotals}/>);
}

function hotelRow(html:string,hotel:string){
 return html.match(new RegExp('<tr[^>]*data-hotel="'+hotel+'"[^>]*>([\\s\\S]*?)</tr>'))?.[1]??'';
}

describe('period hotel matrix',()=>{
 it('associates each metric with the requested hotel order and readable row/column labels',()=>{
  const html=render();
  expect(html).toContain('<table aria-label="Outstanding by hotel"');
  expect(html).toContain('<h3>Outstanding by hotel</h3>');
  expect(html).toContain('Closing date balances');
  expect(html).toMatch(/<th[^>]*scope="col"[^>]*>All outstanding invoices<\/th>/);
  expect(html).toMatch(/<th[^>]*scope="col"[^>]*>Follow-up sends<\/th>/);
  expect([...html.matchAll(/data-hotel="([A-Z]+)"/g)].map(match=>match[1])).toEqual(['TLKL','WAKL','TLFO','TSAN']);
  expect(hotelRow(html,'TSAN')).toMatch(/<th[^>]*scope="row"[^>]*>[\s\S]*TSAN/);
  expect(hotelRow(html,'TLKL')).toContain('data-label="Follow-up sends"');
  expect(hotelRow(html,'TLKL')).toContain('aria-label="Follow-up sends · TLKL · 3 sends · ฿150.00"');
 });

 it('preserves confirmed zero, unknown, missing and signed credit without substituting zero',()=>{
  const html=render();
  const zero=hotelRow(html,'TLKL'),unknown=hotelRow(html,'WAKL'),missing=hotelRow(html,'TLFO'),credit=hotelRow(html,'TSAN');
  expect(zero).toContain('0 <small>invoices</small>');
  expect(zero).toContain('฿0.00');
  expect(unknown).toContain('— <small>invoices</small>');
  expect(unknown).toContain('<b>—</b>');
  expect(missing).toContain('data-testid="metric-open-TLFO"');
  expect(missing).toContain('<b>—</b>');
  expect(missing).not.toContain('฿0.00');
  expect(missing).not.toContain('<button');
  expect(credit).toContain('-฿1,250.50');
  expect(credit).toContain('2 <small>invoices</small>');
  expect(html).not.toContain('hotel-comparison-track');
 });

 it('keeps available drill controls, unavailable disabled controls and their original test IDs',()=>{
  const html=render();
  expect(hotelRow(html,'TLKL')).toMatch(/<button[^>]*data-testid="metric-open-TLKL"[^>]*>/);
  expect(hotelRow(html,'TLKL')).not.toContain('disabled=""');
  expect(hotelRow(html,'WAKL')).toMatch(/<button[^>]*data-testid="metric-open-WAKL"[^>]*disabled=""/);
  expect(hotelRow(html,'TSAN')).toMatch(/<button[^>]*data-testid="metric-open-TSAN"/);
 });

 it('shows source-provided totals first with exact values, units, notes and evidence IDs',()=>{
  const html=render(true),total=html.slice(html.indexOf('<tbody>'),html.indexOf('data-hotel="TLKL"'));
  expect(total).toContain('All hotels');
  expect(total).toContain('data-testid="combined-count"');
  expect(total).toContain('7 <small>invoices</small>');
  expect(total).toContain('data-testid="combined-amount"');
  expect(total).toContain('฿1,234,567.89');
  expect(total).toContain('Net open balance');
  expect(total).toContain('— <small>sends</small>');
  expect(total).toContain('Source unavailable');
  expect(total).toContain('disabled=""');
  expect(render()).not.toContain('All hotels');
 });

 it('keeps a requested total unavailable when no aggregate was provided',()=>{
  const html=renderToStaticMarkup(<PeriodHotelMatrix title="Payments" hotels={['KAT']} columns={[{key:'payment',label:'Paid amount',id:'payment-amount',measures:[{hotel:'KAT',amount:'90.00'}]}]} showTotals/>);
  const total=html.slice(html.indexOf('<tbody>'),html.indexOf('data-hotel="KAT"'));
  expect(total).toContain('All hotels');
  expect(total).toContain('—');
  expect(total).not.toContain('฿90.00');
  expect(total).not.toContain('฿0.00');
 });
});
