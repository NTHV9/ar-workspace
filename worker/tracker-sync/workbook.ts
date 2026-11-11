import {planGroups,groupMarker,moneyCents,type GroupPlan,type GroupTotal} from './transfer-groups';
import {validateTransferBatch,type TransferWrite} from './transfer-model';
import {inflateSync,Inflate} from 'fflate';
import {canResolveWithoutAccountNumber,trackerFields,trackerHotel,type TrackerField,type TrackerIdentity,type TrackerValues} from './model';
import type {RegionId} from '../../src/domain/hotels';

const decoder=new TextDecoder('utf-8',{fatal:true}),encoder=new TextEncoder();
const MAX_FILE=8*1024*1024,MAX_PART=12*1024*1024,MAX_TOTAL=64*1024*1024;
export const trackerHeaders:Readonly<Record<string,string>>={A:'Property',C:'Account No.',E:'เลขที่ Invoice',F:'Folio No.',G:'วันที่โพสต์',R:'วันที่วางบิล',S:'เครดิตเทอม (วัน)',T:'วันครบกำหนด',U:'อีเมลทวง #1',V:'อีเมลทวง #2',W:'อีเมลทวง #3',X:'วันนัดชำระใหม่',Y:'สถานะติดตาม',Z:'จำนวนเงินที่รับ',AA:'ผลต่าง',AB:'รายละเอียดการติดตาม',AC:'ผู้รับผิดชอบ',AG:'KEY (ระบบ-ห้ามแก้)'};
export interface TrackerLocator {sheetName:string;sheetPath:string;row:number;key:string}
export interface TrackerRow extends TrackerIdentity {rowKey:string;folio:string|null;transactionDate?:string|null;agent?:string;property?:string;fields:TrackerValues;formulaFields?:TrackerField[];blockedWriteFields?:('R'|'S'|'U'|'V'|'W')[];locator:TrackerLocator;issues?:string[]}
export interface ParsedTracker {rows:TrackerRow[];schemaFingerprint:string;sheetName:string;sheetPath:string;date1904:boolean}
export interface TrackerCellChange {field:TrackerField;value:string;expected:string|null}
export interface TrackerWorkbookEdit {rowKey:string;expectedIdentity:TrackerIdentity&{transactionDate?:string|null};changes:readonly TrackerCellChange[]}
export interface PreparedTrackerWorkbook {snapshot:ParsedTracker;patchBatch(edits:readonly TrackerWorkbookEdit[]):Uint8Array;groupsCorrect():boolean}
interface Entry {name:string;offset:number;method:number;flags:number;compressed:number;uncompressed:number;crc:number;central:Uint8Array;local:Uint8Array;data:Uint8Array}
interface Cell {column:string;row:number;type:string;style:number;raw:string;formula:boolean;richText:boolean;start:number;end:number;xml:string}
function fail():never {throw Error('tracker_workbook_invalid');}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const u16=(v:DataView,o:number)=>v.getUint16(o,true),u32=(v:DataView,o:number)=>v.getUint32(o,true);
function zip(bytes:Uint8Array):{entries:Entry[];comment:Uint8Array}{
 if(bytes.length<22||bytes.length>MAX_FILE)fail();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(view,i)===0x06054b50&&i+22+u16(view,i+20)===bytes.length){eocd=i;break;}}
 if(eocd<0||u16(view,eocd+4)||u16(view,eocd+6)||u16(view,eocd+8)!==u16(view,eocd+10))fail();
 const count=u16(view,eocd+10),size=u32(view,eocd+12),offset=u32(view,eocd+16);if(!count||count>4096||offset+size!==eocd)fail();
 const entries:Entry[]=[];let cursor=offset,total=0;const names=new Set<string>();
 for(let i=0;i<count;i++){
  if(cursor+46>eocd||u32(view,cursor)!==0x02014b50)fail();const n=u16(view,cursor+28),extra=u16(view,cursor+30),comment=u16(view,cursor+32),end=cursor+46+n+extra+comment;
  if(end>eocd||u16(view,cursor+34))fail();const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+n));
  if(!name||names.has(name)||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..'))fail();names.add(name);
  const flags=u16(view,cursor+8),method=u16(view,cursor+10),compressed=u32(view,cursor+20),uncompressed=u32(view,cursor+24),localOffset=u32(view,cursor+42);
  total+=uncompressed;if(flags&1||![0,8].includes(method)||uncompressed>MAX_PART||total>MAX_TOTAL||localOffset+30>offset||compressed===0xffffffff||uncompressed===0xffffffff)fail();
  if(u32(view,localOffset)!==0x04034b50||u16(view,localOffset+8)!==method||u16(view,localOffset+6)!==flags)fail();
  const localName=u16(view,localOffset+26),localExtra=u16(view,localOffset+28),dataOffset=localOffset+30+localName+localExtra;
  if(dataOffset+compressed>offset||decoder.decode(bytes.subarray(localOffset+30,localOffset+30+localName))!==name)fail();
  entries.push({name,offset:localOffset,method,flags,compressed,uncompressed,crc:u32(view,cursor+16),central:bytes.slice(cursor,end),local:new Uint8Array(),data:bytes.subarray(dataOffset,dataOffset+compressed)});cursor=end;
 }
 if(cursor!==eocd)fail();const ordered=[...entries].sort((a,b)=>a.offset-b.offset);if(ordered[0].offset!==0)fail();
 for(let i=0;i<ordered.length;i++){const end=i+1<ordered.length?ordered[i+1].offset:offset;if(end<ordered[i].data.byteOffset-bytes.byteOffset+ordered[i].compressed)fail();ordered[i].local=bytes.slice(ordered[i].offset,end);}
 return {entries:ordered,comment:bytes.slice(eocd+22)};
}
function unpack(entry:Entry):Uint8Array {
 const value=entry.method===0?entry.data:inflateSync(entry.data,{out:new Uint8Array(entry.uncompressed)});
 if(value.length!==entry.uncompressed||crc32(value)!==entry.crc)fail();return value;
}
function xml(entries:Entry[],name:string):string {const entry=entries.find(e=>e.name===name);if(!entry)fail();const value=decoder.decode(unpack(entry));if(/<!DOCTYPE|<!ENTITY/i.test(value))fail();return value;}
function headerXml(entry:Entry):string {
 if(entry.method===0)return new TextDecoder('utf-8',{fatal:true}).decode(entry.data.subarray(0,32768),{stream:true});
 let result='',size=0;const decode=new TextDecoder('utf-8',{fatal:true});const stream=new Inflate(chunk=>{size+=chunk.length;if(size>131072)fail();result+=decode.decode(chunk,{stream:true});});
 for(let offset=0;offset<entry.data.length&&offset<16384;offset+=128){stream.push(entry.data.subarray(offset,Math.min(offset+128,entry.data.length)),false);if(/<(?:\w+:)?row\b[^>]*\br=["']2["'][^>]*>[\s\S]*?<\/(?:\w+:)?row\s*>/.test(result))break;}
 if(/<!DOCTYPE|<!ENTITY/i.test(result))fail();return result;
}
function entities(value:string):string {return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,key:string)=>{
 const known:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(key[0]!=='#')return known[key];const num=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));if(!Number.isInteger(num)||num<0||num>0x10ffff)fail();return String.fromCodePoint(num);
 });}
