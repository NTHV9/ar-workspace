import {test,expect,type Page} from '@playwright/test';
const jobId='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000002';
async function setup(page:Page,conflict=false){
 const user={id:'synthetic-email-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 const files=[{name:'Statement-final.pdf',storage_key:`jobs/${jobId}/exports/example.pdf`,byte_count:120000,sha256:'a'.repeat(64)}];
 const job={id:jobId,hotel:'KAT',account_id:'example',account_name:'Synthetic travel account',invoice_ids:['1','2'],state:'ready',revision:4,acknowledged:true,files:[],exports:files};
 let draft={id:draftId,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:'example',account_name:job.account_name,invoice_ids:['1','2'],purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Billing documents · Synthetic account · KAT',body:'Dear customer,\n\nPlease find the reviewed documents attached.\n\nKind regards,\nAccounts Receivable',exports:files,attachments:[],revision:0,package_changed:false};const calls:string[]=[];
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const q=r.request(),p=new URL(q.url()).pathname;calls.push(q.method()+' '+p);
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(p===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(p==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com',maxAttachmentBytes:10485760}});
  if(p==='/api/email/open')return r.fulfill({json:draft});
  if(p===`/api/email/${draftId}`&&q.method()==='PUT'){if(conflict)return r.fulfill({status:409,json:{error:'email_revision_conflict'}});draft={...draft,...q.postDataJSON(),revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p===`/api/email/${draftId}/send`)return r.fulfill({json:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}});
  if(p===`/api/email/${draftId}/gmail-draft`)return r.fulfill({json:{id:'synthetic-delivery',mode:'draft',state:'created',created:true}});
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return calls;
}
for(const width of [1440,1280])test(`email workspace ${width}: saved message and explicit Gmail draft`,async({page})=>{
 const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:800});await page.goto(`/?documentJob=${jobId}&compose=1`);
 await expect(page.getByLabel('Email TO')).toHaveValue('');expect(calls.some(c=>c.endsWith('/gmail-draft'))).toBe(false);
 await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByLabel('Email message').fill('Synthetic reviewed billing message.');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');
 await page.screenshot({path:`evidence/email-composer-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();await expect(page.locator('.email-feedback')).toContainText('Gmail confirmed draft creation');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();expect(calls.filter(c=>c.endsWith('/gmail-draft'))).toHaveLength(1);
});
test('email revision conflict retains unsaved message',async({page})=>{await setup(page,true);await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Email message').fill('Keep my unsaved changes');await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('another session');await expect(page.getByLabel('Email message')).toHaveValue('Keep my unsaved changes');});

test('email mobile controls remain reachable',async({page})=>{await setup(page);await page.setViewportSize({width:390,height:844});await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Email message').fill('Synthetic mobile message');await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');await page.locator('.email-columns').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'evidence/email-composer-390.png'});await page.getByRole('button',{name:'Create Gmail draft',exact:true}).scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:'evidence/email-composer-390-handoff.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});

for(const width of [1440,1280,390])test(`Send Now ${width} requires saved edits and an explicit reviewed confirmation`,async({page})=>{const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Email TO').fill('recipient@example.test');await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Workspace draft saved');await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm send now',exact:true})).toBeDisabled();expect(calls.some(c=>c.endsWith('/send'))).toBe(false);await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();await page.screenshot({path:`evidence/email-send-confirmation-${width}.png`});await page.getByRole('button',{name:'Confirm send now',exact:true}).click();await expect(page.getByText('Gmail sent evidence verified. Billing / collection history recorded.',{exact:true})).toBeVisible();expect(calls.filter(c=>c.endsWith('/send'))).toHaveLength(1);});
