import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=> 'synthetic-provider-token',gmailConfigured:()=>true,gmailCallback:vi.fn()}));
import {recoveryMarker,recoverySentPage,recoveryWindow} from '../worker/operations/recovery';
import {assertWritesEnabled,writesHeld} from '../worker/operations/write-hold';
import {handleApi} from '../worker/index';
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
const sent=(headers:{name:string;value:string}[])=>({id:'syntheticMessage1',internalDate:String(Date.parse('2026-09-10T10:00:00Z')),labelIds:['SENT'],payload:{headers}});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('matches explicit markers even when Gmail changes Message-ID',()=>{expect(recoveryMarker(sent([{name:'X-AR-Delivery-ID',value:actor},{name:'Message-ID',value:'<provider-rewritten@google.test>'}]))).toMatchObject({deliveryId:actor,conflict:false});expect(recoveryMarker(sent([{name:'Message-ID',value:`<${actor}@ar-workspace.ar-c82.workers.dev>`}]))).toMatchObject({deliveryId:actor,conflict:false});});
it('conflicting or duplicate AR markers never select an arbitrary receipt',()=>{for(const headers of [[{name:'X-AR-Delivery-ID',value:actor},{name:'X-AR-Delivery-ID',value:actor}],[{name:'X-AR-Delivery-ID',value:actor},{name:'Message-ID',value:`<${other}@ar-workspace.ar-c82.workers.dev>`}]])expect(recoveryMarker(sent(headers))).toMatchObject({deliveryId:null,conflict:true});});
it('unmarked mail is outside the AR match scope and a missing SENT label is not proof',()=>{expect(recoveryMarker(sent([{name:'Message-ID',value:'ordinary@synthetic.test'}]))).toBeNull();expect(()=>recoveryMarker({...sent([]),labelIds:['DRAFT']})).toThrow('recovery_unavailable');});
it('bounds recovery dates, opaque pages and future windows',()=>{const now=Date.parse('2026-09-11T00:00:00Z');expect(recoveryWindow(new URL('https://app.test?from=2026-09-09T00:00:00.000Z&to=2026-09-10T00:00:00.000Z&pageToken=synthetic'),now).page).toBe('synthetic');for(const q of ['from=bad&to=bad','from=2026-01-01T00:00:00Z&to=2026-09-10T00:00:00Z','from=2026-09-10T00:00:00Z&to=2027-09-10T00:00:00Z','from=2026-09-09T00:00:00Z&to=2026-09-10T00:00:00Z&pageToken=%0a'])expect(()=>recoveryWindow(new URL('https://app.test?'+q),now)).toThrow('operations_invalid');});
it('reads metadata only, preserves pagination, and reports a missing DB receipt without creating one',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-11T12:00:00Z'));
 const calls:{url:URL;method:string;body:unknown}[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const url=new URL(String(input));calls.push({url,method:init.method??'GET',body:init.body?JSON.parse(String(init.body)):null});expect(init.redirect).toBe('manual');
  if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'ar@katathani.com'});
  if(url.pathname.endsWith('/messages'))return Response.json({messages:[{id:'syntheticMessage1'}],nextPageToken:'next-synthetic'});
  if(url.pathname.endsWith('/syntheticMessage1')){expect(url.searchParams.get('format')).toBe('metadata');expect(url.searchParams.getAll('metadataHeaders')).toEqual(['X-AR-Delivery-ID','Message-ID']);return Response.json(sent([{name:'X-AR-Delivery-ID',value:actor}]));}
  if(url.pathname.endsWith('/ar_recovery_sent_match'))return Response.json([{deliveryId:actor,gmailId:'syntheticMessage1',state:'missing_receipt',sentAt:'2026-09-10T10:00:00.000Z'}]);
  throw Error('Unexpected call');
 });
 const result=await recoverySentPage(env,actor,new URL('https://app.test?from=2026-09-09T00:00:00.000Z&to=2026-09-11T00:00:00.000Z'));
 expect(result).toMatchObject({scanned:1,complete:false,nextPageToken:'next-synthetic',writesPerformed:0});expect(result.rows[0]).toMatchObject({state:'missing_receipt'});expect(calls.filter(c=>c.url.hostname==='gmail.googleapis.com').every(c=>c.method==='GET')).toBe(true);expect(calls.filter(c=>c.method==='POST').map(c=>c.url.pathname)).toEqual(['/rest/v1/rpc/ar_recovery_sent_match']);
});
it('write hold is fail-closed for malformed configuration and lives outside DB state',()=>{expect(writesHeld({})).toBe(false);expect(writesHeld({OPERATIONS_WRITE_HOLD:'false'})).toBe(false);for(const value of ['true','TRUE','unknown',''])expect(()=>assertWritesEnabled({OPERATIONS_WRITE_HOLD:value})).toThrow('operations_write_hold');});
it('write hold denies authenticated new work before any provider or command RPC',async()=>{const f=vi.fn(async(_input:RequestInfo|URL)=>Response.json({id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-01T00:00:00Z'}));vi.stubGlobal('fetch',f);for(const path of ['/api/documents','/api/email/test-send','/api/refresh','/api/drive/test']){const result=await handleApi(new Request('https://app.test'+path,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:'{}'}),{...env,OPERATIONS_WRITE_HOLD:'true'});expect(result.status).toBe(503);expect(await result.json()).toMatchObject({error:'operations_write_hold'});}expect(f.mock.calls.every(c=>String(c[0]).endsWith('/auth/v1/user'))).toBe(true);});
it('operations endpoints remain private even during a write hold',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);for(const path of ['/api/operations/queue','/api/operations/recovery-sent'])expect((await handleApi(new Request('https://app.test'+path),{...env,OPERATIONS_WRITE_HOLD:'true'})).status).toBe(401);expect(f).not.toHaveBeenCalled();});
it('write hold still allows exact existing SENT verification without dispatching a new message',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=new URL(String(input));calls.push(u.pathname);if(u.pathname==='/auth/v1/user')return Response.json({id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-01T00:00:00Z'});return Response.json(null);});
 const result=await handleApi(new Request(`https://app.test/api/email/deliveries/${actor}/check`,{method:'POST',headers:{Authorization:'Bearer synthetic'}}),{...env,OPERATIONS_WRITE_HOLD:'true'});
 expect(await result.json()).not.toMatchObject({error:'operations_write_hold'});expect(calls.some(path=>path.startsWith('/rest/v1/rpc/'))).toBe(true);expect(calls.some(path=>path.includes('/messages/send'))).toBe(false);
});
it('also matches a saved provider ID when Gmail metadata has no AR header',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-11T12:00:00Z'));
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const u=new URL(String(input));
  if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'ar@katathani.com'});
  if(u.pathname.endsWith('/messages'))return Response.json({messages:[{id:'syntheticMessage1'}]});
  if(u.pathname.endsWith('/syntheticMessage1'))return Response.json(sent([{name:'Message-ID',value:'<provider-rewritten@google.test>'}]));
  const args=JSON.parse(String(init.body));expect(args.p_rows).toMatchObject([{deliveryId:null,gmailId:'syntheticMessage1'}]);
  return Response.json([{deliveryId:actor,gmailId:'syntheticMessage1',sentAt:'2026-09-10T10:00:00Z',state:'recorded',matchedBy:'saved_provider_id'}]);
 });
 const result=await recoverySentPage(env,actor,new URL('https://app.test?from=2026-09-09T00:00:00Z&to=2026-09-11T00:00:00Z'));expect(result.rows[0]).toMatchObject({state:'recorded',matchedBy:'saved_provider_id'});expect(result.complete).toBe(true);
});
