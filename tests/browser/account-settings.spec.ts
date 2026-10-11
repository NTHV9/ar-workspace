import {seedTabSession,syntheticWorkspaceAccess} from './fixtures/auth-session';
import {policyFixture} from './fixtures/collection-policy';
import {test,expect} from '@playwright/test';
import {assertButtonVisibility} from './fixtures/button-visibility';
const user={id:'synthetic-settings-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
async function setup(page:any,conflict=false){
 const writes:any[]=[];const empty={to:[],cc:[],bcc:[]};let settings={revision:0,billing_required:null as boolean|null,credit_term:null as number|null,billing_recipients:empty,collection_recipients:empty};
 await seedTabSession(page,user,'synthetic-token');
 await page.route('https://example.supabase.co/**',(route:any)=>route.fulfill({json:{user}}));
 await page.route('**/api/**',async(route:any)=>{const q=route.request(),p=new URL(q.url()).pathname;
 if(p==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(p==='/api/access/me')return route.fulfill({json:syntheticWorkspaceAccess(user)});if(p==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
 if(p==='/api/refresh')return route.fulfill({json:{jobs:[],running:false,hotels:[]}});
 if(p==='/api/portfolio')return route.fulfill({json:{status:'connected',accounts:[{id:'example',hotel:'KAT',name:'Synthetic settings account',type:'OTA',open:100,over90:0,items:1}],refresh:{running:false,hotels:[]}}});
 if(p==='/api/accounts/KAT/example')return route.fulfill({json:{invoices:[]}});
 if(p==='/api/account-settings/KAT/example'){
  if(q.method()==='GET')return route.fulfill({json:settings});const b=q.postDataJSON();writes.push(b);
  if(conflict)return route.fulfill({status:409,json:{error:'settings_revision_conflict'}});
  settings={revision:1,billing_required:b.billingRequired,credit_term:b.creditTerm,billing_recipients:b.billingRecipients,collection_recipients:b.collectionRecipients};return route.fulfill({json:settings});
 }
 return route.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return writes;
}
test('account setting actions remain readable in their form context',async({page})=>{
 const writes=await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toBeVisible();await assertButtonVisibility(page,page.locator('.account-config'));
 await page.getByLabel('Billing requirement').selectOption('not_required');await page.getByLabel('Credit term (calendar days)').fill('30');await assertButtonVisibility(page,page.locator('.account-config'));expect(writes).toEqual([]);
});
for(const width of [1440,1280])test(`settings ${width}: blank defaults, zero term and explicit recipients`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:800});const writes=await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();
 await expect(page.getByLabel('Billing requirement')).toHaveValue('unset');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('');
 await page.getByLabel('Billing requirement').selectOption('not_required');await page.getByLabel('Credit term (calendar days)').fill('0');await page.getByRole('button',{name:'Billing recipients',exact:true}).click();await expect(page.getByLabel('Billing To',{exact:true})).toHaveValue('');await page.getByLabel('Billing To',{exact:true}).fill('recipient@example.test');await page.getByRole('button',{name:'Save account settings',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Account settings saved');expect(writes[0]).toMatchObject({revision:0,billingRequired:false,creditTerm:0,billingRecipients:{to:['recipient@example.test'],cc:[],bcc:[]}});
 await page.screenshot({path:`.tmp/audit-ui/account-settings-${width}.png`,fullPage:true});
});
test('settings conflict retains unsaved values',async({page})=>{await setup(page,true);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();await page.getByLabel('Credit term (calendar days)').fill('30');await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(page.getByRole('alert')).toContainText('changed in another session');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('30');});

test('saving Billing not required without a term refreshes invoice billing status and leaves due unknown',async({page})=>{
 const writes=await setup(page);let invoiceReads=0;
 await page.route('**/api/accounts/KAT/example',route=>{invoiceReads++;return route.fulfill({json:{invoices:[{id:'SYN-PARTIAL',hotel:'KAT',account_id:'example',guest:'Synthetic partial rules guest',invoice_no:'12345',folio_no:'67890',transaction_date:'2026-09-01',original:100,open:100,collection_role:'standalone',collection_selectable:true,verification_state:'verified',workflow:{revision:writes.length,billing_required:writes.length?false:null,credit_term:null,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:null}}]}});});
 await page.goto('/?account=example&property=KAT');await expect(page.locator('.ledger')).toContainText('Billing setup needed');
 await page.getByRole('button',{name:'Account settings',exact:true}).click();await page.getByLabel('Billing requirement').selectOption('not_required');await page.getByRole('button',{name:'Save account settings',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Billing requirement is saved; add a credit term');expect(writes[0]).toMatchObject({billingRequired:false,creditTerm:null});
 await page.getByRole('button',{name:'Invoice / Folio',exact:true}).click();await expect(page.locator('.ledger')).toContainText('No reminders sent');await expect(page.locator('.ledger')).not.toContainText('Billing setup needed');await expect(page.locator('.ledger tbody tr td').nth(5)).toHaveText('Not available');expect(invoiceReads).toBeGreaterThan(1);
});

test('unsaved account settings survive background reload and same-user token renewal',async({page})=>{
 await setup(page);const tokens:string[]=[];await page.route('**/api/access/me',route=>{tokens.push(route.request().headers().authorization??'');return route.fulfill({json:syntheticWorkspaceAccess(user)});});await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();
 await page.getByLabel('Credit term (calendar days)').fill('45');
 await page.getByRole('button',{name:'OPERA data status',exact:true}).click();await page.getByRole('button',{name:'Reload saved data',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reload saved data',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
 await page.evaluate(u=>{const next={access_token:'synthetic-new-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:u};const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key,JSON.stringify(next));const channel=new BroadcastChannel(key);channel.postMessage({event:'TOKEN_REFRESHED',session:next});channel.close();},user);
 await expect.poll(()=>tokens.includes('Bearer synthetic-new-token')).toBe(true);await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
});
test('unsaved account settings require explicit discard before tab or app navigation',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();await page.getByLabel('Credit term (calendar days)').fill('45');
 let prompts=0;page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
 await page.getByRole('button',{name:'Collection History',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
 await page.getByRole('button',{name:'Collections',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');expect(prompts).toBe(2);
 page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Collection History',exact:true}).click();await expect(page.getByRole('heading',{name:'Collection History',exact:true})).toBeVisible();
});
async function refreshTabToken(page:any,nextUser=user,accessToken='synthetic-new-token',event='TOKEN_REFRESHED'){
 await page.evaluate(({u,accessToken,event}:any)=>{const next={access_token:accessToken,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:u},key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key,JSON.stringify(next));const channel=new BroadcastChannel(key);channel.postMessage({event,session:next});channel.close();},{u:nextUser,accessToken,event});
}
test('a revoked renewed token immediately hides the prior workspace',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT&accountSection=Overview');await page.getByLabel('Credit term (calendar days)').fill('45');
 await page.route('**/api/access/me',route=>route.fulfill({status:403,json:{error:'access_forbidden'}}));await refreshTabToken(page);await expect(page.getByRole('alert')).toContainText('not approved or has been suspended');await expect(page.getByLabel('Credit term (calendar days)')).toHaveCount(0);
});
test('another user cannot retain the prior user workspace while access is pending',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT&accountSection=Overview');await page.getByLabel('Credit term (calendar days)').fill('45');let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});await page.route('**/api/access/me',async route=>{await gate;await route.fulfill({status:403,json:{error:'access_forbidden'}});});
 await refreshTabToken(page,{...user,id:'another-synthetic-settings-user'});await expect(page.getByLabel('Credit term (calendar days)')).toHaveCount(0);release();await expect(page.getByRole('alert')).toContainText('not approved or has been suspended');
});
test('a delayed old token grant cannot restore access after the latest token is revoked',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT&accountSection=Overview');await page.getByLabel('Credit term (calendar days)').fill('45');let release!:()=>void,oldRead=false;const gate=new Promise<void>(r=>{release=r;});await page.route('**/api/access/me',async route=>{if(route.request().headers().authorization==='Bearer synthetic-old-pending'){oldRead=true;await gate;await route.fulfill({json:syntheticWorkspaceAccess(user)});}else await route.fulfill({status:403,json:{error:'access_forbidden'}});});
 await refreshTabToken(page,user,'synthetic-old-pending');await expect.poll(()=>oldRead).toBe(true);await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');await refreshTabToken(page,user,'synthetic-new-revoked');await expect(page.getByRole('alert')).toContainText('not approved or has been suspended');release();await page.waitForTimeout(100);await expect(page.getByLabel('Credit term (calendar days)')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('not approved or has been suspended');
});
test('logout then a same-user login cannot reuse the prior verified grant while checking',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT&accountSection=Overview');await expect(page.getByLabel('Credit term (calendar days)')).toBeVisible();
 await page.evaluate(()=>{const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.removeItem(key);const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_OUT',session:null});channel.close();});await expect(page.getByLabel('Credit term (calendar days)')).toHaveCount(0);
 let release!:()=>void,checking=false;const gate=new Promise<void>(r=>{release=r;});await page.route('**/api/access/me',async route=>{checking=true;await gate;await route.fulfill({json:syntheticWorkspaceAccess(user)});});await refreshTabToken(page,user,'synthetic-same-user-new-login','SIGNED_IN');await expect.poll(()=>checking).toBe(true);await expect(page.getByLabel('Credit term (calendar days)')).toHaveCount(0);release();await expect(page.getByLabel('Credit term (calendar days)')).toBeVisible();
});
