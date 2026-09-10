import {test,expect,type Page} from '@playwright/test';

const jobId='00000000-0000-4000-8000-000000000081',draftId='00000000-0000-4000-8000-000000000082';
const user={id:'synthetic-billing-channel-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
const recipients={billing:{to:['billing@example.test'],cc:['billing-copy@example.test'],bcc:[]},collection:{to:['collections@example.test'],cc:[],bcc:['collection-copy@example.test']}};

async function setup(page:Page,options:{legacy?:boolean;portal?:string;rejectHandoff?:boolean;rejectSettings?:boolean}={}){
 const calls:string[]=[],writes:Record<string,unknown>[]=[];
 const metadata=options.legacy?{}:{billing_method:'system',billing_portal:options.portal??'https://portal.example.test/billing',billing_instructions:'Upload the reviewed PDF, then record the accepted billing date.',collection_instructions:'Include the portal reference in the collection message.'};
 let settings={revision:3,billing_required:true,credit_term:30,billing_recipients:recipients.billing,collection_recipients:recipients.collection,...metadata};
 const files=[{name:'Synthetic-billing.pdf',storage_key:`jobs/${jobId}/exports/synthetic.pdf`,byte_count:2048,sha256:'a'.repeat(64)}];
 const job={id:jobId,hotel:'KAT',account_id:'synthetic-channel',account_name:'Synthetic portal account',invoice_ids:['synthetic-invoice'],state:'ready',revision:4,acknowledged:true,files:[],exports:files};
 let draft={id:draftId,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:job.account_id,account_name:job.account_name,invoice_ids:job.invoice_ids,purpose:'billing',recipients:recipients.billing,subject:'Synthetic billing documents',body:'Please review the synthetic billing documents.',exports:files,attachments:[],revision:0,package_changed:false,...metadata};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{
  const q=r.request(),p=new URL(q.url()).pathname;calls.push(`${q.method()} ${p}`);
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[{id:job.account_id,hotel:'KAT',name:job.account_name,type:'OTA',open:100,over90:0,items:1}],refresh:{running:false,hotels:[]}}});
  if(p===`/api/accounts/KAT/${job.account_id}`)return r.fulfill({json:{invoices:[]}});
  if(p===`/api/account-settings/KAT/${job.account_id}`){
   if(q.method()==='GET')return options.rejectSettings?r.fulfill({status:503,json:{error:'settings_unavailable'}}):r.fulfill({json:settings});
   const b=q.postDataJSON();writes.push(b);
   settings={revision:settings.revision+1,billing_required:b.billingRequired,credit_term:b.creditTerm,billing_recipients:b.billingRecipients,collection_recipients:b.collectionRecipients,billing_method:b.billingMethod,billing_portal:b.billingPortal,billing_instructions:b.billingInstructions,collection_instructions:b.collectionInstructions};
   return r.fulfill({json:settings});
  }
  if(p===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(p==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com'}});
  if(p==='/api/email/open')return r.fulfill({json:draft});
  if(p===`/api/email/${draftId}`&&q.method()==='PUT'){draft={...draft,...q.postDataJSON(),revision:draft.revision+1};return r.fulfill({json:draft});}
  if(p===`/api/email/${draftId}/gmail-draft`||p===`/api/email/${draftId}/send`){
   if(options.rejectHandoff)return r.fulfill({status:409,json:{error:'email_system_billing_required'}});
   const send=p.endsWith('/send');return r.fulfill({json:{id:'synthetic-delivery',state:send?'sent':'created',mode:send?'send':'draft',created:!send,recorded:send}});
  }
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });
 return {calls,writes};
}

for(const width of [1440,390])test(`billing setup ${width}: metadata, zero term and separate recipients survive reload`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:844});const {writes}=await setup(page);
 await page.goto('/?account=synthetic-channel&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Billing type',exact:true})).toHaveValue('system');await expect(page.getByLabel('Billing portal URL',{exact:true})).toHaveValue('https://portal.example.test/billing');
 await page.getByLabel('Credit term (calendar days)').fill('0');await page.getByRole('textbox',{name:'Billing instructions',exact:true}).fill('Upload the reviewed invoice PDF.\nRecord the actual accepted date.');await page.getByRole('textbox',{name:'Collection instructions',exact:true}).fill('Use the separate collections mailbox.');
 await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(page.getByText('Account settings saved.',{exact:false})).toBeVisible();
 expect(writes[0]).toMatchObject({revision:3,billingRequired:true,billingMethod:'system',billingPortal:'https://portal.example.test/billing',creditTerm:0,billingInstructions:'Upload the reviewed invoice PDF.\nRecord the actual accepted date.',collectionInstructions:'Use the separate collections mailbox.',billingRecipients:recipients.billing,collectionRecipients:recipients.collection});
 await page.reload();await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('0');await expect(page.getByRole('textbox',{name:'Billing instructions',exact:true})).toHaveValue('Upload the reviewed invoice PDF.\nRecord the actual accepted date.');
 await page.locator('.account-config').scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/billing-channel-settings-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Billing recipients',exact:true}).click();await expect(page.getByLabel('Billing To',{exact:true})).toHaveValue('billing@example.test');await page.getByRole('button',{name:'Collection recipients',exact:true}).click();await expect(page.getByLabel('Collection To',{exact:true})).toHaveValue('collections@example.test');
});

