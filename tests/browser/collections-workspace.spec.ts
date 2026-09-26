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
 await page.goto('/?code=synthetic-code');await page.getByRole('button',{name:'Collections',exact:true}).click();await expect(page.getByRole('button',{name:'Harbor Travel',exact:true})).toBeVisible();
 return {writes,hotel,rows};
}
for(const [region,width] of [['phuket',1440],['khao-lak',1280],['phuket',390]] as const)test(`${region} ${width}: account-first work, bulk selection and exact document scope`,async({page})=>{
 await page.setViewportSize({width,height:900});const {writes,hotel}=await setup(page,region);
 const views=page.getByRole('navigation',{name:'Collection work views'});
 await expect(views.getByRole('button',{name:/All work/})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByLabel('Queue account',{exact:true})).toBeHidden();
 await expect(page.getByRole('button',{name:'Edit collection rules',exact:true})).toHaveCount(0);
 if(width<=1100)await page.screenshot({path:`evidence/collections-workspace-${region}-${width}-list.png`,fullPage:false});
 await page.getByRole('button',{name:'Harbor Travel',exact:true}).click();
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
 await page.getByRole('button',{name:'Coral Holidays',exact:true}).click();await expect(panel.locator('.queue-selection-footer')).toContainText('0 selected');await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toBeDisabled();
 if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();
 await page.getByRole('button',{name:'Harbor Travel',exact:true}).click();await panel.getByRole('searchbox',{name:'Search selected account invoices'}).fill('First pair');await panel.getByRole('button',{name:'Select all shown',exact:true}).click();await panel.getByRole('button',{name:'Prepare documents',exact:true}).click();
 const prepare=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Prepare documents',exact:true})});await expect(prepare).toContainText('2 selected invoices');await expect(prepare.getByRole('combobox',{name:'Document content',exact:true})).toHaveValue('both');await prepare.getByRole('button',{name:'Create document job',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0]).toMatchObject({hotel,accountId:'harbor',ids:['shared','inv-2'],purpose:'billing',content:'both'});
 await prepare.getByRole('button',{name:'Cancel',exact:true}).click();if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();
 await views.getByRole('button',{name:/On hold/}).click();await page.getByRole('button',{name:'Held Account',exact:true}).click();await expect(panel.getByRole('button',{name:'Prepare documents',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Select all shown',exact:true})).toBeDisabled();if(width<=1100)await panel.getByRole('button',{name:'Close queue details'}).click();await views.getByRole('button',{name:/All work/}).click();
 await page.getByRole('button',{name:'Collection filters',exact:true}).click();await page.getByLabel('Queue timing',{exact:true}).selectOption('Upcoming');await expect(views.getByRole('button',{name:/Upcoming/})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Orchid Agency',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Harbor Travel',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByRole('searchbox',{name:'Search collection queue',exact:true}).fill('does-not-exist');await expect(page.getByText('No work matches these filters',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
for(const [width,height] of [[1440,600],[1280,720]] as const)test(`${width}x${height}: invoice list keeps usable space on short desktop viewports`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,'phuket');await page.getByRole('button',{name:'Harbor Travel',exact:true}).click();
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
for(const [width,height] of [[1440,600],[1280,720],[900,720]] as const)test(`${width}x${height}: work queue expands instead of clipping account rows`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,'phuket');
 const queue=page.getByRole('region',{name:'Prioritized collection work'});
 const geometry=await queue.evaluate(e=>({visible:e.clientHeight,content:e.scrollHeight}));
 expect(geometry.content).toBeLessThanOrEqual(geometry.visible+1);
 await page.getByRole('button',{name:'Orchid Agency',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Orchid Agency',exact:true}).click();
 if(width>1100)await expect(page.getByRole('complementary',{name:'Collection work details'}).locator('.queue-selection-footer')).toBeInViewport({ratio:1});
 else await expect(page.getByRole('dialog',{name:'Collection work details'})).toBeVisible();
 await page.screenshot({path:`evidence/queue-table-room-${width}-${height}.png`,fullPage:false});
});

for(const region of ['phuket','khao-lak'])test(`${region}: workflow changes refresh open work without a manual reload`,async({page})=>{
 const {rows}=await setup(page,region);
 await page.getByRole('searchbox',{name:'Search collection queue',exact:true}).fill('Harbor');
 await page.getByRole('button',{name:'Harbor Travel',exact:true}).click();
 const queue=page.getByRole('region',{name:'Prioritized collection work'});
 await expect(queue).toContainText('Billing');
 rows.filter(r=>r.account_id==='harbor').forEach(r=>{Object.assign(r.workflow!,{first_billing_date:'2026-09-25',due_date:'2026-10-25'});});
 await page.evaluate(()=>{const channel=new BroadcastChannel('ar-invoice-changes');channel.postMessage('changed');channel.close();});
 await expect(queue).not.toContainText('Billing');
 await expect(queue).toContainText('Upcoming');
 await expect(page.getByRole('searchbox',{name:'Search collection queue',exact:true})).toHaveValue('Harbor');
});
