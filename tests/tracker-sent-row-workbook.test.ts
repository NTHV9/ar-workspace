import {describe,expect,it} from 'vitest';
import {strToU8,strFromU8,zipSync,unzipSync} from 'fflate';
import {fixture,identity} from './fixtures/tracker-workbook';
import {appendTrackerSentRows,readTrackerSentRowContext,parseTrackerWorkbook,trackerSentHeaders,type TrackerSentSourceCell} from '../worker/tracker-sync/workbook';
const column=(i:number)=>i<26?String.fromCharCode(65+i):'A'+String.fromCharCode(65+i-26);
const text=(ref:string,s:string)=>`<c r="${ref}" t="inlineStr"><is><t>${s}</t></is></c>`;
function workbook(options:{date1904?:boolean;hotel?:string}={}){const p=unzipSync(fixture(options));p['xl/worksheets/sheet1.xml']=strToU8(strFromU8(p['xl/worksheets/sheet1.xml']).replace(/<row r="2">[\s\S]*?<\/row>/,`<row r="2">${trackerSentHeaders.map((s,i)=>text(column(i)+'2',s)).join('')}</row>`).replace('<row r="3">','<row r="3">'+text('B3','SYNTHETIC AGENT')+text('G3','2026-09-01')).replace('<sheetData>','<dimension ref="A1:AG9"/><sheetData>').replace('</sheetData>','<row r="9">'+text('AK9','outside')+'</row></sheetData>'));return zipSync(p);}
function entry(){const rowKey='KT|SYNTHETIC AGENT|INV:NEW|FOL:004',values33:(string|number|null|TrackerSentSourceCell)[]=Array(33).fill(null);Object.assign(values33,{0:'KT',1:'SYNTHETIC AGENT',2:'00009',3:'=literal guest',4:'NEW',5:'004',6:{value:'2026-10-25',date:true},7:-12.5,8:0,17:{value:'2026-10-25',date:true},18:30,19:{value:'IF(R{row}="","",R{row}+S{row})',formula:true},20:{value:'2026-10-25',date:true},29:{value:'2026-10-25',date:true},30:{value:'2026-10-25',date:true},31:'active',32:rowKey});return {rowKey,identity:{...identity,invoiceNo:'NEW',folioNo:'004',transactionDate:'2026-10-25'},values33};}
const main=(b:Uint8Array)=>strFromU8(unzipSync(b)['xl/worksheets/sheet1.xml']);
function localRecords(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=bytes.length-22;while(view.getUint32(end,true)!==0x06054b50)end--;let cursor=view.getUint32(end+16,true);const parts:{name:string;offset:number}[]=[];for(let i=0;i<view.getUint16(end+10,true);i++){const n=view.getUint16(cursor+28,true);parts.push({name:strFromU8(bytes.subarray(cursor+46,cursor+46+n)),offset:view.getUint32(cursor+42,true)});cursor+=46+n+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);}parts.sort((a,b)=>a.offset-b.offset);return new Map(parts.map((part,i)=>[part.name,bytes.slice(part.offset,parts[i+1]?.offset??view.getUint32(end+16,true))]));}
describe('confirmed Sent append-only XLSX seam',()=>{
 it('reads full schema, exact identity, aliases and highest physical row in both regions',()=>{
  const context=readTrackerSentRowContext(workbook(),'phuket');expect(context.maxRow).toBe(9);expect(context.rows[0]).toMatchObject({row:3,identity:{...identity,transactionDate:'2026-09-01'},agent:'SYNTHETIC AGENT'});
  expect(readTrackerSentRowContext(workbook({hotel:'TLKL'}),'khao-lak').sheetName).toBe('ลูกหนี้ เขาหลัก');
 });
 it('only appends after max row, emits literal strings, signed values, zeros, dates and explicit due formula',()=>{
  const before=workbook(),after=appendTrackerSentRows(before,'phuket',[entry()]),old=main(before),next=main(after);expect(next).toContain('<row r="10">');expect(next).toContain('<dimension ref="A1:AK10"/>');expect(next).toContain('<c r="H10" t="n"><v>-12.5</v></c>');expect(next).toContain('<c r="I10" t="n"><v>0</v></c>');expect(next).toContain('<t xml:space="preserve">=literal guest</t>');expect(next).toContain('<f>IF(R10=&quot;&quot;,&quot;&quot;,R10+S10)</f>');
  for(const row of old.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g))expect(next).toContain(row[0]);expect(next).toContain('<c r="W10" s="1"/>');
  const a=unzipSync(before),b=unzipSync(after);for(const name of Object.keys(a))if(!['xl/worksheets/sheet1.xml','xl/styles.xml'].includes(name))expect(b[name]).toEqual(a[name]);
  const originalRecords=localRecords(before),changedRecords=localRecords(after);for(const [name,record] of originalRecords)if(!['xl/worksheets/sheet1.xml','xl/styles.xml'].includes(name))expect(changedRecords.get(name)).toEqual(record);
  expect(strFromU8(b['xl/styles.xml'])).toContain('yyyy-mm-dd');expect(readTrackerSentRowContext(after,'phuket').rows).toHaveLength(2);
 });
 it('rejects duplicate exact identity, key reuse, batch duplicates and malformed or changed schema',()=>{
  const bytes=workbook(),existing=readTrackerSentRowContext(bytes,'phuket').rows[0],next=entry();expect(()=>appendTrackerSentRows(bytes,'phuket',[{...next,identity:existing.identity}])).toThrow();
  expect(()=>appendTrackerSentRows(bytes,'phuket',[{...next,rowKey:existing.rowKey}])).toThrow();expect(()=>appendTrackerSentRows(bytes,'phuket',[next,next])).toThrow();
  const p=unzipSync(bytes);p['xl/worksheets/sheet1.xml']=strToU8(main(bytes).replace('Agent</t>','Wrong</t>'));expect(()=>appendTrackerSentRows(zipSync(p),'phuket',[next])).toThrow();
 });
 it('keeps 1904 serials correct and allows a changed account as a separate row',()=>{
  const source=workbook({date1904:true}),next=entry();next.identity.accountNo='NEWACCT';next.values33[2]='NEWACCT';const result=appendTrackerSentRows(source,'phuket',[next]);
  expect(readTrackerSentRowContext(result,'phuket').rows[1].identity).toEqual(next.identity);expect(main(result)).toContain('<v>44858</v>');
 });
 it('rejects formula injection, invalid dates, identity/key mismatches and unsupported formulas',()=>{
  const source=workbook();for(const change of [(e:ReturnType<typeof entry>)=>{e.values33[0]='TS';},(e:ReturnType<typeof entry>)=>{e.values33[32]='wrong';},(e:ReturnType<typeof entry>)=>{e.values33[20]={value:'2026-02-31',date:true};},(e:ReturnType<typeof entry>)=>{e.values33[3]={value:'NOW()',formula:true};}]){const e=entry();change(e);expect(()=>appendTrackerSentRows(source,'phuket',[e])).toThrow();}
 });
 it('rejects the exact existing identity under another legacy key and permits a different posting date',()=>{
  const bytes=workbook(),e=entry();e.identity={...identity,transactionDate:'2026-09-01'};e.values33[4]=identity.invoiceNo;e.values33[5]=identity.folioNo;e.values33[6]={value:'2026-09-01',date:true};expect(()=>appendTrackerSentRows(bytes,'phuket',[e])).toThrow('tracker_row_identity_ambiguous');
  e.identity.transactionDate='2026-10-25';e.values33[6]={value:'2026-10-25',date:true};expect(readTrackerSentRowContext(appendTrackerSentRows(bytes,'phuket',[e]),'phuket').rows).toHaveLength(2);
 });
 it('reuses validated yyyy-mm-dd formatting without rewriting the styles part and styles the due formula',()=>{
  const p=unzipSync(workbook());p['xl/styles.xml']=strToU8(strFromU8(p['xl/styles.xml']).replace('formatCode="00000"','formatCode="yyyy-mm-dd"'));const before=zipSync(p),after=appendTrackerSentRows(before,'phuket',[entry()]);
  expect(unzipSync(after)['xl/styles.xml']).toEqual(p['xl/styles.xml']);expect(main(after)).toContain('<c r="T10" s="2"><f>');
 });
 it('copies only validated formatting for new cells without copying any prior tracking contents',()=>{
  const p=unzipSync(workbook());p['xl/worksheets/sheet1.xml']=strToU8(main(zipSync(p)).replace('<row r="3">','<row r="3"><c r="H3" s="0"><v>100</v></c>'));
  const next=main(appendTrackerSentRows(zipSync(p),'phuket',[entry()]));expect(next).toContain('<c r="H10" s="0" t="n"><v>-12.5</v></c>');expect(next).toContain('<c r="V10" s="1"/>');expect(next).not.toContain('SYNTHETIC note &amp; preserved</t></is></c><c r="AC10"');
 });
 it('accepts Buffer-backed bytes without aliasing or corrupting central records',()=>{
  const original=workbook(),buffer=Buffer.from(original),output=appendTrackerSentRows(buffer,'phuket',[entry()]);expect(readTrackerSentRowContext(output,'phuket').rows).toHaveLength(2);expect(buffer).toEqual(Buffer.from(original));
 });
 it('exposes observed aliases in normal date snapshots only for literal nonblank Agent cells',()=>{
  expect(parseTrackerWorkbook(workbook(),'phuket').rows[0]).toMatchObject({agent:'SYNTHETIC AGENT',property:'KT'});
  expect(parseTrackerWorkbook(fixture(),'phuket').rows[0]).not.toHaveProperty('agent');
  const p=unzipSync(workbook());p['xl/worksheets/sheet1.xml']=strToU8(main(zipSync(p)).replace(text('B3','SYNTHETIC AGENT'),'<c r="B3"><f>"SYNTHETIC AGENT"</f><v>1</v></c>'));expect(parseTrackerWorkbook(zipSync(p),'phuket').rows[0]).not.toHaveProperty('agent');
 });
 it('reads all 49 mixed self-closing and child XFs from an Aging Master style layout',()=>{
  const p=unzipSync(workbook()),xfs=Array.from({length:49},(_,i)=>i%3===2?`<xf numFmtId="${i===35?165:0}" applyAlignment="1"><alignment vertical="center"/></xf>`:'<xf numFmtId="0" />').join('');
  p['xl/styles.xml']=strToU8(strFromU8(p['xl/styles.xml']).replace('formatCode="00000"','formatCode="yyyy-mm-dd"').replace(/<cellXfs>[\s\S]*?<\/cellXfs>/,`<cellXfs count="49">${xfs}</cellXfs>`));
  p['xl/worksheets/sheet1.xml']=strToU8(strFromU8(p['xl/worksheets/sheet1.xml']).replace('<c r="R3" s="1"/>','<c r="R3" s="35"/>'));
  const before=zipSync(p),after=appendTrackerSentRows(before,'phuket',[entry()]);expect(unzipSync(after)['xl/styles.xml']).toEqual(p['xl/styles.xml']);expect(main(after)).toContain('<c r="T10" s="35"><f>');expect(main(after)).toContain('<c r="R10" s="35" t="n">');
 });
});
