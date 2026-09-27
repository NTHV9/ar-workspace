import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';
import {calendarAdd} from '../../src/domain/collection';
const today='2026-09-26',stamp='2026-09-26T03:00:00Z';
const user={id:'00000000-0000-4000-8000-000000000001',email:'staff@example.com',aud:'authenticated',role:'authenticated',app_metadata:{providers:['google']},user_metadata:{},created_at:stamp};
async function setup(page:Page,region:string){
 await page.clock.setFixedTime(new Date(stamp));const hotel=region==='phuket'?'KAT':'TLKL';const writes:Record<string,unknown>[]=[];
 const row=(account:string,name:string,n:number,stage:string|null=null,extra:Record<string,unknown>={})=>({hotel,account_id:account,account_name:name,account_type:'Travel Agent',id:n===1?'shared':'inv-'+n,invoice_no:account.toUpperCase()+'-'+(100+n),folio_no:'F-'+n,guest:n<=2?'First pair':'Guest '+n,open:n===1?100.25:n===2?200.25:250,transaction_date:calendarAdd(today,-30),collection_role:'standalone',collection_selectable:true,verification_state:'verified',workflow:{revision:1,billing_required:account==='harbor',credit_term:30,first_billing_date:null,last_reminder_stage:stage,last_reminder_date:stage?calendarAdd(today,-10):null,due_date:calendarAdd(today,-2)},...extra});
 const rows=[...Array.from({length:24},(_,i)=>row('harbor','Harbor Travel',i+1)),row('coral','Coral Holidays',1),row('palm','Palm Tours',1,'Final'),row('orchid','Orchid Agency',1,null,{workflow:{revision:1,billing_required:false,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:calendarAdd(today,20)}}),row('review','Review Account',1,null,{verification_state:'unverified',collection_selectable:false}),row('hold','Held Account',1,null,{exceptions:{held:true,needsReview:false,dispute:'',reopenedAt:null}}),row('setup','Setup Account',1,null,{workflow:null})];
 const accounts=[...new Set(rows.map(r=>r.account_id))].map(id=>{const own=rows.filter(r=>r.account_id===id);return {id,hotel,name:own[0].account_name,type:'Travel Agent',open:own.reduce((n,r)=>n+r.open,0),over90:0,items:own.length,synced_at:stamp,verification_state:'verified'};});
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user}}));
 await page.route('**/api/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic',googleEnabled:true}});
  if(p==='/api/access/me')return r.fulfill({json:{memberId:user.id,email:user.email,displayName:'Synthetic Staff',active:true,administrator:false,regions:[region],revision:1}});
  if(p==='/api/portfolio')return r.fulfill({json:{accounts,status:'connected',refresh:{running:false,hotels:[{hotel,status:'succeeded',last_success_at:stamp}]}}});
  if(p==='/api/refresh')return r.fulfill({json:{running:false,hotels:[{hotel,status:'succeeded',last_success_at:stamp}]}});
  if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/collection-queue')return r.fulfill({json:{rows}});
  if(p==='/api/documents'&&r.request().method()==='POST'){writes.push(r.request().postDataJSON());return r.fulfill({status:503,json:{error:'synthetic_stop_after_selection'}});}
  return r.fulfill({json:{rows:[],total:0}});
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key+'-code-verifier',JSON.stringify('synthetic-code-verifier'));});
 await page.goto('/?code=synthetic-code');await page.getByRole('button',{name:'Collections',exact:true}).click();await expect(page.getByRole('button',{name:/account Harbor Travel$/})).toBeVisible();
 return {writes,hotel,rows};
}
for(const [region,width] of [['phuket',1440],['khao-lak',1280],['phuket',390]] as const)test(`${region} ${width}: account-first work, bulk selection and exact document scope`,async({page})=>{
 await page.setViewportSize({width,height:900});const {writes,hotel}=await setup(page,region);
 const views=page.getByRole('navigation',{name:'Collection work views'});
 await expect(views.getByRole('button',{name:/All work/})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByLabel('Queue account',{exact:true})).toBeHidden();
 await expect(page.getByRole('button',{name:'Edit collection rules',exact:true})).toHaveCount(0);
 if(width<=1100)await page.screenshot({path:`evidence/collections-workspace-${region}-${width}-list.png`,fullPage:false});
 await page.getByRole('button',{name:/account Harbor Travel$/}).click();
 const panel=page.getByRole(width<=1100?'dialog':'complementary',{name:'Collection work details',exact:true});
 await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toBeDisabled();
 await panel.getByRole('searchbox',{name:'Search selected account invoices'}).fill('HARBOR-101');await panel.getByRole('button',{name:'Select all shown',exact:true}).click();await expect(panel.locator('.queue-selection-footer')).toContainText('1 selected');
 await panel.getByRole('searchbox',{name:'Search selected account invoices'}).fill('First pair');await panel.getByRole('button',{name:'Select all shown',exact:true}).click();await expect(panel.locator('.queue-selection-footer')).toContainText('THB 300.50');
 await panel.getByRole('searchbox',{name:'Search selected account invoices'}).fill('');
 if(width<=1100){const amount=await panel.locator('.queue-detail-context strong').boundingBox();const close=await panel.getByRole('button',{name:'Close queue details'}).boundingBox();expect(amount!.x+amount!.width).toBeLessThanOrEqual(close!.x);}
 await panel.locator('.queue-selection-footer').scrollIntoViewIfNeeded();
 await page.screenshot({path:`evidence/collections-workspace-${region}-${width}.png`,fullPage:false});
 const footer=await panel.locator('.queue-selection-footer').boundingBox();const bounds=await panel.boundingBox();expect(footer!.y+footer!.height).toBeLessThanOrEqual(bounds!.y+bounds!.height+1);expect(footer!.y+footer!.height).toBeLessThanOrEqual(900);
 if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();
 await page.getByRole('button',{name:/account Coral Holidays$/}).click();await expect(panel.locator('.queue-selection-footer')).toContainText('0 selected');await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toBeDisabled();
 if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();
 await page.getByRole('button',{name:/account Harbor Travel$/}).click();await panel.getByRole('searchbox',{name:'Search selected account invoices'}).fill('First pair');await panel.getByRole('button',{name:'Select all shown',exact:true}).click();await panel.getByRole('button',{name:'Prepare documents',exact:true}).click();
 const prepare=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Prepare documents',exact:true})});await expect(prepare).toContainText('2 selected invoices');await expect(prepare.getByRole('combobox',{name:'Document content',exact:true})).toHaveValue('both');await prepare.getByRole('button',{name:'Create document job',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0]).toMatchObject({hotel,accountId:'harbor',ids:['shared','inv-2'],purpose:'billing',content:'both'});
 await prepare.getByRole('button',{name:'Cancel',exact:true}).click();if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();
 await views.locator('.queue-more-views summary').click();await views.getByRole('button',{name:/On hold/}).click();await page.getByRole('button',{name:/account Held Account$/}).click();await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Select all shown',exact:true})).toBeDisabled();if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();await views.getByRole('button',{name:/All work/}).click();
 await page.getByRole('button',{name:'Collection filters',exact:true}).click();await page.getByLabel('Queue timing',{exact:true}).selectOption('Upcoming');await expect(views.locator('.queue-more-views summary')).toContainText('Upcoming');await expect(page.getByRole('button',{name:/account Orchid Agency$/})).toBeVisible();await expect(page.getByRole('button',{name:/account Harbor Travel$/})).toHaveCount(0);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByRole('searchbox',{name:'Search collection queue',exact:true}).fill('does-not-exist');await expect(page.getByText('No work matches these filters',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
for(const [width,height] of [[1440,600],[1280,720]] as const)test(`${width}x${height}: invoice list keeps usable space on short desktop viewports`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,'phuket');await page.getByRole('button',{name:/account Harbor Travel$/}).click();
 const panel=page.getByRole('complementary',{name:'Collection work details',exact:true});
 const list=panel.getByRole('group',{name:'Invoices in selected work'});
 const box=await list.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(240);
 await panel.getByLabel('Queue select HARBOR-101',{exact:true}).check();
 await panel.getByLabel('Queue select HARBOR-102',{exact:true}).check();
 await expect(panel.locator('.queue-selection-footer')).toContainText('THB 300.50');
 const currentList=await list.boundingBox();const footer=await panel.locator('.queue-selection-footer').boundingBox();expect(currentList!.y+currentList!.height).toBeLessThanOrEqual(footer!.y+1);
 await panel.getByRole('button',{name:'Prepare documents',exact:true}).scrollIntoViewIfNeeded();await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toBeInViewport();
 await page.screenshot({path:`evidence/queue-invoice-room-${width}-${height}.png`,fullPage:false});
});
for(const [region,width,height] of [['phuket',1440,1000],['khao-lak',1280,900],['phuket',1440,600]] as const)test(`${region} ${width}x${height}: Accounts scroll independently without moving invoices`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,region);
 const queue=page.getByRole('region',{name:'Prioritized collection work'}),panel=page.getByRole('complementary',{name:'Collection work details'}),header=page.locator('.queue-work>header');
 await page.locator('.queue-work').scrollIntoViewIfNeeded();
 const initialPageY=await page.evaluate(()=>scrollY);
 await expect.poll(()=>queue.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(100);
 const initialPanel=await panel.boundingBox(),initialHeader=await header.boundingBox();
 const bounds=await queue.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(height);
 await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+30);await page.mouse.wheel(0,250);
 await expect.poll(()=>queue.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>scrollY)).toBe(initialPageY);expect((await panel.boundingBox())!.y).toBe(initialPanel!.y);expect((await header.boundingBox())!.y).toBe(initialHeader!.y);
 await page.mouse.wheel(0,10000);await expect.poll(()=>queue.evaluate(e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop))).toBeLessThanOrEqual(1);
 // A further wheel at the boundary must not chain to the document.
 await page.mouse.wheel(0,500);await page.waitForTimeout(200);expect(await page.evaluate(()=>scrollY)).toBe(initialPageY);
 const last=queue.getByRole('button',{name:/account Orchid Agency$/});await expect(last).toBeInViewport({ratio:1});await last.click();
 await expect(panel.getByRole('heading',{name:'Orchid Agency',exact:true})).toBeVisible();await expect(panel.getByRole('group',{name:'Invoices in selected work'})).toContainText('ORCHID-101');
 await page.screenshot({path:`.tmp/accounts-panel-scroll/accounts-${region}-${width}-${height}.png`,fullPage:false});
 await queue.focus();await page.keyboard.press('Home');await expect.poll(()=>queue.evaluate(e=>e.scrollTop)).toBe(0);
 await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+30);await page.mouse.wheel(0,-500);await page.waitForTimeout(200);expect(await page.evaluate(()=>scrollY)).toBe(initialPageY);
});
test('compact Accounts retain page scrolling and open the invoice dialog',async({page})=>{
 await page.setViewportSize({width:900,height:720});await setup(page,'phuket');
 const queue=page.getByRole('region',{name:'Prioritized collection work'});expect(await queue.evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
 await page.getByRole('button',{name:/account Orchid Agency$/}).click();await expect(page.getByRole('dialog',{name:'Collection work details'})).toBeVisible();
});

for(const [region,width] of [['phuket',1440],['khao-lak',1280]] as const)test(`${region}: Accounts retain full workbench height with Billing filters`,async({page})=>{
 await page.setViewportSize({width,height:900});const {rows}=await setup(page,region);
 rows.push(...Array.from({length:30},(_,i)=>({...rows[0],account_id:'agency-'+i,account_name:`Travel Company ${i+1}`,id:'agency-invoice-'+i,invoice_no:'AG-'+(i+100)})));
 await page.getByRole('button',{name:'Reload queue',exact:true}).click();
 await page.getByRole('navigation',{name:'Collection work views'}).getByRole('button',{name:/Billing due/}).click();
 await page.getByRole('button',{name:/account Harbor Travel$/}).click();
 const accounts=page.locator('.queue-work'),invoices=page.getByRole('complementary',{name:'Collection work details'}),list=page.getByRole('region',{name:'Prioritized collection work'});
 await expect(accounts.getByRole('searchbox',{name:'Search collection queue'})).toBeVisible();
 await expect.poll(async()=>Math.abs((await accounts.boundingBox())!.height-(await invoices.boundingBox())!.height)).toBeLessThanOrEqual(1);
 const listBox=await list.boundingBox();expect(listBox!.height).toBeGreaterThan(300);
 expect((await accounts.boundingBox())!.width).toBeGreaterThan(380);
 await page.getByRole('button',{name:'Collection filters',exact:true}).click();await expect(page.getByLabel('Queue timing',{exact:true})).toBeVisible();
 expect((await list.boundingBox())!.height).toBe(listBox!.height);
 await page.getByLabel('Queue timing',{exact:true}).press('Escape');await expect(page.getByLabel('Queue timing',{exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Collection filters',exact:true})).toBeFocused();
 await invoices.getByLabel('Queue select HARBOR-101',{exact:true}).check();
 await page.screenshot({path:`.tmp/collections-visual-polish/billing-${region}-${width}.png`,fullPage:true});
});

for(const region of ['phuket','khao-lak'])test(`${region}: workflow changes refresh open work without a manual reload`,async({page})=>{
 const {rows}=await setup(page,region);const search=region==='phuket'?'':'Harbor';
 await page.getByRole('searchbox',{name:'Search collection queue',exact:true}).fill(search);
 await page.getByRole('button',{name:/account Harbor Travel$/}).click();
 const queue=page.getByRole('region',{name:'Prioritized collection work'});
 await expect(queue).toContainText('Billing');
 const panel=page.getByRole('complementary',{name:'Collection work details'});await panel.getByLabel('Queue select HARBOR-101',{exact:true}).check();
 rows.filter(r=>r.account_id==='harbor').forEach(r=>{Object.assign(r.workflow!,{first_billing_date:'2026-09-25',due_date:'2026-10-25'});});
 await page.evaluate(()=>{const channel=new BroadcastChannel('ar-invoice-changes');channel.postMessage('changed');channel.close();});
 await expect(queue).not.toContainText('Billing');
 await expect(queue).toContainText('Upcoming');
 await expect(page.getByRole('searchbox',{name:'Search collection queue',exact:true})).toHaveValue(search);
 await expect(panel.getByRole('heading',{name:'Harbor Travel',exact:true})).toBeVisible();await expect(panel.locator('.queue-selection-footer')).toContainText('0 selected');
});

test('one account can switch work stages without carrying invoice selection across stages',async({page})=>{
 const {rows,writes}=await setup(page,'phuket');Object.assign(rows[0].workflow!,{first_billing_date:'2026-08-01',last_reminder_stage:'Friendly',last_reminder_date:'2026-09-16'});await page.getByRole('button',{name:'Reload queue',exact:true}).click();
 const account=page.getByRole('button',{name:/account Harbor Travel$/});await expect(account).toHaveCount(1);await account.click();const stages=page.getByRole('navigation',{name:'Work stages for selected account'});
 await stages.getByRole('button',{name:/Billing/}).click();await page.getByLabel('Queue select HARBOR-102',{exact:true}).check();await expect(page.locator('.queue-selection-footer')).toContainText('1 selected');
 await stages.getByRole('button',{name:/Follow-up 1/}).click();await expect(page.locator('.queue-selection-footer')).toContainText('0 selected');await expect(page.getByLabel('Queue select HARBOR-102',{exact:true})).toHaveCount(0);await page.getByLabel('Queue select HARBOR-101',{exact:true}).check();
 await page.getByRole('button',{name:'Prepare documents',exact:true}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Prepare documents',exact:true})});await dialog.getByRole('button',{name:'Create document job',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0]).toMatchObject({hotel:'KAT',accountId:'harbor',ids:['shared'],purpose:'collection'});
});
test('invoice workbench shows precise amounts and lets staff review only selected rows',async({page})=>{
 await setup(page,'phuket');await page.getByRole('button',{name:/account Harbor Travel$/}).click();const panel=page.getByRole('complementary',{name:'Collection work details'}),list=panel.getByRole('group',{name:'Invoices in selected work'});
 await expect(list).toContainText('100.25');await expect(list).toContainText('200.25');await panel.getByLabel('Queue select HARBOR-101',{exact:true}).check();await panel.getByLabel('Queue select HARBOR-102',{exact:true}).check();await panel.getByRole('button',{name:'Selected 2',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(2);await expect(panel.locator('.queue-selection-footer')).toContainText('THB 300.50');
 const bounds=await panel.boundingBox();expect(bounds!.width).toBeGreaterThan(700);expect(await list.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.evaluate(()=>window.scrollTo(0,0));await expect(panel.locator('.queue-selection-footer')).toBeInViewport({ratio:1});await page.screenshot({path:'.tmp/collections-redesign/selected-invoices.png',fullPage:false});
});

for(const [region,width,height] of [['phuket',1440,1000],['khao-lak',1280,900],['phuket',390,844]] as const)test(`collections redesign capture ${region} ${width}`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,region);await page.getByRole('button',{name:/account Harbor Travel$/}).click();
 const panel=page.getByRole(width<=1100?'dialog':'complementary',{name:'Collection work details'});await panel.getByLabel('Queue select HARBOR-101',{exact:true}).check();await panel.getByLabel('Queue select HARBOR-102',{exact:true}).check();
 if(width>1100){await page.evaluate(()=>window.scrollTo(0,0));await expect(panel.locator('.queue-selection-footer')).toBeInViewport({ratio:1});}await page.screenshot({path:`.tmp/collections-redesign/collections-${region}-${width}.png`,fullPage:width>1100});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const table=panel.getByRole('group',{name:'Invoices in selected work'});expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 if(width<=1100){await panel.getByRole('button',{name:'Close queue details'}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.tmp/collections-redesign/accounts-mobile.png',fullPage:true});}
});
