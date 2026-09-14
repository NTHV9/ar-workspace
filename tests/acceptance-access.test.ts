import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {assertAcceptanceRecipient} from '../worker/acceptance/recipient';
const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',SUPABASE_SECRET_KEY:'synthetic-private',OPERATIONS_BUDGET_ENABLED:'true',ACCEPTANCE_ENABLED:'true'};
const user={id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-01T00:00:00Z'};
afterEach(()=>vi.unstubAllGlobals());
it('requires the normal approved login even for entering a synthetic workspace',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);for(const path of ['/api/acceptance/enter','/api/acceptance/prepare'])expect((await handleApi(new Request('https://app.test'+path,{method:'POST'}),env)).status).toBe(401);expect(f).not.toHaveBeenCalled();});
it('an inactive scope never falls back to real business tables',async()=>{const calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const path=new URL(String(input)).pathname;calls.push(path);return Response.json(path==='/auth/v1/user'?user:{error:'acceptance_inactive'});});const r=await handleApi(new Request('https://app.test/api/portfolio',{headers:{Authorization:'Bearer synthetic',Cookie:'__Host-ar-acceptance='+id}}),env);expect(r.status).toBe(409);expect(calls).toEqual(['/auth/v1/user','/rest/v1/rpc/ar_acceptance_context']);});
it('scope table reads use the owner-bound gateway rather than a real REST table',async()=>{const names:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const path=new URL(String(input)).pathname;names.push(path);if(path==='/auth/v1/user')return Response.json(user);const args=JSON.parse(String(init.body));if(path.endsWith('ar_acceptance_context'))return Response.json({id,owner:actor,sourceSha:'synthetic',recipientHash:'a'.repeat(64),clockOffsetDays:0});if(path.endsWith('ar_acceptance_read')){expect(args.p_actor).toBe(actor);expect(args.p_id).toBe(id);return Response.json([]);}if(path.endsWith('ar_acceptance_rpc')){expect(args.p_id).toBe(id);expect(args.p_name).toBe('ar_portfolio_accounts');expect(args.p_args).toEqual({p_actor:actor});return Response.json({accounts:[],source:'opera',status:'not_connected',refresh:{hotels:[],running:false}});}throw Error('Unexpected REST table');});const r=await handleApi(new Request('https://app.test/api/portfolio',{headers:{Authorization:'Bearer synthetic',Cookie:'__Host-ar-acceptance='+id}}),env);expect(r.status).toBe(200);expect(names.some(p=>p==='/rest/v1/ar_accounts')).toBe(false);});
it('the test recipient guard allows only the registered single address and rejects CC/BCC',async()=>{const recipients={to:['allowed@example.invalid'],cc:[],bcc:[]};const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(recipients))))].map(n=>n.toString(16).padStart(2,'0')).join('');const scoped={ACCEPTANCE:{id,owner:actor,sourceSha:'synthetic',recipientHash:hash,clockOffsetDays:0}};await assertAcceptanceRecipient(scoped,recipients);await expect(assertAcceptanceRecipient(scoped,{...recipients,to:['not-allowed@example.invalid']})).rejects.toThrow('acceptance_recipient_not_authorized');await expect(assertAcceptanceRecipient(scoped,{...recipients,cc:['extra@example.invalid']})).rejects.toThrow('acceptance_recipient_not_authorized');await expect(assertAcceptanceRecipient(scoped,{...recipients,bcc:['extra@example.invalid']})).rejects.toThrow('acceptance_recipient_not_authorized');});
it('acceptance cleanup also visits transient preparations through the same isolated gateway',async()=>{
 const visited:string[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
  const path=new URL(String(input)).pathname;if(path==='/auth/v1/user')return Response.json(user);
  const args=JSON.parse(String(init.body));
  if(path.endsWith('ar_acceptance_context'))return Response.json({id,owner:actor,sourceSha:'synthetic',recipientHash:'a'.repeat(64),clockOffsetDays:0});
  if(path.endsWith('ar_financial_service_actor'))return Response.json(actor);
  if(!path.endsWith('ar_acceptance_rpc')||args.p_actor!==actor||args.p_id!==id)throw Error('Unexpected unscoped cleanup');
  visited.push(args.p_name);
  if(args.p_name==='ar_document_pending_uploads'||args.p_name==='ar_document_cleanup_candidates')return Response.json([]);
  if(args.p_name==='ar_retention_candidates')return Response.json({total:0,rows:[]});
  throw Error('Unexpected cleanup call');
 });
 const response=await handleApi(new Request('https://app.test/api/acceptance/retention',{method:'POST',headers:{Authorization:'Bearer synthetic',Cookie:'__Host-ar-acceptance='+id,'Content-Type':'application/json'},body:'{}'}),env);
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual({enabled:true,checked:0,deleted:0,blocked:0,uncertain:0,errors:0,transient:{enabled:true,checked:0,deleted:0,errors:0}});
 expect(visited).toContain('ar_document_cleanup_candidates');
});
