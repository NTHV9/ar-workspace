import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';

async function setup(page:Page,holdLogout=false){
 const user={id:'00000000-0000-4000-8000-000000000077',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-15T00:00:00Z'};
 const logouts:string[]=[],writes:string[]=[];let releaseLogout=()=>{};
 const logoutGate=new Promise<void>(resolve=>{releaseLogout=resolve;});
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',async route=>{
  if(new URL(route.request().url()).pathname==='/auth/v1/logout'){
   logouts.push(route.request().method());
   if(holdLogout)await logoutGate;
   return route.fulfill({status:204,body:''});
  }
  return route.fulfill({json:{user}});
 });
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'&&path!=='/api/refresh')writes.push(request.method()+' '+path);
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(path==='/api/refresh')return route.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return route.fulfill({json:{status:'connected',accounts:[{id:'synthetic-account',hotel:'KAT',name:'Synthetic sign-out account',type:'Agent',open:100,over90:0,items:1}],refresh:{running:false,hotels:[]}}});
  if(path==='/api/email/templates')return route.fulfill({json:{items:[],nextOffset:null}});
  if(path==='/api/accounts/KAT/synthetic-account')return route.fulfill({json:{invoices:[]}});
  if(path==='/api/account-settings/KAT/synthetic-account')return route.fulfill({json:{revision:0,billing_required:null,credit_term:null,billing_recipients:{to:[],cc:[],bcc:[]},collection_recipients:{to:[],cc:[],bcc:[]},billing_method:null,billing_portal:null,billing_instructions:'',collection_instructions:''}});
  return route.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });
 return {logouts,writes,releaseLogout};
}

test('sign-out cancel keeps unsaved template inputs and sends no logout request; accept signs out',async({page})=>{
 const {logouts,writes}=await setup(page);await page.goto('/?templates=1');
 await page.getByLabel('Template name',{exact:true}).fill('Keep this synthetic template');
 await expect(page.getByText('Unsaved template edits',{exact:true})).toBeVisible();
 const prompts:string[]=[];let accept=false;
 page.on('dialog',async dialog=>{prompts.push(dialog.message());if(accept)await dialog.accept();else await dialog.dismiss();});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 expect(prompts).toHaveLength(1);expect(logouts).toEqual([]);
 await expect(page.getByLabel('Template name',{exact:true})).toHaveValue('Keep this synthetic template');
 await expect(page.getByText('Unsaved template edits',{exact:true})).toBeVisible();
 accept=true;await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your AR workspace',exact:true})).toBeVisible();
 expect(prompts).toHaveLength(2);expect(logouts).toEqual(['POST']);expect(writes).toEqual([]);
});

test('clean sign-out does not ask to discard unchanged template fields',async({page})=>{
 const {logouts}=await setup(page);await page.goto('/?templates=1');await expect(page.getByLabel('Template name',{exact:true})).toBeVisible();
 const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your AR workspace',exact:true})).toBeVisible();
 expect(prompts).toEqual([]);expect(logouts).toEqual(['POST']);
});

test('sign-out keeps unsaved inputs and the discard guard while logout is pending',async({page})=>{
 const {logouts,writes,releaseLogout}=await setup(page,true);await page.goto('/?templates=1');
 await page.getByLabel('Template name',{exact:true}).fill('Keep this until logout finishes');
 await expect(page.getByText('Unsaved template edits',{exact:true})).toBeVisible();
 const prompts:string[]=[];let accept=true;
 page.on('dialog',async dialog=>{prompts.push(dialog.message());if(accept)await dialog.accept();else await dialog.dismiss();});
 try{
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  expect(prompts).toHaveLength(1);await expect.poll(()=>logouts.length).toBe(1);
  await expect(page.getByLabel('Template name',{exact:true})).toHaveValue('Keep this until logout finishes');
  accept=false;await page.getByRole('button',{name:'Sign out',exact:true}).click();
  expect(prompts).toHaveLength(2);expect(logouts).toEqual(['POST']);expect(writes).toEqual([]);
  await expect(page.getByText('Unsaved template edits',{exact:true})).toBeVisible();
 }finally{releaseLogout();}
 await expect(page.getByRole('heading',{name:'Your AR workspace',exact:true})).toBeVisible();
});

test('sign-out cancel preserves account settings until the user confirms discard',async({page})=>{
 const {logouts,writes}=await setup(page);await page.goto('/?account=synthetic-account&property=KAT');
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByLabel('Credit term (calendar days)').fill('45');
 const prompts:string[]=[];let accept=false;
 page.on('dialog',async dialog=>{prompts.push(dialog.message());if(accept)await dialog.accept();else await dialog.dismiss();});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 expect(prompts).toHaveLength(1);expect(logouts).toEqual([]);await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('45');
 accept=true;await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your AR workspace',exact:true})).toBeVisible();
 expect(prompts).toHaveLength(2);expect(logouts).toEqual(['POST']);expect(writes).toEqual([]);
});
