import {afterEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import Dashboard from '../src/dashboard/Dashboard';
import {ManagementDashboard} from '../src/dashboard/ManagementDashboard';
import ExternalBillingReports from '../src/reports/ExternalBillingReports';
import {syntheticManagement} from './fixtures/management-dashboard';
import {handleApi} from '../worker/index';
import {warmPeriodSummaries} from '../worker/dashboard/precompute';
import {postPublicationMaintenance} from '../worker/refresh/post-publication';
import type {WorkflowStep} from 'cloudflare:workers';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const actor='00000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',FINANCIAL_HISTORY_ENABLED:'true',FINANCIAL_HISTORY_DATE_FILTER_PROOF:'verified:legacy'};
it.each(['sent','invoice_entries','payments','payment_invoices'])('legacy %s Dashboard links show current balances without historical controls or details',kind=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T04:00:00Z'));
 const html=renderToStaticMarkup(<Dashboard cacheGrant="synthetic" token="synthetic" hotel="All" accounts={[]} params={new URLSearchParams('dashboard=1&dashboardFrom=2020-01-01&dashboardTo=2020-01-31&dashboardDetail='+kind)} update={()=>{}} refresh={null} onOpenInvoice={()=>{}}/>);
 expect(html).toContain('Receivables &amp; billing');expect(html).toContain('2026-10-25');
 expect(html).not.toContain('2020-01-31');expect(html).not.toContain('type="date"');
 expect(html).not.toContain('Period filters');expect(html).not.toContain('Dashboard invoice details');expect(html).not.toContain('period activity');
});
it('keeps current management cards and aged account details while dropping the new-invoice cohort report',()=>{
 const scope={hotel:'All',day:'2026-10-25',from:'2026-10-25',to:'2026-10-25',type:'',account:''};
 const html=renderToStaticMarkup(<ManagementDashboard source={{state:'ready',data:syntheticManagement('phuket',scope.from,scope.to)}} scope={scope} onDetail={()=>{}} onReload={()=>{}}/>);
 for(const text of ['Billing progress','Unbilled invoices 10+ days old','Hotel aging summary','Accounts with invoices 61+ days old'])expect(html).toContain(text);
 expect(html).not.toContain('New invoices · period activity');expect(html).not.toContain('Period invoice billing summary');
});
it('legacy external report tab cannot reopen external billing history while Sheets remains accessible',()=>{
 const html=renderToStaticMarkup(<ExternalBillingReports administrator region="phuket" token="synthetic" hotel="All" accounts={[]} params={new URLSearchParams('reports=1&reportsTab=external&externalBilling=1')} update={()=>{}} onDirtyChange={()=>{}} onOpen={()=>{}} dataVersion={0}/>);
 expect(html).toContain('Google Sheets');expect(html).toContain('Invoice Register');expect(html).not.toContain('External billing activity');expect(html).not.toContain('Billing account');
});
it('scheduled publication keeps file retention and never schedules historical imports or reports despite a legacy true flag',async()=>{
 const steps:string[]=[];const step={do:async(name:string)=>{steps.push(name);return {};}} as unknown as WorkflowStep;
 await postPublicationMaintenance({...env,RETENTION_ENABLED:'true'},{runId:actor,hotel:'KAT',refreshReason:'scheduled'},step);
 expect(steps).toEqual(['completed-file-retention']);
});
it('retired summary maintenance performs no historic report reads or cache writes',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect(await warmPeriodSummaries(env)).toEqual({planned:0,completed:0,failed:0});expect(fetcher).not.toHaveBeenCalled();
});
it('scheduled publication still executes exact completed-file retention without accessing OPERA or historical ingestion',async()=>{
 const calls:string[]=[],outputs:unknown[]=[];
 vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);if(url.endsWith('/ar_financial_service_actor'))return Response.json(actor);if(url.endsWith('/ar_retention_candidates'))return Response.json({total:0,rows:[]});throw Error('Unexpected source access');});
 const step={do:async(_name:string,...args:unknown[])=>{const value=await(args.at(-1) as ()=>Promise<unknown>)();outputs.push(value);return value;}} as unknown as WorkflowStep;
 await postPublicationMaintenance({...env,RETENTION_ENABLED:'true'},{runId:actor,hotel:'KAT',refreshReason:'scheduled'},step);
 expect(calls).toEqual(['https://synthetic.supabase.co/rest/v1/rpc/ar_financial_service_actor','https://synthetic.supabase.co/rest/v1/rpc/ar_retention_candidates']);
 expect(outputs).toEqual([{enabled:true,checked:0,deleted:0,blocked:0,uncertain:0,errors:0}]);
});
it('the authenticated current management route still reads current balances and billing evidence',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T04:00:00Z'));
 const source={...syntheticManagement('phuket','2026-10-25','2026-10-25'),mode:'current'},calls:Array<{url:string;body:unknown}>=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,body:init.body?JSON.parse(String(init.body)):null});return Response.json(url.includes('/auth/v1/user')?{id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-09'}:source);});
 const response=await handleApi(new Request('https://app.test/api/dashboard/management?from=2026-10-25&to=2026-10-25',{headers:{Authorization:'Bearer synthetic'}}),env);
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({mode:'current',metrics:source.metrics,hotels:source.hotels});
 expect(calls[1]).toEqual({url:'https://synthetic.supabase.co/rest/v1/rpc/ar_dashboard_management',body:{p_actor:actor,p_from:'2026-10-25',p_to:'2026-10-25',p_hotel:null,p_account:null,p_type:null}});
});
it.each(['/api/financial/refresh','/api/financial/payments','/api/observations/invoices','/api/reports/activity','/api/external-billing','/api/dashboard/invoice-entries','/api/dashboard/payment-invoices','/api/dashboard/management?from=2020-01-01&to=2020-01-31','/api/dashboard/balances?asOf=2020-01-31','/api/dashboard/hotel-overview?from=2020-01-01&to=2020-01-31&segment=balances'])('authenticated legacy report %s is retired before service reads',async path=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-09'});});
 const response=await handleApi(new Request('https://app.test'+path,{method:path.endsWith('/refresh')?'POST':'GET',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},...(path.endsWith('/refresh')?{body:JSON.stringify({commandId:actor,hotel:'KAT',reason:'manual'})}:{})}),env);
 expect(response.status).toBe(410);expect(await response.json()).toMatchObject({error:'report_retired'});expect(calls).toEqual(['https://synthetic.supabase.co/auth/v1/user']);
});
