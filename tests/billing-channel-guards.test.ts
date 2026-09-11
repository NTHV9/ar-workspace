import {it,expect,vi,afterEach} from 'vitest';
import {deliverMessage} from '../worker/email/delivery';
import {prepareMail} from '../worker/email/gmail-draft';
import {settingsApi} from '../worker/settings/api';
import type {EmailDraft} from '../worker/email/shared';
vi.mock('../worker/email/oauth',()=>({gmailCanRead:async()=>true,gmailToken:vi.fn(async()=>{throw Error('unexpected_provider_token');})}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const id='00000000-0000-4000-8000-000000000020';
const draft={id,owner:id,document_job_id:id,document_revision:0,hotel:'KAT',account_id:'synthetic',account_name:'Synthetic',invoice_ids:['A'],purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',exports:[],attachments:[],revision:0,package_changed:false,billing_method:'system'} satisfies EmailDraft;
for(const mode of ['send','draft'] as const)it(`blocks System ${mode} in Worker before loading credentials, OPERA or attachments`,async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(null)).mockResolvedValueOnce(Response.json(draft));vi.stubGlobal('fetch',fetcher);
 await expect(deliverMessage(env,id,id,0,mode,null)).rejects.toThrow('email_system_billing_required');expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.every(c=>String(c[0]).startsWith(env.SUPABASE_URL))).toBe(true);
});
it('blocks the older shared MIME preparation path for System billing too',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);await expect(prepareMail(env,id,draft,'unused')).rejects.toThrow('email_system_billing_required');expect(f).not.toHaveBeenCalled();});
it('passes the exact optional channel metadata through the authorized settings writer',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json({revision:1}));vi.stubGlobal('fetch',f);const value={revision:0,billingRequired:true,creditTerm:0,billingMethod:'system',billingPortal:'https://portal.example.test',billingInstructions:'External submission',collectionInstructions:'Use reference',billingRecipients:{to:[],cc:[],bcc:[]},collectionRecipients:{to:['collect@example.test'],cc:[],bcc:[]}};
 expect((await settingsApi(new Request('https://app.test/api/account-settings/KAT/synthetic',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),env,id)).status).toBe(200);
 expect(String(f.mock.calls[0][0])).toContain('ar_settings_save_v2');expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({p_actor:id,p_billing_required:true,p_credit_term:0,p_delivery:{billingMethod:'system',billingPortal:'https://portal.example.test/',billingInstructions:'External submission'}});
});