test('older required settings default to By Email and non-required clears the method',async({page})=>{
 const {writes}=await setup(page,{legacy:true});await page.goto('/?account=synthetic-channel&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Billing type',exact:true})).toHaveValue('email');await page.getByLabel('Billing requirement').selectOption('not_required');await expect(page.getByRole('combobox',{name:'Billing type',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(page.getByText('Account settings saved.',{exact:false})).toBeVisible();expect(writes[0]).toMatchObject({billingRequired:false,billingMethod:null,billingPortal:null,billingInstructions:'',collectionInstructions:''});
});

for(const action of ['draft','send'] as const)test(`By System blocks billing but permits explicit collection ${action}`,async({page})=>{
 const {calls}=await setup(page);await page.goto(`/?documentJob=${jobId}&compose=1`);
 await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Review & send now',exact:true})).toBeDisabled();
 await expect(page.getByText('By System',{exact:true})).toBeVisible();await expect(page.getByText('Upload the reviewed PDF, then record the accepted billing date.',{exact:true})).toBeVisible();
 const portal=page.getByRole('link',{name:'Open account billing portal',exact:true});await expect(portal).toHaveAttribute('href','https://portal.example.test/billing');await expect(portal).toHaveAttribute('rel',/noopener/);
 expect(calls.some(c=>c.endsWith('/gmail-draft')||c.endsWith('/send'))).toBe(false);
 if(action==='draft')await page.screenshot({path:'evidence/billing-channel-composer-1440.png'});
 await page.getByRole('button',{name:'collection',exact:true}).click();await expect(page.getByText('Include the portal reference in the collection message.',{exact:true})).toBeVisible();await page.getByLabel('Collection stage').selectOption('Friendly');
 await page.getByLabel('Email TO').fill('collections@example.test');await page.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(page.getByText('Workspace draft saved.',{exact:false})).toBeVisible();
 if(action==='draft'){await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();await expect(page.getByText('Gmail confirmed draft creation.',{exact:false})).toBeVisible();}
 else{await page.getByRole('button',{name:'Review & send now',exact:true}).click();await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();await page.getByRole('button',{name:'Confirm send now',exact:true}).click();await expect(page.getByText('Gmail sent evidence verified.',{exact:false})).toBeVisible();}
 expect(calls.filter(c=>c.endsWith(action==='draft'?'/gmail-draft':'/send'))).toHaveLength(1);
});

test('unsafe stored portal has no link and mobile billing guidance remains reachable',async({page})=>{
 await setup(page,{portal:'javascript:alert(1)'});await page.setViewportSize({width:390,height:844});await page.goto(`/?documentJob=${jobId}&compose=1`);
 await expect(page.getByText('By System',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Open account billing portal',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Create Gmail draft',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();await page.screenshot({path:'evidence/billing-channel-composer-390.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('changed server billing method shows actionable handoff feedback',async({page})=>{
 await setup(page,{legacy:true,rejectHandoff:true});await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('By System');await expect(page.getByRole('alert')).toContainText('actual billing date');
});

test('explicit account recipient loading follows purpose and retains unsaved message text',async({page})=>{
 const {calls}=await setup(page);await page.goto(`/?documentJob=${jobId}&compose=1`);
 await expect(page.getByRole('button',{name:'Load account recipients',exact:true})).toBeVisible();
 await page.getByLabel('Email TO').fill('edited@example.test');await page.getByLabel('Email subject').fill('Retain this subject');await page.getByLabel('Email message').fill('Retain this unsaved message.');
 await page.getByRole('button',{name:'collection',exact:true}).click();await expect(page.getByLabel('Email TO')).toHaveValue('edited@example.test');expect(calls.some(c=>c.includes('/account-settings/'))).toBe(false);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Load account recipients',exact:true}).click();await expect(page.getByLabel('Email TO')).toHaveValue('edited@example.test');expect(calls.some(c=>c.includes('/account-settings/'))).toBe(false);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Load account recipients',exact:true}).click();await expect(page.getByLabel('Email TO')).toHaveValue('collections@example.test');await expect(page.getByLabel('Email CC')).toHaveValue('');await expect(page.getByLabel('Email BCC')).toHaveValue('collection-copy@example.test');
 await page.getByRole('button',{name:'billing',exact:true}).click();await expect(page.getByLabel('Email TO')).toHaveValue('collections@example.test');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Load account recipients',exact:true}).click();await expect(page.getByLabel('Email TO')).toHaveValue('billing@example.test');await expect(page.getByLabel('Email CC')).toHaveValue('billing-copy@example.test');await expect(page.getByLabel('Email BCC')).toHaveValue('');
 await expect(page.getByLabel('Email subject')).toHaveValue('Retain this subject');await expect(page.getByLabel('Email message')).toHaveValue('Retain this unsaved message.');await expect(page.getByRole('button',{name:'Save workspace draft',exact:true})).toBeEnabled();
 expect(calls.filter(c=>c.includes('/account-settings/'))).toEqual(['GET /api/account-settings/KAT/synthetic-channel','GET /api/account-settings/KAT/synthetic-channel']);expect(calls.some(c=>c.startsWith('PUT ')||c.endsWith('/send')||c.endsWith('/gmail-draft'))).toBe(false);
 await page.screenshot({path:'evidence/billing-channel-load-recipients-1440.png'});
});

test('failed account recipient loading preserves current recipients and message',async({page})=>{
 const {calls}=await setup(page,{rejectSettings:true});await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Email TO').fill('keep@example.test');await page.getByLabel('Email message').fill('Keep this message.');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Load account recipients',exact:true}).click();await expect(page.getByRole('alert')).toContainText('current recipients and message are retained');await expect(page.getByLabel('Email TO')).toHaveValue('keep@example.test');await expect(page.getByLabel('Email CC')).toHaveValue('billing-copy@example.test');await expect(page.getByLabel('Email message')).toHaveValue('Keep this message.');expect(calls.some(c=>c.startsWith('PUT ')||c.endsWith('/send')||c.endsWith('/gmail-draft'))).toBe(false);
});