function attrs(tag:string):Record<string,string>{const value:Record<string,string>={};for(const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){if(Object.hasOwn(value,match[1]))fail();value[match[1]]=entities(match[2]??match[3]);}return value;}
const texts=(value:string)=>[...value.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t\s*>/g)].map(m=>entities(m[1])).join('');
function cells(value:string,shared:string[],sharedRich:readonly boolean[]=[]):Cell[]{
 const result:Cell[]=[];const seen=new Set<string>();for(const match of value.matchAll(/<(?:\w+:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c\s*>)/g)){
  const a=attrs(match[0].slice(0,match[0].indexOf('>')+1)),ref=/^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(a.r??'');if(!ref||seen.has(a.r))fail();seen.add(a.r);
  const v=/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v\s*>/.exec(match[0]);let raw=v?entities(v[1]):'';
  let richText=/<(?:\w+:)?r(?:\s|>)/.test(match[0]);if(a.t==='s'){if(!/^\d+$/.test(raw)||Number(raw)>=shared.length)fail();richText=sharedRich[Number(raw)]??false;raw=shared[Number(raw)];}else if(a.t==='inlineStr')raw=texts(match[0]);
  if(a.t==='b')raw=raw==='1'?'TRUE':raw==='0'?'FALSE':raw;
  result.push({column:ref[1],row:Number(ref[2]),type:a.t??'n',style:Number(a.s??0),raw,formula:/<(?:\w+:)?f(?:\s|\/|>)/.test(match[0]),richText,start:match.index!,end:match.index!+match[0].length,xml:match[0]});
 }return result;
}
function headersMatch(map:Map<string,Cell>,row:number):boolean{return Object.entries(trackerHeaders).every(([col,text])=>(map.get(col+row)??(col==='A'?map.get('A1'):undefined))?.raw.trim()===text);}
function dateString(value:string,date1904:boolean):string|null {
 if(!value)return null;if(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return value.slice(0,10);
 if(/^\d+(?:\.\d+)?$/.test(value)){const serial=Number(value);if(serial<1||serial>100000)throw Error('tracker_date_invalid');const base=Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30);return new Date(base+Math.floor(serial)*86400000).toISOString().slice(0,10);}
 const date=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value.trim());if(date){let year=Number(date[3]);if(year<100)year+=2000;if(year>2400)year-=543;const parsed=new Date(Date.UTC(year,Number(date[2])-1,Number(date[1])));if(parsed.getUTCDate()!==Number(date[1])||parsed.getUTCMonth()!==Number(date[2])-1)throw Error('tracker_date_invalid');return parsed.toISOString().slice(0,10);}
 throw Error('tracker_date_invalid');
}
export {dateString as trackerDateValue};
/** Canonical numeric text roundtrips through typed provider number cells. */
export function validTrackerCredit(value:unknown):value is string {return typeof value==='string'&&/^(?:0|[1-9]\d{0,3})$/.test(value)&&Number(value)<=3650;}
const dateFields=new Set<TrackerField>(['R','T','U','V','W','X']);
const scalarTypes=new Set(['n','s','inlineStr','str']),dateTypes=new Set([...scalarTypes,'d']);
function value(cell:Cell|undefined,field:TrackerField,date1904:boolean):string|null {
 if(!cell)return null;const numeric=field==='S'||field==='Z'||field==='AA';
 if(!(dateFields.has(field)?dateTypes:scalarTypes).has(cell.type)&&!(cell.type==='b'&&!dateFields.has(field)&&!numeric&&['TRUE','FALSE'].includes(cell.raw)))throw Error('tracker_cell_type_unsupported');
 if(cell.raw==='')return null;return dateFields.has(field)?dateString(cell.raw,date1904):cell.raw;
}
function blockedDateCell(cell:Cell|undefined):boolean {
 if(!cell||cell.formula||cell.richText||!dateTypes.has(cell.type))return true;
 const inner=cell.xml.endsWith('/>')?'':cell.xml.slice(cell.xml.indexOf('>')+1,cell.xml.lastIndexOf('</'));
 return !!inner.replace(/<(?:\w+:)?v\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?v\s*>)/g,'').replace(/<(?:\w+:)?is\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?is\s*>)/g,'').trim();
}
function load(bytes:Uint8Array,region:RegionId,sentIdentity=false){
 const archive=zip(bytes),entries=archive.entries,workbook=xml(entries,'xl/workbook.xml'),relationships=xml(entries,'xl/_rels/workbook.xml.rels');
 const date1904=/\bdate1904=["'](?:1|true)["']/.test(workbook),sharedEntry=entries.find(e=>e.name==='xl/sharedStrings.xml');
 const sharedParts=sharedEntry?[...xml(entries,'xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si\s*>/g)].map(m=>m[1]):[],shared=sharedParts.map(texts),sharedRich=sharedParts.map(part=>/<(?:\w+:)?r(?:\s|>)/.test(part));
 const formats=new Map<number,string>(),styleFormats:number[]=[];
 if(entries.some(e=>e.name==='xl/styles.xml')){const styles=xml(entries,'xl/styles.xml');for(const m of styles.matchAll(/<(?:\w+:)?numFmt\b[^>]*\/?\s*>/g)){const a=attrs(m[0]);formats.set(Number(a.numFmtId),a.formatCode);}
  const xfs=/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs\s*>/.exec(styles)?.[1]??'';for(const m of xfs.matchAll(/<(?:\w+:)?xf\b[^>]*\/?\s*>/g))styleFormats.push(Number(attrs(m[0]).numFmtId??0));}
 const identityValue=(cell:Cell|undefined):string=>{if(!cell)return '';if(cell.formula||!scalarTypes.has(cell.type))throw Error('tracker_row_identity_invalid');const raw=cell.raw.trim(),format=formats.get(styleFormats[cell.style]);if(cell.type==='n'&&/^\d+$/.test(raw)&&format&&/^0{2,20}$/.test(format))return raw.padStart(format.length,'0');return raw;};
 const rels=new Map<string,string>();for(const match of relationships.matchAll(/<(?:\w+:)?Relationship\b[^>]*\/?\s*>/g)){const a=attrs(match[0]);if(a.TargetMode==='External')continue;let target=a.Target??'';if(target.startsWith('/'))target=target.slice(1);else target='xl/'+target;if(target.includes('..')||target.includes('\\'))fail();rels.set(a.Id,target);}
 const choices:{name:string;path:string}[]=[];
 for(const match of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?\s*>/g)){
  const a=attrs(match[0]),path=rels.get(a['r:id']);if(!path||!path.startsWith('xl/worksheets/'))continue;
  const entry=entries.find(e=>e.name===path);if(!entry)fail();const prefix=headerXml(entry),map=new Map(cells(prefix,shared,sharedRich).map(c=>[c.column+c.row,c]));if(headersMatch(map,2))choices.push({name:a.name,path});
 }
 const expectedName=region==='phuket'?'ลูกหนี้ KT+TS':'ลูกหนี้ เขาหลัก';
 if(choices.length!==1||choices[0].name!==expectedName)throw Error('tracker_schema_ambiguous');const text=xml(entries,choices[0].path),all=cells(text,shared,sharedRich),map=new Map(all.map(c=>[c.column+c.row,c]));const chosen={...choices[0],text,cells:all,map};const rows:TrackerRow[]=[];const keys=new Set<string>(),identities=new Set<string>();
 for(const key of chosen.cells.filter(c=>c.column==='AG'&&c.row>2&&c.raw)){
  const get=(col:string)=>chosen.map.get(col+key.row);const hotel=trackerHotel(get('A')?.raw??'',region);if(!hotel)continue;
  const issues:string[]=[];let accountNo='',invoiceNo='',folio:string|null=null;
  if(!scalarTypes.has(key.type))issues.push('identity_invalid');
  try{accountNo=identityValue(get('C'));invoiceNo=identityValue(get('E'));folio=identityValue(get('F'))||null;}catch{issues.push('identity_invalid');}
  if(!accountNo)issues.push('account_missing');if(!invoiceNo)issues.push('invoice_missing');
  let transactionDate:string|null=null;try{const posting=get('G');if(posting&&(posting.formula||!dateTypes.has(posting.type)))throw Error('tracker_row_identity_invalid');transactionDate=dateString(posting?.raw??'',date1904);}catch{issues.push('transaction_date_invalid');}
  if(keys.has(key.raw))throw Error('tracker_row_key_ambiguous');keys.add(key.raw);
  if(accountNo&&invoiceNo){const identityKey=JSON.stringify([hotel,accountNo,invoiceNo,folio,...(sentIdentity?[transactionDate]:[])]);if(identities.has(identityKey))throw Error('tracker_row_identity_ambiguous');identities.add(identityKey);}
  const fields:TrackerValues={};for(const field of trackerFields){try{fields[field]=value(get(field),field,date1904);}catch{fields[field]=get(field)?.raw??null;issues.push(field+'_invalid');}}
  const formulaFields=trackerFields.filter(field=>get(field)?.formula);
  const blockedWriteFields=(['R','S','U','V','W'] as const).filter(field=>blockedDateCell(get(field))||field==='S'&&!scalarTypes.has(get(field)?.type??''));
  const agent=get('B'),aliases=agent&&!agent.formula&&scalarTypes.has(agent.type)&&agent.raw.trim()?{agent:agent.raw,property:get('A')?.raw??''}:{};
  rows.push({rowKey:key.raw,hotel,accountNo,invoiceNo,folioNo:folio,folio,transactionDate,...aliases,fields,...(formulaFields.length?{formulaFields}:{}),...(blockedWriteFields.length?{blockedWriteFields}:{}),locator:{sheetName:chosen.name,sheetPath:chosen.path,row:key.row,key:key.raw},...(issues.length?{issues}:{})});
 }
 return {entries,archiveComment:archive.comment,chosen,parsed:{rows,schemaFingerprint:JSON.stringify([chosen.name,chosen.path,trackerHeaders]),sheetName:chosen.name,sheetPath:chosen.path,date1904} satisfies ParsedTracker};
}
export function prepareTrackerWorkbook(bytes:Uint8Array,region:RegionId):PreparedTrackerWorkbook {
 try{const loaded=load(bytes,region),snapshot={...loaded.parsed,rows:loaded.parsed.rows.map(row=>({...row,fields:{...row.fields},locator:{...row.locator},...(row.issues?{issues:[...row.issues]}:{}),...(row.formulaFields?{formulaFields:[...row.formulaFields]}:{}),...(row.blockedWriteFields?{blockedWriteFields:[...row.blockedWriteFields]}:{})}))};return {snapshot,patchBatch:edits=>patchLoadedWorkbook(loaded,edits),groupsCorrect:()=>{try{const plan=workbookGroups(loaded);return !plan||!plan.changed;}catch{return false;}}};}catch(error){if(error instanceof Error&&error.message.startsWith('tracker_'))throw error;throw Error('tracker_workbook_invalid');}
}
export function parseTrackerWorkbook(bytes:Uint8Array,region:RegionId):ParsedTracker {return prepareTrackerWorkbook(bytes,region).snapshot;}
function serialize(entries:Entry[],changedName:string,content:Uint8Array,comment:Uint8Array):Uint8Array {
 const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
 for(const entry of entries){let local=entry.local,central=entry.central.slice();const cv=new DataView(central.buffer);cv.setUint32(42,offset,true);
  if(entry.name===changedName){const lv=new DataView(local.buffer,local.byteOffset,local.byteLength),headerLength=30+u16(lv,26)+u16(lv,28),header=local.slice(0,headerLength),hv=new DataView(header.buffer),crc=crc32(content);
   hv.setUint16(6,entry.flags&~8,true);hv.setUint16(8,0,true);hv.setUint32(14,crc,true);hv.setUint32(18,content.length,true);hv.setUint32(22,content.length,true);
   cv.setUint16(8,entry.flags&~8,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,content.length,true);cv.setUint32(24,content.length,true);
   local=new Uint8Array(header.length+content.length);local.set(header);local.set(content,header.length);
  }locals.push(local);centrals.push(central);offset+=local.length;
 }
 const centralSize=centrals.reduce((n,c)=>n+c.length,0),out=new Uint8Array(offset+centralSize+22+comment.length);let position=0;for(const local of locals){out.set(local,position);position+=local.length;}for(const central of centrals){out.set(central,position);position+=central.length;}
 const end=new DataView(out.buffer,position,22);end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);end.setUint16(20,comment.length,true);out.set(comment,position+22);if(out.length>MAX_FILE)throw Error('tracker_workbook_too_large');return out;
}
function patchLoadedWorkbook(loaded:ReturnType<typeof load>,edits:readonly TrackerWorkbookEdit[]):Uint8Array {
 if(!edits.length||edits.length>100||edits.reduce((sum,edit)=>sum+edit.changes.length,0)>300)throw Error('tracker_batch_limit');
 if(loaded.entries.some(e=>e.name.startsWith('_xmlsignatures/')))throw Error('tracker_signed_workbook_unsupported');
 const rows=new Map(loaded.parsed.rows.map(row=>[row.rowKey,row])),identityIssues=new Set(['identity_invalid','account_missing','invoice_missing','transaction_date_invalid']);
 const replacements:{start:number;end:number;value:string}[]=[],seen=new Map<string,TrackerCellChange>();let text=loaded.chosen.text;
 for(const {rowKey,expectedIdentity,changes} of edits){const row=rows.get(rowKey);
 if(!row||row.issues?.some(issue=>identityIssues.has(issue)&&!(issue==='account_missing'&&canResolveWithoutAccountNumber(row))||changes.some(change=>issue===change.field+'_invalid'))||row.hotel!==expectedIdentity.hotel||row.accountNo!==expectedIdentity.accountNo||row.invoiceNo!==expectedIdentity.invoiceNo||(row.folio??null)!==(expectedIdentity.folioNo??null)||(expectedIdentity.transactionDate!==undefined&&row.transactionDate!==expectedIdentity.transactionDate))throw Error('tracker_identity_conflict');
 if(!changes.length||changes.length>4||new Set(changes.map(c=>c.field)).size!==changes.length)throw Error('tracker_patch_invalid');
 for(const change of changes){const credit=change.field==='S';if(credit?change.expected!==null||!validTrackerCredit(change.value):!['R','U','V','W'].includes(change.field)||!/^\d{4}-\d{2}-\d{2}$/.test(change.value))throw Error('tracker_patch_forbidden');
  if(row.fields[change.field]!==change.expected)throw Error('tracker_cell_conflict');const cell=loaded.chosen.map.get(change.field+row.locator.row);if(!cell||cell.formula)throw Error('tracker_formula_or_missing_cell');
  const reference=change.field+row.locator.row,prior=seen.get(reference);if(prior){if(prior.value!==change.value||prior.expected!==change.expected)throw Error('tracker_cell_conflict');continue;}seen.set(reference,change);
  if(blockedDateCell(cell)||credit&&!scalarTypes.has(cell.type))throw Error('tracker_cell_metadata_unsupported');
  if(credit){
   const tag=/^<([^\s>]+)/.exec(cell.xml)?.[1];if(!tag)fail();let opening=cell.xml.slice(0,cell.xml.indexOf('>')+1).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/, '>');opening=opening.slice(0,-1)+' t="n">';const prefix=tag.includes(':')?tag.split(':')[0]+':':'';
   replacements.push({start:cell.start,end:cell.end,value:opening+'<'+prefix+'v>'+change.value+'</'+prefix+'v></'+tag+'>'});continue;
  }
  const time=Date.parse(change.value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==change.value)throw Error('tracker_patch_invalid');
  const serial=Math.round((time-Date.UTC(loaded.parsed.date1904?1904:1899,loaded.parsed.date1904?0:11,loaded.parsed.date1904?1:30))/86400000);
  const tag=/^<([^\s>]+)/.exec(cell.xml)?.[1];if(!tag)fail();let opening=cell.xml.slice(0,cell.xml.indexOf('>')+1).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/, '>');opening=opening.slice(0,-1)+' t="n">';const prefix=tag.includes(':')?tag.split(':')[0]+':':'';
  replacements.push({start:cell.start,end:cell.end,value:opening+'<'+prefix+'v>'+serial+'</'+prefix+'v></'+tag+'>'});
 }
 }
 const chunks:string[]=[];let cursor=0;
 for(const replacement of replacements.sort((a,b)=>a.start-b.start)){if(replacement.start<cursor)throw Error('tracker_cell_conflict');chunks.push(text.slice(cursor,replacement.start),replacement.value);cursor=replacement.end;}
 chunks.push(text.slice(cursor));text=chunks.join('');
 return serialize(loaded.entries,loaded.chosen.path,encoder.encode(text),loaded.archiveComment);
}
export function patchTrackerWorkbookBatch(bytes:Uint8Array,region:RegionId,edits:readonly TrackerWorkbookEdit[]):Uint8Array {return prepareTrackerWorkbook(bytes,region).patchBatch(edits);}
export function patchTrackerWorkbook(bytes:Uint8Array,region:RegionId,rowKey:string,expectedIdentity:TrackerIdentity&{transactionDate?:string|null},changes:readonly TrackerCellChange[]):Uint8Array {return patchTrackerWorkbookBatch(bytes,region,[{rowKey,expectedIdentity,changes}]);}

