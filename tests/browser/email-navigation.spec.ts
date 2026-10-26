import {currentWorkspaceSession,openWorkspaceRoute} from './fixtures/workspace-route';
import {test,expect,type Page,type Route} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';

const jobId='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000002';
async function setup(page:Page,{withDelivery=false,view='email'}:{withDelivery?:boolean;view?:'email'|'templates'}={}){
 const user={id:'00000000-0000-4000-8000-000000000801',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 const exports=[{name:'Synthetic-reviewed.pdf',storage_key:`jobs/${jobId}/exports/synthetic.pdf`,byte_count:1000,sha256:'a'.repeat(64)}];
 const job={id:jobId,lifecycle:'transient',hotel:'KAT',account_id:'example',account_name:'Synthetic navigation account',invoice_ids:['1'],state:'ready',revision:4,acknowledged:true,files:[],exports};
 // Navigation starts with saved recipients, including the current regional self-CC.
 // Otherwise opening a nested template creates unrelated unsaved email changes.
 let draft={id:draftId,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:'example',account_name:job.account_name,invoice_ids:['1'],purpose:'billing',recipients:{to:['recipient@example.test'],cc:['ar@katathani.com'],bcc:[]},subject:'Synthetic subject',body:'Original saved message',exports,attachments:[],revision:0,package_changed:false,...(withDelivery?{gmail_handoff:'awaiting_evidence',delivery:{id:'synthetic-delivery',state:'awaiting_evidence',mode:'send',recorded:false}}:{})};
 const controls={calls:[] as string[],upload:null as Route|null,send:null as Route|null,templateSave:null as Route|null,match:null as Route|null};
 await page.addInitScript(u=>{
  localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u}));
  // Model entering a saved preparation from Portfolio using the app's SPA history.
  if(location.search.includes('compose')||location.search.includes('templates')){const target=location.href;history.replaceState(null,'','/?');history.pushState(null,'',target);}
 },user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{
  const request=r.request(),path=new URL(request.url()).pathname;controls.calls.push(request.method()+' '+path);
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(path==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(path===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(path==='/api/gmail/status')return r.fulfill({json:{region:'phuket',expectedEmail:'ar@katathani.com',configured:true,connected:true,canRead:true,email:'ar@katathani.com'}});
  if(path===`/api/documents/${jobId}/abandon`)return r.fulfill({json:{job,outcome:'protected'}});
  if(path==='/api/email/open')return r.fulfill({json:draft});
  if(path==='/api/email/templates')return r.fulfill({json:{items:[],nextOffset:null}});
  if(path.startsWith('/api/email/templates/')&&request.method()==='PUT'){controls.templateSave=r;return;}
  if(path==='/api/email/deliveries/synthetic-delivery/candidates')return r.fulfill({json:{rows:[{gmailId:'synthetic-match',sentAt:'2026-09-14T02:00:00Z',eligible:true,reason:null,proof:'synthetic-proof'}],nextPageToken:null}});
  if(path==='/api/email/deliveries/synthetic-delivery/reviewed-match'){controls.match=r;return;}
  if(path==='/api/email/deliveries/synthetic-delivery/check')return r.fulfill({json:{id:'synthetic-delivery',state:'sent',mode:'send',recorded:true}});
  if(path===`/api/email/${draftId}`&&request.method()==='PUT'){draft={...draft,...request.postDataJSON(),revision:draft.revision+1};return r.fulfill({json:draft});}
  if(path.startsWith(`/api/email/${draftId}/attachments/`)&&request.method()==='POST'){controls.upload=r;return;}
  if(path===`/api/email/${draftId}/send`){controls.send=r;return;}
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });
 await currentWorkspaceSession(page,user);
 await openWorkspaceRoute(page,view==='templates'?'/?templates=1':`/?documentJob=${jobId}&compose=1`);await expect(withDelivery?page.getByRole('heading',{name:'Sending not confirmed',exact:true}):page.getByLabel(view==='templates'?'Template name':'Email message',{exact:true})).toBeVisible();
 return controls;
}
async function dismissBack(page:Page,label='Email message'){
 const visible=label==='Sending email…'?page.getByRole('heading',{name:label,exact:true}):page.getByLabel(label,{exact:true});
 const messages:string[]=[];page.once('dialog',async dialog=>{messages.push(dialog.message());await dialog.dismiss();});
 await page.evaluate(()=>history.back());await expect.poll(()=>messages).toHaveLength(1);
 expect(messages[0]).toContain('without saving or resolving');expect(messages[0]).not.toContain('PDF edits');
 await expect(visible).toBeVisible();
}

