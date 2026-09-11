import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';
const today='2026-09-11',at='2026-09-11T04:25:00Z';
const accounts=[{hotel:'KAT',id:'SYN-A',name:'Azure Travel · Synthetic',type:'Agent',open:1700,over90:1000,items:2},{hotel:'TSK',id:'SYN-A',name:'Azure Travel · Synthetic',type:'Agent',open:500,over90:0,items:1}];
const base={account_id:'SYN-A',account_name:'Azure Travel · Synthetic',account_type:'Agent',guest:'Synthetic guest',invoice_no:'INV-1',folio_no:'FOL-1',open:1000,collection_role:'standalone',collection_selectable:true,verification_state:'verified',transaction_date:'2026-08-01',exception_status:'available'};
const workflow={revision:1,billing_required:false,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:'2026-09-10'};
const queue=[{...base,id:'1',hotel:'KAT',workflow:{...workflow,last_reminder_stage:'Final',last_reminder_date:today}},{...base,id:'2',hotel:'KAT',workflow:{...workflow,billing_required:true,due_date:null}},{...base,id:'1',hotel:'TSK',open:500,workflow}];
async function setup(page:Page,options:{paymentsFail?:boolean;incomplete?:boolean;neverRefreshed?:boolean;queueInvalid?:boolean}={}){
 const calls:{path:string;method:string;query:URLSearchParams;body:unknown}[]=[],unexpected:string[]=[];let failPayments=options.paymentsFail,publishedAt=at,netAdjustment=0;
 // Visible fixture provenance is test-only; production UI continues to report its actual source state.
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('aside');badge.textContent='SYNTHETIC TEST DATA';badge.setAttribute('aria-label','Synthetic test data');badge.style.cssText='font:600 11px/1.4 sans-serif;padding:6px 12px;margin:0 0 8px;border:1px solid #b9c9da;border-radius:8px;color:#10253f;background:white';document.body.insertBefore(badge,document.body.firstChild);}));
 await page.clock.setFixedTime(new Date('2026-09-11T04:30:00Z'));
 const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:at};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 page.on('pageerror',e=>unexpected.push('Page error: '+e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname,q=u.searchParams;calls.push({path:p,method:req.method(),query:q,body:req.postData()?req.postDataJSON():null});
  const scoped=accounts.filter(a=>(!q.get('hotel')||a.hotel===q.get('hotel'))&&(!q.get('account')||a.id===q.get('account'))&&(!q.get('type')||a.type===q.get('type')));
  const refresh={running:false,hotels:['KAT','TSK'].map(h=>({hotel:h,status:'succeeded',last_success_at:options.neverRefreshed?null:publishedAt}))};
  if(p==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(p==='/api/portfolio')return route.fulfill({json:{status:'connected',accounts,refresh}});
  if(p==='/api/refresh')return route.fulfill({json:refresh});
  if(p==='/api/reports/options')return route.fulfill({json:{rows:scoped.map(a=>({hotel:a.hotel,account_id:a.id,account_name:a.name,account_type:a.type})),total:scoped.length}});
  if(p==='/api/reports/current')return route.fulfill({json:{rows:[],total:3,summary:{invoices:3,amount:2500,unverified:0,hotels:options.neverRefreshed?[]:scoped.map(a=>({hotel:a.hotel,accounts:1,open:a.open+(a.hotel==='KAT'?netAdjustment:0),over90:a.over90,oldest_sync:publishedAt,unverified_accounts:0}))}}});
  if(p==='/api/reports/activity'){
   const kinds=q.get('from')===today?[{kind:'First billing',invoices:1,amount:100},{kind:'Rebilling',invoices:1,amount:50},{kind:'Follow 1',invoices:2,amount:500}]:[];
   return route.fulfill({json:{rows:[],total:0,summary:{invoices:4,messages:3,missingAmounts:0,kinds,uniqueInvoices:3,daily:[]}}});
  }
  if(p==='/api/external-billing')return route.fulfill({json:{rows:[],total:0,summary:q.get('from')===today?{records:2,invoices:3,firstBillingInvoices:2,amount:'500.00',unknownAmounts:0}:{records:0,invoices:0,firstBillingInvoices:0,amount:'0.00',unknownAmounts:0}}});
  if(p==='/api/collection-queue')return route.fulfill({json:{rows:options.queueInvalid?[queue[0],queue[0]]:queue}});
  if(p==='/api/mail-reconciliation')return route.fulfill({json:{enabled:false,waiting:0,needsReview:0,last:null}});
  if(p==='/api/financial/status')return route.fulfill({json:{enabled:false,running:false,runs:[]}});
  if(p==='/api/financial/options')return route.fulfill({json:{rows:scoped.map(a=>({hotel:a.hotel,accountId:a.id,name:a.name,type:a.type,accountNo:'SYN-01'})),total:scoped.length,summary:{},coverage:{complete:true}}});
  if(p==='/api/financial/payments'&&failPayments){return route.fulfill({status:503,json:{error:'financial_unavailable'}});}
  if(p==='/api/financial/payments'||p==='/api/financial/invoice_entries')return route.fulfill({json:{view:p.split('/').at(-1),rows:[],total:0,summary:{invoiceCount:q.get('from')===today?3:2,paymentCount:2,amount:'750.00',unknownAmounts:0,notObserved:0,paymentTotals:{creditPostings:'1000.00',currentlyApplied:'600.00',currentlyUnallocated:'400.00',debitPostings:'0.00',transferRows:0,unknownTransferRows:0}},coverage:{complete:!options.incomplete,from:q.get('from'),to:q.get('to'),lastSuccessAt:at,lastAttemptStatus:'succeeded',lastError:null}}});
  if(p==='/api/remittances')return route.fulfill({json:{rows:[],total:0,summary:{documents:1,invoices:3,reportedAmount:'600.00',knownReportedAmount:'600.00',unspecifiedAmounts:0,linkedOpen:'500.00',knownLinkedOpen:'500.00',unverifiedInvoices:0}}});
  if(p==='/api/remittances/options')return route.fulfill({json:{accounts:accounts.map(a=>({hotel:a.hotel,accountId:a.id,name:a.name,type:a.type,accountNo:'SYN-01',verified:true})),config:{maxFileBytes:10485760,maxFiles:50,maxTotalFileBytes:104857600}}});
  unexpected.push(req.method()+' '+p);return route.fulfill({status:501,json:{error:'unexpected_synthetic_request'}});
 });return {calls,unexpected,allowPayments:()=>{failPayments=false;},publishSource:()=>{publishedAt='2026-09-11T04:29:00Z';netAdjustment=100;}};
}
for(const width of [1440,1280,390])test(`dashboard ${width}: daily activity, current work and full source links`,async({page})=>{
 const {calls,unexpected}=await setup(page);await page.setViewportSize({width,height:width===390?844:width===1280?800:900});await page.goto('/?dashboard=1');
 await expect(page.getByTestId('dashboard-billed')).toHaveText('3');await expect(page.getByTestId('dashboard-followups')).toHaveText('2');await expect(page.getByTestId('dashboard-payments')).toHaveText('฿1,000.00');await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿2,200.00');await expect(page.getByTestId('dashboard-work-urgent')).toHaveText('1');await expect(page.getByTestId('dashboard-work-billing')).toHaveText('1');await expect(page.getByTestId('dashboard-work-collection')).toHaveText('1');await expect(page.getByTestId('dashboard-remittances')).toHaveText('1');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`evidence/dashboard-${width}.png`,fullPage:false,animations:'disabled'});await page.screenshot({path:`.tmp/dashboard-${width}-full.png`,fullPage:true,animations:'disabled'});
 expect(calls.filter(c=>c.method!=='GET')).toMatchObject([{path:'/api/refresh',body:{reason:'open'}}]);expect(unexpected).toEqual([]);
});
test('selecting a previous day changes activity, keeps current work, and blank dates are editable',async({page})=>{
 const {calls}=await setup(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-billed')).toHaveText('3');await page.getByLabel('Activity date · Thailand').fill('2026-09-10');await expect(page.getByTestId('dashboard-entries')).toHaveText('2');await expect(page.getByTestId('dashboard-billed')).toHaveText('0');await expect(page.getByTestId('dashboard-work-urgent')).toHaveText('1');
 await page.getByLabel('Activity date · Thailand').fill('');await expect(page.getByRole('alert')).toContainText('Choose a valid activity date');await expect(page.getByTestId('dashboard-payments')).toHaveText('—');await page.getByLabel('Activity date · Thailand').fill(today);await expect(page.getByTestId('dashboard-billed')).toHaveText('3');expect(calls.filter(c=>c.path==='/api/financial/payments').every(c=>c.query.get('from')&&c.query.get('from')===c.query.get('to'))).toBe(true);
});
test('same Account ID across hotels never mixes filters; payment drilldown and back retain the original scope',async({page})=>{
 const {calls,unexpected}=await setup(page);await page.goto('/?dashboard=1');await page.getByLabel('Account type',{exact:true}).selectOption('Agent');await page.getByLabel('Account',{exact:true}).selectOption('["KAT","SYN-A"]');await page.getByLabel('Activity date · Thailand').fill('2026-09-10');await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿1,700.00');
 await page.getByRole('link',{name:'View payment evidence',exact:true}).click();await expect(page.getByRole('heading',{name:'OPERA financial history',exact:true})).toBeVisible();await expect(page.getByLabel('From · OPERA payment date',{exact:true})).toHaveValue('2026-09-10');await expect(page.getByLabel('Account',{exact:true})).toHaveValue('["KAT","SYN-A"]');
 await page.getByRole('link',{name:'Back to Dashboard',exact:true}).click();await expect(page.getByLabel('Activity date · Thailand')).toHaveValue('2026-09-10');await expect(page.getByLabel('Account',{exact:true})).toHaveValue('["KAT","SYN-A"]');await expect(page.getByRole('button',{name:'All Hotels',exact:true})).toHaveClass(/active/);
 await page.getByRole('button',{name:'TSK',exact:true}).click();await expect(page.getByLabel('Account',{exact:true})).toHaveValue('');await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿500.00');expect(calls.filter(c=>c.path==='/api/financial/payments'&&c.query.get('account')).every(c=>c.query.get('hotel')==='KAT')).toBe(true);expect(unexpected).toEqual([]);
});
test('follow-up stage links preserve the exact stage and selected date',async({page})=>{
 const {calls}=await setup(page);await page.goto('/?dashboard=1');await page.getByRole('link',{name:'Follow-up 1',exact:true}).click();await expect(page.getByRole('heading',{name:'Reports & Activity',exact:true})).toBeVisible();await expect.poll(()=>calls.some(c=>c.path==='/api/reports/activity'&&c.query.get('kind')==='Follow 1'&&c.query.get('from')===today&&c.query.get('to')===today)).toBe(true);
});
test('external billing drilldown carries the date and exact account',async({page})=>{
 const {calls}=await setup(page);await page.goto('/?dashboard=1&hotel=KAT&dashboardDay=2026-09-10&dashboardAccount=%5B%22KAT%22%2C%22SYN-A%22%5D');await page.getByRole('link',{name:'Open external billing evidence',exact:true}).click();await expect(page.getByRole('heading',{name:'External billing activity',exact:true})).toBeVisible();await expect.poll(()=>calls.some(c=>c.path==='/api/external-billing'&&c.query.get('hotel')==='KAT'&&c.query.get('account')==='SYN-A'&&c.query.get('from')==='2026-09-10')).toBe(true);
});
test('a failed payment source does not hide working sections or display a fake zero',async({page})=>{
 const {allowPayments}=await setup(page,{paymentsFail:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-payments')).toHaveText('—');await expect(page.getByText('Unavailable · reload to retry',{exact:true})).toBeVisible();await expect(page.getByTestId('dashboard-billed')).toHaveText('3');allowPayments();await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();await expect(page.getByTestId('dashboard-payments')).toHaveText('฿1,000.00');
});
test('incomplete date coverage and a never-refreshed hotel cannot become confirmed zero totals',async({page})=>{
 await setup(page,{incomplete:true,neverRefreshed:true});await page.goto('/?dashboard=1');await expect(page.getByText('Coverage incomplete · open financial history').first()).toBeVisible();await expect(page.getByTestId('dashboard-payments')).toHaveText('—');await expect(page.getByTestId('dashboard-entries')).toHaveText('—');await expect(page.getByTestId('dashboard-net-open')).toHaveText('—');
});
test('duplicate source invoice rows fail the queue section without crashing the dashboard',async({page})=>{
 const {unexpected}=await setup(page,{queueInvalid:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-work-urgent')).toHaveText('—');await expect(page.getByTestId('dashboard-billed')).toHaveText('3');expect(unexpected).toEqual([]);
});
test('mobile keeps measurements in the first viewport and account filters usable in their disclosure',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-billed')).toHaveText('3');
 const metric=await page.getByTestId('dashboard-billed').boundingBox();expect(metric).not.toBeNull();expect(metric!.y+metric!.height).toBeLessThanOrEqual(844);
 await expect(page.getByLabel('Account',{exact:true})).not.toBeVisible();await page.getByText('Account filters',{exact:true}).click();await page.getByLabel('Account',{exact:true}).selectOption('["TSK","SYN-A"]');await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿500.00');await expect(page.getByRole('button',{name:'Reload dashboard',exact:true})).toBeVisible();
});
test('a newly published OPERA snapshot refreshes dashboard summaries without a second manual reload',async({page})=>{
 const {publishSource}=await setup(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿2,200.00');publishSource();await page.getByRole('button',{name:'Reload saved data',exact:true}).click();await expect(page.getByTestId('dashboard-net-open')).toHaveText('฿2,300.00');
});
