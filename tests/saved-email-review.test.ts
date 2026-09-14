import {afterEach,expect,it,vi} from 'vitest';
import {accountWorkspaceApi} from '../worker/accounts/workspace';
import {handleApi} from '../worker/index';
import {previewSavedDraftThread} from '../worker/email/threads';
vi.mock('../worker/email/oauth',()=>({gmailCanRead:async()=>true,gmailToken:async()=>'synthetic-provider-token'}));
const actor='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000002',jobId='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const recipients={to:['customer@example.test'],cc:[],bcc:[]};
const scope={hotel:'KAT' as const,accountId:'A',draftId};
const choice={threadId:'saved-thread',parentMessageId:'m0',rfcMessageId:'<parent0@example.test>',references:['<parent0@example.test>'],subject:'Saved subject',matchedRecipients:recipients.to,parentDate:'2026-09-10T00:00:00.000Z'};
const saved=()=>({id:draftId,owner:actor,document_job_id:jobId,document_revision:1,revision:3,hotel:'KAT',account_id:'A',account_name:'Synthetic account',invoice_ids:['A1'],purpose:'billing',recipients,subject:'Saved subject',body:'Original saved message',package_changed:true,thread:choice,exports:[],attachments:[],providerSecret:'Do not expose this'});
function thread(count=1,historyId='100'){return {id:'saved-thread',historyId,messages:Array.from({length:count},(_,i)=>({id:'m'+i,threadId:'saved-thread',labelIds:['INBOX'],internalDate:String(Date.parse('2026-09-10T00:00:00Z')+i*1000),snippet:'Saved conversation '+i,payload:{headers:[{name:'From',value:'customer@example.test'},{name:'To',value:'ar@katathani.com'},{name:'Subject',value:'Saved subject'},{name:'Message-ID',value:`<parent${i}@example.test>`}],body:{data:'PRIVATE BODY'}}}))};}
function request(suffix='',query=''){return new Request(`https://app.test/api/account-workspace/KAT/A/email/${draftId}${suffix}${query}`);}
afterEach(()=>vi.unstubAllGlobals());
it('reads the exact saved message after the current document becomes unreviewed without opening or creating a draft',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push(url);const body=JSON.parse(String(init.body));if(url.endsWith('ar_email_get')){expect(body).toEqual({p_actor:actor,p_id:draftId});return Response.json(saved());}if(url.endsWith('ar_mail_for_draft')){expect(body).toEqual({p_actor:actor,p_draft:draftId,p_revision:3});return Response.json({id:'00000000-0000-4000-8000-000000000004',owner:actor,draft_id:draftId,revision:3,state:'awaiting_evidence',mode:'send',sent_at:null});}if(url.endsWith('ar_gmail_attempt_get'))return Response.json(null);throw Error('Unexpected');});
 const r=await accountWorkspaceApi(request(),env,actor);expect(r.status).toBe(200);expect(await r.json()).toMatchObject({id:draftId,documentJobId:jobId,documentRevision:1,draftRevision:3,packageChanged:true,subject:'Saved subject',body:'Original saved message',hasThread:true,delivery:{state:'awaiting_evidence',mode:'send',recorded:false}});expect(calls.every(url=>!url.includes('ar_email_open')&&!url.includes('googleapis'))).toBe(true);
});
it('requires actor, exact draft identity, Hotel and Account before any Gmail read',async()=>{
 for(const extra of [{owner:'other'},{id:jobId},{hotel:'TSK'},{account_id:'OTHER'}]){const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({...saved(),...extra});});expect((await accountWorkspaceApi(request('/thread','?revision=3'),env,actor)).status).toBe(403);expect(calls).toHaveLength(1);}
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await accountWorkspaceApi(request(),env,'')).status).toBe(401);expect((await handleApi(request('/thread','?revision=3'),env)).status).toBe(401);expect(fetcher).not.toHaveBeenCalled();
});
it('does not accept mutations or an arbitrary thread selector on saved review routes',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);for(const method of ['POST','PUT','DELETE'])expect((await accountWorkspaceApi(new Request(request(),{method}),env,actor)).status).toBe(405);for(const query of ['?revision=3&threadId=other','?revision=3&offset=50','?revision=3&offset=0&offset=50'])expect((await accountWorkspaceApi(request('/thread',query),env,actor)).status).toBe(400);expect(f).not.toHaveBeenCalled();});
it('reads only the saved thread choice even if the document package changed',async()=>{const urls:URL[]=[];vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('ar_email_get'))return Response.json(saved());urls.push(new URL(url));return Response.json(thread());});const preview=await previewSavedDraftThread(env,actor,scope,3);expect(preview.messages).toHaveLength(1);expect(preview.thread.threadId).toBe('saved-thread');expect(urls).toHaveLength(1);expect(urls[0].pathname).toBe('/gmail/v1/users/me/threads/saved-thread');expect(urls[0].searchParams.get('format')).toBe('metadata');expect(JSON.stringify(preview)).not.toContain('PRIVATE BODY');});
it('retains revision and Gmail history fences on next and previous pages',async()=>{let historyId='100';vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('ar_email_get')?saved():thread(51,historyId)));const first=await previewSavedDraftThread(env,actor,scope,3);expect(first.nextMessageOffset).toBe(50);expect((await previewSavedDraftThread(env,actor,scope,3,50,first.historyId)).messages).toHaveLength(1);historyId='101';await expect(previewSavedDraftThread(env,actor,scope,3,0,'100')).rejects.toThrow('email_thread_changed');await expect(previewSavedDraftThread(env,actor,scope,2)).rejects.toThrow('email_revision_conflict');});
it('retains recipient and parent relation checks on a saved conversation',async()=>{for(const unrelated of [true,false]){vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('ar_email_get'))return Response.json(saved());const value=thread();if(unrelated)value.messages[0].payload.headers[0].value='other@example.test';else value.messages[0].payload.headers[3].value='<changed@example.test>';return Response.json(value);});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow(unrelated?'email_thread_unrelated':'email_thread_changed');}});
it('strips internal saved-draft and delivery fields instead of leaking provider state',async()=>{vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('ar_email_get')?saved():null));const r=await accountWorkspaceApi(request(),env,actor);const body=await r.text();expect(r.status).toBe(200);expect(body).not.toMatch(/providerSecret|Do not expose|storage_key|owner|rfcMessageId/);});