test('one click sends once and replaces preparation until manual Collections return',async({page})=>{
 const controls=await setup(page),original=page.url();
 const send=page.getByRole('button',{name:'Send now',exact:true});
 await send.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 await expect.poll(()=>!!controls.send).toBe(true);
 expect(controls.send!.request().postDataJSON()).toMatchObject({confirmed:true,revision:0});
 await expect(page.getByRole('heading',{name:'Sending email…',exact:true})).toBeVisible();
 await expect(page.getByLabel('Email message',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Back to Collections',exact:true})).toBeDisabled();
 await expect(page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'})).toHaveCount(0);
 await controls.send!.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});
 await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Reviewed email scope'})).toContainText('Messages1Accounts1Invoices1Files1');
 await expect(page.getByRole('region',{name:'Email recipients'})).toContainText('recipient@example.test');
 expect(page.url()).toBe(original);
 await page.getByRole('button',{name:'Back to Collections',exact:true}).click();
 await expect(page).toHaveURL(/collections=1/);expect(new URL(page.url()).searchParams.has('documentJob')).toBe(false);
 expect(controls.calls.filter(call=>call.endsWith('/send'))).toHaveLength(1);
 expect(controls.calls.filter(call=>call.endsWith('/abandon'))).toHaveLength(1);
});

test('accepted result returns while its history check is pending with protected cleanup',async({page})=>{
 const controls=await setup(page);let check:Route|undefined;
 await page.route('**/api/email/deliveries/synthetic-send/check',r=>{check=r;});
 await page.getByRole('button',{name:'Send now',exact:true}).click();await expect.poll(()=>!!controls.send).toBe(true);
 await controls.send!.fulfill({json:{id:'synthetic-send',state:'awaiting_evidence',mode:'send',recorded:false,gmailAccepted:true}});
 await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();
 await expect(page.getByText('History update pending',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Check sent status',exact:true}).click();await expect.poll(()=>!!check).toBe(true);
 await expect(page.getByRole('button',{name:'Back to Collections',exact:true})).toBeEnabled();
 const dialogs:string[]=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await page.getByRole('button',{name:'Back to Collections',exact:true}).click();await expect(page).toHaveURL(/collections=1/);
 expect(controls.calls.filter(call=>call.endsWith('/abandon'))).toHaveLength(1);expect(dialogs).toEqual([]);
 await check!.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});
 expect(controls.calls.filter(call=>call.endsWith('/send'))).toHaveLength(1);
 await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toHaveCount(0);
});

test('failed result exit keeps its summary visible until cleanup succeeds',async({page})=>{
 const controls=await setup(page);let abandon=0;
 await page.route(`**/api/documents/${jobId}/abandon`,r=>{abandon++;return r.fulfill({status:503,json:{error:'cleanup_unavailable'}});});
 await page.getByRole('button',{name:'Send now',exact:true}).click();await expect.poll(()=>!!controls.send).toBe(true);
 await controls.send!.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});
 await page.getByRole('button',{name:'Back to Collections',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('cleanup unavailable');
 expect(new URL(page.url()).searchParams.has('documentJob')).toBe(true);expect(abandon).toBe(1);
});

test('Browser Back protects unsaved email edits until leaving is confirmed',async({page})=>{
 const controls=await setup(page);await page.getByLabel('Email message').fill('Synthetic unsaved message');
 await dismissBack(page);await expect(page.getByLabel('Email message')).toHaveValue('Synthetic unsaved message');
 page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>history.back());
 await expect(page.getByLabel('Email message')).toHaveCount(0);
 expect(controls.calls.some(call=>/\/(send|gmail-draft)$/.test(call)||call===`PUT /api/email/${draftId}`)).toBe(false);
});

