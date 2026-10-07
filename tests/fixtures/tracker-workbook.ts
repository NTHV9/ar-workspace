import {strToU8,zipSync} from 'fflate';
import {trackerHeaders} from '../../worker/tracker-sync/workbook';
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const text=(ref:string,value:string)=>`<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
export const identity={hotel:'KAT' as const,accountNo:'00009',invoiceNo:'00017',folioNo:'003'};
export function fixture(options:{formula?:boolean;duplicate?:boolean;hotel?:string;date1904?:boolean;numericId?:boolean;rows?:number}={}){
 const headers=Object.entries(trackerHeaders).map(([col,value])=>text(col+'2',value)).join('');
 const row=text('A3',options.hotel??'KT')+text('C3','00009')+(options.numericId?'<c r="E3" s="2"><v>17</v></c>':text('E3','00017'))+text('F3','003')+
 '<c r="R3" s="1"/>'+ '<c r="S3"><v>30</v></c>'+ '<c r="T3" s="1"><f>IF(R3="","",R3+S3)</f><v/></c>'+ (options.formula?'<c r="U3" s="1"><f>NOW()</f><v>46000</v></c>':'<c r="U3" s="1"/>')+
 '<c r="V3" s="1"/><c r="W3" s="1"/>'+text('AB3','SYNTHETIC note & preserved')+text('AG3','KT|SYNTHETIC GUEST|INV:00017|FOL:003');
 const duplicate=options.duplicate?'<row r="4">'+row.replaceAll('3"','4"')+'</row>':'';
 const additional=Array.from({length:Math.max(0,(options.rows??1)-1)},(_,index)=>'<row r="'+(index+4)+'">'+row.replaceAll('3"',(index+4)+'"').replaceAll('00017',String(index+18).padStart(5,'0'))+'</row>').join('');
 const sheet=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"/></row><row r="2">${headers}</row><row r="3">${row}</row>${duplicate}${additional}</sheetData><mergeCells><mergeCell ref="B1:F1"/></mergeCells><conditionalFormatting sqref="R3:W3"><cfRule type="expression" priority="1"><formula>R3&gt;0</formula></cfRule></conditionalFormatting></worksheet>`;
 const other=strToU8('<worksheet><sheetData><row r="1">'+text('A1','SYNTHETIC archived log')+'</row></sheetData></worksheet>');
 const parts:{[name:string]:Uint8Array}={
  '[Content_Types].xml':strToU8('<Types/>'),
  'xl/workbook.xml':strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${options.date1904?'1':'0'}"/><sheets><sheet name="${options.hotel&&['SAN','WAT','LFO','TLKL','LFS'].includes(options.hotel)?'ลูกหนี้ เขาหลัก':'ลูกหนี้ KT+TS'}" sheetId="1" r:id="rId1"/><sheet name="Log" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
  'xl/styles.xml':strToU8('<styleSheet><numFmts><numFmt numFmtId="165" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="165"/></cellXfs></styleSheet>'),
  'xl/worksheets/sheet1.xml':strToU8(sheet),'xl/worksheets/sheet2.xml':other,
  'xl/worksheets/_rels/sheet1.xml.rels':strToU8('<Relationships><Relationship Id="external" TargetMode="External" Target="https://example.invalid/SYNTHETIC"/></Relationships>'),
  'xl/media/image1.bin':new Uint8Array([1,2,3,4]),
 };
 return zipSync(parts,{level:6});
}
