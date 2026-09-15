import {afterEach,describe,expect,it,vi} from 'vitest';
import {accountWorkspaceApi} from '../worker/accounts/workspace';
import {externalBillingApi,parseExternalBilling} from '../worker/billing/api';
import {exceptionScope} from '../worker/collection/exceptions';
import {parseAgingInvoicesQuery} from '../worker/dashboard/aging-api';
import {parseDashboardBalancesQuery} from '../worker/dashboard/api';
import {dashboardHotelOverviewApi,parseDashboardHotelOverviewQuery} from '../worker/dashboard/hotel-api';
import {documentApi} from '../worker/documents/api';
import {financialApi,financialFilters} from '../worker/financial/api';
import {handleApi} from '../worker/index';
import {OperaReader} from '../worker/opera/client';
import {remittanceApi} from '../worker/remittance/api';
import {parseRemittanceFilters,parseRemittanceInput,parseRemittanceInvoiceQuery} from '../worker/remittance/validation';
import {parseReportQuery,reportsApi} from '../worker/reports/api';
import {observationFilters} from '../worker/reports/observations';
import {settingsApi} from '../worker/settings/api';

const actor='11111111-1111-4111-8111-111111111111';
const user={id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-01'};
const serviceEnv={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic-secret'};
const appEnv={...serviceEnv,SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
const authRequest=(path:string,init:RequestInit={})=>new Request('https://app.test'+path,{...init,headers:{Authorization:'Bearer synthetic',...Object.fromEntries(new Headers(init.headers))}});

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('regional read query contracts',()=>{
 it('preserves the legacy Phuket overview contract and marks only explicit regional calls',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T03:00:00Z'));
  const base='https://app.test/api/dashboard/hotel-overview?from=2026-09-01&to=2026-09-15';
  expect(parseDashboardHotelOverviewQuery(new URL(base))).toEqual({p_from:'2026-09-01',p_to:'2026-09-15',p_type:null});
  expect(parseDashboardHotelOverviewQuery(new URL(base+'&region=khao-lak'))).toEqual({p_from:'2026-09-01',p_to:'2026-09-15',p_type:null,p_region:'khao-lak'});
  expect(()=>parseDashboardHotelOverviewQuery(new URL(base+'&region=krabi'))).toThrow('dashboard_invalid');
 });

 it('maps Khao Lak aggregate reads to the reserved SQL scope and keeps account reads exact',()=>{
  expect(financialFilters(new URL('https://app.test/api/financial/invoice_entries?region=khao-lak'))).toMatchObject({p_hotel:'KhaoLak',p_account:null});
  expect(parseDashboardBalancesQuery(new URL('https://app.test/api/dashboard/balances?region=khao-lak&asOf=2026-09-15'))).toMatchObject({p_hotel:'KhaoLak'});
  expect(parseReportQuery(new URL('https://app.test/api/reports/options?region=khao-lak'))).toMatchObject({p_hotel:'KhaoLak'});
  expect(observationFilters(new URL('https://app.test/api/observations/options?region=khao-lak'))).toMatchObject({p_hotel:'KhaoLak'});
  expect(parseRemittanceFilters(new URLSearchParams('region=khao-lak&view=pending'))).toMatchObject({hotel:'KhaoLak',accountId:null});
  expect(financialFilters(new URL('https://app.test/api/financial/invoice_entries?region=khao-lak&hotel=WAKL&account=A'))).toMatchObject({p_hotel:'WAKL',p_account:'A'});
  expect(parseRemittanceInvoiceQuery(new URLSearchParams('region=khao-lak&hotel=TSAN&accountId=A'))).toMatchObject({hotel:'TSAN',accountId:'A'});
 });

 it('infers a region from an exact Khao Lak hotel and rejects mismatched or invalid regions',()=>{
  expect(parseReportQuery(new URL('https://app.test/api/reports/current?hotel=TLFO'))).toMatchObject({p_hotel:'TLFO'});
  for(const url of [
   'https://app.test/api/reports/current?region=khao-lak&hotel=KAT',
   'https://app.test/api/financial/invoice_entries?region=phuket&hotel=TLKL',
   'https://app.test/api/dashboard/balances?region=unknown&asOf=2026-09-15',
  ])expect(()=>url.includes('/reports/')?parseReportQuery(new URL(url)):url.includes('/financial/')?financialFilters(new URL(url)):parseDashboardBalancesQuery(new URL(url))).toThrow();
 });

 it('accepts four-property aging account pairs and rejects a leaked Phuket pair',()=>{
  const accounts=encodeURIComponent(JSON.stringify([['TLKL','A'],['WAKL','B'],['TLFO','C'],['TSAN','D']]));
  expect(parseAgingInvoicesQuery(new URL(`https://app.test/api/dashboard/aging-invoices?region=khao-lak&accounts=${accounts}`))).toMatchObject({p_hotel:'KhaoLak',p_accounts:[['TLKL','A'],['WAKL','B'],['TLFO','C'],['TSAN','D']]});
  const leaked=encodeURIComponent(JSON.stringify([['KAT','A']]));
  expect(()=>parseAgingInvoicesQuery(new URL(`https://app.test/api/dashboard/aging-invoices?region=khao-lak&accounts=${leaked}`))).toThrow('aging_invalid');
 });
});

describe('six-property operational identities',()=>{
 it('accepts Khao Lak writes while preserving one exact hotel and account',()=>{
  const commandId='00000000-0000-4000-8000-000000000001';
  expect(parseExternalBilling({commandId,action:'record',hotel:'TLFO',accountId:'A',actualDate:'2026-09-15',channel:'system',reference:'Synthetic',note:'',amount:null,lines:[{invoiceId:'I',revision:0}]}).hotel).toBe('TLFO');
  expect(exceptionScope('TSAN','A','I')).toEqual({hotel:'TSAN',accountId:'A',invoiceId:'I'});
  expect(parseRemittanceInput({commandId,revision:0,confirmed:true,hotel:'WAKL',accountId:'A',receivedDate:'2026-09-15',reference:'Synthetic',sourceNote:'',notes:'',reportedAmount:null,lines:[{invoiceId:'I',reportedAmount:null}],changeReason:''},new Date('2026-09-15T12:00:00Z')).hotel).toBe('WAKL');
 });

 it('keeps OPERA financial reads on the configured Khao Lak property',async()=>{
  let request:Request|undefined;
  const reader=new OperaReader({origin:'https://gateway.example.com',appKey:'synthetic',hotelId:'TLKL'},async()=>'synthetic',async value=>{request=value;return Response.json({});});
  await reader.financialHistoryPage({hotel:'TLKL',accountId:'A',start:'2026-09-01',end:'2026-09-15',kinds:['invoice']},0,20);
  expect(new URL(request!.url).searchParams.get('hotelIds')).toBe('TLKL');
  expect(()=>reader.financialHistoryPage({hotel:'KAT',accountId:'A',start:'2026-09-01',end:'2026-09-15',kinds:['invoice']},0,20)).toThrow('invalid_request:financial_scope');
 });

 it('reads Khao Lak account history through an exact path scope',async()=>{
  const calls:RequestInit[]=[];const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{calls.push(init);return Response.json({rows:[],total:0});});vi.stubGlobal('fetch',fetcher);
  const response=await accountWorkspaceApi(new Request('https://app.test/api/account-workspace/WAKL/A/history'),serviceEnv,actor);
  expect(response.status).toBe(200);
  expect(JSON.parse(String(calls[0].body))).toMatchObject({p_hotel:'WAKL',p_account:'A'});
 });

 it('uses exact Khao Lak settings and document scopes',async()=>{
  const calls:{path:string;body:Record<string,unknown>}[]=[];
  vi.stubGlobal('fetch',async(target:string,init:RequestInit)=>{calls.push({path:new URL(target).pathname,body:JSON.parse(String(init.body))});return Response.json(new URL(target).pathname.endsWith('ar_settings_get')?{hotel:'TLKL',accountId:'A'}:{id:'00000000-0000-4000-8000-000000000009',files:[]});});
  expect((await settingsApi(new Request('https://app.test/api/account-settings/TLKL/A'),serviceEnv,actor)).status).toBe(200);
  const create={commandKey:'00000000-0000-4000-8000-000000000008',hotel:'TSAN',accountId:'A',ids:['I'],content:'invoices',layout:'separate',purpose:'billing'};
  expect((await documentApi(new Request('https://app.test/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(create)}),serviceEnv,actor,{})).status).toBe(202);
  expect(calls.map(call=>call.body)).toEqual([{p_hotel:'TLKL',p_account_id:'A'},{p_owner:actor,p_command_key:create.commandKey,p_hotel:'TSAN',p_account_id:'A',p_ids:['I'],p_content:'invoices',p_layout:'separate',p_purpose:'billing',p_statement_source:'native'}]);
 });
});

describe('regional API adapters and response fences',()=>{
 const emptyScope=()=>({balances:null,activity:null,external:null,entries:null,payments:null,paid:null});
 const overview=(hotels:string[])=>({region:'khao-lak',from:'2026-09-01',to:'2026-09-15',total:emptyScope(),hotels:hotels.map(hotel=>({hotel,...emptyScope()}))});

 it('uses the regional overview RPC and enforces exact ordered result hotels',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T03:00:00Z'));
  const calls:{url:string;body:unknown}[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,body:JSON.parse(String(init.body))});return Response.json(overview(['TLKL','WAKL','TLFO','TSAN']));});
  const request=new Request('https://app.test/api/dashboard/hotel-overview?region=khao-lak&from=2026-09-01&to=2026-09-15');
  const response=await dashboardHotelOverviewApi(request,serviceEnv,actor);
  expect(response.status).toBe(200);
  expect(calls).toEqual([{url:'https://synthetic.supabase.co/rest/v1/rpc/ar_dashboard_region_overview',body:{p_actor:actor,p_from:'2026-09-01',p_to:'2026-09-15',p_type:null,p_region:'khao-lak'}}]);
  vi.stubGlobal('fetch',async()=>Response.json(overview(['TLKL','KAT','TLFO','TSAN'])));
  expect((await dashboardHotelOverviewApi(request,serviceEnv,actor)).status).toBe(503);
 });

 it('uses a distinct regional Portfolio RPC and rejects cross-region account or refresh rows',async()=>{
  const payload={region:'khao-lak',accounts:[{hotel:'TLKL',id:'A',name:'Synthetic',type:'Agent',open:10,items:1}],source:'opera',status:'connected',refresh:{hotels:[{hotel:'TLKL',status:'succeeded',last_success_at:'2026-09-15'}],running:false}};
  const calls:{path:string;body:unknown}[]=[];
  vi.stubGlobal('fetch',async(target:string,init:RequestInit={})=>{const path=new URL(target).pathname;if(path==='/auth/v1/user')return Response.json(user);calls.push({path,body:JSON.parse(String(init.body))});return Response.json(payload);});
  const response=await handleApi(authRequest('/api/portfolio?region=khao-lak'),appEnv);
  expect(response.status).toBe(200);
  expect(calls).toEqual([{path:'/rest/v1/rpc/ar_portfolio_region_accounts',body:{p_actor:actor,p_region:'khao-lak'}}]);
  vi.stubGlobal('fetch',async(target:string)=>new URL(target).pathname==='/auth/v1/user'?Response.json(user):Response.json({...payload,accounts:[{...payload.accounts[0],hotel:'KAT'}]}));
  expect((await handleApi(authRequest('/api/portfolio?region=khao-lak'),appEnv)).status).toBe(503);
 });

 it('dispatches All refresh within the selected region only',async()=>{
  const requested:string[]=[],dispatched:string[]=[];
  vi.stubGlobal('fetch',async(target:string,init:RequestInit={})=>{const path=new URL(target).pathname;if(path==='/auth/v1/user')return Response.json(user);const body=JSON.parse(String(init.body));if(path.endsWith('/ar_request_refresh')){requested.push(body.p_hotel);return Response.json({id:`run-${body.p_hotel}`,status:'queued',created:true});}if(path.endsWith('/ar_refresh_job')){const hotel=String(body.p_run_id).slice(4);return Response.json({hotel,account_id:null,reason:'manual'});}throw Error('unexpected');});
  const env={...appEnv,OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',AR_REFRESH:{async create(value:{params:{hotel:string}}){dispatched.push(value.params.hotel);},async get(){return {async status(){return {status:'running'};}};}}};
  const response=await handleApi(authRequest('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({region:'khao-lak',hotel:'All',reason:'manual'})}),env);
  expect(response.status).toBe(200);expect(requested).toEqual(['TLKL','WAKL','TLFO','TSAN']);expect(dispatched).toEqual(requested);
 });

 it('uses regional refresh status and rejects a status row from another region',async()=>{
  const calls:{path:string;body:unknown}[]=[];
  vi.stubGlobal('fetch',async(target:string,init:RequestInit={})=>{const path=new URL(target).pathname;if(path==='/auth/v1/user')return Response.json(user);calls.push({path,body:JSON.parse(String(init.body))});return Response.json({running:false,hotels:[{hotel:'TSAN',status:'succeeded'}]});});
  expect((await handleApi(authRequest('/api/refresh?region=khao-lak'),appEnv)).status).toBe(200);
  expect(calls).toEqual([{path:'/rest/v1/rpc/ar_refresh_region_status',body:{p_region:'khao-lak'}}]);
  vi.stubGlobal('fetch',async(target:string)=>new URL(target).pathname==='/auth/v1/user'?Response.json(user):Response.json({running:false,hotels:[{hotel:'KAT',status:'succeeded'}]}));
  expect((await handleApi(authRequest('/api/refresh?region=khao-lak'),appEnv)).status).toBe(503);
 });

 it.each([{region:'phuket',hotel:'KAT'},{region:'khao-lak',hotel:'TLKL'}] as const)('uses the regional financial status RPC for $region',async({region,hotel})=>{
  const calls:{path:string;body:unknown}[]=[];vi.stubGlobal('fetch',async(target:string,init:RequestInit)=>{calls.push({path:new URL(target).pathname,body:JSON.parse(String(init.body))});return Response.json({running:false,runs:[{id:`synthetic-${hotel}`,hotel,status:'succeeded'}]});});
  const response=await financialApi(new Request(`https://app.test/api/financial/status?region=${region}`),serviceEnv,actor);
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({running:false});
  expect(calls).toEqual([{path:'/rest/v1/rpc/ar_financial_region_status',body:{p_actor:actor,p_region:region}}]);
 });

 it('keeps no-region financial status on the legacy Phuket RPC',async()=>{
  const calls:{path:string;body:unknown}[]=[];vi.stubGlobal('fetch',async(target:string,init:RequestInit)=>{calls.push({path:new URL(target).pathname,body:JSON.parse(String(init.body))});return Response.json({running:false,runs:[{id:'synthetic-kat',hotel:'KAT',status:'succeeded'}]});});
  expect((await financialApi(new Request('https://app.test/api/financial/status'),serviceEnv,actor)).status).toBe(200);
  expect(calls).toEqual([{path:'/rest/v1/rpc/ar_financial_status',body:{p_actor:actor}}]);
 });

 it('rejects invalid financial regions before access and wrong-region status results after access',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect((await financialApi(new Request('https://app.test/api/financial/status?region=krabi'),serviceEnv,actor)).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
  vi.stubGlobal('fetch',async()=>Response.json({running:false,runs:[{id:'synthetic-kat',hotel:'KAT',status:'succeeded'}]}));
  expect((await financialApi(new Request('https://app.test/api/financial/status?region=khao-lak'),serviceEnv,actor)).status).toBe(503);
 });

 it('filters Collections to the selected region before returning rows',async()=>{
  const rows=[{hotel:'KAT',account_id:'P',id:'1'},{hotel:'TSAN',account_id:'K',id:'2'}];
  vi.stubGlobal('fetch',async(target:string)=>{const path=new URL(target).pathname;if(path==='/auth/v1/user')return Response.json(user);if(path==='/rest/v1/ar_collection_rows')return Response.json(rows);if(path==='/rest/v1/ar_invoice_exceptions')return Response.json([]);throw Error('unexpected');});
  const response=await handleApi(authRequest('/api/collection-queue?region=khao-lak'),appEnv);
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({rows:[{hotel:'TSAN',account_id:'K',id:'2'}]});
 });

 it('rejects report result rows outside the requested region',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({rows:[{hotel:'KAT'}],total:1,summary:{}}));
  const response=await reportsApi(new Request('https://app.test/api/reports/current?region=khao-lak'),serviceEnv,actor);
  expect(response.status).toBe(503);
 });

 it('maps regional external billing reads and rejects cross-region rows',async()=>{
  const calls:unknown[]=[];vi.stubGlobal('fetch',async(_target:string,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return Response.json({rows:[{hotel:'TLKL'}],total:1});});
  const request=new Request('https://app.test/api/external-billing?region=khao-lak');
  expect((await externalBillingApi(request,serviceEnv,actor)).status).toBe(200);
  expect(calls).toEqual([{p_actor:actor,p_hotel:'KhaoLak',p_account:null,p_from:null,p_to:null,p_offset:0,p_limit:50,p_type:null}]);
  vi.stubGlobal('fetch',async()=>Response.json({rows:[{hotel:'KAT'}],total:1}));
  expect((await externalBillingApi(request,serviceEnv,actor)).status).toBe(503);
 });

 it('uses regional remittance options and rejects option accounts from another region',async()=>{
  const payload={region:'khao-lak',accounts:[{hotel:'TLKL',accountId:'A',name:'Synthetic',type:'Agent',accountNo:null,verified:true}],accountTypes:['Agent']};
  const calls:{path:string;body:unknown}[]=[];vi.stubGlobal('fetch',async(target:string,init:RequestInit)=>{calls.push({path:new URL(target).pathname,body:JSON.parse(String(init.body))});return Response.json(payload);});
  const request=new Request('https://app.test/api/remittances/options?region=khao-lak');
  expect((await remittanceApi(request,serviceEnv,actor)).status).toBe(200);
  expect(calls).toEqual([{path:'/rest/v1/rpc/ar_remittance_region_options',body:{p_actor:actor,p_region:'khao-lak'}}]);
  vi.stubGlobal('fetch',async()=>Response.json({...payload,accounts:[{...payload.accounts[0],hotel:'KAT'}]}));
  expect((await remittanceApi(request,serviceEnv,actor)).status).toBe(503);
 });
});
