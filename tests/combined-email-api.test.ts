import {afterEach,it,expect,vi} from 'vitest';
import {emailApi} from '../worker/email/api';
import {requestAccessIntent} from '../worker/access/scope';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const content={recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',richBody:null,signatureHotel:'KAT'};
const members=[{memberId:id,documentJobId:id,documentRevision:1,draftId:id,draftRevision:1,stage:null,policyVersion:null}];
const input={id,revision:0,commandId:other,members,content};
const request=(v:unknown,path='/api/email/combined')=>new Request('https://app.test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
afterEach(()=>vi.unstubAllGlobals());
it.each([['email_duplicate_scope',409],['email_mailbox_invalid',409],['email_package_too_large',413],['email_command_conflict',409]] as const)('maps %s to its actionable status',async(code,status)=>{
 vi.stubGlobal('fetch',async()=>Response.json({error:code}));
 const r=await emailApi(request(input),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},id);
 expect(r.status).toBe(status);expect(await r.json()).toEqual({error:code});
});
it('reports concurrent preparation contention as a retryable conflict without a send attempt',async()=>{
 const f=vi.fn(async()=>Response.json({message:'document_busy',code:'55P03'},{status:400}));vi.stubGlobal('fetch',f);
 const r=await emailApi(request(input),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},id);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'document_busy'});expect(f).toHaveBeenCalledTimes(1);
});
it('saves only the explicit common message and member receipt contract',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push([url,JSON.parse(String(init.body))]);return Response.json({id,revision:1,members,content,delivery:null});});
 const response=await emailApi(request(input),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},id);
 expect(response.status).toBe(200);expect(calls[0][0]).toMatch(/ar_combined_email_save$/);expect(calls[0][1]).toEqual({p_actor:id,p_id:id,p_revision:0,p_command:other,p_members:members,p_content:content});
});
it('rejects duplicate members, injected paths and malformed common messages before database access',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 for(const v of [{...input,members:[...members,...members]},{...input,members:[{...members[0],storageKey:'foreign'}]},{...input,content:{...content,body:123}},{...input,content:{...content,signatureHotel:'OTHER'}}])expect((await emailApi(request(v),{},id)).status).toBe(400);
 expect(f).not.toHaveBeenCalled();
});
it('admits combined creation via regional mail grant and stored resources via all-member combined scope',async()=>{
 expect(await requestAccessIntent(request(input))).toEqual({kind:'region',region:'phuket',mail:true});
 expect(await requestAccessIntent(new Request('https://app.test/api/email/combined/'+id))).toEqual({kind:'combined',ref:id,mail:true});
 await expect(requestAccessIntent(request({revision:1,confirmed:true,commandId:other},'/api/email/combined/'+id+'/send/other'))).rejects.toThrow('access_forbidden');
});
it('never exposes private manifests or unexpected SQL fields on stored preparation reads',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({id,revision:1,members:[{...members[0],hotel:'KAT',accountId:'A',accountName:'Synthetic',invoiceIds:['I'],purpose:'billing',layout:'combined',stageLabel:null,files:[{fileId:id+':0',name:'KAT-A.pdf',byteCount:3,sha256:'abc',storage_key:'private'}],manifest:{storage_key:'private'},draft:{storage_key:'private'}}],content,mailbox:'phuket',totals:{accounts:1,invoices:1,files:1,bytes:3},delivery:null,secret:'private'}));
 const r=await emailApi(new Request('https://app.test/api/email/combined/'+id),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},id);
 expect(r.status).toBe(200);expect(JSON.stringify(await r.json())).not.toContain('private');
});
it('rejects unauthorized signature owner using effective human rather than shared workspace owner',async()=>{
 const {plainMessage,richText}=await import('../src/email/rich-message');const richBody={...plainMessage('Synthetic'),signature:{staffId:id,name:'Synthetic',title:'Staff',workplace:'Katathani Phuket Beach Resort'}};
 const f=vi.fn();vi.stubGlobal('fetch',f);const r=await emailApi(request({...input,content:{...content,richBody,body:richText(richBody)}}),{REQUEST_ACTOR:other},id);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'email_signature_changed'});expect(f).not.toHaveBeenCalled();
});
it('requires one explicit confirmation and valid command before reading preparation',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);for(const v of [{revision:1,commandId:other},{revision:1,commandId:'invalid',confirmed:true},{revision:-1,commandId:other,confirmed:true},{revision:1,commandId:other,confirmed:true,mode:'draft'}])expect((await emailApi(request(v,'/api/email/combined/'+id+'/send'),{},id)).status).toBe(400);expect(f).not.toHaveBeenCalled();
});
it('retains cross-origin and body budget protection',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);const r=await emailApi(new Request('https://app.test/api/email/combined',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:JSON.stringify(input)}),{},id);expect(r.status).toBe(403);
 expect((await emailApi(request({...input,padding:'x'.repeat(1048576)}),{},id)).status).toBe(413);expect(f).not.toHaveBeenCalled();
});