/** Full combined-sheet schema required only for creating a confirmed-Sent row. */
export const trackerSentHeaders=['Property','Agent','Account No.','ชื่อผู้เข้าพัก (Guest)','เลขที่ Invoice','Folio No.','วันที่โพสต์','ยอดค้าง (บาท)','0-30','31-60','61-90','91-120','121-150','151+','อายุใบ (วัน)','กลุ่มอายุ','สถานะอายุ','วันที่วางบิล','เครดิตเทอม (วัน)','วันครบกำหนด','อีเมลทวง #1','อีเมลทวง #2','อีเมลทวง #3','วันนัดชำระใหม่','สถานะติดตาม','จำนวนเงินที่รับ','ผลต่าง','รายละเอียดการติดตาม','ผู้รับผิดชอบ','พบครั้งแรก','อัปเดตล่าสุด','สถานะแถว','KEY (ระบบ-ห้ามแก้)'] as const;
export interface TrackerSentSourceCell {value:string|number|null;formula?:true;date?:true}
export interface TrackerSentRowIdentity extends TrackerIdentity {folioNo:string|null;transactionDate:string|null}
export interface TrackerSentRowEntry {rowKey:string;identity:TrackerSentRowIdentity;values33:readonly (string|number|null|TrackerSentSourceCell)[]}
export interface TrackerSentRowContext {sheetName:string;sheetPath:string;date1904:boolean;rows:{rowKey:string;row:number;identity:TrackerSentRowIdentity;agent:string;property:string}[];maxRow:number}
const sentColumn=(index:number):string=>index<26?String.fromCharCode(65+index):'A'+String.fromCharCode(65+index-26);
const sentColumnIndex=(column:string):number=>{let index=0;for(const c of column)index=index*26+c.charCodeAt(0)-64;return index-1;};
const sentEscape=(value:string):string=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function sentIdentityKey(identity:TrackerSentRowIdentity):string {return JSON.stringify([identity.hotel,identity.accountNo,identity.invoiceNo,identity.folioNo??null,identity.transactionDate??null]);}
function sentLoad(bytes:Uint8Array,region:RegionId){
 // Buffer.slice() aliases storage; the lossless ZIP writer requires owned slices.
 const loaded=load(Uint8Array.from(bytes),region,true),map=loaded.chosen.map;
 if(!trackerSentHeaders.every((text,index)=>{const cell=map.get(sentColumn(index)+'2');return cell&&!cell.formula&&scalarTypes.has(cell.type)&&cell.raw===text;}))throw Error('tracker_sent_schema_invalid');
 const mainSheet=[...xml(loaded.entries,'xl/workbook.xml').matchAll(/<(?:\w+:)?sheet\b[^>]*\/?\s*>/g)].map(match=>attrs(match[0])).find(a=>a.name===loaded.chosen.name);if(mainSheet?.state&&mainSheet.state!=='visible')throw Error('tracker_sent_schema_invalid');
 const keys=new Set<string>();for(const key of loaded.chosen.cells.filter(cell=>cell.column==='AG'&&cell.row>2&&cell.raw)){if(key.formula||!scalarTypes.has(key.type)||keys.has(key.raw))throw Error('tracker_row_key_ambiguous');keys.add(key.raw);}
 let maxRow=2,last=0;for(const match of loaded.chosen.text.matchAll(/<(?:\w+:)?row\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?row\s*>)/g)){
  const row=Number(attrs(match[0].slice(0,match[0].indexOf('>')+1)).r);if(!Number.isInteger(row)||row<1||row>1048576||row<=last)throw Error('tracker_sent_row_invalid');last=row;maxRow=Math.max(maxRow,row);
 }
 for(const cell of loaded.chosen.cells){maxRow=Math.max(maxRow,cell.row);if(cell.row>2&&cell.column==='A'&&trackerHotel(cell.raw,region)&&!map.get('AG'+cell.row)?.raw)throw Error('tracker_sent_key_missing');}
 const rows=loaded.parsed.rows.map(row=>{if(row.issues?.some(issue=>['identity_invalid','invoice_missing','transaction_date_invalid'].includes(issue)))throw Error('tracker_identity_conflict');const agent=map.get('B'+row.locator.row);if(agent?.formula||agent&&!scalarTypes.has(agent.type))throw Error('tracker_identity_conflict');return {rowKey:row.rowKey,row:row.locator.row,identity:{hotel:row.hotel,accountNo:row.accountNo,invoiceNo:row.invoiceNo,folioNo:row.folioNo??null,transactionDate:row.transactionDate??null},agent:agent?.raw??'',property:map.get('A'+row.locator.row)?.raw??''};});
 return {loaded,keys,context:{sheetName:loaded.chosen.name,sheetPath:loaded.chosen.path,date1904:loaded.parsed.date1904,rows,maxRow} satisfies TrackerSentRowContext};
}
export function readTrackerSentRowContext(bytes:Uint8Array,region:RegionId):TrackerSentRowContext {return sentLoad(bytes,region).context;}
function sentDay(value:string):number {if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('tracker_sent_date_invalid');const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw Error('tracker_sent_date_invalid');return time;}
function sentDateStyle(loaded:ReturnType<typeof load>):{style:number;changed?:string} {
 const styles=xml(loaded.entries,'xl/styles.xml'),prefix=/<((?:\w+:)?)styleSheet\b/.exec(styles)?.[1]??'';
 const section=/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs\s*>/.exec(styles);if(!section)throw Error('tracker_sent_styles_invalid');
 const formats=new Map<number,string>();for(const match of styles.matchAll(/<(?:\w+:)?numFmt\b[^>]*\/?\s*>/g)){const a=attrs(match[0]);formats.set(Number(a.numFmtId),a.formatCode);}
 const xfs=[...section[1].matchAll(/<(?:\w+:)?xf\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf\s*>)/g)].map(m=>m[0]);
 const known=xfs.findIndex(xf=>formats.get(Number(attrs(xf.slice(0,xf.indexOf('>')+1)).numFmtId))==='yyyy-mm-dd');if(known>=0)return {style:known};
 const id=Math.max(163,...formats.keys())+1,format=`<${prefix}numFmt numFmtId="${id}" formatCode="yyyy-mm-dd"/>`;let changed=styles;
 const numFmts=/<(?:\w+:)?numFmts\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?numFmts\s*>)/.exec(styles);
 if(numFmts){const count=[...numFmts[0].matchAll(/<(?:\w+:)?numFmt\b/g)].length,opening=numFmts[0].slice(0,numFmts[0].indexOf('>')+1).replace(/\s+count\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/,'>'),tag=/^<([^\s>]+)/.exec(opening)![1];const body=numFmts[0].endsWith('/>')?'':numFmts[0].slice(numFmts[0].indexOf('>')+1,numFmts[0].lastIndexOf('</'));changed=changed.replace(numFmts[0],opening.slice(0,-1)+` count="${count+1}">`+body+format+`</${tag}>`);}else{const rootEnd=changed.indexOf('>',changed.indexOf('styleSheet'));changed=changed.slice(0,rootEnd+1)+`<${prefix}numFmts count="1">${format}</${prefix}numFmts>`+changed.slice(rootEnd+1);}
 const rTemplate=loaded.chosen.cells.find(c=>c.column==='R'&&c.row>2),template=xfs[rTemplate?.style??0];if(!template)throw Error('tracker_sent_styles_invalid');
 const xf=template.replace(/\s+numFmtId\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\s+applyNumberFormat\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/^(<[^\s>]+)/,`$1 numFmtId="${id}" applyNumberFormat="1"`);
 const opening=section[0].slice(0,section[0].indexOf('>')+1).replace(/\s+count\s*=\s*(?:"[^"]*"|'[^']*')/,'');changed=changed.replace(section[0],opening.slice(0,-1)+` count="${xfs.length+1}">`+section[1]+xf+section[0].slice(section[0].lastIndexOf('</')));return {style:xfs.length,changed};
}
/** Appends only; all prior row XML and unrelated ZIP records remain untouched. */
export function appendTrackerSentRows(bytes:Uint8Array,region:RegionId,entries:readonly TrackerSentRowEntry[]):Uint8Array {
 const {loaded,context,keys}=sentLoad(bytes,region);if(!entries.length||entries.length>100||context.maxRow+entries.length>1048576)throw Error('tracker_batch_limit');if(loaded.entries.some(e=>e.name.startsWith('_xmlsignatures/')))throw Error('tracker_signed_workbook_unsupported');
 const identities=new Set(context.rows.map(row=>sentIdentityKey(row.identity))),dateColumns=new Set([6,17,19,20,21,22,23,29,30]);
 const close=/<\/(?:\w+:)?sheetData\s*>/.exec(loaded.chosen.text);if(!close||[...loaded.chosen.text.matchAll(/<(?:\w+:)?sheetData\b/g)].length!==1)throw Error('tracker_sent_schema_invalid');const prefix=/^<\/((?:\w+:)?)/.exec(close[0])?.[1]??'';
 const dateStyle=sentDateStyle(loaded),styleSection=/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs\s*>/.exec(xml(loaded.entries,'xl/styles.xml')),styleCount=[...(styleSection?.[1]??'').matchAll(/<(?:\w+:)?xf\b/g)].length,templateStyles=new Map<string,number>();
 const identityRows=new Set(context.rows.map(row=>row.row));for(const cell of loaded.chosen.cells){if(!identityRows.has(cell.row)||templateStyles.has(cell.column)||!Object.hasOwn(attrs(cell.xml.slice(0,cell.xml.indexOf('>')+1)),'s'))continue;if(!Number.isInteger(cell.style)||cell.style<0||cell.style>=styleCount)throw Error('tracker_sent_styles_invalid');templateStyles.set(cell.column,cell.style);}
 let added='';for(let offset=0;offset<entries.length;offset++){
  const entry=entries[offset],row=context.maxRow+offset+1;if(!entry.rowKey||entry.values33.length!==33||keys.has(entry.rowKey))throw Error('tracker_row_key_ambiguous');keys.add(entry.rowKey);
  const values=entry.values33.map(input=>input!==null&&typeof input==='object'?input:{value:input});
  if(values.some(cell=>!cell||cell.formula&&cell.date||Object.keys(cell).some(key=>!['value','formula','date'].includes(key))||cell.formula!==undefined&&cell.formula!==true||cell.date!==undefined&&cell.date!==true))throw Error('tracker_sent_cell_invalid');
  const plain=values.map(cell=>cell.value),hotel=typeof plain[0]==='string'?trackerHotel(plain[0],region):null;
  if(!hotel||typeof plain[2]!=='string'||!plain[2]||typeof plain[4]!=='string'||!plain[4]||plain[5]!==null&&typeof plain[5]!=='string'||plain[6]!==null&&typeof plain[6]!=='string'||plain[32]!==entry.rowKey||values.slice(0,7).some(cell=>cell.formula))throw Error('tracker_identity_conflict');
  const identity:TrackerSentRowIdentity={hotel,accountNo:plain[2],invoiceNo:plain[4],folioNo:plain[5]||null,transactionDate:plain[6]===null?null:(sentDay(plain[6]),plain[6])};if(sentIdentityKey(identity)!==sentIdentityKey(entry.identity))throw Error('tracker_identity_conflict');const key=sentIdentityKey(identity);if(identities.has(key))throw Error('tracker_row_identity_ambiguous');identities.add(key);
  added+=`<${prefix}row r="${row}">`;for(let index=0;index<33;index++){
   const cell=values[index],value=cell.value,column=sentColumn(index),ref=column+row,style=templateStyles.get(column),styleAttr=style===undefined?'':` s="${style}"`;
   if(value!==null&&typeof value!=='number'&&typeof value!=='string'||typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&(value.length>32767||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)))throw Error('tracker_sent_cell_invalid');
   if(cell.formula){if(index!==19||typeof value!=='string'||!value)throw Error('tracker_sent_formula_forbidden');const formula=value.replace(/^=/,'').replaceAll('{row}',String(row));added+=`<${prefix}c r="${ref}" s="${dateStyle.style}"><${prefix}f>${sentEscape(formula)}</${prefix}f></${prefix}c>`;continue;}
   if(cell.date){if(!dateColumns.has(index)||typeof value!=='string')throw Error('tracker_sent_date_invalid');const serial=Math.round((sentDay(value)-Date.UTC(context.date1904?1904:1899,context.date1904?0:11,context.date1904?1:30))/86400000);if(serial<1||serial>100000)throw Error('tracker_sent_date_invalid');added+=`<${prefix}c r="${ref}" s="${dateStyle.style}" t="n"><${prefix}v>${serial}</${prefix}v></${prefix}c>`;continue;}
   if(value===null){added+=`<${prefix}c r="${ref}"${styleAttr}/>`;continue;}if(typeof value==='number'){added+=`<${prefix}c r="${ref}"${styleAttr} t="n"><${prefix}v>${value}</${prefix}v></${prefix}c>`;continue;}
   added+=`<${prefix}c r="${ref}"${styleAttr} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${sentEscape(value)}</${prefix}t></${prefix}is></${prefix}c>`;
  }added+=`</${prefix}row>`;
 }
 let text=loaded.chosen.text.slice(0,close.index)+added+loaded.chosen.text.slice(close.index);
 const dimension=/<(?:\w+:)?dimension\b[^>]*\/?\s*>/.exec(text);if(dimension){const a=attrs(dimension[0]),ref=/^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/.exec(a.ref??'');if(!ref)throw Error('tracker_sent_dimension_invalid');const maxCol=loaded.chosen.cells.reduce((max,c)=>Math.max(max,sentColumnIndex(c.column)),32),endCol=sentColumnIndex(ref[3]??ref[1])>maxCol?(ref[3]??ref[1]):maxCol<26?String.fromCharCode(65+maxCol):(()=>{let i=maxCol+1,result='';while(i){i--;result=String.fromCharCode(65+i%26)+result;i=Math.floor(i/26);}return result;})();const endRow=Math.max(Number(ref[4]??ref[2]),context.maxRow+entries.length);text=text.replace(dimension[0],dimension[0].replace(/\bref\s*=\s*(?:"[^"]*"|'[^']*')/,`ref="${ref[1]}${ref[2]}:${endCol}${endRow}"`));}
 let output=serialize(loaded.entries,loaded.chosen.path,encoder.encode(text),loaded.archiveComment);if(dateStyle.changed){const archive=zip(output);output=serialize(archive.entries,'xl/styles.xml',encoder.encode(dateStyle.changed),archive.comment);}return output;
}

/** Transfer identity and Agent grouping while preserving invoice values and formula semantics. */
export function patchTrackerTransfers(bytes:Uint8Array,region:RegionId,inputs:readonly TransferWrite[]):Uint8Array {
 const loaded=load(Uint8Array.from(bytes),region),snapshot={...loaded.parsed,version:'patch',capabilities:{conditionalWrite:'proven' as const}};
 const rows=validateTransferBatch(snapshot,inputs);
 if(loaded.entries.some(e=>e.name.startsWith('_xmlsignatures/')))throw Error('tracker_signed_workbook_unsupported');
 const changes:{start:number;end:number;value:string}[]=[];
 for(const [index,row] of rows.entries()){
  const input=inputs[index];
  for(const [field,value] of [['B',input.agent],['C',input.accountNo],['AG',input.newRowKey]]){
   const cell=loaded.chosen.map.get(field+(row.locator as TrackerLocator).row);
   if(!cell||cell.formula||!scalarTypes.has(cell.type)||blockedDateCell(cell))throw Error('tracker_cell_metadata_unsupported');
   const tag=/^<([^\s>]+)/.exec(cell.xml)?.[1];if(!tag)fail();
   const prefix=tag.includes(':')?tag.split(':')[0]+':':'';
   const opening=cell.xml.slice(0,cell.xml.indexOf('>')+1).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/, '>').slice(0,-1)+' t="inlineStr">';
   changes.push({start:cell.start,end:cell.end,value:opening+'<'+prefix+'is><'+prefix+'t xml:space="preserve">'+sentEscape(value)+'</'+prefix+'t></'+prefix+'is></'+tag+'>'});
  }
 }
 let text='',cursor=0;
 for(const c of changes.sort((a,b)=>a.start-b.start)){if(c.start<cursor)throw Error('tracker_cell_conflict');text+=loaded.chosen.text.slice(cursor,c.start)+c.value;cursor=c.end;}
 text+=loaded.chosen.text.slice(cursor);
 const result=serialize(loaded.entries,loaded.chosen.path,encoder.encode(text),loaded.archiveComment);
 const grouped=regroupTrackerWorkbook(retargetUrgentKeys(result,region,inputs),region);
 const parsed=parseTrackerWorkbook(grouped,region);
 for(const input of inputs){const row=parsed.rows.find(r=>r.rowKey===input.newRowKey);if(!row||row.accountNo!==input.accountNo||row.agent!==input.agent)throw Error('tracker_identity_conflict');}
 return grouped;
}

function workbookGroups(loaded:ReturnType<typeof load>):GroupPlan|null {
 const rows=loaded.parsed.rows.map(r=>({key:r.rowKey,hotel:r.hotel,agent:r.agent??'',accountNo:r.accountNo,row:r.locator.row,
  cents:['H','I','J','K','L','M','N'].map(c=>{const cell=loaded.chosen.map.get(c+r.locator.row);if(cell?.formula)throw Error('tracker_transfer_layout_invalid');return moneyCents(cell?.raw);})}));
 const markers=loaded.chosen.cells.filter(c=>c.column==='H'&&c.formula).flatMap(c=>{
  const f=entities(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/.exec(c.xml)?.[1]??'');
  const m=groupMarker(c.row,loaded.chosen.map.get('D'+c.row)?.raw??'',f,['H','I','J','K','L','M','N'].map(col=>moneyCents(loaded.chosen.map.get(col+c.row)?.raw)));
  return m?[m]:[];
 });
 return planGroups(rows,markers);
}
export function trackerWorkbookGroupsCorrect(bytes:Uint8Array,region:RegionId):boolean {
 try{const plan=workbookGroups(load(bytes,region));return !plan||!plan.changed;}catch{return false;}
}
function rebasedFormula(value:string,oldRow:number,newRow:number):string {
 const formula=entities(value);
 const pieces=formula.split(/("(?:[^"]|"")*")/g);
 return pieces.map((p,i)=>{
  if(i%2)return p;
  if(/[!\[\]]/.test(p)||/\b(?:INDIRECT|OFFSET)\s*\(/i.test(p))throw Error('tracker_transfer_layout_invalid');
  return p.replace(/(\$?[A-Z]{1,3}\$?)([1-9]\d*)\b/g,(match,col:string,n:string,offset:number)=>{
   if(p[offset+match.length]==='(')return match;
   const r=Number(n);if(r!==oldRow&&r>2)throw Error('tracker_transfer_layout_invalid');
   return col+(r===oldRow?newRow:r);
  });
 }).join('');
}
function movedRow(text:string,oldRow:number,newRow:number,total?:GroupTotal):string {
 text=text.replace(/^<(?:\w+:)?row\b[^>]*>/,tag=>tag.replace(/\br=(?:"[^"]*"|'[^']*')/,'r="'+newRow+'"'));
 const label=total?'▸ รวม '+total.agent+' ('+total.count+' ใบ)':'';
 return text.replace(/<(?:\w+:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c\s*>)/g,cell=>{
  const ref=/\br="([A-Z]+)(\d+)"/.exec(cell);if(!ref||Number(ref[2])!==oldRow)throw Error('tracker_transfer_layout_invalid');
  const col=ref[1],tag=/^<([^\s>]+)/.exec(cell)![1],prefix=tag.includes(':')?tag.split(':')[0]+':':'';
  cell=cell.replace('r="'+col+oldRow+'"','r="'+col+newRow+'"');
  if(total&&(col==='D'||['H','I','J','K','L','M','N'].includes(col))){
   let opening=cell.slice(0,cell.indexOf('>')+1).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/, '>');
   if(col==='D')return opening.slice(0,-1)+' t="inlineStr"><'+prefix+'is><'+prefix+'t>'+sentEscape(label)+'</'+prefix+'t></'+prefix+'is></'+tag+'>';
   const cents=total.cents['HIJKLMN'.indexOf(col)],formula=col==='H'||/<(?:\w+:)?f\b/.test(cell);
   return opening+(formula?'<'+prefix+'f>SUBTOTAL(9,'+col+total.start+':'+col+total.end+')</'+prefix+'f>':'')+'<'+prefix+'v>'+(cents/100)+'</'+prefix+'v></'+tag+'>';
  }
  return cell.replace(/<(?:\w+:)?f\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?f>/g,(_m,attributes:string,f:string)=>{
   if(attributes.trim())throw Error('tracker_transfer_layout_invalid');
   return '<'+prefix+'f>'+sentEscape(rebasedFormula(f,oldRow,newRow))+'</'+prefix+'f>';
  });
 });
}
/** Rebuild only the generated grouped ledger. Unknown layouts remain untouched. */
export function regroupTrackerWorkbook(bytes:Uint8Array,region:RegionId):Uint8Array {
 let loaded=load(bytes,region),plan=workbookGroups(loaded);
 if(!plan||!plan.changed)return bytes;
 const expanded=expandLedgerSharedFormulas(loaded);
 if(expanded!==loaded.chosen.text){
  loaded=load(serialize(loaded.entries,loaded.chosen.path,encoder.encode(expanded),loaded.archiveComment),region);
  plan=workbookGroups(loaded);if(!plan)throw Error('tracker_transfer_layout_invalid');
 }
 if(loaded.entries.some(e=>e.name==='xl/calcChain.xml')||/<(?:\w+:)?(?:legacyDrawing|tableParts)\b/.test(loaded.chosen.text))throw Error('tracker_transfer_layout_attachments');
 // Google Office editing adds empty drawing parts. Preserve those byte-for-byte;
 // anchored objects require an explicit relocation policy before rows can move.
 if(/<(?:\w+:)?drawing\b/.test(loaded.chosen.text)){
  const filename=loaded.chosen.path.split('/').at(-1)!,relationships=xml(loaded.entries,'xl/worksheets/_rels/'+filename+'.rels');
  const links=[...relationships.matchAll(/<(?:\w+:)?Relationship\b[^>]*\/>/g)].map(r=>attrs(r[0]));
  const drawings=[...loaded.chosen.text.matchAll(/<(?:\w+:)?drawing\b([^>]*)\/>/g)];
  if(!drawings.length)throw Error('tracker_transfer_layout_attachments');
  for(const drawing of drawings){
   const id=attrs(drawing[1])['r:id'],link=links.filter(l=>l.Id===id&&l.Type?.endsWith('/drawing'));
   if(link.length!==1||link[0].TargetMode||!/^\.\.\/drawings\/drawing\d+\.xml$/.test(link[0].Target))throw Error('tracker_transfer_layout_attachments');
   const content=xml(loaded.entries,'xl/'+link[0].Target.slice(3)).replace(/^<\?xml[^>]*\?>\s*/,'');
   if(!/^<(?:\w+:)?wsDr\b[^>]*(?:\/>|>\s*<\/(?:\w+:)?wsDr>)\s*$/.test(content))throw Error('tracker_transfer_layout_attachments');
  }
 }
 const body=/<((?:\w+:)?sheetData)\b[^>]*>([\s\S]*?)<\/\1>/.exec(loaded.chosen.text);
 if(!body)throw Error('tracker_transfer_layout_sheet_data');
 const rowXml=new Map<number,string>();
 for(const r of body[2].matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?row>)/g)){
  const n=Number(/\br="(\d+)"/.exec(r[0])?.[1]);if(!n||rowXml.has(n))throw Error('tracker_transfer_layout_invalid');rowXml.set(n,r[0]);
 }
 if([...rowXml.keys()].some(n=>n>plan.end)||rowXml.size!==plan.end)throw Error('tracker_transfer_layout_row_extent');
 // Other sheets may look up values by KEY over the whole ledger. A positional
 // reference to a moving row needs explicit support before any publication.
 const quoted="'"+loaded.chosen.name.replaceAll("'","''")+"'";
 for(const entry of loaded.entries)if(/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)&&entry.name!==loaded.chosen.path){
  const other=xml(loaded.entries,entry.name);
  for(const f of other.matchAll(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/g)){
   const value=entities(f[1]);let cursor=0;
   while((cursor=value.indexOf(quoted+'!',cursor))>=0){
    const rest=value.slice(cursor+quoted.length+1),ref=/^\$?[A-Z]+\$?(\d+)(?::\$?[A-Z]+\$?(\d+))?/.exec(rest);
    if(!ref||Number(ref[1])>2&&!(Number(ref[1])<=plan.start&&Number(ref[2])>=Math.max(plan.end,plan.newEnd)))throw Error('tracker_transfer_layout_invalid');
    cursor+=quoted.length+1;
   }
  }
 }
 const rowBody=[rowXml.get(1)!,rowXml.get(2)!,...plan.items.map(item=>{
  const source=item.kind==='data'?item.oldRow:item.templateRow,text=rowXml.get(source);if(!text)throw Error('tracker_transfer_layout_invalid');
  if(item.kind==='total'&&item.oldRow===null&&loaded.chosen.cells.some(c=>c.row===source&&!['D','H','I','J','K','L','M','N'].includes(c.column)&&c.raw!==''))throw Error('tracker_transfer_layout_invalid');
  return movedRow(text,source,item.row,item.kind==='total'?item:undefined);
 })].join('');
 let main=loaded.chosen.text.replace(body[0],'<'+body[1]+'>'+rowBody+'</'+body[1]+'>');
 const delta=plan.newEnd-plan.end,shift=(v:string)=>v.replace(/(\$?[A-Z]{1,3}\$?)([1-9]\d*)/g,(_m,col:string,n:string)=>{
  const r=Number(n);if(r===plan.end)return col+plan.newEnd;if(r>plan.end&&r<100000)return col+(r+delta);
  if(r>2&&r!==plan.start&&r<plan.end)throw Error('tracker_transfer_layout_invalid');
  return col+r;
 });
 main=main.replace(/\b(?:ref|sqref)="([^"]*)"/g,(whole,value:string)=>{
  if(!/^[A-Z$0-9: ]+$/.test(value))return whole;
  return whole.replace(value,shift(value));
 });
 const result=serialize(loaded.entries,loaded.chosen.path,encoder.encode(main),loaded.archiveComment);
 const interim=load(result,region),book=xml(interim.entries,'xl/workbook.xml');
 const updated=book.replace(/<definedName\b[^>]*>[\s\S]*?<\/definedName>/g,entry=>{
  if(!entities(entry).includes(quoted+'!'))return entry;
  if(!/\bname="_xlnm\._FilterDatabase"/.test(entry))throw Error('tracker_transfer_layout_invalid');
  return entry.replace(/>([\s\S]*?)<\/definedName>/,(_m,v:string)=>'>'+sentEscape(shift(entities(v)))+'</definedName>');
 });
 const out=updated===book?result:serialize(interim.entries,'xl/workbook.xml',encoder.encode(updated),interim.archiveComment);
 if(!trackerWorkbookGroupsCorrect(out,region))throw Error('tracker_transfer_layout_invalid');
 return out;
}

