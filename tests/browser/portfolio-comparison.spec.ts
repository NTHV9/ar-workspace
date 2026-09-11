import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';

// Fictional API fixtures: different internal IDs, shared Account No., no reporting group field.
const accounts=[
  {hotel:'KAT',id:'kat-a',account_no:'SYN-A',name:'Azure Travel · Synthetic',type:'Agent',open:200,over90:20,items:2},
  {hotel:'TSK',id:'tsk-a',account_no:'SYN-A',name:'Azure Travel TSK · Synthetic',type:'Agent',open:100,over90:10,items:1},
  {hotel:'KAT',id:'kat-b',account_no:'SYN-B',name:'Birch Travel · Synthetic',type:'Agent',open:50,over90:0,items:1},
  {hotel:'TSK',id:'tsk-b',account_no:'SYN-B',name:'Birch Travel · Synthetic',type:'Agent',open:0,over90:0,items:0},
  {hotel:'KAT',id:'kat-c',account_no:'SYN-C',name:'Cedar Travel · Synthetic',type:'Corporate',open:300,over90:30,items:3},
];
async function setup(page:Page){
 const errors:string[]=[],calls:string[]=[];
 const user={id:'synthetic-comparison-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-11T00:00:00Z'};
 await page.addInitScript(u=>{
  localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u}));
  addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('aside');badge.textContent='SYNTHETIC TEST DATA';badge.style.cssText='padding:8px 16px;color:#10253f;background:white;font:600 12px sans-serif';document.body.insertBefore(badge,document.body.firstChild);});
 },user);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',r=>{
  const p=new URL(r.request().url()).pathname;calls.push(p);
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{accounts,status:'connected',refresh:{running:false,hotels:[]}}});
  if(accounts.some(a=>p===`/api/accounts/${a.hotel}/${a.id}`))return r.fulfill({json:{invoices:[]}});
  errors.push('Unexpected API: '+p);return r.fulfill({status:501,json:{error:'unmocked_test_api'}});
 });return {errors,calls};
}

for(const width of [1440,1280])test(`comparison ${width}: paired rows, zero vs absent hotel, sorting and separate ledgers`,async({page})=>{
 const {errors,calls}=await setup(page);
 await page.setViewportSize({width,height:width===1440?900:800});await page.goto('/');
 const panel=page.locator('.accounts-panel'),rows=panel.locator('tbody tr');
 await expect(rows).toHaveCount(3);
 const azure=rows.filter({hasText:'Azure Travel · Synthetic'}),birch=rows.filter({hasText:'Birch Travel · Synthetic'}),cedar=rows.filter({hasText:'Cedar Travel · Synthetic'});
 await expect(azure.locator('td.tsk')).toHaveText('THB 100');await expect(azure.locator('td.kat')).toHaveText('THB 200');await expect(azure.locator('.total-cell')).toHaveText('THB 300');
 await expect(azure.locator('td').nth(6)).toHaveText('2');await expect(azure.locator('td').nth(7)).toHaveText('3');
 await expect(birch.locator('td.tsk button')).toHaveText('THB 0');await expect(cedar.locator('td.tsk')).toHaveText('—');await expect(cedar.locator('td.tsk button')).toHaveCount(0);
 await expect(panel.locator('th[aria-sort="descending"]')).toHaveText('Total open');
 for(const label of ['Account','TSK','KAT','Total open','Over 90 days','% share','Accounts','Items']){
  await panel.getByRole('button',{name:label,exact:true}).click();await expect(panel.locator('th[aria-sort="desc"],th[aria-sort="descending"]')).toHaveText(label);
  await panel.getByRole('button',{name:label,exact:true}).click();await expect(panel.locator('th[aria-sort="ascending"]')).toHaveText(label);
  await expect(rows).toHaveCount(3);
 }
 await panel.getByRole('button',{name:'Total open',exact:true}).click();
 await page.screenshot({path:`evidence/portfolio-comparison-${width}.png`,animations:'disabled',fullPage:false});
 // Either hotel's alias or Account No. must retain the full comparison row.
 await page.getByPlaceholder('Search Account / Account ID').fill('Azure Travel TSK');await expect(rows).toHaveCount(1);await expect(azure.locator('.total-cell')).toHaveText('THB 300');
 await page.getByPlaceholder('Search Account / Account ID').fill('syn-a');await expect(rows).toHaveCount(1);await expect(azure.locator('.percentage')).toHaveText('100.0%');
 for(const [hotel,id] of [['KAT','kat-a'],['TSK','tsk-a']]){
  await azure.locator(`td.${hotel.toLowerCase()} button`).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('property')).toBe(hotel);expect(new URL(page.url()).searchParams.get('account')).toBe(id);
  await expect.poll(()=>calls.includes(`/api/accounts/${hotel}/${id}`)).toBe(true);
  await page.getByRole('button',{name:'Back to portfolio',exact:false}).click();await expect(rows).toHaveCount(1);await expect(page.getByPlaceholder('Search Account / Account ID')).toHaveValue('syn-a');
 }
 await azure.locator('.name-link').click();await expect(page.getByRole('dialog',{name:'Choose account hotel'})).toBeVisible();await expect(page.locator('.hotel-choice')).toHaveCount(2);
 await expect(page.locator('.hotel-choice').filter({hasText:'TSK'})).toContainText('Azure Travel TSK · Synthetic');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByLabel('Account filter',{exact:true}).selectOption('Azure Travel TSK · Synthetic');await expect(rows).toHaveCount(1);await expect(azure.locator('.total-cell')).toHaveText('THB 300');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByLabel('Account Type',{exact:true}).selectOption('Agent');await expect(rows).toHaveCount(2);
 await page.getByRole('button',{name:'TSK',exact:true}).first().click();await expect(rows).toHaveCount(2);await expect(rows.locator('td.kat button')).toHaveCount(0);await expect(panel).toContainText('TSK only');
 expect(errors).toEqual([]);
});
