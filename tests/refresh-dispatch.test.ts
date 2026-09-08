import { afterEach,expect,it,vi } from 'vitest';
import { requestRefresh, type RefreshParams } from '../worker/refresh/backend';
afterEach(()=>vi.unstubAllGlobals());
it('dispatches the canonical database scope when an account request joins a full-hotel run',async()=>{
  let dispatched:RefreshParams|undefined;
  vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('ar_request_refresh')?{id:'synthetic-run',status:'queued',created:false}:{id:'synthetic-run',hotel:'KAT',account_id:null,status:'queued'}));
  await requestRefresh({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic-test-key',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',AR_REFRESH:{async create(o){dispatched=o.params;},async get(){return {async status(){return {};}};}}},'KAT','synthetic-account','manual');
  expect(dispatched).toEqual({runId:'synthetic-run',hotel:'KAT',accountId:undefined});
});
