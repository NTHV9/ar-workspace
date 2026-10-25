import {readJson} from '../drive/shared';
import {trackerHotel,type TrackerIdentity} from './model';

/** Only a fresh inserted row can receive these initial values. */
export type NativeAppendCell=string|number|boolean|null|{formula:string};
export interface NativeAppendPlan {
 sheetId:number;sheetTitle:'ลูกหนี้ เขาหลัก';metadataId:number;rowKey:string;
 identity:TrackerIdentity;values:readonly NativeAppendCell[];
 /** Set by the durable journal before any provider POST, never inferred here. */
 priorUncertain:boolean;
}
export interface NativeAppendResult {
 status:'written'|'exists'|'conflict'|'uncertain';mutationStarted?:boolean;
 /** Identity receipt only: no claim that original dates still remain in staff cells. */
 identityMatched?:true;retrySafe?:boolean;rejectedStatus?:429;
}
export const nativeAppendHeaders=Object.freeze([
 'Property','Agent','Account No.','ชื่อผู้เข้าพัก (Guest)','เลขที่ Invoice','Folio No.','วันที่โพสต์',
 'ยอดค้าง (บาท)','0-30','31-60','61-90','91-120','121-150','151+','อายุใบ (วัน)','กลุ่มอายุ','สถานะอายุ',
 'วันที่วางบิล','เครดิตเทอม (วัน)','วันครบกำหนด','อีเมลทวง #1','อีเมลทวง #2','อีเมลทวง #3',
 'วันนัดชำระใหม่','สถานะติดตาม','จำนวนเงินที่รับ','ผลต่าง','รายละเอียดการติดตาม','ผู้รับผิดชอบ',
 'พบครั้งแรก','อัปเดตล่าสุด','สถานะแถว','KEY (ระบบ-ห้ามแก้)',
]);
type Entered={stringValue?:string;numberValue?:number;boolValue?:boolean;formulaValue?:string};
interface GridCell {userEnteredValue?:Entered;userEnteredFormat?:{numberFormat?:{pattern?:string}};effectiveFormat?:{numberFormat?:{pattern?:string}}}
interface Sheet {properties:{sheetId:number;title:string;gridProperties:{rowCount:number;columnCount:number}};data?:{startRow?:number;startColumn?:number;rowData?:{values?:GridCell[]}[]}[]}
interface Snapshot {rows:Map<number,GridCell[]>;rowCount:number;templateRow:number|null}
const ROOT='https://sheets.googleapis.com/v4/spreadsheets/',TITLE='ลูกหนี้ เขาหลัก';
const dates=new Set([6,17,19,20,21,22,23,29,30]);
const conflict=()=>{throw Error('tracker_append_conflict');};
/** ROW() keeps a fresh row's due-date formula correct after inserts and moves. */
export function nativeAppendDueFormula(billingRequired:boolean):string{
 const base=billingRequired?'R':'G';
 return `=IF(AND(ISNUMBER(INDEX(${base}:${base},ROW())),ISNUMBER(INDEX(S:S,ROW()))),INDEX(${base}:${base},ROW())+INDEX(S:S,ROW()),"")`;
}
function iso(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function serial(value:string){return (Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;}
function numberDate(value:number){return Number.isSafeInteger(value)&&value>=1&&value<2958466?new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10):conflict();}
function plain(cell:GridCell|undefined):string|number|boolean|null {
 const value=cell?.userEnteredValue;if(!value||Object.keys(value).length===0)return null;
 if(Object.keys(value).length!==1||value.formulaValue!==undefined)return conflict();
 if(typeof value.stringValue==='string')return value.stringValue;
 if(typeof value.numberValue==='number'&&Number.isFinite(value.numberValue))return value.numberValue;
 if(typeof value.boolValue==='boolean')return value.boolValue;
 return conflict();
}
function identityText(cell:GridCell|undefined):string{
 const value=plain(cell);if(value===null)return '';if(typeof value==='string')return value.trim();
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return conflict();
 const pattern=cell?.userEnteredFormat?.numberFormat?.pattern??cell?.effectiveFormat?.numberFormat?.pattern;
 if(pattern&&pattern!=='General'&&!/^0{1,20}$/.test(pattern))return conflict();
 return pattern&&/^0{2,20}$/.test(pattern)?String(value).padStart(pattern.length,'0'):String(value);
}
function identity(row:GridCell[]):TrackerIdentity|null{
 const property=plain(row[0]);if(typeof property!=='string')return null;
 const hotel=trackerHotel(property,'khao-lak');if(!hotel)return null;
 const accountNo=identityText(row[2]),invoiceNo=identityText(row[4]),folioNo=identityText(row[5])||null;
 if(!accountNo||!invoiceNo)return null;
 const raw=plain(row[6]),transactionDate=typeof raw==='number'?numberDate(raw):iso(raw)?raw:null;
 if(!transactionDate)return conflict();
 return {hotel,accountNo,invoiceNo,folioNo,transactionDate};
}
const key=(value:TrackerIdentity)=>JSON.stringify([value.hotel,value.accountNo,value.invoiceNo,value.folioNo??null,value.transactionDate??null]);
function typed(values:readonly NativeAppendCell[]):Entered[]{
 if(values.length!==33)return conflict();
 return values.map((value,index)=>{
  if(value===null)return {};
  if(index>=23&&index<=28)return conflict();
  if(typeof value==='object'){
   if(!value||Object.keys(value).join(',')!=='formula'||index!==19||![nativeAppendDueFormula(true),nativeAppendDueFormula(false)].includes(value.formula))return conflict();
   return {formulaValue:value.formula};
  }
  if(typeof value==='string'){
   if(value.length>5000)return conflict();
   if(dates.has(index)&&value!==''){if(!iso(value))return conflict();return {numberValue:serial(value)};}
   return {stringValue:value};
  }
  if(typeof value==='number'&&Number.isFinite(value))return {numberValue:value};
  if(typeof value==='boolean')return {boolValue:value};
  return conflict();
 });
}
function validatePlan(plan:NativeAppendPlan):Entered[]{
 if(plan.sheetTitle!==TITLE||!Number.isSafeInteger(plan.sheetId)||plan.sheetId<0||!Number.isSafeInteger(plan.metadataId)||plan.metadataId<1||plan.metadataId>2147483647||typeof plan.priorUncertain!=='boolean'||!plan.rowKey||plan.rowKey.length>5000)return conflict();
 if(!plan.identity.accountNo||!plan.identity.invoiceNo||!iso(plan.identity.transactionDate))return conflict();
 const values=typed(plan.values),actual=identity(values.map(userEnteredValue=>({userEnteredValue})));
 if(!actual||key(actual)!==key(plan.identity)||plain({userEnteredValue:values[32]})!==plan.rowKey)return conflict();
 return values;
}
async function http(token:string,file:string,suffix:string,fetcher:typeof fetch,body?:unknown){
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(file)||!token||/[\r\n]/.test(token))return conflict();
 const url=new URL(ROOT+file+suffix);
 if(url.origin!=='https://sheets.googleapis.com'||url.username||url.password)return conflict();
 return fetcher(url.toString(),{method:body===undefined?'GET':'POST',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function json(response:Response,max=16*1024*1024){
 if(!response.ok){await response.body?.cancel();throw Error('tracker_append_unavailable');}
 return readJson(response,max);
}
/** A fixed Sheets endpoint; do not route this through the Drive-only helper. */
export async function readNativeAppendSheetId(token:string,fileId:string,fetcher:typeof fetch=fetch):Promise<number>{
 const query=new URLSearchParams({fields:'spreadsheetId,sheets(properties(sheetId,title))',prettyPrint:'false'});
 const structure=await json(await http(token,fileId,'?'+query,fetcher),65536);
 if(structure.spreadsheetId!==fileId||!Array.isArray(structure.sheets))return conflict();
 const sheets=(structure.sheets as Sheet[]).filter(s=>s.properties?.title===TITLE),id=sheets[0]?.properties?.sheetId;
 if(sheets.length!==1||!Number.isSafeInteger(id)||Number(id)<0)return conflict();return Number(id);
}
async function snapshot(token:string,file:string,plan:NativeAppendPlan,fetcher:typeof fetch):Promise<Snapshot>{
 const projection=await occupiedProjection(token,file,fetcher),keys=projection.keys,extent=projection.extent,rows=new Map<number,GridCell[]>();
 let rowCount:number|undefined,retained=0;
 for(let start=0;start<extent;start+=200){
  const end=Math.min(start+200,extent),query=new URLSearchParams({includeGridData:'true',prettyPrint:'false',ranges:`'${TITLE}'!A${start+1}:AG${end}`,fields:'spreadsheetId,sheets(properties(sheetId,title,gridProperties),data(startRow,startColumn,rowData(values(userEnteredValue,userEnteredFormat(numberFormat),effectiveFormat(numberFormat)))))'});
  const data=await json(await http(token,file,'?'+query,fetcher),2*1024*1024);
  retained+=new TextEncoder().encode(JSON.stringify(data)).byteLength;if(retained>16*1024*1024)throw Error('tracker_append_unavailable');
  if(data.spreadsheetId!==file||!Array.isArray(data.sheets)||data.sheets.length!==1)return conflict();
  const sheet=data.sheets[0] as Sheet,props=sheet?.properties;
  if(props?.sheetId!==plan.sheetId||props.title!==TITLE||!Number.isSafeInteger(props.gridProperties?.rowCount)||props.gridProperties.rowCount<4||props.gridProperties.columnCount<33||rowCount!==undefined&&rowCount!==props.gridProperties.rowCount)return conflict();
  rowCount=props.gridProperties.rowCount;
  if(!Array.isArray(sheet.data)||sheet.data.length!==1)return conflict();
  const block=sheet.data[0];
  if((block.startColumn??0)!==0||(block.startRow??0)!==start||block.rowData!==undefined&&!Array.isArray(block.rowData)||(block.rowData?.length??0)>end-start)return conflict();
  for(let index=start;index<end;index++){
   const cells=block.rowData?.[index-start]?.values??[];
   if(rows.has(index)||index>=rowCount||cells.length>33)return conflict();
   if(index>=2&&(plain(cells[32])??'')!==(keys[index]??''))return conflict();
   rows.set(index,cells);
  }
 }
 if(projection.signature!==(await occupiedProjection(token,file,fetcher)).signature)throw Error('tracker_append_unavailable');
 const headers=rows.get(1);if(!headers)return conflict();
 for(let i=0;i<33;i++){
  const raw=plain(headers[i]),value=i===0&&(raw===null||raw==='')?plain(rows.get(0)?.[0]):raw;
  if(value!==nativeAppendHeaders[i])return conflict();
 }
 if(rowCount===undefined)return conflict();
 return {rows,rowCount,templateRow:[...rows].find(([index,cells])=>index>=2&&identity(cells)!==null)?.[0]??null};
}
async function occupiedProjection(token:string,file:string,fetcher:typeof fetch):Promise<{keys:string[];extent:number;signature:string}>{
 // Include business identity as well as AG: a deleted key must not hide a
 // debtor row below the last remaining key and cause a duplicate insertion.
 const spans=['A:A','C:C','E:G','AG:AG'],widths=[1,1,3,1];
 const query=new URLSearchParams({majorDimension:'ROWS',valueRenderOption:'FORMULA',prettyPrint:'false',fields:'spreadsheetId,valueRanges(range,majorDimension,values)'});
 for(const span of spans)query.append('ranges',`'${TITLE}'!${span}`);
 let value:Record<string,unknown>;
 try{value=await json(await http(token,file,'/values:batchGet?'+query,fetcher),1024*1024);}
 catch(error){if(error instanceof Error&&error.message==='drive_response_too_large')return conflict();throw error;}
 if(value.spreadsheetId!==file||!Array.isArray(value.valueRanges)||value.valueRanges.length!==spans.length)return conflict();
 const projections=value.valueRanges.map((entry:unknown,index)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return conflict();
  const range=entry as {range?:unknown;majorDimension?:unknown;values?:unknown};
  if(typeof range.range!=='string'||range.majorDimension!=='ROWS'||range.values!==undefined&&!Array.isArray(range.values))return conflict();
  const [left,right]=spans[index].split(':'),match=new RegExp(`^'${TITLE}'!${left}1:${right}([1-9][0-9]*)$`).exec(range.range),end=match?Number(match[1]):0;
  const rows=(range.values??[]) as unknown[][];
  if(!Number.isSafeInteger(end)||end<1||rows.length>100002||rows.length>end||rows.some(row=>!Array.isArray(row)||row.length>widths[index]||row.some(cell=>cell!==null&&typeof cell!=='string'&&typeof cell!=='boolean'&&!(typeof cell==='number'&&Number.isFinite(cell)))))return conflict();
  while(rows.length&&rows.at(-1)!.every(v=>v===null||v===''))rows.pop();return rows;
 });
 const keys=projections[3].map(row=>{const key=row[0]??'';if(typeof key!=='string'||key.startsWith('=')||key.length>5000)return conflict();return key;});
 return {keys,extent:Math.max(2,...projections.map(rows=>rows.length)),signature:JSON.stringify(projections)};
}
async function metadataHeadroom(token:string,file:string,fetcher:typeof fetch){
 const query=new URLSearchParams({fields:'matchedDeveloperMetadata(developerMetadata(metadataId,metadataKey,metadataValue))'});
 const data=await json(await http(token,file,'/developerMetadata:search?'+query,fetcher,{dataFilters:[{developerMetadataLookup:{}}]}),2*1024*1024);
 if(data.matchedDeveloperMetadata!==undefined&&!Array.isArray(data.matchedDeveloperMetadata))return conflict();
 let characters=0;const seen=new Set<number>();
 for(const entry of (data.matchedDeveloperMetadata??[]) as {developerMetadata?:{metadataId?:number;metadataKey?:string;metadataValue?:string}}[]){
  const m=entry.developerMetadata;
  if(!m||!Number.isSafeInteger(m.metadataId)||typeof m.metadataKey!=='string'||m.metadataValue!==undefined&&typeof m.metadataValue!=='string')return conflict();
  if(seen.has(m.metadataId!))continue;seen.add(m.metadataId!);characters+=m.metadataKey.length+(m.metadataValue?.length??0);
 }
 // Keep headroom for another concurrent marker. API quota rejection is atomic.
 if(characters+1>29900)return conflict();
}
async function metadata(token:string,file:string,plan:NativeAppendPlan,fetcher:typeof fetch){
 const response=await http(token,file,'/developerMetadata/'+plan.metadataId,fetcher);
 if(response.status===404){await response.body?.cancel();return null;}
 return json(response,32768);
}
function classify(current:Snapshot,meta:Record<string,unknown>|null,plan:NativeAppendPlan):NativeAppendResult|null{
 let matches=0;const seen=new Set<string>(),keys=new Set<string>();
 for(const [index,cells]of current.rows){
  if(index<2)continue;
  const ag=plain(cells[32]);
  if(ag!==null&&ag!==''){if(typeof ag!=='string'||keys.has(ag))return {status:'conflict'};keys.add(ag);}
  const property=plain(cells[0]);
  if((ag===null||ag==='')&&typeof property==='string'&&trackerHotel(property,'khao-lak')&&cells.some((cell,i)=>i>=1&&i<=31&&Object.keys(cell.userEnteredValue??{}).length>0))return {status:'conflict'};
  const actual=identity(cells);
  // A damaged target key is evidence of an existing row, never absence.
  // Likewise, a matching invoice whose account was cleared is ambiguous:
  // another AG cannot authorize a duplicate under a guessed account.
  if(!actual){
   if(ag===plan.rowKey)return {status:'conflict'};
   if(typeof property==='string'&&trackerHotel(property,'khao-lak')===plan.identity.hotel&&identityText(cells[2])===''&&identityText(cells[4])===plan.identity.invoiceNo&&(identityText(cells[5])||null)===(plan.identity.folioNo??null)){
    const raw=plain(cells[6]),day=typeof raw==='number'?numberDate(raw):iso(raw)?raw:null;
    if(day===plan.identity.transactionDate)return {status:'conflict'};
   }
   continue;
  }
  const canonical=key(actual);if(seen.has(canonical))return {status:'conflict'};seen.add(canonical);
  if(canonical===key(plan.identity))matches++;
  if(canonical!==key(plan.identity)&&plain(cells[32])===plan.rowKey)return {status:'conflict'};
 }
 if(meta){
  const range=(meta.location as {dimensionRange?:Record<string,unknown>}|undefined)?.dimensionRange;
  if(meta.metadataId!==plan.metadataId||meta.metadataKey!=='s'||range?.sheetId!==plan.sheetId||range.dimension!=='ROWS'||!Number.isSafeInteger(range.startIndex)||Number(range.startIndex)<2||range.endIndex!==Number(range.startIndex)+1)return {status:'conflict'};
  const row=current.rows.get(Number(range.startIndex));
  const actual=row?identity(row):null;
  if(!row||matches!==1||!actual||key(actual)!==key(plan.identity)||plain(row[32])!==plan.rowKey)return {status:'conflict'};
  return {status:'written',identityMatched:true};
 }
 if(matches===1)return {status:'exists',identityMatched:true};
 if(plan.priorUncertain)return {status:'uncertain'};
 return null;
}
/** Pure payload construction, shared by the HTTP adapter and provider qualification. */
export function buildNativeAppendRequests(plan:NativeAppendPlan,rowCount:number,templateRow:number|null):object[]{
 const values=validatePlan(plan);
 if(!Number.isSafeInteger(rowCount)||rowCount<4||rowCount>100002||templateRow!==null&&(!Number.isSafeInteger(templateRow)||templateRow<2||templateRow>=rowCount))return conflict();
 const index=rowCount-1,range={sheetId:plan.sheetId,startRowIndex:index,endRowIndex:index+1,startColumnIndex:0,endColumnIndex:33};
 const requests:object[]=[{insertDimension:{range:{sheetId:plan.sheetId,dimension:'ROWS',startIndex:index,endIndex:index+1},inheritFromBefore:false}}];
 if(templateRow!==null)requests.push({copyPaste:{source:{...range,startRowIndex:templateRow,endRowIndex:templateRow+1},destination:range,pasteType:'PASTE_FORMAT'}});
 requests.push({updateCells:{start:{sheetId:plan.sheetId,rowIndex:index,columnIndex:0},rows:[{values:values.map(userEnteredValue=>({userEnteredValue}))}],fields:'userEnteredValue'}});
 for(const col of dates)if(values[col].numberValue!==undefined||col===19&&values[col].formulaValue!==undefined)requests.push({repeatCell:{range:{...range,startColumnIndex:col,endColumnIndex:col+1},cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'yyyy-mm-dd'}}},fields:'userEnteredFormat.numberFormat'}});
 requests.push({createDeveloperMetadata:{developerMetadata:{metadataId:plan.metadataId,metadataKey:'s',visibility:'DOCUMENT',location:{dimensionRange:{sheetId:plan.sheetId,dimension:'ROWS',startIndex:index,endIndex:index+1}}}}});
 return requests;
}
/** Caller has durably journaled this exact metadata ID and initial row before POST.
 * Inserts a private fresh row inside the observed grid in one atomic API batch.
 * Never writes an existing row, even when its staff dates have become blank. */