const sentDraft=()=>({...saved(),thread:null,document_lifecycle:'transient',document_closed_at:'2026-09-10T00:00:01.000Z'});
const receipt=()=>({id:'00000000-0000-4000-8000-000000000004',owner:actor,draft_id:draftId,revision:3,state:'sent',mode:'send',gmail_id:'sent-message',sent_at:'2026-09-10T00:00:00.000Z'});
function newConversation(count=2,historyId='200'){
 const value=thread(count,historyId);value.id='new-thread';
 value.messages.forEach((message,i)=>{message.threadId='new-thread';if(i===0){message.id='sent-message';message.labelIds=['SENT'];message.payload.headers[0].value='ar@katathani.com';message.payload.headers[1].value=recipients.to[0];message.snippet='Original first sent message';}else{message.payload.headers.push({name:'In-Reply-To',value:'<parent0@example.test>'});message.snippet='Customer reply to first sent message';}});
 return value;
}
function mockSentReview({draft=sentDraft(),delivery=receipt(),conversation=newConversation(),metadata=conversation.messages[0]}:{draft?:Record<string,unknown>;delivery?:Record<string,unknown>|null;conversation?:ReturnType<typeof newConversation>;metadata?:Record<string,unknown>}={}){
 const calls:{url:URL;method:string;body:Record<string,unknown>|null}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const target=new URL(url),body=init.body?JSON.parse(String(init.body)):null;calls.push({url:target,method:init.method??'GET',body});
  if(target.pathname.endsWith('/ar_email_get'))return Response.json(draft);
  if(target.pathname.endsWith('/ar_mail_for_draft')){expect(body).toEqual({p_actor:actor,p_draft:draftId,p_revision:3});return Response.json(delivery);}
  if(target.pathname.endsWith('/ar_gmail_attempt_get'))return Response.json(null);
  if(target.pathname==='/gmail/v1/users/me/messages/sent-message')return Response.json(metadata);
  if(target.pathname==='/gmail/v1/users/me/threads/new-thread')return Response.json(conversation);
  throw Error('Unexpected synthetic read: '+target.pathname);
 });return calls;
}
it('offers the exact verified sent conversation for a first email after transient files are closed',async()=>{
 const calls=mockSentReview();const response=await accountWorkspaceApi(request(),env,actor);expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({hasThread:true,threadSource:'sent',documentRevision:1,draftRevision:3,delivery:{state:'sent',recorded:true}});
 expect(calls.some(call=>call.url.hostname==='gmail.googleapis.com')).toBe(false);
});
it('anchors a first sent email and its reply to the exact receipt without selecting a thread or reopening files',async()=>{
 const calls=mockSentReview();const result=await previewSavedDraftThread(env,actor,scope,3);
 expect(result.thread.threadId).toBe('new-thread');expect(result.messages).toMatchObject([{id:'sent-message',direction:'outgoing',matchesReply:false},{id:'m1',direction:'incoming',matchesReply:true}]);
 const provider=calls.filter(call=>call.url.hostname==='gmail.googleapis.com');expect(provider.map(call=>call.url.pathname)).toEqual(['/gmail/v1/users/me/messages/sent-message','/gmail/v1/users/me/threads/new-thread']);
 expect(provider.every(call=>call.method==='GET'&&call.url.searchParams.get('format')==='metadata')).toBe(true);
 expect(calls.some(call=>/select|confirm_sent|email_open|storage/.test(call.url.pathname))).toBe(false);expect(JSON.stringify(result)).not.toContain('PRIVATE BODY');
});
it('also reads a first Gmail draft only after its exact sent message is confirmed',async()=>{mockSentReview({delivery:{...receipt(),mode:'draft'}});expect((await previewSavedDraftThread(env,actor,scope,3)).messages[1].matchesReply).toBe(true);});
it('rejects a different saved owner, Hotel, Account or draft revision before resolving a sent anchor',async()=>{
 for(const change of [{owner:jobId},{hotel:'TSK'},{account_id:'OTHER'},{id:jobId}]){const calls=mockSentReview({draft:{...sentDraft(),...change}});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow('email_forbidden');expect(calls).toHaveLength(1);}
 const calls=mockSentReview();await expect(previewSavedDraftThread(env,actor,scope,2)).rejects.toThrow('email_revision_conflict');expect(calls).toHaveLength(1);
});
it('rejects a mismatched delivery owner, draft identity or revision before any provider read',async()=>{
 for(const [change,error] of [[{owner:jobId},'email_forbidden'],[{draft_id:jobId},'email_forbidden'],[{revision:2},'email_revision_conflict']] as const){const calls=mockSentReview({delivery:{...receipt(),...change}});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow(error);expect(calls.some(call=>call.url.hostname==='gmail.googleapis.com')).toBe(false);}
});
it('never infers a conversation from pending, uncertain, reviewed or incomplete delivery evidence',async()=>{
 for(const delivery of [null,...['pending','created','awaiting_evidence','review_required'].map(state=>({...receipt(),state})),{...receipt(),gmail_id:null,provider_receipt_id:'sent-message'},{...receipt(),sent_at:null}]){
  const calls=mockSentReview({delivery});const response=await accountWorkspaceApi(request(),env,actor);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({hasThread:false,threadSource:null});
  await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow('email_thread_not_selected');expect(calls.some(call=>call.url.hostname==='gmail.googleapis.com')).toBe(false);
 }
});
it('rejects diagnostic deliveries as account conversation evidence',async()=>{const calls=mockSentReview({delivery:{...receipt(),mode:'test'}});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow('email_invalid');expect(calls.some(call=>call.url.hostname==='gmail.googleapis.com')).toBe(false);});
it('rejects an invalid provider anchor instead of following its thread',async()=>{
 for(const change of [{id:'other-message'},{labelIds:['DRAFT']},{labelIds:[]},{threadId:'https://other.test/thread'}]){const conversation=newConversation(),calls=mockSentReview({conversation,metadata:{...conversation.messages[0],...change}});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow('email_thread_invalid');expect(calls.filter(call=>call.url.pathname.includes('/threads/'))).toHaveLength(0);}
});
it('rechecks the sent sender, subject, time and exact anchor within thread metadata',async()=>{
 for(const field of ['sender','subject','time','anchor'] as const){const conversation=newConversation(),metadata=structuredClone(conversation.messages[0]);if(field==='sender')metadata.payload.headers[0].value='customer@example.test';if(field==='subject')metadata.payload.headers[2].value='Wrong subject';if(field==='time')metadata.internalDate=String(Number(metadata.internalDate)+1000);if(field==='anchor')conversation.messages[0].payload.headers[3].value='<changed@example.test>';mockSentReview({conversation,metadata});await expect(previewSavedDraftThread(env,actor,scope,3)).rejects.toThrow('email_thread_changed');}
});
it('keeps complete pagination and the Gmail history fence for a first sent conversation',async()=>{
 mockSentReview({conversation:newConversation(51)});const first=await previewSavedDraftThread(env,actor,scope,3);expect(first.nextMessageOffset).toBe(50);
 expect((await previewSavedDraftThread(env,actor,scope,3,50,first.historyId)).messages).toHaveLength(1);
 mockSentReview({conversation:newConversation(51,'201')});await expect(previewSavedDraftThread(env,actor,scope,3,0,first.historyId)).rejects.toThrow('email_thread_changed');
});
