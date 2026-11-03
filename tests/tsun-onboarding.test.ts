import {afterEach,expect,it,vi} from 'vitest';
import {strToU8,strFromU8,zipSync,unzipSync} from 'fflate';
import {hotelInRegion,type HotelId} from '../src/domain/hotels';
import {configuredOperaHotels,resultMatchesHotelScope} from '../worker/hotels';
import {trackerHotel,matchTrackerInvoice} from '../worker/tracker-sync/model';
import {parseTrackerWorkbook,trackerHeaders} from '../worker/tracker-sync/workbook';
import {readNativeTracker} from '../worker/tracker-sync/native';
import {buildSentAppendPlan,type SentAppendCandidate} from '../worker/tracker-sync/append';
import {fixture} from './fixtures/tracker-workbook';
import {financialFilters} from '../worker/financial/api';
import {requestRefresh,type RefreshParams} from '../worker/refresh/backend';
import {OperaReader} from '../worker/opera/client';
import {enqueueExactAbandon,readExitOutbox} from '../src/preparation/exit-outbox';
const hotel='TSUN' as HotelId;
afterEach(()=>vi.unstubAllGlobals());
it('admits only canonical TSUN operational configuration and rejects foreign regional identities',()=>{
 expect(configuredOperaHotels('KAT,TSK,TLKL,WAKL,TLFO,TSAN,TSUN')).toEqual(['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']);
 expect(configuredOperaHotels('TSUN,SUN')).toEqual([]);expect(configuredOperaHotels('TSUN,TSUN')).toEqual([]);
 expect(hotelInRegion(hotel,'khao-lak')).toBe(true);expect(hotelInRegion(hotel,'phuket')).toBe(false);
 expect(financialFilters(new URL('https://app.test/api/financial/payments?region=khao-lak&hotel=TSUN&account=same'))).toMatchObject({p_hotel:'TSUN',p_account:'same'});
 expect(()=>financialFilters(new URL('https://app.test/api/financial/payments?region=phuket&hotel=TSUN&account=same'))).toThrow();
 expect(resultMatchesHotelScope({rows:[{hotel:'TSUN',accountId:'same'}]},'phuket')).toBe(false);expect(resultMatchesHotelScope({rows:[{hotel:'TSUN',accountId:'same'}]},'khao-lak')).toBe(true);
});
it('normalizes SUN and TSUN Sheet labels without borrowing LFS or another hotel identity',()=>{
 for(const alias of ['SUN','TSUN',' sun ']){expect(trackerHotel(alias,'khao-lak')).toBe('TSUN');expect(trackerHotel(alias,'phuket')).toBeNull();}
 expect(trackerHotel('LFS','khao-lak')).toBeNull();
 const row={hotel,accountNo:'0001',invoiceNo:'001',folioNo:'2'},candidates=[{...row,hotel:'TSAN' as HotelId,accountId:'same',invoiceId:'same'},{...row,accountId:'same',invoiceId:'same'}];
 expect(matchTrackerInvoice(row,candidates)).toEqual(candidates[1]);expect(matchTrackerInvoice(row,candidates.slice(0,1))).toBeNull();
});
it.each(['SUN','TSUN'])('reads %s XLSX labels as TSUN while preserving leading-zero identity',alias=>{
 const parts=unzipSync(fixture({hotel:'SAN'}));parts['xl/worksheets/sheet1.xml']=strToU8(strFromU8(parts['xl/worksheets/sheet1.xml']).replace('<t>SAN</t>',`<t>${alias}</t>`));
 expect(parseTrackerWorkbook(zipSync(parts),'khao-lak').rows).toMatchObject([{hotel:'TSUN',accountNo:'00009',invoiceNo:'00017'}]);
});
function nativeGrid(properties:string[]){
 const col=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
 const cells=(values:Record<string,string>)=>{const row:Record<string,unknown>[]=Array.from({length:33},()=>({}));for(const [k,v] of Object.entries(values))row[col(k)]={userEnteredValue:{stringValue:v}};return {values:row};};
 return {spreadsheetId:'synthetic_tsun_sheet_123456789',sheets:[{properties:{sheetId:9,title:'ลูกหนี้ เขาหลัก'},data:[{rowData:[{values:[]},cells(trackerHeaders),...properties.map((property,index)=>cells({A:property,B:'Synthetic Agent',C:'0001',E:'001',F:'002',G:'2026-11-03',AG:'synthetic-key-'+index}))]}]}]};
}
function nativeFetch(properties:string[]){const grid=nativeGrid(properties);vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>Response.json(String(input).includes('/values/')?{range:"'ลูกหนี้ เขาหลัก'!AG1:AG"+(properties.length+2),majorDimension:'ROWS',values:[[],[trackerHeaders.AG],...properties.map((_,index)=>['synthetic-key-'+index])]}:grid));}
it.each(['SUN','TSUN'])('reads %s native Sheet labels under the exact original regional schema',async alias=>{
 nativeFetch([alias]);const result=await readNativeTracker('synthetic-token','synthetic_tsun_sheet_123456789');expect(result.rows).toMatchObject([{hotel:'TSUN',accountNo:'0001',invoiceNo:'001'}]);
});
it('rejects SUN and TSUN duplicate canonical native identities instead of counting twice',async()=>{
 nativeFetch(['SUN','TSUN']);await expect(readNativeTracker('synthetic-token','synthetic_tsun_sheet_123456789')).rejects.toThrow('tracker_native_identity_ambiguous');
});
it('keeps same invoice and account IDs independent across TSUN and TSAN native rows',async()=>{
 nativeFetch(['SUN','SAN']);const result=await readNativeTracker('synthetic-token','synthetic_tsun_sheet_123456789');expect(result.rows.map(r=>r.hotel)).toEqual(['TSUN','TSAN']);
});
it('first TSUN Sent append waits for an observed same-hotel account alias',()=>{
 const job:SentAppendCandidate={id:'synthetic',state:'pending',hotel,accountId:'same',invoiceId:'same',invoiceNo:'100',folio:'200',sourceHash:'a'.repeat(64),desiredDates:{R:'2026-11-03',U:null,V:null,W:null},sourceRow:{accountNo:'0001',accountName:'API name',guest:null,transactionDate:'2026-11-03',open:'107.00',aging:['107.00','0','0','0','0','0'],age:0,agingLabel:'0-30',agingStatus:'normal',businessDate:'2026-11-03',creditTerm:30,billingRequired:true}};
 const row={rowKey:'SAN|Synthetic Agent|I:99|1',hotel:'TSAN' as HotelId,accountNo:'0001',invoiceNo:'99',folio:'199',transactionDate:'2026-11-02',agent:'Synthetic Agent',property:'SAN',fields:{},locator:{}};
 const snapshot={version:'observed',rows:[row],schemaFingerprint:'schema',capabilities:{conditionalWrite:'unsupported' as const}};
 expect(()=>buildSentAppendPlan(job,snapshot)).toThrow('tracker_append_alias_missing');
 expect(()=>buildSentAppendPlan(job,{...snapshot,rows:[{...row,hotel,accountNo:'another',property:'TSUN'}]})).toThrow('tracker_append_alias_missing');
 const plan=buildSentAppendPlan(job,{...snapshot,rows:[row,{...row,hotel,property:'TSUN',rowKey:'TSUN|Synthetic Agent|I:99|1'}]});expect(plan.rowKey).toBe('TSUN|Synthetic Agent|I:100|1');expect(plan.values).toHaveLength(33);expect(plan.values[0]).toBe('TSUN');expect(plan.values[17]).toBe('2026-11-03');
 const fromSun=buildSentAppendPlan(job,{...snapshot,rows:[{...row,hotel,property:'SUN',rowKey:'SUN|Synthetic Agent|I:99|1'}]});expect(fromSun.values[0]).toBe('TSUN');expect(fromSun.rowKey).toBe(plan.rowKey);
});
it('refresh joins only a canonical TSUN run and refuses a same-account different-hotel result',async()=>{
 let resultHotel='TSUN',dispatched:RefreshParams|undefined;vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('ar_request_refresh')?{id:'synthetic-run',status:'queued',created:false}:{id:'synthetic-run',hotel:resultHotel,account_id:'same',status:'queued'}));
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',AR_REFRESH:{async create(o:{params:RefreshParams}){dispatched=o.params;},async get(){return {async status(){return {};}};}}};
 await requestRefresh(env,hotel,'same','manual');expect(dispatched).toMatchObject({hotel:'TSUN',accountId:'same'});resultHotel='TSAN';await expect(requestRefresh(env,hotel,'same','manual')).rejects.toThrow('invalid_response');
});
it('keeps TSUN OPERA financial reads bound to its configured hotel and account',async()=>{
 let request:Request|undefined;const reader=new OperaReader({origin:'https://gateway.example.com',appKey:'synthetic',hotelId:hotel},async()=>'synthetic',async value=>{request=value;return Response.json({});});
 await reader.financialHistoryPage({hotel,accountId:'same',start:'2026-11-01',end:'2026-11-03',kinds:['invoice']},0,20);expect(new URL(request!.url).searchParams.get('hotelIds')).toBe('TSUN');expect(()=>reader.financialHistoryPage({hotel:'TSAN',accountId:'same',start:'2026-11-01',end:'2026-11-03',kinds:['invoice']},0,20)).toThrow('invalid_request:financial_scope');
});
it('retains exact TSUN cleanup metadata when leaving an unstarted preparation',()=>{
 const map=new Map<string,string>(),storage:Storage={get length(){return map.size;},clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);}};
 enqueueExactAbandon(storage,{actorId:'00000000-0000-4000-8000-000000000001',authSessionId:'00000000-0000-4000-8000-000000000002',jobIds:[],creates:[{commandKey:'00000000-0000-4000-8000-000000000003',hotel:'TSUN',payloadDigest:'a'.repeat(64)}]});expect(readExitOutbox(storage)).toMatchObject([{hotel:'TSUN'}]);
});
