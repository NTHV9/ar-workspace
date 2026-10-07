import {describe,expect,it} from 'vitest';
import {strToU8,strFromU8,zipSync,unzipSync} from 'fflate';
import {parseTrackerWorkbook,patchTrackerWorkbook,patchTrackerWorkbookBatch,prepareTrackerWorkbook} from '../worker/tracker-sync/workbook';

import {fixture,identity} from './fixtures/tracker-workbook';

function localParts(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=bytes.length-22;while(view.getUint32(end,true)!==0x06054b50)end--;let cursor=view.getUint32(end+16,true);const offsets:{name:string;offset:number}[]=[];
 for(let i=0;i<view.getUint16(end+10,true);i++){const nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true);offsets.push({name:strFromU8(bytes.subarray(cursor+46,cursor+46+nameLength)),offset:view.getUint32(cursor+42,true)});cursor+=46+nameLength+extra+comment;}
 const central=view.getUint32(end+16,true);offsets.sort((a,b)=>a.offset-b.offset);return new Map(offsets.map((part,index)=>[part.name,bytes.slice(part.offset,index+1<offsets.length?offsets[index+1].offset:central)]));
}
describe('tracker OOXML boundaries',()=>{
 it('holds boolean identity, dates and financial values without treating them as 1 or 0',()=>{
  for(const raw of ['1','0'])for(const field of ['C','E','F','AG','G','R','T','U','V','W','X','S','Z','AA']){
   const parts=unzipSync(fixture());let sheet=strFromU8(parts['xl/worksheets/sheet1.xml']);
   const cell=`<c r="${field}3" t="b"><v>${raw}</v></c>`,pattern=new RegExp(`<c r="${field}3"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
   sheet=['G','X','Z','AA'].includes(field)?sheet.replace('<row r="3">','<row r="3">'+cell):sheet.replace(pattern,cell);
   parts['xl/worksheets/sheet1.xml']=strToU8(sheet);const bytes=zipSync(parts),row=parseTrackerWorkbook(bytes,'phuket').rows[0];
   expect(row.issues,field+raw).toContain(['C','E','F','AG'].includes(field)?'identity_invalid':field==='G'?'transaction_date_invalid':field+'_invalid');
   if(['R','T','U','V','W','X','S','Z','AA'].includes(field))expect(row.fields[field as 'R']).toBe(raw==='1'?'TRUE':'FALSE');
   if(['C','E','F','AG','G','R','U'].includes(field))expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folioNo:row.folio},[{field:field==='U'?'U':'R',value:'2026-10-06',expected:row.fields[field==='U'?'U':'R']??null}])).toThrow('tracker_identity_conflict');
  }
 });
 it('retains literal booleans in text fields and blocks unsupported blank date cell types',()=>{
  const parts=unzipSync(fixture());parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace(/<c r="AB3"[\s\S]*?<\/c>/,'<c r="AB3" t="b"><v>1</v></c>').replace('<c r="R3" s="1"/>','<c r="R3" t="b"/>'));
  const bytes=zipSync(parts),row=parseTrackerWorkbook(bytes,'phuket').rows[0];expect(row.fields.AB).toBe('TRUE');expect(row.blockedWriteFields).toContain('R');
  expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:null}])).toThrow();
 });
 it('reads the exact schema, self-closing blanks and identifiers without losing zeros',()=>{const rows=parseTrackerWorkbook(fixture(),'phuket').rows;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({...identity,folio:'003',formulaFields:['T'],fields:{R:null,S:'30',T:null,U:null,AB:'SYNTHETIC note & preserved'}});});
 it('preserves numeric identifiers formatted with explicit leading zeros',()=>{expect(parseTrackerWorkbook(fixture({numericId:true}),'phuket').rows[0].invoiceNo).toBe('00017');});
 it('rejects ambiguous hidden keys, excludes LFS and holds a wrong regional tab',()=>{expect(()=>parseTrackerWorkbook(fixture({duplicate:true}),'phuket')).toThrow('tracker_row_key_ambiguous');expect(parseTrackerWorkbook(fixture({hotel:'LFS'}),'khao-lak').rows).toEqual([]);expect(()=>parseTrackerWorkbook(fixture(),'khao-lak')).toThrow('tracker_schema_ambiguous');});
 it('patches only allowed numeric date cells while retaining formulas, attributes and every unrelated compressed part',()=>{
  const original=fixture(),row=parseTrackerWorkbook(original,'phuket').rows[0];const patched=patchTrackerWorkbook(original,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:null},{field:'V',value:'2026-10-07',expected:null}]);
  const before=localParts(original),after=localParts(patched);for(const [name,part] of before)if(name!=='xl/worksheets/sheet1.xml')expect(after.get(name)).toEqual(part);
  const originalXml=strFromU8(unzipSync(original)['xl/worksheets/sheet1.xml']),newXml=strFromU8(unzipSync(patched)['xl/worksheets/sheet1.xml']);
  expect(newXml.replace(/<c r="(?:R3|V3)"[^>]*>[\s\S]*?<\/c>/g,'PATCH')).toBe(originalXml.replace(/<c r="(?:R3|V3)"[^>]*\/>/g,'PATCH'));
  expect(parseTrackerWorkbook(patched,'phuket').rows[0].fields).toMatchObject({R:'2026-10-06',V:'2026-10-07',T:null});
 });
 it('checks complete current row identity and expected value; never writes protected fields or formulas',()=>{const data=fixture(),row=parseTrackerWorkbook(data,'phuket').rows[0];
  expect(()=>patchTrackerWorkbook(data,'phuket',row.rowKey,{...identity,invoiceNo:'17'},[{field:'R',value:'2026-10-06',expected:null}])).toThrow('tracker_identity_conflict');
  expect(()=>patchTrackerWorkbook(data,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:'2020-01-01'}])).toThrow('tracker_cell_conflict');
  for(const field of ['S','T','X','Y','Z','AA','AB','AC'] as const)expect(()=>patchTrackerWorkbook(data,'phuket',row.rowKey,identity,[{field,value:'2026-10-06',expected:row.fields[field]??null}])).toThrow('tracker_patch_forbidden');
  const formula=fixture({formula:true}),f=parseTrackerWorkbook(formula,'phuket').rows[0];expect(()=>patchTrackerWorkbook(formula,'phuket',f.rowKey,identity,[{field:'U',value:'2026-10-06',expected:f.fields.U??null}])).toThrow('tracker_formula_or_missing_cell');
 });
 it('respects the workbook 1904 date system and rejects malformed archive/XML',()=>{const data=fixture({date1904:true}),row=parseTrackerWorkbook(data,'phuket').rows[0];const changed=patchTrackerWorkbook(data,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:null}]);expect(parseTrackerWorkbook(changed,'phuket').rows[0].fields.R).toBe('2026-10-06');expect(()=>parseTrackerWorkbook(new Uint8Array(40),'phuket')).toThrow('tracker_workbook_invalid');
  const files=unzipSync(fixture());files['xl/workbook.xml']=strToU8('<!DOCTYPE workbook [<!ENTITY x SYSTEM "file:///etc/passwd">]><workbook/>');expect(()=>parseTrackerWorkbook(zipSync(files),'phuket')).toThrow('tracker_workbook_invalid');
 });
 it('holds derived tracking tabs and unsupported cell metadata instead of silently dropping it',()=>{
  const renamed=unzipSync(fixture());renamed['xl/workbook.xml']=strToU8(strFromU8(renamed['xl/workbook.xml']).replace('ลูกหนี้ KT+TS','Derived copy'));expect(()=>parseTrackerWorkbook(zipSync(renamed),'phuket')).toThrow('tracker_schema_ambiguous');
  const files=unzipSync(fixture());files['xl/worksheets/sheet1.xml']=strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('<c r="R3" s="1"/>','<c r="R3" s="1"><extLst><ext uri="SYNTHETIC metadata"/></extLst></c>'));
  const data=zipSync(files),row=parseTrackerWorkbook(data,'phuket').rows[0];expect(row.blockedWriteFields).toEqual(['R']);expect(row.fields.R).toBeNull();expect(()=>patchTrackerWorkbook(data,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:null}])).toThrow('tracker_cell_metadata_unsupported');
 });
 it('holds an unsupported date field without discarding the canonical row or blocking unrelated confirmed dates',()=>{
  const parts=unzipSync(fixture());parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace('<c r="W3" s="1"/>','<c r="W3" t="inlineStr"><is><t>5/10</t></is></c>'));
  const bytes=zipSync(parts),row=parseTrackerWorkbook(bytes,'phuket').rows[0];expect(row.issues).toEqual(['W_invalid']);expect(row.fields.W).toBe('5/10');
  const patched=patchTrackerWorkbook(bytes,'phuket',row.rowKey,identity,[{field:'R',value:'2026-10-06',expected:null}]);expect(parseTrackerWorkbook(patched,'phuket').rows[0].fields).toMatchObject({R:'2026-10-06',W:'5/10'});
  expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,identity,[{field:'W',value:'2026-10-06',expected:'5/10'}])).toThrow('tracker_identity_conflict');
 });
 it('patches two rows in one prepared workbook and preserves every unrelated compressed record',()=>{
  const original=fixture({rows:2}),prepared=prepareTrackerWorkbook(original,'phuket');
  const edits=prepared.snapshot.rows.map(row=>({rowKey:row.rowKey,expectedIdentity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folioNo:row.folio},changes:[{field:'R' as const,value:'2026-10-06',expected:null}]}));
  const changed=prepared.patchBatch(edits),before=localParts(original),after=localParts(changed);
  for(const [name,part] of before)if(name!=='xl/worksheets/sheet1.xml')expect(after.get(name)).toEqual(part);
  expect(parseTrackerWorkbook(changed,'phuket').rows.map(row=>row.fields.R)).toEqual(['2026-10-06','2026-10-06']);
  const invalid=edits.map(edit=>({...edit,expectedIdentity:{...edit.expectedIdentity}}));invalid[1].expectedIdentity.invoiceNo='WRONG';expect(()=>prepared.patchBatch(invalid)).toThrow('tracker_identity_conflict');
 });
 it('enforces batch bounds and keeps the prepared authority separate from caller snapshot edits',()=>{
  const original=fixture(),prepared=prepareTrackerWorkbook(original,'phuket'),row=prepared.snapshot.rows[0];row.fields.R='2026-01-01';
  const edit={rowKey:row.rowKey,expectedIdentity:identity,changes:[{field:'R' as const,value:'2026-10-06',expected:'2026-01-01'}]};
  expect(()=>prepared.patchBatch([edit])).toThrow('tracker_cell_conflict');
  expect(()=>patchTrackerWorkbookBatch(original,'phuket',Array.from({length:101},()=>edit))).toThrow('tracker_batch_limit');
  expect(()=>patchTrackerWorkbookBatch(original,'phuket',Array.from({length:100},()=>({...edit,changes:['R','U','V','W'].map(field=>({field:field as 'R',value:'2026-10-06',expected:null}))})))).toThrow('tracker_batch_limit');
 });
 it('handles the bounded 100-row, 300-date-cell batch without rebuilding unrelated workbook parts',()=>{
  const original=fixture({rows:100}),prepared=prepareTrackerWorkbook(original,'phuket');
  const edits=prepared.snapshot.rows.map(row=>({rowKey:row.rowKey,expectedIdentity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folioNo:row.folio},changes:['R','U','V'].map(field=>({field:field as 'R'|'U'|'V',value:'2026-10-06',expected:null}))}));
  const changed=prepared.patchBatch(edits);expect(parseTrackerWorkbook(changed,'phuket').rows.every(row=>row.fields.R==='2026-10-06'&&row.fields.U==='2026-10-06'&&row.fields.V==='2026-10-06')).toBe(true);
  const before=localParts(original),after=localParts(changed);for(const [name,part] of before)if(name!=='xl/worksheets/sheet1.xml')expect(after.get(name)).toEqual(part);
 });
 it('does not silently discard shared-string rich formatting on a date cell',()=>{
  const parts=unzipSync(fixture());parts['xl/sharedStrings.xml']=strToU8('<sst><si><r><rPr><b/></rPr><t>2026-10-01</t></r></si></sst>');parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace('<c r="U3" s="1"/>','<c r="U3" s="1" t="s"><v>0</v></c>'));
  const bytes=zipSync(parts),row=parseTrackerWorkbook(bytes,'phuket').rows[0];expect(row.fields.U).toBe('2026-10-01');expect(row.blockedWriteFields).toEqual(['U']);expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,identity,[{field:'U',value:'2026-10-06',expected:'2026-10-01'}])).toThrow('tracker_cell_metadata_unsupported');
 });
});
