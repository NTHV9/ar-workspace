import {test,expect,type Page} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{providers:['google']},user_metadata:{},created_at:'2026-09-23T00:00:00Z'};
async function login(page:Page){
 await page.route('https://example.supabase.co/**',route=>route.fulfill({json:{access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user}}));
 await page.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic',googleEnabled:true}}));
 await page.route('**/api/access/me',r=>r.fulfill({json:{memberId:user.id,email:user.email,active:true,administrator:true,regions:['phuket','khao-lak'],revision:1}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key+'-code-verifier',JSON.stringify('synthetic-code-verifier'));});
 await page.goto('/?code=synthetic-code');await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeVisible();
}
for(const region of ['phuket','khao-lak'])test(`${region}: slow or failed payments do not hold invoice and billing results`,async({page})=>{
 const fixture=await setupRegional(page);await login(page);
 if(region==='khao-lak')await page.getByRole('combobox',{name:'Region',exact:true}).selectOption('khao-lak');
 let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);const requests:string[]=[];
 await page.route('**/api/dashboard/hotel-overview?*',async route=>{
  const segment=new URL(route.request().url()).searchParams.get('segment')!;requests.push(segment);
  if(segment==='paid'){await gate;await route.fulfill({status:503,json:{error:'dashboard_unavailable'}});return;}
  await route.fallback();
 });
 try{
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.getByRole('button',{name:'This month',exact:true}).click();
  await expect(page.getByTestId('dashboard-invoice_entries-count')).not.toHaveText('—');
  await expect(page.getByTestId('dashboard-first-count')).not.toHaveText('—');
  const card=page.locator('[data-activity="paid"]');await expect(card).toContainText('Loading…');
  await expect(page.getByText('Some hotel activity breakdowns are unavailable.',{exact:false})).toHaveCount(0);
  release();await expect(card).toContainText('Could not load · Reload dashboard');
  await expect(page.getByTestId('dashboard-invoice_entries-count')).not.toHaveText('—');
  expect(new Set(requests).size).toBe(6);expect(fixture.errors).toEqual([]);
  await page.screenshot({path:`evidence/period-progressive-${region}.png`,fullPage:true});
 }finally{release();}
});
for(const region of ['phuket','khao-lak'])test(`${region}: cached month appears on return and reload before any slow response, then clears at sign-out`,async({page})=>{
 await setupRegional(page,true);await login(page);
 if(region==='khao-lak')await page.getByRole('combobox',{name:'Region',exact:true}).selectOption('khao-lak');
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.getByRole('button',{name:'This month',exact:true}).click();
 await expect(page.getByTestId('dashboard-invoice_entries-count')).toHaveText('0');
 await expect.poll(()=>page.evaluate(()=>({tab:!!sessionStorage.getItem('ar-google-tab-v1'),paths:JSON.parse(sessionStorage.getItem('ar-period-preview-v1')??'[]').map((e:{path:string})=>e.path)}))).toMatchObject({tab:true,paths:expect.arrayContaining([expect.stringMatching(/from=\d{4}-\d{2}-01/)])});
 let release=()=>{};const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/dashboard/hotel-overview?*',async route=>{await gate;await route.fallback();});
 try{
  await page.getByRole('button',{name:'Aging',exact:true}).click();await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.getByRole('button',{name:'This month',exact:true}).click();
  await expect(page.getByTestId('dashboard-invoice_entries-count')).toHaveText('0');
  await expect(page.getByText('Loading activity… Available results are shown as they arrive.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByTestId('dashboard-invoice_entries-count')).toHaveText('0');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('ar-period-preview-v1'))).toBeNull();
 }finally{release();}
});