test('saving the email clears its navigation guard',async({page})=>{
 await setup(page);await page.getByLabel('Email message').fill('Synthetic saved message');
 await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.locator('.email-feedback')).toContainText('Message saved in this preparation');
 const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 await page.evaluate(()=>history.back());await expect(page.getByLabel('Email message')).toHaveCount(0);expect(dialogs).toEqual([]);
});

test('pending and failed supplemental uploads keep the navigation guard until resolved',async({page})=>{
 const controls=await setup(page);await page.getByLabel('Select supplemental file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nSynthetic upload fixture')});
 await expect.poll(()=>!!controls.upload).toBe(true);await dismissBack(page);
 await controls.upload!.fulfill({status:503,json:{error:'email_attachment_unavailable'}});
 await expect(page.getByRole('button',{name:'Retry this upload',exact:true})).toBeEnabled();await dismissBack(page);
 await page.getByRole('button',{name:'Remove failed selection',exact:true}).click();
 const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 await page.evaluate(()=>history.back());await expect(page.getByLabel('Email message')).toHaveCount(0);expect(dialogs).toEqual([]);
 expect(controls.calls.filter(call=>call.includes('/attachments/'))).toHaveLength(1);
});

test('a send in progress keeps the navigation guard until its result is retained',async({page})=>{
 const controls=await setup(page);await page.getByRole('button',{name:'Send now',exact:true}).click();
 await expect.poll(()=>!!controls.send).toBe(true);
 await dismissBack(page,'Sending email…');await expect(page.getByRole('button',{name:'Back to Collections',exact:true})).toBeDisabled();
 await controls.send!.fulfill({json:{id:'synthetic-send',state:'awaiting_evidence',mode:'send',recorded:false}});
 await expect(page.getByRole('heading',{name:'Sending not confirmed',exact:true})).toBeVisible();
 const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 await page.evaluate(()=>history.back());await expect(page.getByLabel('Email message')).toHaveCount(0);expect(dialogs).toEqual([]);
 expect(controls.calls.filter(call=>call.endsWith('/send'))).toHaveLength(1);
});

