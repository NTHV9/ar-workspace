import {policyFixture} from './fixtures/collection-policy';
import {test,expect,type Page} from '@playwright/test';
import type {EmailDraft} from '../../worker/email/shared';
import type {ThreadChoice,ThreadSummary} from '../../src/email/threads';

const jobId='00000000-0000-4000-8000-000000000091',draftId='00000000-0000-4000-8000-000000000092';
const first:ThreadSummary={threadId:'a111',parentMessageId:'a112',subject:'Synthetic account · September documents',participants:['ar@katathani.com','billing@example.test'],latestAt:'2026-09-10T06:00:00Z',messageCount:1};
const second:ThreadSummary={...first,threadId:'b111',parentMessageId:'b112',subject:'Synthetic account · Earlier conversation'};
const selected:ThreadChoice={threadId:first.threadId,parentMessageId:first.parentMessageId,rfcMessageId:'<synthetic@example.test>',references:[],subject:first.subject,matchedRecipients:['billing@example.test'],parentDate:first.latestAt};
async function setup(page:Page,options:{selected?:boolean;handoff?:boolean;failure?:string;disconnected?:boolean;delayPreview?:boolean;delaySelection?:boolean;historyChanged?:boolean;noSnippet?:boolean;paged?:boolean;alternateParent?:boolean}={}){
 const calls:{path:string;method:string;body?:Record<string,unknown>;auth?:string}[]=[],unexpected:string[]=[];
 const user={id:'synthetic-threads-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
 const files=[{name:'Synthetic-statement.pdf',storage_key:`jobs/${jobId}/exports/synthetic.pdf`,byte_count:12000,sha256:'a'.repeat(64)}];
 const job={id:jobId,hotel:'KAT',account_id:'synthetic-thread-account',account_name:'Synthetic travel account',invoice_ids:['1','2'],state:'ready',revision:4,acknowledged:true,files:[],exports:files};
 let draft:EmailDraft={id:draftId,owner:user.id,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:job.account_id,account_name:job.account_name,invoice_ids:['1','2'],purpose:'billing',recipients:{to:['billing@example.test'],cc:[],bcc:['private@example.test']},subject:options.selected?first.subject:'New synthetic billing email',body:'Synthetic message to preserve.',exports:files,attachments:[],revision:2,package_changed:false,thread:options.selected?selected:null,gmail_handoff:options.handoff?'created':null};
 let releasePreview:()=>void=()=>{};const previewGate=new Promise<void>(resolve=>{releasePreview=resolve;});
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('**/*',async r=>{
  const q=r.request(),url=new URL(q.url()),p=url.pathname;
  if(url.hostname==='example.supabase.co')return r.fulfill({json:{user}});
  if(!p.startsWith('/api/')){if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return r.continue();unexpected.push(q.url());return r.abort();}
  calls.push({path:p+url.search,method:q.method(),body:q.postData()?q.postDataJSON():undefined,auth:q.headers().authorization});
  if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(p===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(p==='/api/email/open')return r.fulfill({json:draft});
  if(p==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:!options.disconnected,canRead:!options.disconnected,email:'ar@katathani.com'}});
  if(p===`/api/email/${draftId}/threads`)return r.fulfill({json:{threads:url.searchParams.has('pageToken')?[second]:[first],nextPageToken:url.searchParams.has('pageToken')?null:'synthetic-next'}});
  if(p.startsWith(`/api/email/${draftId}/threads/`)){
   if(options.delayPreview)await previewGate;
   const thread={...(p.endsWith(second.threadId)?second:first),messageCount:options.paged?51:options.alternateParent?2:1},offset=Number(url.searchParams.get('offset')??0);if(offset&&options.historyChanged)return r.fulfill({status:409,json:{error:'email_thread_changed'}});
   return r.fulfill({json:{historyId:'1000',thread,messages:[{id:offset?'a113':thread.parentMessageId,date:first.latestAt,from:'billing@example.test',to:['ar@katathani.com'],subject:offset?'Synthetic later page subject':thread.subject,snippet:options.noSnippet?'':offset?'Synthetic later page.':'<img src="https://never-load.example.test/tracker"> Synthetic reply, reference only.',direction:offset?'unknown':'incoming',matchesReply:!offset},...(options.alternateParent?[{id:'a114',date:first.latestAt,from:'billing@example.test',to:['ar@katathani.com'],subject:'Synthetic earlier invoice discussion',snippet:'Earlier message with a different subject.',direction:'incoming',matchesReply:false}]:[]),...(!offset&&options.paged?Array.from({length:49},(_,index)=>({id:`synthetic${index}`,date:first.latestAt,from:'ar@katathani.com',to:['billing@example.test'],subject:first.subject,snippet:`Synthetic archived message ${index+2}.`,direction:'outgoing',matchesReply:false})):[])],nextMessageOffset:offset||!options.paged?null:50,checkedAt:first.latestAt}});
  }
  if(p===`/api/email/${draftId}/thread`){if(options.delaySelection)await previewGate;if(options.failure)return r.fulfill({status:409,json:{error:options.failure}});const body=q.postDataJSON();draft={...draft,thread:body.threadId?{...selected,threadId:body.threadId,parentMessageId:body.parentMessageId,subject:body.parentMessageId==='a114'?'Synthetic earlier invoice discussion':body.parentMessageId==='a113'?'Synthetic later page subject':first.subject}:null,subject:body.threadId?(body.parentMessageId==='a114'?'Synthetic earlier invoice discussion':body.parentMessageId==='a113'?'Synthetic later page subject':first.subject):draft.subject,revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p===`/api/email/${draftId}`&&q.method()==='PUT'){const body=q.postDataJSON();draft={...draft,...body,rich_body:body.richBody,revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p==='/api/email/templates')return r.fulfill({json:{items:[],nextOffset:null}});
  if(p===`/api/email/${draftId}/gmail-draft`)return r.fulfill({json:{id:'synthetic-delivery',state:'created',mode:'draft',created:true}});
  if(p.startsWith('/api/email/test-conversations/'))return r.fulfill({json:{thread:first,historyId:'1000',messages:[{id:'synthetic-reply',date:first.latestAt,from:'billing@example.test',to:['ar@katathani.com'],subject:first.subject,snippet:'Synthetic inbound diagnostic reply.',direction:'incoming',matchesReply:true}],nextMessageOffset:null,checkedAt:first.latestAt}});
  if(p==='/api/email/test-conversations')return r.fulfill({json:{deliveries:[{id:'00000000-0000-4000-8000-000000000099',sentAt:first.latestAt,subject:'Synthetic verified test'}],nextOffset:null}});
  if(p==='/api/email/test-send')return r.fulfill({json:{state:'sent',id:'synthetic-test'}});
  unexpected.push(`${q.method()} ${p}`);return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });
 return {calls,unexpected,releasePreview};
}
const openComposer=(page:Page)=>page.goto(`http://127.0.0.1:5191/?documentJob=${jobId}&compose=1`);
const chooseExisting=async(page:Page)=>{await page.getByRole('button',{name:'Continue existing thread',exact:true}).click();await page.getByRole('button',{name:`Preview ${first.subject}`,exact:true}).click();};

test('thread search and conversation paginate with authenticated explicit scope confirmation',async({page})=>{
 const {calls,unexpected}=await setup(page,{paged:true});await openComposer(page);
 expect(calls.some(c=>c.path.includes('/threads'))).toBe(false);
 await page.getByRole('button',{name:'Continue existing thread',exact:true}).click();await page.getByRole('button',{name:'Next conversations',exact:true}).click();await expect(page.getByRole('button',{name:`Preview ${second.subject}`,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Previous conversations',exact:true}).click();await page.getByRole('button',{name:`Preview ${first.subject}`,exact:true}).click();
 await expect(page.getByText('<img src=',{exact:false})).toBeVisible();await expect(page.locator('.thread-review img')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Use this conversation',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Next messages',exact:true}).click();await expect(page.getByText('Synthetic later page.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Previous messages',exact:true}).click();
 await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.getByRole('button',{name:'Use this conversation',exact:true}).click();
 await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue(first.subject);await expect(page.getByLabel('Email subject',{exact:true})).toHaveAttribute('readonly','');
 await expect(page.getByLabel('Email message',{exact:true})).toHaveValue('Synthetic message to preserve.');await expect(page.getByLabel('Email BCC',{exact:true})).toHaveValue('private@example.test');
 expect(calls.filter(c=>c.path.endsWith('/thread'))).toHaveLength(1);expect(calls.find(c=>c.path.endsWith('/thread'))?.body).toEqual({revision:2,threadId:'a111',parentMessageId:'a112',confirmed:true});
 expect(calls.some(c=>c.path.includes('offset=50&historyId=1000'))).toBe(true);expect(calls.some(c=>c.path.includes('offset=0&historyId=1000'))).toBe(true);expect(calls.filter(c=>c.path.includes('/threads')).every(c=>c.auth==='Bearer synthetic-token'&&c.path.includes('revision=2'))).toBe(true);expect(unexpected).toEqual([]);
});

test('dirty edits block selection; cancellation preserves draft and late preview cannot reopen it',async({page})=>{
 const {calls,unexpected,releasePreview}=await setup(page,{delayPreview:true});await openComposer(page);await page.getByLabel('Email message',{exact:true}).fill('Retain my unsaved draft');await expect(page.getByRole('button',{name:'Continue existing thread',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByText('Workspace draft saved.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Continue existing thread',exact:true}).click();await page.getByRole('button',{name:`Preview ${first.subject}`,exact:true}).click();
 await page.getByRole('button',{name:'Close conversation review',exact:true}).click();releasePreview();await expect(page.getByRole('dialog',{name:'Conversation review',exact:true})).toHaveCount(0);await expect(page.getByLabel('Email message',{exact:true})).toHaveValue('Retain my unsaved draft');expect(calls.some(c=>c.path.endsWith('/thread'))).toBe(false);expect(unexpected).toEqual([]);
});

for(const failure of ['email_revision_conflict','email_thread_unrelated','email_thread_unavailable'])test(`thread selection ${failure} retains saved message and allows cancellation`,async({page})=>{
 const {unexpected}=await setup(page,{failure});await openComposer(page);await chooseExisting(page);await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.getByRole('button',{name:'Use this conversation',exact:true}).click();await expect(page.locator('.thread-review [role="alert"]')).toBeVisible();await page.getByRole('button',{name:'Close conversation review',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue('New synthetic billing email');await expect(page.getByLabel('Email message',{exact:true})).toHaveValue('Synthetic message to preserve.');expect(unexpected).toEqual([]);
});

test('selected subject survives template application and explicit clearing keeps current text',async({page})=>{
 const {calls,unexpected}=await setup(page,{selected:true});await openComposer(page);await page.getByRole('button',{name:'Choose template',exact:true}).click();await page.getByRole('button',{name:'Apply to message',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue(first.subject);await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByText('Workspace draft saved.',{exact:false})).toBeVisible();const body=await page.getByRole('textbox',{name:'Email message',exact:true}).textContent();
 await page.getByRole('button',{name:'Start a new email',exact:true}).click();await page.getByRole('button',{name:'Confirm new email',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).not.toHaveAttribute('readonly','');await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue(first.subject);expect(await page.getByRole('textbox',{name:'Email message',exact:true}).textContent()).toBe(body);expect(calls.at(-1)?.body).toEqual({revision:3,threadId:null,confirmed:true});expect(unexpected).toEqual([]);
});

test('changing parent updates the exact subject in confirmation before selecting',async({page})=>{
 const {calls,unexpected}=await setup(page,{alternateParent:true});await openComposer(page);await chooseExisting(page);
 await expect(page.locator('.thread-confirmation')).toContainText(`Subject to use: ${first.subject}`);
 await page.getByRole('radio',{name:'Reply to this message',exact:true}).nth(1).check();
 await expect(page.locator('.thread-confirmation')).toContainText('Subject to use: Synthetic earlier invoice discussion');await expect(page.locator('.thread-confirmation')).not.toContainText(`Subject to use: ${first.subject}`);
 await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.getByRole('button',{name:'Use this conversation',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue('Synthetic earlier invoice discussion');expect(calls.find(c=>c.path.endsWith('/thread'))?.body).toMatchObject({threadId:'a111',parentMessageId:'a114'});expect(unexpected).toEqual([]);
});

test('failed different conversation preview cannot retain or confirm a previous parent',async({page})=>{
 const {calls,unexpected}=await setup(page);await page.route(`**/api/email/${draftId}/threads/${second.threadId}?*`,r=>r.fulfill({status:503,json:{error:'email_thread_unavailable'}}));await openComposer(page);await chooseExisting(page);await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();
 await page.getByRole('button',{name:'Back to conversations',exact:true}).click();await page.getByRole('button',{name:'Next conversations',exact:true}).click();await page.getByRole('button',{name:`Preview ${second.subject}`,exact:true}).click();await expect(page.locator('.thread-review [role="alert"]')).toContainText('could not load');await expect(page.locator('.thread-messages')).toHaveCount(0);await expect(page.locator('.thread-confirmation')).toHaveCount(0);expect(calls.some(c=>c.path.endsWith('/thread'))).toBe(false);await page.getByRole('button',{name:'Close conversation review',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue('New synthetic billing email');expect(unexpected).toEqual([]);
});

test('same conversation pagination preserves the deliberately selected parent and subject',async({page})=>{
 const {calls,unexpected}=await setup(page,{paged:true});await openComposer(page);await chooseExisting(page);await page.getByRole('button',{name:'Next messages',exact:true}).click();await page.getByRole('radio',{name:'Reply to this message',exact:true}).check();await expect(page.locator('.thread-confirmation')).toContainText('Subject to use: Synthetic later page subject');await page.getByRole('button',{name:'Previous messages',exact:true}).click();await expect(page.locator('.thread-confirmation')).toContainText('Subject to use: Synthetic later page subject');await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.getByRole('button',{name:'Use this conversation',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).toHaveValue('Synthetic later page subject');expect(calls.find(c=>c.path.endsWith('/thread'))?.body).toMatchObject({threadId:'a111',parentMessageId:'a113'});expect(unexpected).toEqual([]);
});

test('failed refresh removes obsolete metadata and prevents confirming it',async({page})=>{
 const {calls,unexpected}=await setup(page);await openComposer(page);await chooseExisting(page);await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.route(`**/api/email/${draftId}/threads/${first.threadId}?*`,r=>r.fulfill({status:503,json:{error:'email_thread_unavailable'}}));await page.getByRole('button',{name:'Refresh conversation',exact:true}).click();await expect(page.locator('.thread-review [role="alert"]')).toContainText('could not load');await expect(page.locator('.thread-messages')).toHaveCount(0);await expect(page.locator('.thread-confirmation')).toHaveCount(0);expect(calls.some(c=>c.path.endsWith('/thread'))).toBe(false);expect(unexpected).toEqual([]);
});

test('handoff keeps read-only conversation review available and blocks all message mutations',async({page})=>{
 const {calls,unexpected}=await setup(page,{selected:true,handoff:true});await openComposer(page);await expect(page.getByLabel('Email message',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Start a new email',exact:true})).toBeDisabled();await page.getByRole('button',{name:'View conversation',exact:true}).click();await expect(page.getByText('Explicit reply reference',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Use this conversation',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Refresh conversation',exact:true}).click();await expect(page.getByText('Replies do not change balances, billing dates or collection stages.',{exact:true})).toBeVisible();expect(calls.some(c=>c.path.endsWith('/thread'))).toBe(false);expect(unexpected).toEqual([]);
});

test('Gmail read authorization required before any conversation request',async({page})=>{const {calls,unexpected}=await setup(page,{disconnected:true});await openComposer(page);await expect(page.getByRole('button',{name:'Continue existing thread',exact:true})).toBeDisabled();await expect(page.getByText('Connect Gmail with read access to review conversations.',{exact:true})).toBeVisible();expect(calls.some(c=>c.path.includes('/threads'))).toBe(false);expect(unexpected).toEqual([]);});

test('clearing a saved thread remains available when Gmail needs reconnecting',async({page})=>{const {calls,unexpected}=await setup(page,{selected:true,disconnected:true});await openComposer(page);await page.getByRole('button',{name:'Start a new email',exact:true}).click();await page.getByRole('button',{name:'Confirm new email',exact:true}).click();await expect(page.getByLabel('Email subject',{exact:true})).not.toHaveAttribute('readonly','');expect(calls.some(c=>c.path.includes('/threads'))).toBe(false);expect(calls.find(c=>c.path.endsWith('/thread'))?.body).toEqual({revision:2,threadId:null,confirmed:true});expect(unexpected).toEqual([]);});

test('selection in flight blocks close, message edits and other save or handoff commands',async({page})=>{
 const {calls,unexpected,releasePreview}=await setup(page,{delaySelection:true});await openComposer(page);await chooseExisting(page);await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).check();await page.getByRole('button',{name:'Use this conversation',exact:true}).click();await expect(page.getByRole('button',{name:'Close conversation review',exact:true})).toBeDisabled();await expect(page.locator('[aria-label="Email message"]')).toBeDisabled();await expect(page.locator('.email-heading button')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Conversation review',exact:true})).toBeVisible();releasePreview();await expect(page.getByRole('dialog',{name:'Conversation review',exact:true})).toHaveCount(0);expect(calls.filter(c=>c.path.endsWith('/thread'))).toHaveLength(1);expect(calls.some(c=>c.path.endsWith('/send')||c.path.endsWith('/gmail-draft')||c.method==='PUT')).toBe(false);expect(unexpected).toEqual([]);
});

test('changed Gmail history discards the old preview and refresh starts a coherent first page',async({page})=>{
 const {calls,unexpected}=await setup(page,{historyChanged:true,noSnippet:true,paged:true});await openComposer(page);await chooseExisting(page);await expect(page.getByText('Message text not loaded. Only header metadata is available.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Next messages',exact:true}).click();await expect(page.locator('.thread-review [role="alert"]')).toContainText('changed in Gmail');await expect(page.locator('.thread-messages')).toHaveCount(0);await expect(page.getByRole('button',{name:'Use this conversation',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Refresh conversation',exact:true}).click();await expect(page.locator('.thread-messages')).toBeVisible();expect(calls.filter(c=>c.path.includes('/threads/a111')).at(-1)?.path).toBe(`/api/email/${draftId}/threads/a111?revision=2&offset=0`);expect(unexpected).toEqual([]);
});

test('diagnostic thread preview and explicit reply stay separate from account selection',async({page})=>{
 const {calls,unexpected}=await setup(page);await openComposer(page);await page.getByRole('button',{name:'Connection test',exact:true}).click();await page.getByLabel('Test conversation',{exact:true}).selectOption('00000000-0000-4000-8000-000000000099');await page.getByRole('button',{name:'View test conversation',exact:true}).click();await expect(page.getByText('Synthetic inbound diagnostic reply.',{exact:true})).toBeVisible();await expect(page.getByText('Synthetic connection test only.',{exact:false})).toBeVisible();await page.keyboard.press('Escape');await page.getByLabel('One-time test recipient',{exact:true}).fill('diagnostic@example.test');await page.getByRole('button',{name:'Send one test email',exact:true}).click();await expect(page.getByText('Test email sent and verified.',{exact:false})).toBeVisible();expect(calls.find(c=>c.path==='/api/email/test-send')?.body).toMatchObject({replyToDeliveryId:'00000000-0000-4000-8000-000000000099',confirmed:true});expect(calls.some(c=>c.path.endsWith('/thread')||c.path.endsWith('/send'))).toBe(false);await expect(page.getByLabel('One-time test recipient',{exact:true})).toHaveValue('');expect(unexpected).toEqual([]);
});

test('diagnostic previous page retains history and explicit refresh starts fresh',async({page})=>{
 const {unexpected}=await setup(page),queries:string[]=[];
 await page.route('**/api/email/test-conversations/00000000-0000-4000-8000-000000000099?*',route=>{
  const url=new URL(route.request().url()),offset=Number(url.searchParams.get('offset')??0);queries.push(url.search);
  const messages=Array.from({length:51},(_,index)=>({id:`synthetic-diagnostic-${index}`,date:first.latestAt,from:'billing@example.test',to:['ar@katathani.com'],subject:first.subject,snippet:`Synthetic diagnostic message ${index+1}.`,direction:'incoming',matchesReply:false}));
  return route.fulfill({json:{thread:{...first,messageCount:51},historyId:'1000',messages:messages.slice(offset,offset+50),nextMessageOffset:offset?null:50,checkedAt:first.latestAt}});
 });
 await openComposer(page);await page.getByRole('button',{name:'Connection test',exact:true}).click();await page.getByLabel('Test conversation',{exact:true}).selectOption('00000000-0000-4000-8000-000000000099');await page.getByRole('button',{name:'View test conversation',exact:true}).click();
 await expect(page.getByText('Synthetic diagnostic message 1.',{exact:true})).toBeVisible();expect(queries.at(-1)).toBe('?offset=0');
 await page.getByRole('button',{name:'Next messages',exact:true}).click();await expect(page.getByText('Synthetic diagnostic message 51.',{exact:true})).toBeVisible();expect(queries.at(-1)).toBe('?offset=50&historyId=1000');
 await page.getByRole('button',{name:'Previous messages',exact:true}).click();await expect(page.getByText('Synthetic diagnostic message 1.',{exact:true})).toBeVisible();expect(queries.at(-1)).toBe('?offset=0&historyId=1000');
 await page.getByRole('button',{name:'Refresh test conversation',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh test conversation',exact:true})).toBeEnabled();expect(queries.at(-1)).toBe('?offset=0');expect(unexpected).toEqual([]);
});

for(const width of [1440,1280,390])test(`conversation review ${width} has reachable confirmation and no overflow`,async({page})=>{
 const {unexpected}=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await openComposer(page);await page.getByRole('button',{name:'Continue existing thread',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/email-threads-composer-${width}.png`});await chooseExisting(page);await page.getByRole('checkbox',{name:'I confirm this conversation and its participants belong to KAT · Synthetic travel account.'}).scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/email-threads-review-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Conversation review',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Email workspace',exact:true})).toBeVisible();expect(unexpected).toEqual([]);
});