function expandLedgerSharedFormulas(loaded:ReturnType<typeof load>,allowSheetRefs=false):string {
 const masters=new Map<string,{column:number;row:number;formula:string;bounds:number[]}>();
 const col=(v:string)=>[...v].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 const letters=(n:number)=>{let v='';for(;n>0;n=Math.floor((n-1)/26))v=String.fromCharCode(65+(n-1)%26)+v;return v;};
 const tags=loaded.chosen.cells.flatMap(cell=>{
  const f=/<((?:\w+:)?f)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(cell.xml);if(!f)return [];
  const a=attrs(f[2]);
  if(a.t!==undefined&&a.t!=='shared')throw Error('tracker_transfer_layout_invalid');
  if(a.t==='shared'&&f[3]!==undefined){
   const range=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a.ref??''),single=/^([A-Z]+)(\d+)$/.exec(a.ref??'');
   const bounds=range?[col(range[1]),Number(range[2]),col(range[3]),Number(range[4])]:single?[col(single[1]),Number(single[2]),col(single[1]),Number(single[2])]:undefined;
   if(!a.si||masters.has(a.si)||!bounds||bounds[0]!==col(cell.column)||bounds[1]!==cell.row)throw Error('tracker_transfer_layout_invalid');
   masters.set(a.si,{column:col(cell.column),row:cell.row,formula:entities(f[3]),bounds});
  }
  return [{cell,f,a}];
 });
 if(!masters.size&&!tags.some(t=>t.a.t==='shared'))return loaded.chosen.text;
 const replacements:{start:number;end:number;value:string}[]=[];
 for(const {cell,f,a}of tags){
  if(a.t!=='shared')continue;
  const master=masters.get(a.si??''),c=col(cell.column);
  if(!master||c<master.bounds[0]||c>master.bounds[2]||cell.row<master.bounds[1]||cell.row>master.bounds[3])throw Error('tracker_transfer_layout_invalid');
  const formula=master.formula.split(/("(?:[^"]|"")*"|'(?:[^']|'')+'!|\b[A-Za-z_][A-Za-z0-9_.]*!)/g).map((part,index)=>{
   if(index%2){if(part.endsWith('!')&&!allowSheetRefs)throw Error('tracker_transfer_layout_invalid');return part;}
   if(/[!\[\]]/.test(part))throw Error('tracker_transfer_layout_invalid');
   return part.replace(/(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)\b/g,(match,absoluteCol:string,column:string,absoluteRow:string,row:string,offset:number)=>{
    if(part[offset+match.length]==='(')return match;
    const x=col(column)+(absoluteCol?0:c-master.column),y=Number(row)+(absoluteRow?0:cell.row-master.row);
    if(x<1||x>16384||y<1||y>1048576)throw Error('tracker_transfer_layout_invalid');
    return absoluteCol+letters(x)+absoluteRow+y;
   });
  }).join('');
  const value=cell.xml.replace(f[0],'<'+f[1]+'>'+sentEscape(formula)+'</'+f[1]+'>');
  replacements.push({start:cell.start,end:cell.end,value});
 }
 let result='',cursor=0;
 for(const r of replacements.sort((a,b)=>a.start-b.start)){result+=loaded.chosen.text.slice(cursor,r.start)+r.value;cursor=r.end;}
 return result+loaded.chosen.text.slice(cursor);
}

