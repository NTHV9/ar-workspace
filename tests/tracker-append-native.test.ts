import {expect,it,vi} from 'vitest';
import {appendNativeTracker,buildNativeAppendRequests,nativeAppendHeaders,type NativeAppendPlan,nativeAppendDueFormula} from '../worker/tracker-sync/append-native';

const file='synthetic_native_original_123456',title='ลูกหนี้ เขาหลัก';
type Cell={userEnteredValue?:{stringValue?:string;numberValue?:number;boolValue?:boolean;formulaValue?:string};userEnteredFormat?:{numberFormat:{pattern:string}}};
const cell=(v:unknown):Cell=>v===null?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}};
const rowValues=()=>['SAN','Agent','NEW_ACCOUNT','Guest','00001','F1','2026-09-01',100,100,0,0,0,0,0,5,'0-30','ปกติ','2026-10-25',30,null,null,null,null,null,null,null,null,null,null,'2026-10-25','2026-10-25','observed','sent-new-row'];
const plan=():NativeAppendPlan=>({sheetId:9,sheetTitle:title,metadataId:456,rowKey:'sent-new-row',identity:{hotel:'TSAN',accountNo:'NEW_ACCOUNT',invoiceNo:'00001',folioNo:'F1',transactionDate:'2026-09-01'},values:rowValues(),priorUncertain:false});
function fake(options:{existing?:boolean;oldAccount?:boolean;duplicates?:boolean;lost?:boolean;metadata?:boolean;wrongMetadata?:boolean;header?:boolean;redirect?:boolean;metadataCharacters?:number;rowCount?:number;duplicateIdAtPost?:boolean}={}){
 const rows:Cell[][]=[[],nativeAppendHeaders.map(cell)];
 if(options.header)rows[1][7]=cell('changed');
 if(options.existing||options.oldAccount){const v=rowValues();v[17]=null;if(options.oldAccount){v[2]='OLD_ACCOUNT';v[32]='old-account-row';}rows.push(v.map(cell));}
 if(options.duplicates)rows.push([...rows[2]]);
 let metadata:Record<string,unknown>|null=options.metadata?{metadataId:456,metadataKey:'s',location:{dimensionRange:{sheetId:9,dimension:'ROWS',startIndex:2,endIndex:3}}}:null;
 if(options.metadata&&!options.existing)rows.push(rowValues().map(cell));
 if(options.wrongMetadata&&metadata)metadata.metadataKey='OTHER';
 const posts:Record<string,unknown>[]=[],before=JSON.stringify(rows);
 const fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
  expect(new URL(String(input)).hostname).toBe('sheets.googleapis.com');expect(init.redirect).toBe('manual');
  if(options.redirect)return new Response(null,{status:302,headers:{Location:'https://example.org'}});
  if(String(input).includes('/developerMetadata:search'))return Response.json({matchedDeveloperMetadata:options.metadataCharacters?[{developerMetadata:{metadataId:999,metadataKey:'p',metadataValue:'x'.repeat(options.metadataCharacters-1)}}]:[]});
  if(init.method==='POST'){
   const body=JSON.parse(String(init.body));posts.push(body);
   if(options.duplicateIdAtPost){
    metadata={metadataId:456,metadataKey:'s',location:{dimensionRange:{sheetId:9,dimension:'ROWS',startIndex:2,endIndex:3}}};
    // Model the documented atomic batch rejection: inspect every request before applying any.
    if(body.requests.some((r:Record<string,any>)=>r.createDeveloperMetadata?.developerMetadata.metadataId===metadata!.metadataId))return Response.json({error:{code:400,status:'INVALID_ARGUMENT'}},{status:400});
   }
   const insert=body.requests[0].insertDimension.range.startIndex;
   while(rows.length<insert)rows.push([]);rows.splice(insert,0,[]);
   for(const request of body.requests){if(request.updateCells){const u=request.updateCells;rows[u.start.rowIndex]=u.rows[0].values;}if(request.createDeveloperMetadata)metadata=request.createDeveloperMetadata.developerMetadata;}
   if(options.lost)throw Error('response lost');
   return Response.json({spreadsheetId:file,replies:[]});
  }
  if(String(input).includes('/developerMetadata/'))return metadata?Response.json(metadata):Response.json({error:{}},{status:404});
  if(String(input).includes('/values:batchGet')){
   const spans=[['A','A',[0]],['C','C',[2]],['E','G',[4,5,6]],['AG','AG',[32]]] as const;
   return Response.json({spreadsheetId:file,valueRanges:spans.map(([left,right,columns])=>{
    const values=rows.map(row=>columns.map(i=>{const v=row[i]?.userEnteredValue;return v?.stringValue??v?.numberValue??v?.formulaValue??v?.boolValue??null;}));
    while(values.length&&values.at(-1)!.every(v=>v===null))values.pop();
    return {range:`'${title}'!${left}1:${right}${options.rowCount??100}`,majorDimension:'ROWS',values};
   })});
  }
  if(String(input).includes('/values/')){
   const values=rows.map(row=>{const v=row[32]?.userEnteredValue;return v?[v.stringValue??v.numberValue??v.formulaValue]:[];});while(values.length&&!values.at(-1)?.length)values.pop();
   return Response.json({range:`'${title}'!AG1:AG${options.rowCount??100}`,majorDimension:'ROWS',values});
  }
  const range=new URL(String(input)).searchParams.get('ranges')?.match(/!A(\d+):AG(\d+)$/),start=range?Number(range[1])-1:0,end=range?Number(range[2]):rows.length;
  return Response.json({spreadsheetId:file,sheets:[{properties:{sheetId:9,title,gridProperties:{rowCount:options.rowCount??100,columnCount:33}},data:[{startRow:start,startColumn:0,rowData:rows.slice(start,end).map(values=>({values}))}]}]});
 });
 return {rows,posts,fetcher,before};
}
it('appends a new exact account atomically and writes dates only on the fresh row',async()=>{
 const state=fake({oldAccount:true});const before=JSON.stringify(state.rows[2]);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'written',mutationStarted:true});
 expect(state.posts).toHaveLength(1);expect(JSON.stringify(state.rows[2])).toBe(before);
 const requests=state.posts[0].requests as Record<string,any>[];
 expect(requests[0]).toMatchObject({insertDimension:{range:{sheetId:9,startIndex:99,endIndex:100}}});
 const update=requests.find(r=>r.updateCells)!.updateCells;
 expect(update.start).toEqual({sheetId:9,rowIndex:99,columnIndex:0});expect(update.rows[0].values).toHaveLength(33);
 expect(update.rows[0].values[17].userEnteredValue).toEqual({numberValue:46320});
 expect(requests.at(-1)).toMatchObject({createDeveloperMetadata:{developerMetadata:{metadataId:456,metadataKey:'s'}}});
});
it('an existing exact identity returns exists and preserves a deliberately blank date',async()=>{
 const state=fake({existing:true});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'exists',mutationStarted:false});
 expect(state.posts).toHaveLength(0);expect(JSON.stringify(state.rows)).toBe(state.before);
});
it('duplicate canonical identities hold',async()=>{
 const state=fake({existing:true,duplicates:true});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);
});
it('a lost successful POST reconciles the same metadata without another insert',async()=>{
 const state=fake({lost:true});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'written'});
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'written',mutationStarted:false});expect(state.posts).toHaveLength(1);
});
it('absent metadata after prior uncertain never retries',async()=>{
 const state=fake();expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});expect(state.posts).toHaveLength(0);
});
it('mismatched metadata and schema are held',async()=>{
 for(const options of [{metadata:true,wrongMetadata:true},{header:true}]){const state=fake(options);expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict'});expect(state.posts).toHaveLength(0);}
});
it('formula-looking financial strings remain literal and intentional formulas are typed only on a new row',async()=>{
 const state=fake(),p=plan(),values=[...p.values];values[3]='=HYPERLINK("https://example.org")';values[19]={formula:nativeAppendDueFormula(true)};
 expect(await appendNativeTracker('token',file,{...p,values},state.fetcher)).toMatchObject({status:'written'});
 const u=(state.posts[0].requests as Record<string,any>[]).find(r=>r.updateCells)!.updateCells.rows[0].values;
 expect(u[3].userEnteredValue).toEqual({stringValue:values[3]});expect(u[19].userEnteredValue).toEqual({formulaValue:nativeAppendDueFormula(true)});
 expect((state.posts[0].requests as Record<string,any>[]).some(r=>r.repeatCell?.range.startColumnIndex===19&&r.repeatCell?.cell.userEnteredFormat.numberFormat.type==='DATE')).toBe(true);
});
it('redirects never forward bearer credentials',async()=>{
 const state=fake({redirect:true});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});expect(state.posts).toHaveLength(0);expect(state.fetcher).toHaveBeenCalledTimes(1);
});
it('global duplicate AG keys hold even on other accounts',async()=>{
 const state=fake({oldAccount:true});const other=rowValues();other[2]='THIRD_ACCOUNT';other[32]='old-account-row';state.rows.push(other.map(cell));
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);
});
it('same AG on another account conflicts rather than duplicating a legacy merge key',async()=>{
 const state=fake({oldAccount:true});state.rows[2][32]=cell(plan().rowKey);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);
});
it('transient pre-read failure exposes that no mutation was attempted',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:429}));
 expect(await appendNativeTracker('token',file,plan(),fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects arbitrary formulas and staff initialization outside confirmed date fields',async()=>{
 for(const [index,value]of [[19,{formula:'=IMPORTXML("https://example.org","*")'}],[26,{formula:'=H100-Z100'}],[27,'copied note']] as const){
  const state=fake(),p=plan(),values=[...p.values];values[index]=value;
  expect(await appendNativeTracker('token',file,{...p,values},state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.fetcher).not.toHaveBeenCalled();
 }
});
it('a failed atomic insert leaves existing rows intact and its same-ID retry is readback only',async()=>{
 const state=fake({oldAccount:true}),before=JSON.stringify(state.rows);
 const fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>String(input).endsWith(':batchUpdate')?Response.json({error:{code:400}},{status:400}):state.fetcher(input,init));
 expect(await appendNativeTracker('token',file,plan(),fetcher)).toMatchObject({status:'uncertain',mutationStarted:true});
 expect(JSON.stringify(state.rows)).toBe(before);
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});
 expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith(':batchUpdate'))).toHaveLength(1);
});
it('a human cleared staff date after append is preserved and the identity receipt still completes',async()=>{
 const state=fake({metadata:true});state.rows[2][17]={};
 state.rows[2][27]=cell('human note');
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'written',identityMatched:true,mutationStarted:false});
 expect(state.posts).toHaveLength(0);
 expect(state.rows[2][17]).toEqual({});expect(state.rows[2][27]).toEqual(cell('human note'));
});
it('an existing exact row after an unknown prior attempt returns exists despite a blank date',async()=>{
 const state=fake({existing:true});expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'exists',identityMatched:true,mutationStarted:false});expect(state.posts).toHaveLength(0);
});
it('a marker removed together with its row never authorizes another unknown POST',async()=>{
 const state=fake({lost:true});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'written'});
 state.rows.splice(2); // Simulate the legacy whole-file replacement removing row and metadata.
 const fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>String(input).includes('/developerMetadata/')?Response.json({error:{}},{status:404}):state.fetcher(input,init));
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});expect(state.posts).toHaveLength(1);
});
it('metadata contains only the short key and enforces remaining character budget before insertion',async()=>{
 const state=fake();expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'written'});
 const m=(state.posts[0].requests as Record<string,any>[]).at(-1)!.createDeveloperMetadata.developerMetadata;expect(m.metadataValue).toBeUndefined();
 const full=fake({metadataCharacters:30000});expect(await appendNativeTracker('token',file,plan(),full.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(full.posts).toHaveLength(0);
});
it('formatted tails are ignored and occupied grids use pages of at most 200 rows',async()=>{
 const state=fake({rowCount:1000000});
 for(let n=2;n<405;n++){const v=rowValues();v[4]='INV-'+n;v[32]='old-'+n;state.rows[n]=v.map(cell);}
 // This prior unknown needs only bounded reconciliation, never a provider POST.
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'uncertain',mutationStarted:false});
 const ranges=state.fetcher.mock.calls.map(([url])=>new URL(String(url)).searchParams.get('ranges')).filter((v):v is string=>!!v&&/!A\d+:AG\d+$/.test(v));
 expect(ranges.length).toBe(3);expect(ranges.every(r=>{const m=/!A(\d+):AG(\d+)$/.exec(r)!;return !!m&&Number(m[2])-Number(m[1])<200;})).toBe(true);
});
it('a definitive HTTP429 mutation rejection is retry safe but a lost POST is never retried',async()=>{
 const state=fake(),fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>String(input).endsWith(':batchUpdate')?Response.json({error:{}},{status:429}):state.fetcher(input,init));
 expect(await appendNativeTracker('token',file,plan(),fetcher)).toMatchObject({status:'uncertain',mutationStarted:true,retrySafe:true,rejectedStatus:429});expect(state.posts).toHaveLength(0);
});
it('a duplicate metadata ID atomically rolls back the entire insert batch',async()=>{
 const state=fake({oldAccount:true,duplicateIdAtPost:true}),before=JSON.stringify(state.rows);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:true});
 expect(state.posts).toHaveLength(1);expect(JSON.stringify(state.rows)).toBe(before);
 expect(await appendNativeTracker('token',file,{...plan(),priorUncertain:true},state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(1);
});
it('a new key beyond the existing tracker reader extent is held before POST',async()=>{
 const state=fake({rowCount:1000000});expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);
});
it('provider qualification uses the exact pure production payload',async()=>{
 const state=fake({oldAccount:true});await appendNativeTracker('token',file,plan(),state.fetcher);
 expect(state.posts[0].requests).toEqual(buildNativeAppendRequests(plan(),100,2));
});
it('an exact identity below the last AG key with AG blank holds without another row',async()=>{
 const state=fake({oldAccount:true}),v=rowValues();v[32]=null;
 while(state.rows.length<12)state.rows.push([]);state.rows.push(v.map(cell));
 const before=JSON.stringify(state.rows);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);expect(JSON.stringify(state.rows)).toBe(before);
});
it('a normal subtotal with A blank and no AG does not block an exact new identity',async()=>{
 const state=fake({oldAccount:true}),subtotal:Array<unknown>=Array.from({length:33},()=>null);subtotal[1]='Subtotal';subtotal[7]=123;
 state.rows.push(subtotal.map(cell));
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'written'});expect(state.posts).toHaveLength(1);
});
it('identity movement between compact projections holds before any mutation',async()=>{
 const state=fake({oldAccount:true});let projections=0;
 const fetcher=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
  if(String(input).includes('/values:batchGet')&&++projections===2)state.rows[2][2]=cell('EDITED_ACCOUNT');
  return state.fetcher(input,init);
 });
 expect(await appendNativeTracker('token',file,plan(),fetcher)).toMatchObject({status:'uncertain',mutationStarted:false,retrySafe:true});expect(state.posts).toHaveLength(0);
});
it('a planned AG with missing account cannot be skipped as an absent invoice',async()=>{
 const state=fake({existing:true});state.rows[2][2]={};state.rows[2][17]=cell('2026-10-01');const before=JSON.stringify(state.rows);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);expect(JSON.stringify(state.rows)).toBe(before);
});
it('a matching invoice with another AG and unknown account holds its partial identity',async()=>{
 const state=fake({oldAccount:true});state.rows[2][2]={};const before=JSON.stringify(state.rows);
 expect(await appendNativeTracker('token',file,plan(),state.fetcher)).toMatchObject({status:'conflict',mutationStarted:false});expect(state.posts).toHaveLength(0);expect(JSON.stringify(state.rows)).toBe(before);
});
