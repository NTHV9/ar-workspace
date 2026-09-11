import {test,expect,type Page} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
async function setup(page:Page,{failure=false,complete=true}={}){
 const requests:{path:string;method:string;body:unknown}[]=[];await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('aside');badge.textContent='SYNTHETIC TEST DATA';badge.style.cssText='padding:8px 16px;color:#10253f;background:white;font:600 12px sans-serif';document.body.insertBefore(badge,document.body.firstChild);}));
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',r=>{const req=r.request(),u=new URL(req.url()),path=u.pathname;requests.push({path:path+u.search,method:req.method(),body:req.method()==='POST'?req.postDataJSON():null});
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});if(path==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});if(path==='/api/portfolio')return r.fulfill({json:{accounts:[],status:'connected',refresh:{running:false,hotels:[]}}});if(path==='/api/collection-policy')return r.fulfill({status:503,json:{error:'policy_unavailable'}});
  if(path==='/api/financial/status')return r.fulfill({json:{enabled:true,running:false,runs:[]}});if(path==='/api/financial/refresh')return r.fulfill({json:{status:'succeeded',created:false}});
  if(path==='/api/financial/options')return r.fulfill({json:{rows:[{hotel:'KAT',accountId:'A',name:'Synthetic Financial Account',type:'Agent',accountNo:'SYN-A'}],total:1}});
  if(path.startsWith('/api/financial/')){
   if(failure)return r.fulfill({status:503,json:{error:'financial_unavailable'}});
   const view=path.split('/').at(-1),row={hotel:'KAT',accountId:'A',accountName:'Synthetic Financial Account',accountType:'Agent',accountNo:'SYN-A',sourceStatus:'observed',firstObservedAt:'2026-09-10T12:00:00Z',lastObservedAt:'2026-09-10T12:00:00Z',lastCheckedAt:'2026-09-10T12:00:00Z',transactionId:'301',transactionDate:'2026-09-10',invoiceTransactionId:'101',paymentTransactionId:'301',invoiceTransactionDate:'2026-09-10',invoiceNo:'INV-101',folioNo:'FOL-201',amount:'-1000.00',appliedAmount:view==='payments'?'-600.00':'600.00',unallocatedAmount:'-400.00',originalAmount:'1000.00',openAmount:'400.00',collectionRole:'standalone',entryClassification:'invoice',transfer:'none_reported',transactionCode:'SYN-PAY',applicationDate:null};
   return r.fulfill({json:{view,rows:complete?[row]:[],total:complete?51:0,coverage:{complete,lastSuccessAt:complete?'2026-09-10T12:00:00Z':null,from:'2026-08-11',to:'2026-09-10'},summary:{invoiceCount:1,paymentCount:1,knownAmount:'1000.00',amount:complete?'1000.00':null,unknownAmounts:0,notObserved:0,compressedChildren:0,openingBalances:0,credits:0,paymentTotals:{creditPostings:complete?'1000.00':null,debitPostings:complete?'0.00':null,currentlyApplied:complete?'600.00':null,currentlyUnallocated:complete?'400.00':null,transferRows:0,unknownTransferRows:0}}}});
  }
  return r.fulfill({status:501,json:{error:'unmocked_test_endpoint'}});
 });return requests;
}
for(const [width,height] of [[1440,900],[1280,800],[390,844]])test(`financial history ${width}: independent payment and application amounts`,async({page})=>{await page.setViewportSize({width,height});const requests=await setup(page);await page.goto('/?financial=1&hotel=KAT');await expect(page.getByRole('heading',{name:'OPERA financial history',exact:true})).toBeVisible();await expect(page.locator('.financial-metrics')).toContainText('฿1,000.00');await expect(page.locator('.financial-metrics')).toContainText('฿600.00');await expect(page.locator('.financial-metrics')).toContainText('฿400.00');await expect(page.getByRole('region',{name:'Financial source records'})).toContainText('-฿1,000.00');await page.screenshot({path:`evidence/financial-payments-${width}.png`});await page.getByRole('button',{name:'Invoice applications',exact:true}).click();await expect(page.getByText('These are current applications for invoices dated in this range.',{exact:false})).toBeVisible();await expect(page.getByRole('region',{name:'Financial source records'})).toContainText('Application date not supplied');await page.getByRole('button',{name:'Next financial page',exact:true}).click();await expect.poll(()=>requests.some(r=>r.path.includes('/applications?')&&r.path.includes('page=1'))).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(requests.filter(r=>r.method==='POST').every(r=>r.path==='/api/refresh'||r.path==='/api/financial/refresh')).toBe(true);});
test('missing financial coverage never displays a confirmed zero total',async({page})=>{await setup(page,{complete:false});await page.goto('/?financial=1');await expect(page.getByText('Coverage is incomplete for this range.',{exact:false})).toBeVisible();await expect(page.locator('.financial-metrics strong').first()).toHaveText('—');await expect(page.getByText('No verified financial history is available for this range yet.',{exact:true})).toBeVisible();});
test('financial API failure is not an empty day',async({page})=>{await setup(page,{failure:true});await page.goto('/?financial=1');await expect(page.getByRole('alert')).toContainText('Financial history is unavailable');await expect(page.getByText('No source records match this range.',{exact:true})).toHaveCount(0);});

