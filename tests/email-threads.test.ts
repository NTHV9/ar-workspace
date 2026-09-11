import {afterEach,expect,it,vi} from 'vitest';
import {buildMime,encodedHeader} from '../worker/email/mime';
import {verifySentEvidence} from '../worker/email/sent-evidence';
import {url64} from '../worker/email/crypto';
import type {ThreadChoice} from '../src/email/threads';
import {chooseParent,listThreads,parseConversation,previewThread,revalidateThread,selectThread,rfcIds,syntheticConversation} from '../worker/email/threads';
import {hash} from '../worker/email/crypto';
import {sendDiagnostic} from '../worker/email/delivery';
import {emailApi} from '../worker/email/api';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-provider-token',gmailCanRead:async()=>true}));

const recipients={to:['example@example.test'],cc:[],bcc:[]};
const input={revision:0,purpose:'billing' as const,recipients,subject:'Synthetic thread',body:'Synthetic body'};
const messageId='<00000000-0000-4000-8000-000000000000@ar-workspace.ar-c82.workers.dev>';
const thread:ThreadChoice={threadId:'abc123',parentMessageId:'def456',rfcMessageId:'<parent@example.test>',references:['<first@example.test>','<parent@example.test>'],subject:input.subject,matchedRecipients:recipients.to,parentDate:'2026-09-10T00:00:00.000Z'};
const sent=()=>({id:'sent123',threadId:thread.threadId,labelIds:['SENT'],internalDate:String(Date.now()-60000),payload:{headers:[{name:'Message-ID',value:messageId},{name:'From',value:'ar@katathani.com'},{name:'To',value:recipients.to[0]},{name:'Subject',value:input.subject},{name:'In-Reply-To',value:thread.rfcMessageId},{name:'References',value:thread.references.join(' ')}],mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(input.body))}}});
afterEach(()=>vi.unstubAllGlobals());
it('adds exact parent and references to reply MIME without changing new messages',()=>{
 const plain=new TextDecoder().decode(buildMime(input,[],messageId));expect(plain).not.toContain('In-Reply-To:');
 const reply=new TextDecoder().decode(buildMime(input,[],messageId,thread));expect(reply).toContain('In-Reply-To: <parent@example.test>');expect(reply).toContain('References: <first@example.test>\r\n <parent@example.test>');
});
it('requires expected provider thread and exact reply headers in SENT proof',async()=>{
 const expected={messageId,...input,files:[],thread};
 expect(await verifySentEvidence(sent(),expected,async()=>new Uint8Array())).toMatchObject({status:'verified'});
 const wrong=sent();wrong.threadId='different';expect(await verifySentEvidence(wrong,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required',reason:'message_thread'});
 const missing=sent();missing.payload.headers=missing.payload.headers.filter(h=>h.name!=='In-Reply-To');expect(await verifySentEvidence(missing,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required'});
 const badReferences=sent();badReferences.payload.headers.at(-1)!.value='<wrong@example.test> '+thread.rfcMessageId;expect(await verifySentEvidence(badReferences,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required'});
 expect(await verifySentEvidence(sent(),{...expected,thread:{...thread,subject:'Different'}},async()=>new Uint8Array())).toMatchObject({status:'review_required',reason:'message_thread'});
 const injected=sent();injected.payload.headers.at(-1)!.value=thread.references.join('\n ');expect(await verifySentEvidence(injected,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required'});
});
it('rejects forged CRLF, duplicate RFC references and altered subject before MIME',()=>{
 for(const bad of [{...thread,rfcMessageId:'<parent@example.test>\r\nBcc: bad@example.test'},{...thread,references:[thread.rfcMessageId,thread.rfcMessageId]},{...thread,subject:'Different'}])expect(()=>buildMime(input,[],messageId,bad)).toThrow();
});
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const draftId='00000000-0000-4000-8000-000000000001';
const draft=()=>({id:draftId,owner:'owner',revision:2,package_changed:false,recipients,subject:input.subject,body:input.body,thread:null});
const providerMessage=(n=1)=>({id:'message'+n,threadId:'abc123',labelIds:['INBOX'],internalDate:String(Date.parse('2026-09-10T00:00:00Z')+n),snippet:'Plain synthetic snippet',payload:{headers:[{name:'From',value:'Example <example@example.test>'},{name:'To',value:'ar@katathani.com'},{name:'Subject',value:input.subject},{name:'Message-ID',value:`<parent${n}@example.test>`}]}});
const conversation=(count=1)=>({id:'abc123',historyId:'12345',messages:Array.from({length:count},(_,n)=>providerMessage(n+1))});
it('validates exact chosen parent participation even if another message matches the account',()=>{
 const c=conversation(2);c.messages[1].payload.headers[0].value='other@example.test';
 const parsed=parseConversation(c,'abc123',recipients);expect(()=>chooseParent(parsed,recipients,'message2')).toThrow('email_thread_unrelated');expect(chooseParent(parsed,recipients,'message1').matchedRecipients).toEqual(recipients.to);
});
it('rejects missing/duplicate provider and RFC IDs, ambiguous headers, wrong thread and CRLF',()=>{
 const variants=[(c:ReturnType<typeof conversation>)=>c.messages.push(c.messages[0]),(c:ReturnType<typeof conversation>)=>c.messages[0].threadId='wrong',(c:ReturnType<typeof conversation>)=>c.messages[0].payload.headers.push({name:'Message-ID',value:'<duplicate@example.test>'}),(c:ReturnType<typeof conversation>)=>c.messages[0].payload.headers[3].value='<invalid>',(c:ReturnType<typeof conversation>)=>c.messages[0].payload.headers[0].value='example@example.test\r\nBcc: bad@example.test',(c:ReturnType<typeof conversation>)=>c.messages[0].payload.headers.push({name:'References',value:'<same@example.test> <same@example.test>'})];
 for(const mutate of variants){const c=conversation();mutate(c);expect(()=>parseConversation(c,'abc123',recipients)).toThrow('email_thread_invalid');}
 expect(()=>chooseParent(parseConversation(conversation(),'abc123',recipients),recipients,'missing')).toThrow();
});
it('keeps missing metadata snippets empty, classifies direction and proves only explicit parent references',()=>{
 const c=conversation(2);delete (c.messages[0] as {snippet?:string}).snippet;c.messages[1].payload.headers.push({name:'In-Reply-To',value:'<parent1@example.test>'});
 const parsed=parseConversation(c,'abc123',recipients,'<parent1@example.test>');expect(parsed.messages[0]).toMatchObject({snippet:'',direction:'incoming',matchesReply:false});expect(parsed.messages[1].matchesReply).toBe(true);
});
it('searches only explicit external To/CC and preserves provider pagination',async()=>{
 const urls:URL[]=[];vi.stubGlobal('fetch',async(url:string)=>{if(url.includes('/ar_email_get'))return Response.json({...draft(),recipients:{...recipients,bcc:['hidden@example.test']}});const u=new URL(url);urls.push(u);return Response.json(u.pathname.endsWith('/threads')?{threads:[{id:'abc123'}],nextPageToken:'next123'}:conversation());});
 const result=await listThreads(env,'owner',draftId,2,'page123');expect(result.nextPageToken).toBe('next123');expect(result.threads[0].subject).toBe(input.subject);expect(urls[0].searchParams.get('pageToken')).toBe('page123');expect(urls[0].searchParams.get('maxResults')).toBe('10');expect(urls[0].searchParams.get('q')).not.toMatch(/hidden|bcc:|ar@/);expect(urls[1].searchParams.get('format')).toBe('metadata');
});
it('rejects duplicate search IDs instead of silently deduplicating results',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.includes('/ar_email_get')?draft():{threads:[{id:'abc123'},{id:'abc123'}]}));await expect(listThreads(env,'owner',draftId,2)).rejects.toThrow('email_thread_invalid');
});
it('paginates complete bounded metadata and rejects changed history between display pages',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>Response.json(url.includes('/ar_email_get')?draft():conversation(51)));
 const first=await previewThread(env,'owner',draftId,2,'abc123');expect(first.messages).toHaveLength(50);expect(first.nextMessageOffset).toBe(50);expect(first.historyId).toBe('12345');
 expect((await previewThread(env,'owner',draftId,2,'abc123',50,first.historyId)).messages).toHaveLength(1);
 await expect(previewThread(env,'owner',draftId,2,'abc123',50,'old')).rejects.toThrow('email_thread_changed');await expect(previewThread(env,'owner',draftId,2,'abc123',50)).rejects.toThrow('email_thread_invalid');
});
it('checks owner, revision and reviewed package before calling the provider',async()=>{
 for(const [change,error] of [[{owner:'other'},'email_forbidden'],[{revision:3},'email_revision_conflict'],[{package_changed:true},'email_package_changed']] as const){const f=vi.fn().mockResolvedValue(Response.json({...draft(),...change}));vi.stubGlobal('fetch',f);await expect(listThreads(env,'owner',draftId,2)).rejects.toThrow(error);expect(f).toHaveBeenCalledTimes(1);}
});
it('requires explicit confirmation and routes provider-only selection to atomic database writer',async()=>{
 const calls:{name:string;args:Record<string,unknown>}[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{if(url.includes('/rpc/')){const name=url.split('/').at(-1)!;const args=JSON.parse(String(init.body));calls.push({name,args});return Response.json(name==='ar_email_get'?draft():name==='ar_email_thread_select'?{error:'email_handoff_pending'}:null);}return Response.json(conversation());});
 const request=(body:unknown)=>new Request('https://app.test/api/email/'+draftId+'/thread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await emailApi(request({revision:2,threadId:'abc123',parentMessageId:'message1'}),env,'owner')).status).toBe(400);
 const response=await emailApi(request({revision:2,threadId:'abc123',parentMessageId:'message1',confirmed:true}),env,'owner');expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'email_handoff_pending'});expect(calls.find(c=>c.name==='ar_email_thread_select')?.args.p_choice).toMatchObject({rfcMessageId:'<parent1@example.test>',subject:input.subject});
});
it('revalidates provider parent before handoff and rejects changed RFC identity',async()=>{
 const c=conversation();const choice=chooseParent(parseConversation(c,'abc123',recipients),recipients,'message1');c.messages[0].payload.headers[3].value='<changed@example.test>';vi.stubGlobal('fetch',async()=>Response.json(c));await expect(revalidateThread(env,'owner',{thread:choice,recipients,subject:choice.subject})).rejects.toThrow('email_thread_changed');
});
it('retains a single In-Reply-To ancestor when the chosen parent has no References',async()=>{
 const c=conversation();c.messages[0].payload.headers.push({name:'In-Reply-To',value:'<ancestor@example.test>'});
 const expected={threadId:'abc123',parentMessageId:'message1',rfcMessageId:'<parent1@example.test>',references:['<ancestor@example.test>','<parent1@example.test>'],subject:input.subject,matchedRecipients:recipients.to,parentDate:new Date(Number(c.messages[0].internalDate)).toISOString()};
 expect(chooseParent(parseConversation(c,'abc123',recipients),recipients,'message1')).toEqual(expected);
 vi.stubGlobal('fetch',async()=>Response.json(c));expect(await revalidateThread(env,'owner',{thread:expected,recipients,subject:input.subject})).toEqual(expected);
 c.messages[0].payload.headers.push({name:'References',value:'<first@example.test>'});expect(chooseParent(parseConversation(c,'abc123',recipients),recipients,'message1').references).toEqual(['<first@example.test>','<parent1@example.test>']);
 c.messages[0].payload.headers.pop();c.messages[0].payload.headers.at(-1)!.value='<ancestor@example.test> <other@example.test>';expect(chooseParent(parseConversation(c,'abc123',recipients),recipients,'message1').references).toEqual(['<parent1@example.test>']);
});
it('clear selection uses the guarded writer without Gmail permission or requests',async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json(draft())).mockResolvedValueOnce(Response.json({...draft(),revision:3}));vi.stubGlobal('fetch',f);expect(await selectThread(env,'owner',draftId,2,null)).toMatchObject({revision:3});expect(f.mock.calls[1][0]).toContain('/ar_email_thread_select');
});
it('normalizes RFC continuations while rejecting bare newlines and malformed dot atoms',()=>{
 const c=conversation();const subject='Synthetic long Unicode subject — '.repeat(4);c.messages[0].payload.headers[2].value=encodedHeader(subject);c.messages[0].payload.headers.push({name:'References',value:'<first@example.test>\r\n <second@example.test>'});expect(chooseParent(parseConversation(c,'abc123',recipients),recipients,'message1')).toMatchObject({subject,references:['<first@example.test>','<second@example.test>','<parent1@example.test>']});
 for(const bad of ['<.parent@example.test>','<parent.@example.test>','<parent@.example.test>','<parent@example.test.>','<parent@example.test>\n <other@example.test>'])expect(()=>rfcIds(bad)).toThrow('email_thread_invalid');
});
it('supports archived messages with no label IDs without fabricating a direction or snippet',()=>{
 const c=conversation();delete (c.messages[0] as {labelIds?:string[]}).labelIds;expect(parseConversation(c,'abc123',recipients).messages[0].direction).toBe('incoming');
});
it('quotes special valid local-parts in literal Gmail search terms',async()=>{
 let query='';vi.stubGlobal('fetch',async(url:string)=>{if(url.includes('/ar_email_get'))return Response.json({...draft(),recipients:{to:['part{a}|b+tag@example.test'],cc:[],bcc:[]}});query=new URL(url).searchParams.get('q')??'';return Response.json({threads:[]});});await listThreads(env,'owner',draftId,2);expect(query).toContain('from:"part{a}|b+tag@example.test"');
});
it('diagnostic resolves Gmail rewritten RFC ID with message-specific fields and enforces the original recipient hash',async()=>{
 const digest=await hash(new TextEncoder().encode(JSON.stringify(recipients)));const source={id:draftId,owner:'owner',mode:'test',state:'sent',draft_id:null,gmail_id:'message1',snapshot:{expected:{recipientHash:digest,subject:input.subject}}};
 const c=conversation();c.messages[0].labelIds=['SENT'];c.messages[0].payload.headers[0].value='ar@katathani.com';c.messages[0].payload.headers[1].value=recipients.to[0];
 vi.stubGlobal('fetch',async(url:string)=>{if(url.includes('/ar_mail_get'))return Response.json(source);const u=new URL(url);if(u.pathname.includes('/messages/')){expect(u.searchParams.get('fields')).toBe('id,threadId,labelIds,internalDate,snippet,payload/headers');return Response.json(c.messages[0]);}return Response.json(c);});
 expect((await syntheticConversation(env,'owner',draftId,digest)).choice.rfcMessageId).toBe('<parent1@example.test>');await expect(syntheticConversation(env,'owner',draftId,'wrong')).rejects.toThrow('email_test_command_conflict');
});
it('diagnostic rejects real-account deliveries, unsent tests, different recipient, and supplemental replies',async()=>{
 const digest=await hash(new TextEncoder().encode(JSON.stringify(recipients)));for(const change of [{mode:'send'},{state:'awaiting_evidence'},{draft_id:draftId},{owner:'other'}]){vi.stubGlobal('fetch',async()=>Response.json({id:draftId,owner:'owner',mode:'test',state:'sent',draft_id:null,gmail_id:'message1',snapshot:{expected:{recipientHash:digest,subject:input.subject}},...change}));await expect(syntheticConversation(env,'owner',draftId,digest)).rejects.toThrow('email_test_command_conflict');}
 await expect(sendDiagnostic(env,'owner',draftId,recipients.to[0],{draftId,revision:2,ids:[draftId]},false,draftId)).rejects.toThrow('email_invalid');
});
