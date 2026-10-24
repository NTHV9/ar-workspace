import {readJson} from '../drive/shared';
import {canResolveWithoutAccountNumber,trackerFields,trackerHotel,type TrackerField} from './model';
import {trackerHeaders,trackerDateValue,validTrackerCredit} from './workbook';
import type {ProviderRow,ProviderSnapshot,ProviderWrite} from './service';
const TITLE='ลูกหนี้ เขาหลัก',ROOT='https://sheets.googleapis.com/v4/spreadsheets/';
const dates=new Set(['R','T','U','V','W','X']),allowed=new Set(['R','U','V','W']);
interface Cell {userEnteredValue?:{stringValue?:string;numberValue?:number;formulaValue?:string;boolValue?:boolean};effectiveValue?:{stringValue?:string;numberValue?:number;boolValue?:boolean;errorValue?:unknown};formattedValue?:string;textFormatRuns?:unknown[];chipRuns?:unknown[];userEnteredFormat?:{numberFormat?:{type?:string;pattern?:string}};effectiveFormat?:{numberFormat?:{type?:string;pattern?:string}}}
interface Sheet {properties:{sheetId:number;title:string};data?:{startRow?:number;startColumn?:number;rowData?:{values?:Cell[]}[]}[]}
const column=(name:string)=>[...name].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
async function request(token:string,file:string,suffix:string,init:RequestInit={}){if(!/^[A-Za-z0-9_-]{20,200}$/.test(file))throw Error('tracker_target_conflict');return fetch(ROOT+file+suffix,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(90000)});}
function raw(cell:Cell|undefined):string|null{if(!cell)return null;const v=cell.userEnteredValue?.formulaValue?cell.effectiveValue:cell.userEnteredValue??cell.effectiveValue;if(v===undefined)return null;if('errorValue'in v)throw Error('tracker_native_cell_invalid');if(typeof v.stringValue==='string')return v.stringValue;if(typeof v.numberValue==='number'&&Number.isFinite(v.numberValue))return String(v.numberValue);if(typeof v.boolValue==='boolean')return v.boolValue?'TRUE':'FALSE';throw Error('tracker_native_cell_invalid');}
function identityValue(cell:Cell|undefined):string {if(cell?.userEnteredValue?.formulaValue||typeof (cell?.userEnteredValue??cell?.effectiveValue)?.boolValue==='boolean')throw Error('tracker_native_identity_invalid');let value=raw(cell)?.trim()??'';const numeric=cell?.userEnteredValue?cell.userEnteredValue.numberValue:cell?.effectiveValue?.numberValue,format=cell?.userEnteredFormat?.numberFormat?.pattern??cell?.effectiveFormat?.numberFormat?.pattern;if(numeric!==undefined){if(!Number.isSafeInteger(numeric)||numeric<0||format&&!/^0{1,20}$/.test(format)&&format!=='General')throw Error('tracker_native_identity_invalid');if(format&&/^0{2,20}$/.test(format))value=value.padStart(format.length,'0');}return value;}
function blockedDate(cell:Cell|undefined){return !!cell?.userEnteredValue?.formulaValue||[cell?.textFormatRuns,cell?.chipRuns].some(r=>r!==undefined&&(!Array.isArray(r)||r.length>0));}
function date(value:string|null):string|null {const result=trackerDateValue(value??'',false);if(result&&(!/^\d{4}-\d{2}-\d{2}$/.test(result)||new Date(result+'T00:00:00Z').toISOString().slice(0,10)!==result))throw Error('tracker_native_date_invalid');return result;}
function parse(value:Record<string,unknown>,file:string){
 if(value.spreadsheetId!==file||!Array.isArray(value.sheets))throw Error('tracker_native_schema_invalid');
 const matches=(value.sheets as Sheet[]).filter(s=>s.properties?.title===TITLE);if(matches.length!==1)throw Error('tracker_native_schema_invalid');const sheet=matches[0],gid=sheet.properties.sheetId;if(!Number.isInteger(gid)||gid<0)throw Error('tracker_native_schema_invalid');
 const grid=new Map<number,Cell[]>();for(const data of sheet.data??[]){if((data.startColumn??0)!==0||!Array.isArray(data.rowData))throw Error('tracker_native_schema_invalid');const first=data.startRow??0;if(!Number.isInteger(first)||first<0)throw Error('tracker_native_schema_invalid');for(let i=0;i<data.rowData.length;i++){if(first+i>100001||grid.has(first+i))throw Error('tracker_native_schema_invalid');grid.set(first+i,data.rowData[i].values??[]);}}
 const headers=grid.get(1),fallback=!raw(headers?.[0])?grid.get(0)?.[0]:undefined;
 if(!headers||!Object.entries(trackerHeaders).every(([col,title])=>raw(col==='A'&&fallback?fallback:headers[column(col)])?.trim()===title)||Object.values(trackerHeaders).some(title=>headers.filter(c=>raw(c)?.trim()===title).length+(title==='Property'&&raw(fallback)?.trim()===title?1:0)!==1))throw Error('tracker_native_schema_invalid');
 const rows:ProviderRow[]=[],keys=new Set<string>(),identities=new Set<string>(),cells=new Map<string,Cell[]>();
 for(const [rowIndex,row]of grid){if(rowIndex<2)continue;const get=(col:string)=>row[column(col)];if(get('AG')?.userEnteredValue?.formulaValue)throw Error('tracker_native_identity_invalid');const key=raw(get('AG'))??'';if(!key)continue;const hotel=trackerHotel(identityValue(get('A')),'khao-lak');if(!hotel)continue;if(keys.has(key))throw Error('tracker_native_identity_ambiguous');keys.add(key);
  const issues:string[]=[];let accountNo='',invoiceNo='',folio:string|null=null,transactionDate:string|null=null;try{accountNo=identityValue(get('C'));invoiceNo=identityValue(get('E'));folio=identityValue(get('F'))||null;if(get('G')?.userEnteredValue?.formulaValue)throw Error('tracker_native_identity_invalid');transactionDate=date(raw(get('G')));}catch{issues.push('identity_invalid');}if(!accountNo)issues.push('account_missing');if(!invoiceNo)issues.push('invoice_missing');
  const identity=JSON.stringify([hotel,accountNo,invoiceNo,folio]);if(accountNo&&invoiceNo&&identities.has(identity))throw Error('tracker_native_identity_ambiguous');identities.add(identity);
  const fields:ProviderRow['fields']={},formulaFields:TrackerField[]=[];for(const field of trackerFields){const cell=get(field);if(cell?.userEnteredValue?.formulaValue)formulaFields.push(field);try{fields[field]=dates.has(field)?date(raw(cell)):raw(cell)||null;}catch{fields[field]=cell?.formattedValue??null;issues.push(field+'_invalid');}}
  const agent=!get('B')?.userEnteredValue?.formulaValue?raw(get('B'))?.trim():undefined,property=identityValue(get('A'));
  rows.push({rowKey:key,hotel,accountNo,invoiceNo,folio,folioNo:folio,transactionDate,fields,...(agent?{agent,property}:{}),locator:{sheetId:gid,sheetName:TITLE,rowIndex},issues,formulaFields,blockedWriteFields:(['R','S','U','V','W'] as const).filter(f=>blockedDate(get(f)))});cells.set(key,row);
 }
 return {rows,cells,gid};
}
export function trackerIdentityMatches(row:ProviderRow,identity:ProviderWrite['expectedIdentity']):boolean{return !!identity&&row.hotel===identity.hotel&&row.accountNo===identity.accountNo&&row.invoiceNo===identity.invoiceNo&&(row.folio??null)===(identity.folio??null)&&(row.transactionDate??null)===(identity.transactionDate??null);}
async function nativeJson(token:string,file:string,suffix:string,maxBytes=16*1024*1024){
 const response=await request(token,file,suffix);if(!response.ok){await response.body?.cancel();throw Error(response.status===401||response.status===403||response.status===404?'tracker_authorization_required':'tracker_provider_unavailable');}
 try{return await readJson(response,maxBytes);}catch(error){
  if(error instanceof Error&&error.message==='drive_response_too_large'){
   await response.body?.cancel().catch(()=>{});
   throw Error(suffix.startsWith('/values/')?'tracker_native_keys_too_large':'tracker_native_grid_too_large');
  }
  throw error;
 }
}
export async function readNativeTrackerChangeHint(token:string,file:string):Promise<string>{
 // A change hint only: the full reader still validates business identity,
 // headers, dates, formulas and write safety before importing or publishing.
 const spans=['A1:AG2','A:A','C:C','E:G','R:AC','AG:AG'],widths=[33,1,1,3,12,1];
 const query=new URLSearchParams({prettyPrint:'false',valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER',majorDimension:'ROWS',fields:'spreadsheetId,valueRanges(range,majorDimension,values)'});
 for(const span of spans)query.append('ranges',`'${TITLE}'!${span}`);
 let value:Awaited<ReturnType<typeof nativeJson>>;
 try{value=await nativeJson(token,file,'/values:batchGet?'+query,1024*1024);}catch(error){
  if(error instanceof Error&&error.message==='tracker_native_grid_too_large')throw Error('tracker_native_hint_too_large');
  throw error;
 }
 if(!value||value.spreadsheetId!==file||!Array.isArray(value.valueRanges)||value.valueRanges.length!==spans.length)throw Error('tracker_native_schema_invalid');
 const projection=value.valueRanges.map((entry:unknown,index:number)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('tracker_native_schema_invalid');
  const range=entry as {range?:unknown;majorDimension?:unknown;values?:unknown};
  if(typeof range.range!=='string'||range.majorDimension!=='ROWS'||range.values!==undefined&&!Array.isArray(range.values))throw Error('tracker_native_schema_invalid');
  const match=/^(?:'([^']+)'|([^'!]+))!(.*)$/.exec(range.range);
  if(!match||(match[1]??match[2])!==TITLE)throw Error('tracker_native_schema_invalid');
  const bounds=index===0?/^A1:AG(2)$/.exec(match[3]):new RegExp(`^${spans[index].split(':')[0]}1:${spans[index].split(':')[1]}([1-9][0-9]*)$`).exec(match[3]);
  const end=bounds?Number(bounds[1]):0;
  if(!Number.isSafeInteger(end)||end<1)throw Error('tracker_native_schema_invalid');
  const rows=(range.values??[]) as unknown[];
  if(rows.length>100002||rows.length>end||rows.some(row=>!Array.isArray(row)||row.length>widths[index]||row.some(cell=>cell!==null&&typeof cell!=='string'&&typeof cell!=='boolean'&&!(typeof cell==='number'&&Number.isFinite(cell)))))throw Error('tracker_native_schema_invalid');
  return rows;
 });
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(projection))));
 let numeric=0n;for(const byte of hash.slice(0,12))numeric=numeric*256n+BigInt(byte);
 return '9'+numeric.toString().padStart(29,'0');
}
async function nativeKeys(token:string,file:string){
 // Values omit the formatted-only tail. FORMULA exposes key formulas rather
 // than silently accepting their evaluated result as a stable row identity.
 const query=new URLSearchParams({majorDimension:'ROWS',valueRenderOption:'FORMULA',prettyPrint:'false'});
 const value=await nativeJson(token,file,'/values/'+encodeURIComponent(`'${TITLE}'!AG:AG`)+'?'+query);
 if(typeof value.range!=='string'||!new RegExp(`^'${TITLE}'!AG1:AG[1-9][0-9]*$`).test(value.range)||value.majorDimension!=='ROWS'||value.values!==undefined&&!Array.isArray(value.values))throw Error('tracker_native_schema_invalid');
 const rows=(value.values??[]) as unknown[];if(rows.length>100002)throw Error('tracker_native_schema_invalid');
 return rows.map(row=>{
  if(!Array.isArray(row)||row.length>1)throw Error('tracker_native_schema_invalid');
  const key=row[0];if(key===undefined)return '';if(typeof key==='boolean')return key?'TRUE':'FALSE';if(typeof key==='string'||typeof key==='number'&&Number.isFinite(key))return String(key);throw Error('tracker_native_identity_invalid');
 });
}
export async function readNativeTracker(token:string,file:string):Promise<ProviderSnapshot>{
 const keys=await nativeKeys(token,file);let extent=Math.max(2,keys.length);while(extent>2&&!keys[extent-1])extent--;
 const rows:ProviderRow[]=[],pageHashes:string[]=[],seenKeys=new Set<string>(),identities=new Set<string>();
 let gid:number|undefined,headers:NonNullable<NonNullable<Sheet['data']>[number]['rowData']>|undefined,retainedBytes=2;
 const digest=async(value:unknown)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const gridQuery=(start:number,end:number)=>'?'+new URLSearchParams({includeGridData:'true',prettyPrint:'false',ranges:`'${TITLE}'!A${start+1}:AG${end}`,fields:'spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat(numberFormat),effectiveFormat(numberFormat),textFormatRuns,chipRuns))))'});
 let fastValue:Awaited<ReturnType<typeof nativeJson>>|undefined;
 // Small occupied grids avoid serial page latency. Keep the JSON allocation
 // conservative; only this byte-limit failure may retry with bounded pages.
 if(extent>200&&extent<=2000){try{fastValue=await nativeJson(token,file,gridQuery(0,extent),8*1024*1024);}catch(error){if(!(error instanceof Error)||error.message!=='tracker_native_grid_too_large')throw error;}}
 const pageSize=fastValue===undefined?200:extent;
 for(let start=0;start<extent;start+=pageSize){
  const end=Math.min(start+pageSize,extent),value=fastValue??await nativeJson(token,file,gridQuery(start,end));
  if(value.spreadsheetId!==file||!Array.isArray(value.sheets))throw Error('tracker_native_schema_invalid');
  const matches=(value.sheets as Sheet[]).filter(sheet=>sheet.properties?.title===TITLE);if(matches.length!==1)throw Error('tracker_native_schema_invalid');
  const sheet=matches[0],data=sheet.data;
  if(!Number.isInteger(sheet.properties.sheetId)||sheet.properties.sheetId<0||gid!==undefined&&sheet.properties.sheetId!==gid||!Array.isArray(data)||data.length!==1||(data[0].startRow??0)!==start||(data[0].startColumn??0)!==0||data[0].rowData!==undefined&&!Array.isArray(data[0].rowData))throw Error('tracker_native_schema_invalid');
  gid=sheet.properties.sheetId;const page=data[0].rowData??[];if(page.length>end-start||page.some(row=>row.values!==undefined&&(!Array.isArray(row.values)||row.values.length>33)))throw Error('tracker_native_schema_invalid');
  for(let i=start;i<end;i++){
   const cell=page[i-start]?.values?.[column('AG')];if(cell?.userEnteredValue?.formulaValue)throw Error('tracker_native_identity_invalid');
   if((raw(cell)??'')!==(keys[i]??''))throw Error('tracker_snapshot_changed');
  }
  if(start===0)headers=page.slice(0,2).map(row=>({values:row.values?.map(cell=>({userEnteredValue:cell.userEnteredValue,effectiveValue:cell.effectiveValue}))}));
  if(!headers||headers.length!==2)throw Error('tracker_native_schema_invalid');
  const parsed=parse({spreadsheetId:file,sheets:[{properties:sheet.properties,data:[...(start?[{startRow:0,startColumn:0,rowData:headers}]:[]),{startRow:start,startColumn:0,rowData:page}]}]},file);
  for(const row of parsed.rows){
   const identity=JSON.stringify([row.hotel,row.accountNo,row.invoiceNo,row.folio]);
   if(seenKeys.has(row.rowKey)||row.accountNo&&row.invoiceNo&&identities.has(identity))throw Error('tracker_native_identity_ambiguous');
   seenKeys.add(row.rowKey);identities.add(identity);
   retainedBytes+=new TextEncoder().encode(JSON.stringify(row)).byteLength+1;if(retainedBytes>16*1024*1024)throw Error('tracker_native_grid_too_large');rows.push(row);
  }
  // Keep a digest of each complete typed observation, then release its cells.
  // Only normalized business rows and the small headers survive to the next GET.
  pageHashes.push(await digest(value));
 }
 const after=await nativeKeys(token,file);
 // This detects moved/changed key positions, not an atomic field snapshot.
 // Native publication keeps its existing best-effort/readback contract.
 if(JSON.stringify(after)!==JSON.stringify(keys))throw Error('tracker_snapshot_changed');
 const hash=await digest(pageHashes);
 return {version:'native-observed:'+hash,rows,schemaFingerprint:JSON.stringify([TITLE,gid,trackerHeaders]),capabilities:{conditionalWrite:'unverified',writeAssurance:'best-effort'}};
}
export async function writeNativeTrackerBatch(token:string,file:string,inputs:readonly ProviderWrite[]):Promise<{status:'written'|'conflict'|'uncertain';version?:string}>{
 if(!inputs.length||inputs.length>100||inputs.reduce((n,i)=>n+i.changes.length,0)>300)throw Error('tracker_batch_limit');
 const current=await readNativeTracker(token,file),requests:unknown[]=[],seen=new Map<string,string>();
 // Recheck tuple uniqueness on this fresh typed observation. A second
 // Account row may have appeared since the service selected its commands.
 const tuple=(row:ProviderRow)=>row.folio&&row.transactionDate?JSON.stringify([row.hotel,row.invoiceNo,row.folio,row.transactionDate]):null,tupleCounts=new Map<string,number>();
 for(const row of current.rows){const key=tuple(row);if(key)tupleCounts.set(key,(tupleCounts.get(key)??0)+1);}
 for(const input of inputs){const row=current.rows.find(r=>r.rowKey===input.rowKey);if(!row||!trackerIdentityMatches(row,input.expectedIdentity)||row.issues?.some(i=>!/^([A-Z]{1,2})_invalid$/.test(i)&&!(i==='account_missing'&&canResolveWithoutAccountNumber(row)))||!input.changes.length||tuple(row)!==null&&tupleCounts.get(tuple(row)!)!==1)return {status:'conflict'};
  for(const change of input.changes){
   const credit=change.field==='S';if(credit?change.expected!==null||!validTrackerCredit(change.value):!allowed.has(change.field)||typeof change.value!=='string')throw Error('tracker_patch_forbidden');
   let value=change.value!;if(!credit){let day:string|null;try{day=date(value);}catch{return {status:'conflict'};}if(!day||day!==value)return {status:'conflict'};value=day;}
   if(row.blockedWriteFields?.includes(change.field as 'R'|'S'|'U'|'V'|'W')||row.issues?.includes(change.field+'_invalid')||(row.fields[change.field]??null)!==change.expected)return {status:'conflict'};
   const key=input.rowKey+':'+change.field,prior=seen.get(key);if(prior&&prior!==value)return {status:'conflict'};if(prior)continue;seen.set(key,value);const locator=row.locator as {sheetId:number;rowIndex:number};
   requests.push({updateCells:{start:{sheetId:locator.sheetId,rowIndex:locator.rowIndex,columnIndex:column(change.field)},rows:[{values:[{userEnteredValue:{numberValue:credit?Number(value):(Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000}}]}],fields:'userEnteredValue'}});
  }
 }
 // One best-effort atomic request, without any conditional-write guarantee.
 try{const response=await request(token,file,':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests,includeSpreadsheetInResponse:false})});if(!response.ok){await response.body?.cancel();return {status:'uncertain'};}const result=await readJson(response);if(result.spreadsheetId!==file)return {status:'uncertain'};}catch{return {status:'uncertain'};}
 try{const after=await readNativeTracker(token,file);if(after.schemaFingerprint!==current.schemaFingerprint)return {status:'uncertain',version:after.version};for(const input of inputs){const row=after.rows.find(r=>r.rowKey===input.rowKey);if(!row||!trackerIdentityMatches(row,input.expectedIdentity)||input.changes.some(c=>row.formulaFields?.includes(c.field)||row.fields[c.field]!==c.value))return {status:'uncertain',version:after.version};}return {status:'written',version:after.version};}catch{return {status:'uncertain'};}
}