test('the selected August range shows queued hotels separately from another running period',async({page})=>{
 const requests=await setup(page,{complete:false});
 const run=(id:string,hotel:string,from:string,to:string,status:string)=>({id,hotel,from,to,status,accounts:status==='running'?100:0,finishedAt:null,error:null});
 await page.route('**/api/financial/status',r=>r.fulfill({json:{enabled:true,running:true,runs:[run('aug-t','TSK','2026-08-01','2026-08-31','queued'),run('aug-k','KAT','2026-08-01','2026-08-31','queued'),run('old-k','KAT','2026-08-12','2026-09-11','running')]}}));
 await page.goto('/?financial=1');await expect(page.locator('.financial-metrics strong').first()).toHaveText('—');
 await page.getByLabel('From · OPERA payment date').fill('2026-08-01');await page.getByLabel('Through · OPERA payment date').fill('2026-08-31');
 const status=page.getByRole('region',{name:'Refresh for selected dates'});
 await expect(status).toContainText('2026-08-01 → 2026-08-31',{timeout:1000});
 await expect(status).toContainText('KAT · Queued');await expect(status).toContainText('TSK · Queued');
 await expect(page.getByRole('button',{name:'Selected range already queued or running'})).toBeDisabled();
 await expect(page.getByText('Other periods are also queued or running.',{exact:false})).toBeVisible();
 await page.screenshot({path:'evidence/financial-range-queued-1440.png',animations:'disabled'});
 await page.getByLabel('From · OPERA payment date').fill('2026-07-01');await page.getByLabel('Through · OPERA payment date').fill('2026-07-31');
 await expect(status).toContainText('No matching request in recent history');
 await page.getByRole('button',{name:'Refresh date range from OPERA',exact:true}).click();
 await expect.poll(()=>requests.filter(r=>r.method==='POST'&&(r.body as {reason?:string})?.reason==='backfill').map(r=>r.body)).toEqual([
  expect.objectContaining({hotel:'KAT',from:'2026-07-01',to:'2026-07-31'}),expect.objectContaining({hotel:'TSK',from:'2026-07-01',to:'2026-07-31'})
 ]);
 await expect(page.getByText('History refresh requested for 2026-07-01 → 2026-07-31',{exact:false})).toBeVisible();
 await page.getByLabel('Through · OPERA payment date').fill('2026-08-31');
 await expect(page.getByText('History refresh requested for',{exact:false})).toHaveCount(0);
});

test('a completed selected range reloads totals while an unrelated history run remains queued',async({page})=>{
 await setup(page,{complete:false});let completed=false;
 const selected=['KAT','TSK'].map(hotel=>({id:'aug-'+hotel,hotel,from:'2026-08-01',to:'2026-08-31',status:'running',accounts:2,finishedAt:null,error:null}));
 await page.route('**/api/financial/status',r=>r.fulfill({json:{enabled:true,running:true,runs:[...selected.map(run=>({...run,status:completed?'succeeded':'running',finishedAt:completed?'2026-09-10T12:01:00Z':null})),{id:'other',hotel:'TSK',from:'2026-09-01',to:'2026-09-10',status:'queued',accounts:0,finishedAt:null,error:null}]}}));
 await page.route('**/api/financial/payments?**',r=>r.fulfill({json:{rows:[],total:0,coverage:{complete:completed,from:'2026-08-01',to:'2026-08-31'},summary:{paymentTotals:{creditPostings:completed?'1200.00':null,currentlyApplied:null,currentlyUnallocated:null,debitPostings:completed?'0.00':null}}}}));
 await page.goto('/?financial=1');await page.getByLabel('From · OPERA payment date').fill('2026-08-01');await page.getByLabel('Through · OPERA payment date').fill('2026-08-31');
 await expect(page.locator('.financial-metrics strong').first()).toHaveText('—');
 completed=true;await page.clock.fastForward(16000);
 await expect(page.locator('.financial-metrics strong').first()).toHaveText('฿1,200.00',{timeout:1500});
 await expect(page.getByText('Coverage is incomplete for this range.',{exact:false})).toHaveCount(0);
});
