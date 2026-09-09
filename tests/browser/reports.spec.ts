import {test,expect,type Page} from '@playwright/test';
const account={hotel:'KAT',id:'SYNTH-REPORT',name:'Azure Travel · Synthetic',type:'OTA',open:1200,over90:200,items:2};
const activity={delivery_id:'synthetic-delivery',hotel:'KAT',account_id:account.id,account_name:account.name,account_type:'OTA',invoice_id:'SYNTH-INV',invoice_no:'SYNTH-INV',folio_no:'SYNTH-FOL',sent_at:'2026-09-09T18:30:00Z',sent_date:'2026-09-10',kind:'First billing',purpose:'billing',stage:null,amount:5000};
async function setup(page:Page,fail=false){
 const calls:string[]=[];const user={id:'synthetic-reports-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 await page.clock.setFixedTime(new Date('2026-09-10T05:00:00Z'));
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;calls.push(r.request().method()+' '+u.pathname+u.search);
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[account],refresh:{running:false,hotels:[]}}});
  if(p==='/api/reports/options')return r.fulfill({json:{rows:[{hotel:'KAT',account_id:account.id,account_name:account.name,account_type:'OTA'}],total:1}});
  if(p.startsWith('/api/reports/')&&fail)return r.fulfill({status:503,json:{error:'reports_unavailable'}});
  if(p==='/api/reports/current')return r.fulfill({json:{rows:[{...activity,id:activity.invoice_id,open:1200,latest_stage:'Final',last_sent_at:activity.sent_at,verification_state:'verified',collection_selectable:true,workflow:{billing_required:true,first_billing_date:'2026-08-01',due_date:'2026-08-31'}}],total:1,summary:{invoices:1,amount:1200,unverified:0,unbilled:0,urgent:1,stages:[{kind:'Final',invoices:1,amount:1200}],hotels:[{hotel:'KAT',accounts:1,open:1200,over90:200,oldest_sync:'2026-09-10T03:00:00Z',unverified_accounts:0}]}}});
  if(p==='/api/reports/activity'){
   const drill=u.searchParams.has('invoice'),empty=u.searchParams.get('kind')==='Rebilling',second=u.searchParams.get('page')==='1';
   const count=empty?0:drill?1:51;
   const rows=empty?[]:drill?[{...activity,invoice_id:u.searchParams.get('invoice'),invoice_no:u.searchParams.get('invoice')}]:second?[{...activity,delivery_id:'synthetic-delivery-2',invoice_id:'SYNTH-LAST',invoice_no:'SYNTH-LAST'}]:Array.from({length:50},(_,i)=>({...activity,invoice_id:`SYNTH-${i}`,invoice_no:`SYNTH-${i}`}));
   return r.fulfill({json:{rows,total:count,summary:{invoices:count,uniqueInvoices:count,messages:empty?0:drill?1:2,amount:count*5000,missingAmounts:0,daily:empty?[]:[{sent_date:'2026-09-10',invoices:count,messages:drill?1:2,amount:count*5000}],kinds:empty?[]:[{kind:'First billing',invoices:count,amount:count*5000}]}}});
  }
  if(p.startsWith('/api/accounts/'))return r.fulfill({json:{invoices:[]}});
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return calls;
}
for(const width of [1440,1280,390])test(`reports ${width}: independent current / history, pagination and drilldown`,async({page})=>{
 const calls=await setup(page);await page.setViewportSize({width,height:width===390?844:900});await page.goto('/?reports=1');
 await expect(page.getByRole('heading',{name:'Reports & Activity',exact:true})).toBeVisible();
 await expect(page.locator('.reports-metrics')).toContainText('1.2K');
 await page.screenshot({path:`evidence/reports-current-${width}.png`,fullPage:true});
 await page.getByRole('tab',{name:'Verified sent activity'}).click();
 await expect(page.locator('.reports-metrics')).toContainText('255K');
 await expect(page.locator('.reports-table tbody tr')).toHaveCount(50);
 await expect(page.locator('.reports-table')).toContainText(/10 Sept? 2026/);
 await page.getByRole('button',{name:'Next report page',exact:true}).click();await expect(page.locator('.reports-table')).toContainText('SYNTH-LAST');
 await page.getByRole('button',{name:'View history SYNTH-LAST'}).click();await expect(page.getByRole('heading',{name:'Invoice send history'})).toBeVisible();
 if(width===390)await expect(page.getByRole('heading',{name:'Invoice send history'})).toBeInViewport();
 await expect(page.locator('.reports-history')).toContainText('THB 5,000.00');
 expect(calls.some(c=>c.includes('invoice=SYNTH-LAST')&&!c.includes('from=')&&!c.includes('to='))).toBe(true);
 await page.screenshot({path:`evidence/reports-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Close invoice history'}).click();
 await page.getByLabel('Report activity kind').selectOption('Rebilling');await expect(page.getByText('No verified sends match these filters.',{exact:true})).toBeVisible();
 expect(calls.filter(c=>c.startsWith('POST')).every(c=>c.startsWith('POST /api/refresh'))).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('reports unavailable is not an empty activity day',async({page})=>{await setup(page,true);await page.goto('/?reports=1');await page.getByRole('tab',{name:'Verified sent activity'}).click();await expect(page.getByRole('alert')).toContainText('Report data is unavailable');await expect(page.locator('.reports-metrics strong').first()).toHaveText('—');await expect(page.getByText('No verified sends match these filters.',{exact:true})).toHaveCount(0);});
test('mobile invoice history opens into view from a full fifty-row page',async({page})=>{await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/?reports=1');await page.getByRole('tab',{name:'Verified sent activity'}).click();await expect(page.locator('.reports-table tbody tr')).toHaveCount(50);await page.getByRole('button',{name:'View history SYNTH-0',exact:true}).click();await expect(page.getByRole('heading',{name:'Invoice send history'})).toBeInViewport();});
