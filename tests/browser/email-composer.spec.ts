import {policyFixture} from './fixtures/collection-policy';
import {test,expect,type Page} from '@playwright/test';
import {assertButtonVisibility} from './fixtures/button-visibility';
const jobId='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000002';
async function setup(page:Page,conflict=false){
 const user={id:'synthetic-email-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 const files=[{name:'Statement-final.pdf',storage_key:`jobs/${jobId}/exports/example.pdf`,byte_count:120000,sha256:'a'.repeat(64)}];
 const job={id:jobId,hotel:'KAT',account_id:'example',account_name:'Synthetic travel account',invoice_ids:['1','2'],state:'ready',revision:4,acknowledged:true,files:[],exports:files};
 let draft={id:draftId,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:'example',account_name:job.account_name,invoice_ids:['1','2'],purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Billing documents · Synthetic account · KAT',body:'Dear customer,\n\nPlease find the reviewed documents attached.\n\nKind regards,\nAccounts Receivable',exports:files,attachments:[],revision:0,package_changed:false};const calls:string[]=[];
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const q=r.request(),p=new URL(q.url()).pathname;calls.push(q.method()+' '+p);
  if(p==='/api/access/me')return r.fulfill({json:{memberId:user.id,email:user.email,administrator:true,active:true,regions:['phuket','khao-lak'],revision:1,registered:true}});
  if(p==='/api/access/signature')return r.fulfill({json:{revision:0,enabled:false,signature:{staffId:'00000000-0000-4000-8000-000000000099',name:'',title:'',workplace:''}}});
  if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic',googleEnabled:true}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(p===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(p==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com',maxAttachmentBytes:10485760}});
  if(p==='/api/email/open')return r.fulfill({json:draft});
  if(p===`/api/email/${draftId}`&&q.method()==='PUT'){if(conflict)return r.fulfill({status:409,json:{error:'email_revision_conflict'}});draft={...draft,...q.postDataJSON(),exports:q.postDataJSON().generatedNames?draft.exports.map(f=>({...f,name:q.postDataJSON().generatedNames.find((n:{storageKey:string;name:string})=>n.storageKey===f.storage_key).name})):draft.exports,rich_body:q.postDataJSON().richBody??null,template_ref:q.postDataJSON().templateRef??null,revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p.startsWith(`/api/email/${draftId}/attachments/`)){const file={id:p.split('/').at(-1)!,name:'Synthetic.png',mime:'image/png',storage_key:'synthetic',byte_count:12,sha256:'b'.repeat(64)};draft={...draft,attachments:(q.method()==='POST'?[file]:[]) as typeof draft.attachments,revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p===`/api/email/${draftId}/send`)return r.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});
  if(p===`/api/email/${draftId}/gmail-draft`)return r.fulfill({json:{id:'synthetic-delivery',mode:'draft',state:'created',created:true}});
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return calls;
}
test('email actions remain readable without sending while checking hover and focus',async({page})=>{
 const calls=await setup(page);await page.goto('/tests/browser/audit-email/harness.html');await expect(page.getByLabel('Email TO')).toBeVisible();await assertButtonVisibility(page,page.locator('.email-workspace'));
 await page.getByLabel('Email TO').fill('recipient@example.test');await assertButtonVisibility(page,page.locator('.email-workspace'));await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');
 await page.getByRole('button',{name:'Review & send now',exact:true}).click();await assertButtonVisibility(page,page.locator('.email-send-confirm'));await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();await assertButtonVisibility(page,page.locator('.email-send-confirm'));
 expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});
for(const width of [1440,1280])test(`email workspace ${width}: saved message and explicit Gmail draft`,async({page})=>{
 const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:800});await page.goto('/tests/browser/audit-email/harness.html');
 await expect(page.getByLabel('Email TO')).toHaveValue('');expect(calls.some(c=>c.endsWith('/gmail-draft'))).toBe(false);
 await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Synthetic reviewed billing message.');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');
 await page.screenshot({path:`evidence/email-composer-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();await expect(page.locator('.email-feedback')).toContainText('Gmail confirmed draft creation');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();expect(calls.filter(c=>c.endsWith('/gmail-draft'))).toHaveLength(1);
});
test('email revision conflict retains unsaved message',async({page})=>{await setup(page,true);await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email message').fill('Keep my unsaved changes');await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('another session');await expect(page.getByLabel('Email message')).toHaveValue('Keep my unsaved changes');});

for(const width of [1440,390])test(`generated filename edit saves and reopens with unchanged PDF review ${width}`,async({page})=>{
 const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:844});await page.goto('/tests/browser/audit-email/harness.html');
 const name=page.getByLabel('Generated PDF filename 1'),download=page.getByRole('button',{name:'Download PDF',exact:true});await expect(name).toHaveValue('Statement-final.pdf');
 await name.fill('ใบแจ้งหนี้.pdf');await expect(download).toBeEnabled();await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Review & send now',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(download).toBeEnabled();await expect(page.locator('.email-file small').filter({hasText:'Reviewed PDF'})).toBeVisible();await page.reload();await expect(name).toHaveValue('ใบแจ้งหนี้.pdf');
 await page.getByLabel('Email TO').fill('synthetic@example.test');await expect(download).toBeEnabled();await page.getByRole('button',{name:'Save message',exact:true}).click();await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.locator('.email-send-confirm')).toContainText('ใบแจ้งหนี้.pdf');await expect(page.locator('.email-send-confirm')).not.toContainText('Statement-final.pdf');await page.getByRole('button',{name:'Back to editing',exact:true}).click();
 await page.route(`**/api/email/${draftId}/exports/0*`,r=>{expect(new URL(r.request().url()).searchParams.get('revision')).toBe('2');return r.fulfill({body:'%PDF synthetic',contentType:'application/pdf'});});
 const event=page.waitForEvent('download');await download.click();expect((await event).suggestedFilename()).toBe('ใบแจ้งหนี้.pdf');
 await page.locator('.email-attachments').scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/email-generated-filenames-${width}.png`});expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});