export async function appendNativeTracker(token:string,fileId:string,plan:NativeAppendPlan,fetcher:typeof fetch=fetch):Promise<NativeAppendResult>{
 let mutationStarted=false;
 try{
  validatePlan(plan);
  const current=await snapshot(token,fileId,plan,fetcher),meta=await metadata(token,fileId,plan,fetcher),preflight=classify(current,meta,plan);
  if(preflight)return {...preflight,mutationStarted};
  // Inserting at the requested grid tail must not create a key outside the
  // existing shared tracker's supported occupied extent.
  if(current.rowCount>100002)return {status:'conflict',mutationStarted};
  await metadataHeadroom(token,fileId,fetcher);
  const requests=buildNativeAppendRequests(plan,current.rowCount,current.templateRow);
  mutationStarted=true;
  try{
   const response=await http(token,fileId,':batchUpdate',fetcher,{requests});
   if(response.status===429){await response.body?.cancel();return {status:'uncertain',mutationStarted,retrySafe:true,rejectedStatus:429};}
   await json(response,1024*1024);
  }catch{/* unknown outcomes only reconcile the same ID; no retry */}
  try{
   const after=await snapshot(token,fileId,plan,fetcher),receipt=await metadata(token,fileId,plan,fetcher);
   return {...(classify(after,receipt,{...plan,priorUncertain:true})??{status:'uncertain'}),mutationStarted};
  }catch{return {status:'uncertain',mutationStarted};}
 }catch(error){const isConflict=error instanceof Error&&error.message==='tracker_append_conflict';return {status:isConflict?'conflict':'uncertain',mutationStarted,...(!isConflict&&!mutationStarted?{retrySafe:true}:{})};}
}
