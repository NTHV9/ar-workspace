import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {trackerHeaders} from '../worker/tracker-sync/workbook';
import {trackerAdapter,writeTrackerBatch} from '../worker/tracker-sync/provider';
import {readNativeTracker} from '../worker/tracker-sync/native';
import {syncTracker,type TrackerEnv,type ProviderWrite} from '../worker/tracker-sync/service';
vi.mock('../worker/drive/oauth',()=>({driveToken:vi.fn(async()=> 'synthetic-token')}));
vi.mock('../worker/drive/provider',async original=>({...await original<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
const file='synthetic_native_original_123456',owner='synthetic-owner';
const env:TrackerEnv={REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'};
type Cell={userEnteredValue?:{stringValue?:string;numberValue?:number;formulaValue?:string;boolValue?:boolean};effectiveValue?:{stringValue?:string;numberValue?:number};textFormatRuns?:unknown[];chipRuns?:unknown[];userEnteredFormat?:{numberFormat:{type:string;pattern:string}}};
const col=(v:string)=>[...v].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
function nativeResponse(value:ReturnType<typeof grid>,url:string){
 const parsed=new URL(url),sheet=value.sheets[0],rows=sheet.data[0].rowData;
 if(parsed.pathname.includes('/values/')){
  const values=rows.map(row=>{const v=row.values[col('AG')]?.userEnteredValue;const key=v?.formulaValue??v?.stringValue??v?.numberValue??v?.boolValue;return key===undefined?[]:[key];});
  while(values.length&&!values.at(-1)?.length)values.pop();
  return Response.json({range:"'ลูกหนี้ เขาหลัก'!AG1:AG100002",majorDimension:'ROWS',values});
 }
 const range=parsed.searchParams.get('ranges')?.match(/!A(\d+):AG(\d+)$/);
 if(!range)return Response.json(value);
 const start=Number(range[1])-1,end=Number(range[2]);
 return Response.json({...value,sheets:[{...sheet,data:[{startRow:start,startColumn:0,rowData:rows.slice(start,end)}]}]});
}
function grid(){const headers:Cell[]=Array.from({length:33},()=>({}));for(const [k,v]of Object.entries(trackerHeaders))headers[col(k)]={userEnteredValue:{stringValue:v}};const row=(key:string,invoice:string)=>{const cells:Cell[]=Array.from({length:33},()=>({}));for(const [k,v]of Object.entries({A:'SAN',C:'0002',E:invoice,F:'F'+invoice,G:'2026-09-01',AG:key}))cells[col(k)]={userEnteredValue:{stringValue:v}};for(const k of ['R','U','V','W'])cells[col(k)].userEnteredFormat={numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}};cells[col('T')]={userEnteredValue:{formulaValue:'=R3+S3'}};cells[col('AA')]={userEnteredValue:{formulaValue:'=H3-Z3'}};return {values:cells};};return {spreadsheetId:file,sheets:[{properties:{sheetId:9,title:'ลูกหนี้ เขาหลัก',gridProperties:{rowCount:100,columnCount:33}},data:[{startRow:0,startColumn:0,rowData:[{values:[]},{values:headers},row('key-A','00001'),row('key-B','00002')]}]}]};}
function fake(options:{lost?:boolean;move?:boolean;formula?:boolean;changeIdentity?:boolean;newGid?:boolean}={}){let value=grid();if(options.move){const rows=value.sheets[0].data[0].rowData;[rows[2],rows[3]]=[rows[3],rows[2]];value.sheets[0].properties.sheetId=77;}if(options.formula)value.sheets[0].data[0].rowData[2].values[col('R')].userEnteredValue={formulaValue:'=TODAY()'};const posts:Record<string,unknown>[]=[];const fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{const url=String(input);if(url.includes('sheets.googleapis.com')){if(init.method==='POST'){const body=JSON.parse(String(init.body));posts.push(body);for(const request of body.requests){const u=request.updateCells;value.sheets[0].data[0].rowData[u.start.rowIndex].values[u.start.columnIndex].userEnteredValue=u.rows[0].values[0].userEnteredValue;}if(options.changeIdentity)value.sheets[0].data[0].rowData[2].values[col('E')].userEnteredValue={stringValue:'OTHER'};if(options.newGid)value.sheets[0].properties.sheetId=88;if(options.lost)throw Error('synthetic response lost');return Response.json({spreadsheetId:file,replies:[]});}return nativeResponse(value,url);}return Response.json({id:file,name:'Master_SAN_AR_Tracker',mimeType:'application/vnd.google-apps.spreadsheet',trashed:false,version:'1',modifiedTime:'2026-10-07T00:00:00Z',capabilities:{canDownload:true,canEdit:true,canModifyContent:true}});});vi.stubGlobal('fetch',fetcher);return {posts,value,fetcher};}
const input=():ProviderWrite=>({version:'observed',rowKey:'key-A',expectedIdentity:{hotel:'TSAN',accountNo:'0002',invoiceNo:'00001',folio:'F00001',transactionDate:'2026-09-01'},locator:{sheetId:123,row:40},changes:[{field:'R',expected:null,value:'2026-09-02'},{field:'U',expected:null,value:'2026-09-03'},{field:'V',expected:null,value:'2026-09-04'},{field:'W',expected:null,value:'2026-09-05'}]});
// SQL receipt/authority selection is deliberately a fake RPC boundary here.
// Parsing, service decisions, provider preimage validation, HTTP mutation and
// readback use their real implementations; this does not claim SQL execution.
function joinedNative(options:{lost?:boolean;clearBeforeWrite?:boolean;missingRow?:boolean;noOutbox?:boolean}={}){
 const state=fake({lost:options.lost}),providerFetch=globalThis.fetch,calls:{name:string;body:Record<string,unknown>}[]=[];
 const cells=state.value.sheets[0].data[0].rowData[2].values;
 if(options.clearBeforeWrite)cells[col('U')].userEnteredValue={stringValue:'2026-09-02'};
 if(options.missingRow)delete cells[col('AG')].userEnteredValue;
 let receipt='pending';
 vi.stubGlobal('fetch',async(url:RequestInfo|URL,init:RequestInit={})=>{
  if(!String(url).startsWith('https://synthetic.supabase.co/rest/v1/rpc/')){
   if(init.method==='POST')expect(calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('uncertain');
   return providerFetch(url,init);
  }
  const name=String(url).split('/').at(-1)!,body=JSON.parse(String(init.body));calls.push({name,body});
  if(name==='ar_tracker_claim')return Response.json({status:'claimed',fileId:file});
  if(name==='ar_tracker_outbox'){
   if(options.clearBeforeWrite)delete cells[col('U')].userEnteredValue;
   if(options.noOutbox)return Response.json([]);
   return Response.json(receipt==='written'?[]:[{id:'synthetic-confirmed-intent',rowKey:'key-A',identity:input().expectedIdentity,locator:{},field:'U',value:'2026-09-03',expected:options.clearBeforeWrite?'2026-09-02':null,state:receipt}]);
  }
  if(name==='ar_tracker_write_result'){receipt=String(body.p_state);return Response.json({state:receipt});}
  return Response.json({});
 });
 return {...state,calls,run:()=>syncTracker({...env,SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},owner,owner,'khao-lak',trackerAdapter)};
}
it('joins an existing confirmed intent through native arm, publication, exact readback and receipt without a second write',async()=>{
 const state=joinedNative();await state.run();
 expect(state.posts).toHaveLength(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['uncertain','written']);
 expect(state.calls.map(c=>c.name)).toEqual(['ar_tracker_claim','ar_tracker_snapshot','ar_tracker_membership','ar_tracker_outbox','ar_tracker_write_result','ar_tracker_write_result','ar_tracker_finish']);
 const imported=state.calls.find(c=>c.name==='ar_tracker_snapshot')!.body.p_rows as {fields:Record<string,unknown>}[];
 expect(imported[0].fields.U).toBeNull();
 await state.run();expect(state.posts).toHaveLength(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_snapshot').at(-1)?.body).toMatchObject({p_rows:[{fields:{U:'2026-09-03'}},{}]});
});
it('a collaborator date deletion between service snapshot and native preimage read is not restored',async()=>{
 const state=joinedNative({clearBeforeWrite:true});await state.run();
 expect(state.posts).toHaveLength(0);
 expect(state.value.sheets[0].data[0].rowData[2].values[col('U')].userEnteredValue).toBeUndefined();
 expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['uncertain','conflict']);
 expect(state.calls.find(c=>c.name==='ar_tracker_snapshot')?.body).toMatchObject({p_rows:[{fields:{U:'2026-09-02'}},{}]});
});
it('a lost native response is reconciled by the next joined snapshot without another provider mutation',async()=>{
 const state=joinedNative({lost:true});await state.run();
 expect(state.posts).toHaveLength(1);expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('uncertain');
 await state.run();expect(state.posts).toHaveLength(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('written');
});
it('a stale selected outbox identity with a deleted provider row cannot write a neighbouring invoice',async()=>{
 const state=joinedNative({missingRow:true});await state.run();expect(state.posts).toHaveLength(0);
 expect(state.calls.find(c=>c.name==='ar_tracker_membership')?.body.p_keys).toEqual(['key-B']);
 expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['conflict']);
});
it('joins every mapped source column and explicit date clears into the snapshot RPC without a provider write',async()=>{
 const state=joinedNative({noOutbox:true}),cells=state.value.sheets[0].data[0].rowData[2].values;
 const fields={R:'2026-09-01',S:'30',T:'2026-10-01',U:'2026-09-02',V:'2026-09-03',W:'2026-09-04',X:'2026-10-10',Y:'Awaiting reply',Z:'125.50',AA:'0',AB:'Synthetic source note',AC:'Synthetic owner'};
 for(const [field,value] of Object.entries(fields))cells[col(field)].userEnteredValue={stringValue:value};
 await state.run();expect(state.calls.find(c=>c.name==='ar_tracker_snapshot')?.body).toMatchObject({p_rows:[{fields,fieldHolds:[]},{}]});
 for(const field of ['R','U','V','W'])delete cells[col(field)].userEnteredValue;
 await state.run();expect(state.calls.filter(c=>c.name==='ar_tracker_snapshot').at(-1)?.body).toMatchObject({p_rows:[{fields:{...fields,R:null,U:null,V:null,W:null}},{}]});
 expect(state.posts).toHaveLength(0);
});
it.each([403,429])('a joined native read failure %i records failure without publication and a fresh run can recover',async status=>{
 const state=joinedNative(),fetchBeforeFailure=globalThis.fetch;let fail=true;
 vi.stubGlobal('fetch',async(url:RequestInfo|URL,init:RequestInit={})=>fail&&String(url).includes('sheets.googleapis.com')?new Response('synthetic provider body must not escape',{status}):fetchBeforeFailure(url,init));
 await expect(state.run()).rejects.toThrow(status===403?'tracker_authorization_required':'tracker_provider_unavailable');
 expect(state.posts).toHaveLength(0);expect(state.calls.some(c=>c.name==='ar_tracker_snapshot')).toBe(false);
 expect(state.calls.filter(c=>c.name==='ar_tracker_finish').at(-1)?.body.p_error).toBe('tracker_unavailable');
 fail=false;await state.run();expect(state.posts).toHaveLength(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('written');
});
afterEach(()=>vi.unstubAllGlobals());
it('writes dates for a corroborated blank Account No. without filling or changing that identity cell',async()=>{
 const state=fake(),cell=state.value.sheets[0].data[0].rowData[2].values[col('C')];delete cell.userEnteredValue;
 const write=input();write.expectedIdentity={...write.expectedIdentity,accountNo:'',transactionDate:'2026-09-01'};
 expect(await writeTrackerBatch(env,owner,'khao-lak',file,[write])).toMatchObject({status:'written'});
 expect(cell.userEnteredValue).toBeUndefined();expect(state.posts).toHaveLength(1);
});
it('streams individually bounded pages when combined typed metadata exceeds 16 MiB',async()=>{
 const state=fake(),rows=state.value.sheets[0].data[0].rowData,base=globalThis.fetch;
 rows.length=402;for(let i=4;i<402;i++)rows[i]={values:[]};rows[400]=structuredClone(rows[2]);rows[400].values[col('AG')].userEnteredValue={stringValue:'key-last'};rows[400].values[col('E')].userEnteredValue={stringValue:'last-invoice'};
 // Typed formatting is large but does not become business fields. Each page
 // fits the existing cap while a single complete grid cannot fit it.
 const hugeFormat='0'.repeat(60000);
 for(let i=4;i<400;i++)rows[i]={values:[{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:hugeFormat}}}]};
 vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
  const url=new URL(String(args[0])),range=url.searchParams.get('ranges')?.match(/!A(\d+):AG(\d+)$/);
  if(range&&Number(range[2])-Number(range[1])+1>200)return new Response('{}',{headers:{'Content-Length':String(16*1024*1024+1)}});
  return base(...args);
 });
 const result=await readNativeTracker('synthetic-token',file);
 expect(result.rows.map(row=>row.rowKey)).toEqual(['key-A','key-B','key-last']);expect(result.rows.at(-1)?.locator).toMatchObject({rowIndex:400});
 expect(state.fetcher.mock.calls.filter(call=>new URL(String(call[0])).searchParams.has('ranges')).map(call=>new URL(String(call[0])).searchParams.get('ranges'))).toEqual(["'ลูกหนี้ เขาหลัก'!A1:AG200","'ลูกหนี้ เขาหลัก'!A201:AG400","'ลูกหนี้ เขาหลัก'!A401:AG401"]);
 expect(state.posts).toHaveLength(0);
});
it('reads only occupied typed rows when an unbounded formatted tail exceeds 16 MiB',async()=>{
 const state=fake(),base=globalThis.fetch;
 vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
  const url=new URL(String(args[0]));
  if(url.searchParams.get('ranges')==="'ลูกหนี้ เขาหลัก'!A:AG")return new Response('{}',{headers:{'Content-Length':String(16*1024*1024+1)}});
  return base(...args);
 });
 const result=await readNativeTracker('synthetic-token',file);
 expect(result.rows.map(row=>row.rowKey)).toEqual(['key-A','key-B']);expect(state.posts).toHaveLength(0);
 expect(state.fetcher.mock.calls.filter(call=>new URL(String(call[0])).searchParams.has('ranges')).map(call=>new URL(String(call[0])).searchParams.get('ranges'))).toEqual(["'ลูกหนี้ เขาหลัก'!A1:AG4"]);
});
it.each([false,true])('allows unrelated sheet metadata but rejects duplicate target sheets: %s',async duplicateTarget=>{
 const state=fake(),base=globalThis.fetch;
 vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
  const response=await base(...args);if(!new URL(String(args[0])).searchParams.has('ranges'))return response;
  const body=await response.json() as ReturnType<typeof grid>;
  body.sheets.push({...body.sheets[0],properties:{...body.sheets[0].properties,sheetId:10,title:duplicateTarget?'ลูกหนี้ เขาหลัก':'Unrelated sheet'},data:[]});
  return Response.json(body);
 });
 if(duplicateTarget)await expect(readNativeTracker('synthetic-token',file)).rejects.toThrow('tracker_native_schema_invalid');
 else expect((await readNativeTracker('synthetic-token',file)).rows.map(row=>row.rowKey)).toEqual(['key-A','key-B']);
 expect(state.posts).toHaveLength(0);
});
it('preserves exact locators and duplicate-key guards at distant occupied rows',async()=>{
 const state=fake(),rows=state.value.sheets[0].data[0].rowData;
 rows.length=202;for(let i=4;i<202;i++)rows[i]={values:[]};rows[200]=structuredClone(rows[2]);rows[200].values[col('AG')].userEnteredValue={stringValue:'key-edge'};rows[200].values[col('E')].userEnteredValue={stringValue:'edge-invoice'};
 const result=await readNativeTracker('synthetic-token',file);expect(result.rows.find(row=>row.rowKey==='key-edge')?.locator).toMatchObject({rowIndex:200});
 rows[200].values[col('AG')].userEnteredValue={stringValue:'key-A'};
 await expect(readNativeTracker('synthetic-token',file)).rejects.toThrow('tracker_native_identity_ambiguous');expect(state.posts).toHaveLength(0);
});
it('rejects a canonical invoice repeated on a later page even with a different AG key',async()=>{
 const state=fake(),rows=state.value.sheets[0].data[0].rowData;rows.length=201;for(let i=4;i<200;i++)rows[i]={values:[]};rows[200]=structuredClone(rows[2]);rows[200].values[col('AG')].userEnteredValue={stringValue:'different-key'};
 await expect(readNativeTracker('synthetic-token',file)).rejects.toThrow('tracker_native_identity_ambiguous');expect(state.posts).toHaveLength(0);
});
it.each(['gid','offset','missing','keys'] as const)('fails closed for a later page with changed %s',async mode=>{
 const state=fake(),rows=state.value.sheets[0].data[0].rowData,base=globalThis.fetch;rows.length=201;for(let i=4;i<200;i++)rows[i]={values:[]};rows[200]=structuredClone(rows[2]);rows[200].values[col('AG')].userEnteredValue={stringValue:'last-key'};rows[200].values[col('E')].userEnteredValue={stringValue:'last-invoice'};
 vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
  const response=await base(...args);if(new URL(String(args[0])).searchParams.get('ranges')!=="'ลูกหนี้ เขาหลัก'!A201:AG201")return response;
  const body=await response.json() as ReturnType<typeof grid>;if(mode==='gid')body.sheets[0].properties.sheetId=10;if(mode==='offset')body.sheets[0].data[0].startRow=199;if(mode==='missing')body.sheets[0].data=[];if(mode==='keys')body.sheets[0].data[0].rowData[0].values[col('AG')].userEnteredValue={stringValue:'changed-key'};return Response.json(body);
 });
 await expect(writeTrackerBatch(env,owner,'khao-lak',file,[input()])).rejects.toThrow();expect(state.posts).toHaveLength(0);
});
it.each(['keys','grid'] as const)('keeps the 16 MiB cap and identifies the oversized %s response',async kind=>{
 const state=fake(),base=globalThis.fetch;vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{const url=new URL(String(args[0]));if(kind==='keys'?url.pathname.includes('/values/'):url.searchParams.has('ranges'))return new Response('{}',{headers:{'Content-Length':String(16*1024*1024+1)}});return base(...args);});
 await expect(readNativeTracker('synthetic-token',file)).rejects.toThrow(kind==='keys'?'tracker_native_keys_too_large':'tracker_native_grid_too_large');expect(state.posts).toHaveLength(0);
});
it.each(['during-grid','after-grid','missing-grid','wrong-gid','wrong-offset'] as const)('rejects %s changes without partial import or provider write',async mode=>{
 const state=fake(),base=globalThis.fetch;let keyReads=0;
 vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{
  const url=new URL(String(args[0]));if(url.pathname.includes('/values/')){keyReads++;if(mode==='after-grid'&&keyReads===2)state.value.sheets[0].data[0].rowData[2].values[col('AG')].userEnteredValue={stringValue:'changed-key'};}
  if(url.searchParams.has('ranges')){
   if(mode==='missing-grid')return Response.json({spreadsheetId:file,sheets:[{properties:state.value.sheets[0].properties,data:[]}]});
   if(mode==='during-grid')state.value.sheets[0].data[0].rowData[2].values[col('AG')].userEnteredValue={stringValue:'changed-key'};
   const response=await base(...args),body=await response.json() as ReturnType<typeof grid>;
   if(mode==='wrong-gid')body.sheets[0].properties.sheetId=-1;
   if(mode==='wrong-offset')body.sheets[0].data[0].startRow=1;
   return Response.json(body);
  }
  return base(...args);
 });
 await expect(readNativeTracker('synthetic-token',file)).rejects.toThrow();expect(state.posts).toHaveLength(0);
});
it('publishes only numeric date values at freshly matched identity, preserving all other cell metadata',async()=>{const state=fake(),before=structuredClone(state.value);expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'written'});expect(state.posts).toHaveLength(1);const requests=state.posts[0].requests as {updateCells:{start:{sheetId:number;rowIndex:number;columnIndex:number};fields:string;rows:{values:{userEnteredValue:{numberValue:number}}[]}[]}}[];expect(requests.map(r=>[r.updateCells.start,r.updateCells.fields])).toEqual([17,20,21,22].map(columnIndex=>[{sheetId:9,rowIndex:2,columnIndex},'userEnteredValue']));for(const r of requests){expect(Number.isInteger(r.updateCells.rows[0].values[0].userEnteredValue.numberValue)).toBe(true);before.sheets[0].data[0].rowData[2].values[r.updateCells.start.columnIndex].userEnteredValue=r.updateCells.rows[0].values[0].userEnteredValue;}expect(state.value).toEqual(before);});
it('keeps the owner-approved native date writeback available under shipped runtime defaults',async()=>{
 const shipped=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')) as {vars:Record<string,string>};
 const state=fake();
 expect(await writeTrackerBatch({...env,...shipped.vars},owner,'khao-lak',file,[input()])).toMatchObject({status:'written'});
 expect(state.posts).toHaveLength(1);
});
it('is disabled by default and formulas/identity mismatches never publish',async()=>{const state=fake();expect(await writeTrackerBatch({...env,TRACKER_NATIVE_BEST_EFFORT_ENABLED:undefined},owner,'khao-lak',file,[input()])).toEqual({status:'conflict'});expect(state.posts).toHaveLength(0);const formula=fake({formula:true});expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'conflict'});expect(formula.posts).toHaveLength(0);const wrong=input();wrong.expectedIdentity.invoiceNo='1';const identity=fake();expect(await writeTrackerBatch(env,owner,'khao-lak',file,[wrong])).toMatchObject({status:'conflict'});expect(identity.posts).toHaveLength(0);});
it.each([{lost:true},{changeIdentity:true}])('response loss or changed readback identity is uncertain with exactly one POST: %j',async option=>{const state=fake(option);expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'uncertain'});expect(state.posts).toHaveLength(1);});
it('accepts observed merged Property A1 header and resolves moved key under a new gid',async()=>{const state=fake({move:true}),rows=state.value.sheets[0].data[0].rowData;rows[0].values=[rows[1].values[0]];rows[1].values[0]={};expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'written'});expect(state.posts[0]).toMatchObject({requests:Array.from({length:4},()=>({updateCells:{start:{sheetId:77,rowIndex:3}}}))});});
it('holds duplicate canonical rows even when posting dates and AG differ',async()=>{const state=fake(),rows=state.value.sheets[0].data[0].rowData;rows[3].values[col('E')]=structuredClone(rows[2].values[col('E')]);rows[3].values[col('F')]=structuredClone(rows[2].values[col('F')]);rows[3].values[col('G')]={userEnteredValue:{stringValue:'2026-09-02'}};await expect(writeTrackerBatch(env,owner,'khao-lak',file,[input()])).rejects.toThrow('tracker_native_identity_ambiguous');expect(state.posts).toHaveLength(0);});
it('text identifiers never gain zero padding from a numeric format',async()=>{const state=fake(),cell=state.value.sheets[0].data[0].rowData[2].values[col('E')];cell.userEnteredValue={stringValue:'1'};cell.userEnteredFormat={numberFormat:{type:'NUMBER',pattern:'00000'}};const p=input();p.expectedIdentity.invoiceNo='1';expect(await writeTrackerBatch(env,owner,'khao-lak',file,[p])).toMatchObject({status:'written'});});
it.each(['textFormatRuns','chipRuns'] as const)('holds targeted %s metadata that value writes would erase',async property=>{const state=fake();state.value.sheets[0].data[0].rowData[2].values[col('R')][property]=[{}];expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);});
it('changed gid after publication is uncertain without another POST',async()=>{const state=fake({newGid:true});expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'uncertain'});expect(state.posts).toHaveLength(1);});
it('matches normal numeric posting dates without treating date formatting as an identifier mask',async()=>{const state=fake(),cell=state.value.sheets[0].data[0].rowData[2].values[col('G')];cell.userEnteredValue={numberValue:(Date.UTC(2026,8,1)-Date.UTC(1899,11,30))/86400000};cell.userEnteredFormat={numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}};expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'written'});});
it.each([false,true])('boolean %s is nonblank invalid date content and is never overwritten',async boolValue=>{const state=fake();state.value.sheets[0].data[0].rowData[2].values[col('R')].userEnteredValue={boolValue};expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);});
it('boolean identity cannot be accepted as a string identifier',async()=>{const state=fake();state.value.sheets[0].data[0].rowData[2].values[col('E')].userEnteredValue={boolValue:false};const p=input();p.expectedIdentity.invoiceNo='FALSE';expect(await writeTrackerBatch(env,owner,'khao-lak',file,[p])).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);});
it.each([{}, {numberValue:Number.NaN}])('unrecognized/nonfinite date values are never coerced to an expected blank',async value=>{const state=fake();state.value.sheets[0].data[0].rowData[2].values[col('R')].userEnteredValue=value;expect(await writeTrackerBatch(env,owner,'khao-lak',file,[input()])).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);});
it('retains nondate boolean source values verbatim',async()=>{const state=fake(),cells=state.value.sheets[0].data[0].rowData[2].values;cells[col('Y')].userEnteredValue={boolValue:false};cells[col('AB')].userEnteredValue={boolValue:true};const snapshot=await readNativeTracker('synthetic-token',file);expect(snapshot.rows[0].fields).toMatchObject({Y:'FALSE',AB:'TRUE'});expect(state.posts).toHaveLength(0);});
