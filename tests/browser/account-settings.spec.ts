import {policyFixture} from './fixtures/collection-policy';
import {test,expect} from '@playwright/test';
import {assertButtonVisibility} from './fixtures/button-visibility';
const user={id:'synthetic-settings-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
async function setup(page:any,conflict=false){
 const writes:any[]=[];const empty={to:[],cc:[],bcc:[]};let settings={revision:0,billing_required:null as boolean|null,credit_term:null as number|null,billing_recipients:empty,collection_recipients:empty};
 await page.addInitScript((u:any)=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',(route:any)=>route.fulfill({json:{user}}));
 await page.route('**/api/**',async(route:any)=>{const q=route.request(),p=new URL(q.url()).pathname;
 if(p==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(p==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
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
 const writes=await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toBeVisible();await assertButtonVisibility(page,page.locator('.account-config'));
 await page.getByLabel('Billing requirement').selectOption('not_required');await page.getByLabel('Credit term (calendar days)').fill('30');await assertButtonVisibility(page,page.locator('.account-config'));expect(writes).toEqual([]);
});
for(const width of [1440,1280])test(`settings ${width}: blank defaults, zero term and explicit recipients`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:800});const writes=await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByLabel('Billing requirement')).toHaveValue('unset');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('');
 await page.getByLabel('Billing requirement').selectOption('not_required');await page.getByLabel('Credit term (calendar days)').fill('0');await page.getByRole('button',{name:'Billing recipients',exact:true}).click();await expect(page.getByLabel('Billing To',{exact:true})).toHaveValue('');await page.getByLabel('Billing To',{exact:true}).fill('recipient@example.test');await page.getByRole('button',{name:'Save account settings',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Account settings saved');expect(writes[0]).toMatchObject({revision:0,billingRequired:false,creditTerm:0,billingRecipients:{to:['recipient@example.test'],cc:[],bcc:[]}});
 await page.screenshot({path:`evidence/account-settings-${width}.png`,fullPage:true});
});
test('settings conflict retains unsaved values',async({page})=>{await setup(page,true);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByLabel('Credit term (calendar days)').fill('30');await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(page.getByRole('alert')).toContainText('changed in another session');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('30');});

test('unsaved account settings survive background reload and same-user token renewal',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByLabel('Credit term (calendar days)').fill('45');
 await page.getByRole('button',{name:'Reload saved data',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reload saved data',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
 await page.evaluate(u=>{const next={access_token:'synthetic-new-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:u};localStorage.setItem('sb-example-auth-token',JSON.stringify(next));const channel=new BroadcastChannel('sb-example-auth-token');channel.postMessage({event:'TOKEN_REFRESHED',session:next});channel.close();},user);
 await expect(page.getByRole('button',{name:'Reload saved data',exact:true})).toBeEnabled();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
});
test('unsaved account settings require explicit discard before tab or app navigation',async({page})=>{
 await setup(page);await page.goto('/?account=example&property=KAT');await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByLabel('Credit term (calendar days)').fill('45');
 let prompts=0;page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
 await page.getByRole('button',{name:'Collection History',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
 await page.getByRole('button',{name:'Collections',exact:true}).click();await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');expect(prompts).toBe(2);
 page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Collection History',exact:true}).click();await expect(page.getByRole('heading',{name:'Collection History',exact:true})).toBeVisible();
});
