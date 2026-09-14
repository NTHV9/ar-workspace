import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';

async function setup(page:Page){
 const user={id:'synthetic-lazy-recovery-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 const controls={blockModule:true,modules:[] as string[],configReads:0,navigationLoads:0,writes:[] as string[]};
 page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())controls.navigationLoads++;});
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',route=>route.fulfill({json:{user}}));
 await page.route(/\/(?:src\/remittance\/Remittances\.tsx|assets\/Remittances-[^/]+\.js)(?:\?|$)/,route=>{controls.modules.push(new URL(route.request().url()).pathname);return controls.blockModule?route.abort('failed'):route.continue();});
 await page.route('**/api/**',route=>{const request=route.request(),path=new URL(request.url()).pathname;if(request.method()!=='GET')controls.writes.push(path);
  if(path==='/api/config'){controls.configReads++;return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});}
  if(path==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(path==='/api/refresh')return route.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return route.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(path==='/api/email/templates')return route.fulfill({json:{items:[],nextOffset:null}});
  if(path==='/api/remittances/options')return route.fulfill({json:{accounts:[],accountTypes:[],config:{maxFileBytes:1048576,maxFiles:5,maxTotalFileBytes:5242880}}});
  if(path==='/api/remittances')return route.fulfill({json:{rows:[],total:0,summary:{documents:0,invoices:0,reportedAmount:'0.00',knownReportedAmount:'0.00',unspecifiedAmounts:0,linkedOpen:'0.00',knownLinkedOpen:'0.00',unverifiedInvoices:0}}});
  return route.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });
 await page.goto('/?search=Synthetic%20preserved%20filter');await expect(page.getByRole('heading',{name:'Receivables portfolio',exact:true})).toBeVisible();return controls;
}
const navigation=(page:Page,name:string)=>page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true});
for(const width of [1440,390])test(`a failed lazy module keeps navigation and offers manual recovery ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const controls=await setup(page),before=controls.configReads;
 await navigation(page,'Remittances').click();await expect.poll(()=>controls.modules.length).toBeGreaterThan(0);await expect(page.getByRole('heading',{name:'This page could not be loaded',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Reload workspace',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();expect(controls.configReads).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await navigation(page,'Templates').click();await expect(page.getByLabel('Template name',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'This page could not be loaded',exact:true})).toHaveCount(0);
 await navigation(page,'Portfolio').click();await expect(page.getByRole('heading',{name:'Receivables portfolio',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('search')).toBe('Synthetic preserved filter');
 expect(controls.writes.every(path=>path==='/api/refresh')).toBe(true);
});
test('manual Reload workspace recovers the failed view without automatic retries',async({page})=>{
 const controls=await setup(page),before=controls.configReads;await navigation(page,'Remittances').click();const reload=page.getByRole('button',{name:'Reload workspace',exact:true});await expect(reload).toBeVisible();
 expect(controls.configReads).toBe(before);const failedRequests=controls.modules.length;controls.blockModule=false;
 await reload.click();await expect(page.getByRole('heading',{name:'Remittances',exact:true})).toBeVisible();await expect(page.getByText('No notices match this view',{exact:true})).toBeVisible();
 expect(controls.modules.length).toBeGreaterThan(failedRequests);expect(controls.configReads).toBeGreaterThan(before);expect(controls.navigationLoads).toBe(2);expect(new URL(page.url()).searchParams.get('remittances')).toBe('1');expect(controls.writes.every(path=>path==='/api/refresh')).toBe(true);
});
test('an unsaved template still requires navigation confirmation before a failing lazy load',async({page})=>{
 const controls=await setup(page);await navigation(page,'Templates').click();await page.getByLabel('Template name',{exact:true}).fill('Synthetic unsaved template');
 page.once('dialog',dialog=>dialog.dismiss());await navigation(page,'Remittances').click();await expect(page.getByLabel('Template name',{exact:true})).toHaveValue('Synthetic unsaved template');expect(controls.modules).toEqual([]);
 page.once('dialog',dialog=>dialog.accept());await navigation(page,'Remittances').click();await expect(page.getByRole('heading',{name:'This page could not be loaded',exact:true})).toBeVisible();
 expect(controls.writes.every(path=>path==='/api/refresh')).toBe(true);
});
