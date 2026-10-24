import {afterEach,expect,it,vi} from 'vitest';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {fixture,identity as xlsxIdentity} from './fixtures/tracker-workbook';
import {parseTrackerWorkbook,patchTrackerWorkbook,trackerHeaders} from '../worker/tracker-sync/workbook';
import {writeNativeTrackerBatch,readNativeTracker} from '../worker/tracker-sync/native';
import {writeTrackerBatch} from '../worker/tracker-sync/provider';
import type {ProviderWrite,TrackerEnv} from '../worker/tracker-sync/service';
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn(async()=> 'synthetic-token')}));
vi.mock('../worker/drive/provider',async original=>({...await original<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
const file='synthetic_credit_tracker_12345',sheet='ลูกหนี้ เขาหลัก',col=(v:string)=>[...v].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
type Cell={userEnteredValue?:{stringValue?:string;numberValue?:number;formulaValue?:string;boolValue?:boolean};effectiveValue?:{stringValue?:string;numberValue?:number};textFormatRuns?:unknown[];chipRuns?:unknown[]};
const nativeIdentity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7',transactionDate:'2026-09-01'};
const nativeInput=(value='30',expected:string|null=null):ProviderWrite=>({version:'old-observation',rowKey:'row-a',expectedIdentity:nativeIdentity,locator:{sheetId:99,rowIndex:900},changes:[{field:'S',value,expected}]});
afterEach(()=>vi.unstubAllGlobals());
function native(options:{cell?:Cell;lost?:boolean;readbackFormula?:boolean}={}){
 const headers:Cell[]=Array.from({length:33},()=>({})),cells:Cell[]=Array.from({length:33},()=>({}));for(const [column,title]of Object.entries(trackerHeaders))headers[col(column)]={userEnteredValue:{stringValue:title}};
 for(const [column,value]of Object.entries({A:'SAN',C:'0002',E:'00001',F:'7',G:'2026-09-01',AG:'row-a'}))cells[col(column)]={userEnteredValue:{stringValue:value}};
 for(const column of ['R','U','V','W'])cells[col(column)]={userEnteredValue:{stringValue:'2026-09-01'}};
 cells[col('T')]={userEnteredValue:{formulaValue:'=R3+S3'},effectiveValue:{numberValue:46300}};cells[col('S')]=options.cell??{};
 const rows=[{values:[] as Cell[]},{values:headers},{values:cells}],posts:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const url=new URL(String(input));
  if(init.method==='POST'){const body=JSON.parse(String(init.body));posts.push(body);for(const request of body.requests){const update=request.updateCells;rows[update.start.rowIndex].values[update.start.columnIndex].userEnteredValue=update.rows[0].values[0].userEnteredValue;}
   if(options.readbackFormula)cells[col('S')].userEnteredValue={formulaValue:'=30'};if(options.lost)throw Error('synthetic lost reply');return Response.json({spreadsheetId:file});}
  if(url.pathname.includes('/values/'))return Response.json({range:`'${sheet}'!AG1:AG${rows.length}`,majorDimension:'ROWS',values:rows.map(row=>{const key=row.values[col('AG')]?.userEnteredValue?.stringValue;return key===undefined?[]:[key];})});
  return Response.json({spreadsheetId:file,sheets:[{properties:{sheetId:7,title:sheet},data:[{startRow:0,startColumn:0,rowData:rows}]}]});
 });return {cells,rows,posts};
}
it.each(['S','R'] as const)('native fresh duplicate complete tuple across Accounts prevents %s publication',async field=>{
 const state=native(),duplicate=structuredClone(state.cells);
 duplicate[col('C')].userEnteredValue={stringValue:'0003'};duplicate[col('AG')].userEnteredValue={stringValue:'row-b'};state.rows.push({values:duplicate});
 const input=nativeInput();if(field==='R')input.changes=[{field:'R',expected:'2026-09-01',value:'2026-09-02'}];
 expect(await writeNativeTrackerBatch('synthetic-token',file,[input])).toEqual({status:'conflict'});expect(state.posts).toHaveLength(0);
});
it.each([{field:'E',value:'1'},{field:'F',value:'007'},{field:'G',value:'2026-09-02'}])('native distinguishes exact complete tuple component %j during fresh write validation',async changed=>{
 const state=native(),duplicate=structuredClone(state.cells);
 duplicate[col('C')].userEnteredValue={stringValue:'0003'};duplicate[col('AG')].userEnteredValue={stringValue:'row-b'};duplicate[col(changed.field)].userEnteredValue={stringValue:changed.value};state.rows.push({values:duplicate});
 expect(await writeNativeTrackerBatch('synthetic-token',file,[nativeInput()])).toMatchObject({status:'written'});expect(state.posts).toHaveLength(1);
});
it.each(['0','30','3650'])('native writes numeric S=%s from a fresh exact blank row and changes no date or T',async value=>{
 const state=native(),before=structuredClone(state.cells);expect(await writeNativeTrackerBatch('synthetic-token',file,[nativeInput(value)])).toMatchObject({status:'written'});
 expect(state.posts).toHaveLength(1);expect(state.posts[0]).toMatchObject({requests:[{updateCells:{start:{sheetId:7,rowIndex:2,columnIndex:18},rows:[{values:[{userEnteredValue:{numberValue:Number(value)}}]}],fields:'userEnteredValue'}}]});
 expect(state.cells.filter((_c,index)=>index!==18)).toEqual(before.filter((_c,index)=>index!==18));
});
it.each([{userEnteredValue:{stringValue:'45'}},{userEnteredValue:{formulaValue:'=30'},effectiveValue:{numberValue:30}},{textFormatRuns:[{startIndex:0}]},{chipRuns:[{}]},{userEnteredValue:{boolValue:false}}] satisfies Cell[])('native holds a nonblank, formula or unsupported S cell %j',async cell=>{
 const state=native({cell});const before=structuredClone(state.cells);expect(await writeNativeTrackerBatch('synthetic-token',file,[nativeInput()])).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);expect(state.cells).toEqual(before);
});
it.each(['-1','3651','1.5','2026-10-25'])('native forbids invalid S value %s',async value=>{
 const state=native();await expect(writeNativeTrackerBatch('synthetic-token',file,[nativeInput(value)])).rejects.toThrow('tracker_patch_forbidden');expect(state.posts).toHaveLength(0);
});
it('native forbids nonblank S expected preimages and does not trust a stale locator or different identity',async()=>{
 const state=native();await expect(writeNativeTrackerBatch('synthetic-token',file,[nativeInput('30','20')])).rejects.toThrow('tracker_patch_forbidden');
 const input=nativeInput();input.expectedIdentity={...nativeIdentity,accountNo:'other'};expect(await writeNativeTrackerBatch('synthetic-token',file,[input])).toEqual({status:'conflict'});expect(state.posts).toHaveLength(0);
});
it.each([{lost:true},{readbackFormula:true}])('native leaves unknown or nonexact S publication uncertain %j',async options=>{
 const state=native(options);expect(await writeNativeTrackerBatch('synthetic-token',file,[nativeInput()])).toMatchObject({status:'uncertain'});expect(state.posts).toHaveLength(1);
});
it('native includes formula and rich S write holds in its observation',async()=>{
 native({cell:{chipRuns:[{}]}});expect((await readNativeTracker('synthetic-token',file)).rows[0].blockedWriteFields).toContain('S');
});
function xlsx(cell='<c r="S3"/>'){
 const parts=unzipSync(fixture());parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace('<c r="S3"><v>30</v></c>',cell));return zipSync(parts);
}
it.each(['0','30','3650'])('XLSX changes only the blank S cell to numeric %s and preserves unrelated workbook parts',value=>{
 const before=xlsx(),row=parseTrackerWorkbook(before,'phuket').rows[0],changed=patchTrackerWorkbook(before,'phuket',row.rowKey,xlsxIdentity,[{field:'S',value,expected:null}]);
 expect(parseTrackerWorkbook(changed,'phuket').rows[0].fields.S).toBe(value);
 const oldParts=unzipSync(before),newParts=unzipSync(changed);for(const name of Object.keys(oldParts))if(name!=='xl/worksheets/sheet1.xml')expect(newParts[name]).toEqual(oldParts[name]);
 const oldSheet=strFromU8(oldParts['xl/worksheets/sheet1.xml']),newSheet=strFromU8(newParts['xl/worksheets/sheet1.xml']);expect(newSheet.replace(/<c r="S3"[^>]*>[\s\S]*?<\/c>/,'S')).toBe(oldSheet.replace('<c r="S3"/>','S'));
});
it.each(['','<c r="S3"><v>45</v></c>','<c r="S3"><f>30</f><v/></c>','<c r="S3"><extLst/></c>','<c r="S3" t="b"/>'])('XLSX holds missing or unsafe S cell %s',cell=>{
 const bytes=xlsx(cell),row=parseTrackerWorkbook(bytes,'phuket').rows[0];expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,xlsxIdentity,[{field:'S',value:'30',expected:null}])).toThrow();
});
it.each(['-1','3651','1.5','2026-10-25'])('XLSX forbids invalid numeric S=%s',value=>{
 const bytes=xlsx(),row=parseTrackerWorkbook(bytes,'phuket').rows[0];expect(()=>patchTrackerWorkbook(bytes,'phuket',row.rowKey,xlsxIdentity,[{field:'S',value,expected:null}])).toThrow('tracker_patch_forbidden');
});
it('XLSX S fill uses the existing conditional upload and exact full-byte readback',async()=>{
 let bytes=xlsx(),tag='"synthetic-1"',uploads=0;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const url=new URL(String(input));if(url.pathname.startsWith('/upload/drive/v2/')){uploads++;expect(new Headers(init.headers).get('If-Match')).toBe('"synthetic-1"');bytes=new Uint8Array(init.body as Uint8Array);tag='"synthetic-2"';return Response.json({id:file});}
  if(url.pathname.startsWith('/drive/v2/'))return Response.json({id:file,title:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',etag:tag});
  if(url.searchParams.get('alt')==='media')return new Response(bytes as BodyInit);
  return Response.json({id:file,name:'Master_KAT_AR_Tracker_Phuket.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',trashed:false,version:tag==='"synthetic-1"'?'1':'2',modifiedTime:'2026-10-25T00:00:00Z',size:String(bytes.length),capabilities:{canDownload:true,canEdit:true,canModifyContent:true}});
 });
 const row=parseTrackerWorkbook(bytes,'phuket').rows[0],env:TrackerEnv={REPORT_SHEET_PHUKET_ID:file,TRACKER_BLOB_CAS_ENABLED:'true'};
 expect(await writeTrackerBatch(env,'synthetic-owner','phuket',file,[{version:'v2:"synthetic-1"',rowKey:row.rowKey,expectedIdentity:{...xlsxIdentity,folio:xlsxIdentity.folioNo},locator:row.locator,changes:[{field:'S',value:'30',expected:null}]}])).toEqual({status:'written',version:'v2:"synthetic-2"'});
 expect(uploads).toBe(1);expect(parseTrackerWorkbook(bytes,'phuket').rows[0].fields.S).toBe('30');
});