test('unsaved template edits inside email also protect Browser Back',async({page})=>{
 const controls=await setup(page);await page.getByRole('button',{name:'Choose template',exact:true}).click();
 await page.getByLabel('Template name',{exact:true}).fill('Synthetic unsaved nested template');
 await dismissBack(page);await expect(page.getByLabel('Template name',{exact:true})).toHaveValue('Synthetic unsaved nested template');
 expect(controls.calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});

for(const view of ['templates','email'] as const)test(`saving an untouched starter template protects ${view} navigation until the response is retained`,async({page})=>{
 const controls=await setup(page,{view});if(view==='email'){await expect(page.getByRole('button',{name:'Save message',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Choose template',exact:true}).click();}
 await page.getByRole('button',{name:'Save template',exact:true}).click();await expect.poll(()=>!!controls.templateSave).toBe(true);
 await dismissBack(page,'Template name');
 expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})).toBe(true);
 const request=controls.templateSave!.request(),content=request.postDataJSON().content;
 await controls.templateSave!.fulfill({json:{...content,id:new URL(request.url()).pathname.split('/').at(-1),revision:1,updated_at:'2026-09-14T02:00:00Z'}});
 await expect(page.locator('.template-feedback')).toContainText('Template saved.');
 const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 await page.evaluate(()=>history.back());await expect(page.getByLabel('Template name',{exact:true})).toHaveCount(0);expect(dialogs).toEqual([]);
 expect(controls.calls.filter(call=>call.startsWith('PUT /api/email/templates/'))).toHaveLength(1);expect(controls.calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});

test('saving a nested template preserves the guard for unsaved email recipients',async({page})=>{
 const controls=await setup(page);
 await page.getByLabel('Email CC',{exact:true}).fill('copy@example.test, ar@katathani.com');
 await page.getByRole('button',{name:'Choose template',exact:true}).click();
 await page.getByRole('button',{name:'Save template',exact:true}).click();await expect.poll(()=>!!controls.templateSave).toBe(true);
 const request=controls.templateSave!.request(),content=request.postDataJSON().content;
 await controls.templateSave!.fulfill({json:{...content,id:new URL(request.url()).pathname.split('/').at(-1),revision:1,updated_at:'2026-09-14T02:00:00Z'}});
 await expect(page.locator('.template-feedback')).toContainText('Template saved.');
 await dismissBack(page,'Template name');
 await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('copy@example.test, ar@katathani.com');
 expect(controls.calls).not.toContain(`PUT /api/email/${draftId}`);
 expect(controls.calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});

async function openSentReview(page:Page){
 await page.getByRole('button',{name:'Review existing sent message',exact:true}).click();
 await page.getByRole('button',{name:'Find matching sent messages',exact:true}).click();
 await page.getByRole('button',{name:'Select this sent message',exact:true}).click();
 await page.getByLabel('Sent match review note').fill('Synthetic note that must be retained');
 return page.getByRole('dialog',{name:'Review an existing sent message',exact:true});
}

test('an unsaved Sent review note protects Browser Back, Close and Escape',async({page})=>{
 const controls=await setup(page,{withDelivery:true}),review=await openSentReview(page);await dismissBack(page,'Sent match review note');
 const messages:string[]=[];const cancel=async(dialog:import('@playwright/test').Dialog)=>{messages.push(dialog.message());await dialog.dismiss();};page.on('dialog',cancel);
 await page.getByRole('button',{name:'Close sent review',exact:true}).click();await expect.poll(()=>messages.length).toBe(1);await expect(review).toBeVisible();
 await page.keyboard.press('Escape');await expect.poll(()=>messages.length).toBe(2);await expect(review).toBeVisible();
 await expect(page.getByLabel('Sent match review note')).toHaveValue('Synthetic note that must be retained');
 expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})).toBe(true);
 // A removed dialog must release its guard in the same commit, before another
 // browser event can observe the closed review. Passive cleanup leaves a gap.
 await page.evaluate(()=>{
  Object.assign(window,{sentReviewGuardAtRemoval:null});
  const review=document.querySelector('dialog[aria-labelledby="sent-review-title"]')!;
  const observer=new MutationObserver(()=>{if(review.isConnected)return;observer.disconnect();const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);Object.assign(window,{sentReviewGuardAtRemoval:event.defaultPrevented});});
  observer.observe(document.body,{childList:true,subtree:true});
 });
 page.off('dialog',cancel);page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Close sent review',exact:true}).click();await expect(review).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as {sentReviewGuardAtRemoval:boolean|null}).sentReviewGuardAtRemoval)).toBe(false);
 const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});await page.evaluate(()=>history.back());await expect(page.getByLabel('Email message')).toHaveCount(0);expect(dialogs).toEqual([]);
 expect(controls.calls.some(call=>/\/(reviewed-match|send|gmail-draft)$/.test(call))).toBe(false);
});

for(const outcome of ['sent','failed'] as const)test(`a pending Sent match protects navigation and preserves the ${outcome} outcome without resending`,async({page})=>{
 const controls=await setup(page,{withDelivery:true}),review=await openSentReview(page);
 await page.getByRole('checkbox',{name:'I confirmed in Gmail that this is the message sent for this reviewed package.'}).check();
 await page.getByRole('button',{name:'Link verified sent message',exact:true}).click();await expect.poll(()=>!!controls.match).toBe(true);
 await dismissBack(page,'Sent match review note');await expect(page.getByRole('button',{name:'Close sent review',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(review).toBeVisible();
 await controls.match!.fulfill(outcome==='sent'?{json:{state:'sent'}}:{status:409,json:{error:'email_review_changed'}});
 if(outcome==='sent'){
  await expect(review).toHaveCount(0);await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();
  const dialogs:string[]=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});await page.evaluate(()=>history.back());await expect(page.getByLabel('Email message')).toHaveCount(0);expect(dialogs).toEqual([]);
  expect(controls.calls.filter(call=>call.endsWith('/check'))).toHaveLength(1);
 }else{
  await expect(review.getByRole('alert')).toContainText('do not resend');await dismissBack(page,'Sent match review note');await expect(page.getByLabel('Sent match review note')).toHaveValue('Synthetic note that must be retained');
  expect(controls.calls.some(call=>call.endsWith('/check'))).toBe(false);
 }
 expect(controls.calls.filter(call=>call.endsWith('/reviewed-match'))).toHaveLength(1);expect(controls.calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});