test('generated filename errors and stale saves retain typed names and message',async({page})=>{
 const calls=await setup(page,true);await page.goto('/tests/browser/audit-email/harness.html');const name=page.getByLabel('Generated PDF filename 1');await name.fill('../bad.pdf');await expect(name).toHaveAttribute('aria-invalid','true');await expect(page.getByRole('button',{name:'Save message',exact:true})).toBeDisabled();
 await name.fill('Kept renamed.pdf');await page.getByLabel('Email message').fill('Retained synthetic body');await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('alert')).toContainText('another session');await expect(name).toHaveValue('Kept renamed.pdf');await expect(page.getByLabel('Email message')).toHaveValue('Retained synthetic body');await expect(page.getByRole('button',{name:'Download PDF',exact:true})).toBeEnabled();expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});

for(const expired of [true,false])test(`generated attachment download explains verified expiry without losing email edits (${expired})`,async({page})=>{
 const calls=await setup(page);await page.route(`**/api/email/${draftId}/exports/0*`,route=>route.fulfill({status:expired?410:503,json:{error:expired?'storage_file_expired':'email_attachment_unavailable'}}));
 await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email message').fill('Keep unsaved message after attachment error');
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 const alert=page.getByRole('alert');
 if(expired){await expect(alert).toContainText('deleted');await expect(alert).toContainText('new document preparation');await expect(alert).not.toContainText('Retry');}
 else{await expect(alert).toContainText('Private attachment download is unavailable.');await expect(alert).not.toContainText('deleted');}
 await expect(page.getByLabel('Email message')).toHaveValue('Keep unsaved message after attachment error');
 expect(calls.some(call=>/\/(send|gmail-draft)$/.test(call)||call===`PUT /api/email/${draftId}`)).toBe(false);
});

test('email mobile controls remain reachable',async({page})=>{await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email message').fill('Synthetic mobile message');await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');await page.locator('.email-columns').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'evidence/email-composer-390.png'});await page.getByRole('button',{name:'Create Gmail draft',exact:true}).scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:'evidence/email-composer-390-handoff.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});