/** Retarget only the live urgent lookup, never historical/log copies of a KEY. */
function retargetUrgentKeys(bytes:Uint8Array,region:RegionId,inputs:readonly TransferWrite[]):Uint8Array {
 const changed=inputs.filter(i=>i.rowKey!==i.newRowKey);if(!changed.length)return bytes;
 const loaded=load(bytes,region),book=xml(loaded.entries,'xl/workbook.xml'),rels=xml(loaded.entries,'xl/_rels/workbook.xml.rels');
 const sheets=[...book.matchAll(/<(?:\w+:)?sheet\b[^>]*\/>/g)].map(m=>attrs(m[0])).filter(s=>s.name==='🔥 เร่งด่วน');
 if(!sheets.length)return bytes;if(sheets.length!==1)throw Error('tracker_transfer_layout_invalid');
 const links=[...rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*\/>/g)].map(m=>attrs(m[0])).filter(r=>r.Id===sheets[0]['r:id']);
 if(links.length!==1||links[0].TargetMode)throw Error('tracker_transfer_layout_invalid');
 const path=links[0].Target.startsWith('/')?links[0].Target.slice(1):'xl/'+links[0].Target;
 if(!/^xl\/worksheets\/[^/]+\.xml$/.test(path))throw Error('tracker_transfer_layout_invalid');
 let text=xml(loaded.entries,path);const sharedEntry=loaded.entries.find(e=>e.name==='xl/sharedStrings.xml');
 const shared=sharedEntry?[...xml(loaded.entries,sharedEntry.name).matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>texts(m[1])):[];
 const initial=cells(text,shared);
 text=expandLedgerSharedFormulas({...loaded,chosen:{...loaded.chosen,text,cells:initial}},true);
 const all=cells(text,shared),map=new Map(all.map(c=>[c.column+c.row,c])),updates=new Map<string,string>();
 const title="'"+loaded.chosen.name.replaceAll("'","''")+"'!",escape=(v:string)=>v.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
 const groupPlan=workbookGroups(loaded),minimumEnd=groupPlan?Math.max(groupPlan.end,groupPlan.newEnd):loaded.parsed.rows.reduce((n,r)=>Math.max(n,r.locator.row),2);
 const match=new RegExp('MATCH\\(\\$?([A-Z]+)\\$?(\\d+),'+escape(title)+'\\$?AG\\$?3:\\$?AG\\$?([1-9][0-9]*),0\\)','g');
 for(const cell of all)if(cell.formula){
  const f=entities(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/.exec(cell.xml)?.[1]??'').replace(/"(?:[^"]|"")*"/g,'""');
  for(const ref of f.matchAll(match)){
   if(Number(ref[2])!==cell.row||Number(ref[3])<minimumEnd)throw Error('tracker_transfer_layout_invalid');
   const key=map.get(ref[1]+ref[2]);if(!key||key.formula||!scalarTypes.has(key.type)||blockedDateCell(key))throw Error('tracker_cell_metadata_unsupported');
   const input=changed.find(i=>i.rowKey===key.raw);if(!input)continue;
   updates.set(key.column+key.row,input.newRowKey);
   const agent=map.get('B'+key.row),header=map.get('B2')??map.get('B1');
   if(header?.raw==='Agent'&&agent?.raw===input.expectedAgent&&!agent.formula&&!blockedDateCell(agent))updates.set('B'+key.row,input.agent);
  }
 }
 if(!updates.size)return bytes;
 let result='',cursor=0;
 for(const cell of all.filter(c=>updates.has(c.column+c.row)).sort((a,b)=>a.start-b.start)){
  const tag=/^<([^\s>]+)/.exec(cell.xml)![1],prefix=tag.includes(':')?tag.split(':')[0]+':':'';
  const opening=cell.xml.slice(0,cell.xml.indexOf('>')+1).replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/,'').replace(/\/>$/, '>').slice(0,-1)+' t="inlineStr">';
  result+=text.slice(cursor,cell.start)+opening+'<'+prefix+'is><'+prefix+'t>'+sentEscape(updates.get(cell.column+cell.row)!)+'</'+prefix+'t></'+prefix+'is></'+tag+'>';cursor=cell.end;
 }
 result+=text.slice(cursor);
 return serialize(loaded.entries,path,encoder.encode(result),loaded.archiveComment);
}