for(const width of [1440,1280,390])test(`Send Now ${width} requires an explicit reviewed confirmation`,async({page})=>{const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm send now',exact:true})).toBeDisabled();expect(calls.some(c=>c.endsWith('/send'))).toBe(false);await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();await page.screenshot({path:`evidence/email-send-confirmation-${width}.png`});await page.getByRole('button',{name:'Confirm send now',exact:true}).click();await expect(page.getByText('Gmail sent evidence verified. Billing / collection history recorded.',{exact:true})).toBeVisible();expect(calls.filter(c=>c.endsWith('/send'))).toHaveLength(1);});

 test('rich mode preserves formatting when selected again and across saved reload',async({page})=>{
 await setup(page);await page.goto('/tests/browser/audit-email/harness.html');await page.getByRole('button',{name:'Rich text',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Email message',exact:true});await editor.fill('Synthetic rich test');await editor.press('ControlOrMeta+A');await editor.press('ControlOrMeta+b');
 await expect(editor.locator('b,strong')).toContainText('Synthetic rich test');await page.getByRole('button',{name:'Rich text',exact:true}).click();await expect(editor.locator('b,strong')).toContainText('Synthetic rich test');
 await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');await page.reload();await expect(page.getByRole('textbox',{name:'Email message',exact:true}).locator('b,strong')).toContainText('Synthetic rich test');
 await page.screenshot({path:'evidence/email-rich-composer-1440.png'});
 });

test('review saves current edits and filenames before explicit send confirmation',async({page})=>{
 const calls=await setup(page);await page.goto('/tests/browser/audit-email/harness.html');
 await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Current reviewed message');await page.getByLabel('Generated PDF filename 1').fill('Current-final.pdf');
 const review=page.getByRole('button',{name:'Review & send now',exact:true});await expect(review).toBeEnabled();await review.click();
 await expect(page.locator('.email-send-confirm')).toContainText('Current-final.pdf');await expect(page.locator('.email-send-confirm')).toContainText('Current reviewed message');expect(calls.filter(c=>c===`PUT /api/email/${draftId}`)).toHaveLength(1);expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
 await page.route(`**/api/email/${draftId}/send`,r=>{expect(r.request().postDataJSON().revision).toBe(1);return r.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});});
 await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();await page.getByRole('button',{name:'Confirm send now',exact:true}).click();await expect(page.getByText('Gmail sent evidence verified. Billing / collection history recorded.',{exact:true})).toBeVisible();
});
test('review save failure retains current input and prevents handoff',async({page})=>{
 const calls=await setup(page,true);await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Keep current edits');await page.getByLabel('Generated PDF filename 1').fill('Retained.pdf');
 const review=page.getByRole('button',{name:'Review & send now',exact:true});await expect(review).toBeEnabled();await review.click();await expect(page.getByRole('alert')).toContainText('another session');await expect(page.locator('.email-send-confirm')).toHaveCount(0);await expect(page.getByLabel('Email message')).toHaveValue('Keep current edits');await expect(page.getByLabel('Generated PDF filename 1')).toHaveValue('Retained.pdf');expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});

for(const action of ['Review & send now','Create Gmail draft'])test(`current edits saved once before ${action}, including rapid repeat clicks`,async({page})=>{
 const calls=await setup(page);await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Latest unsaved message');
 await page.route(`**/api/email/${draftId}/gmail-draft`,r=>{calls.push(`POST /api/email/${draftId}/gmail-draft`);expect(r.request().postDataJSON().revision).toBe(1);return r.fulfill({json:{id:'synthetic-delivery',mode:'draft',state:'created',created:true}});});
 await page.getByRole('button',{name:action,exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
 if(action==='Review & send now')await expect(page.locator('.email-send-confirm')).toContainText('Latest unsaved message');else await expect(page.locator('.email-feedback')).toContainText('Gmail confirmed draft creation');
 expect(calls.filter(c=>c===`PUT /api/email/${draftId}`)).toHaveLength(1);expect(calls.filter(c=>c.endsWith('/gmail-draft'))).toHaveLength(action==='Create Gmail draft'?1:0);expect(calls.some(c=>c.endsWith('/send'))).toBe(false);
});
test('download saves changed filename and uses returned revision',async({page})=>{
 const calls=await setup(page);await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Generated PDF filename 1').fill('Downloaded-current.pdf');
 await page.route(`**/api/email/${draftId}/exports/0*`,r=>{expect(new URL(r.request().url()).searchParams.get('revision')).toBe('1');return r.fulfill({body:'%PDF synthetic',contentType:'application/pdf'});});
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();expect((await downloaded).suggestedFilename()).toBe('Downloaded-current.pdf');expect(calls.filter(c=>c===`PUT /api/email/${draftId}`)).toHaveLength(1);expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});

for(const width of [1440,390])test(`direct review screenshot with current unsaved inputs ${width}`,async({page})=>{
 await setup(page);await page.setViewportSize({width,height:width===1440?900:844});await page.goto('/tests/browser/audit-email/harness.html');await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Synthetic current message, ready for review.');await page.getByLabel('Generated PDF filename 1').fill('Review-current.pdf');await expect(page.getByRole('button',{name:'Review & send now',exact:true})).toBeEnabled();await page.screenshot({path:`.tmp/email-flow-speed/composer-unsaved-${width}.png`});await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.locator('.email-send-confirm')).toContainText('Review-current.pdf');await page.screenshot({path:`.tmp/email-flow-speed/direct-review-${width}.png`});
});
test('supplemental addition and removal save current edits before attachment mutation',async({page})=>{
 const calls=await setup(page);const revisions:(string|number)[]=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith(`/api/email/${draftId}/attachments/`))revisions.push(request.method()==='POST'?new URL(request.url()).searchParams.get('revision')!:request.postDataJSON().revision);});await page.goto('/tests/browser/audit-email/harness.html');
 await page.getByLabel('Email message').fill('Message before file');await page.getByLabel('Select supplemental file').setInputFiles({name:'Synthetic.png',mimeType:'image/png',buffer:Buffer.from('synthetic')});const remove=page.getByRole('button',{name:'Remove Synthetic.png',exact:true});await expect(remove).toBeVisible();
 await page.getByLabel('Email message').fill('Message before removal');await remove.click();await expect(remove).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toContainText('Message before removal');expect(revisions).toEqual(['1',3]);expect(calls.filter(c=>c===`PUT /api/email/${draftId}`)).toHaveLength(2);expect(calls.some(c=>/\/(send|gmail-draft)$/.test(c))).toBe(false);
});
