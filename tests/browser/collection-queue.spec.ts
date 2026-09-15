import {policyFixture} from './fixtures/collection-policy';
import {test,expect,type Page} from '@playwright/test';
const accountNames=['Azure Travel · Synthetic','Harbor Tours · Synthetic','Coral Travel · Synthetic','Palm Holidays · Synthetic','Bay Travel · Synthetic','Island Agency · Synthetic','Lagoon Travel · Synthetic','North Travel · Synthetic','Review Account · Synthetic'];
function rows(){return accountNames.map((name,index)=>({hotel:index%2?'TSK':'KAT',account_id:String(index+1),id:String(index+100),guest:'Synthetic Guest '+(index+1),invoice_no:'INV-'+(index+1),folio_no:'FOL-'+(index+1),open:[740000,510000,390000,310000,280000,190000,140000,95000,85000][index],transaction_date:'2026-08-01',collection_role:'standalone',collection_selectable:index!==8,verification_state:index===8?'unverified':'verified',account_name:name,account_type:index%2?'Corporate':'OTA',workflow:index===5?null:{revision:0,billing_required:index===0,credit_term:30,first_billing_date:null,last_reminder_stage:[null,'Follow 1','Final','Friendly',null,null,'Follow 2','Follow 3',null][index],last_reminder_date:[null,'2026-09-01','2026-09-09','2026-09-03',null,null,'2026-09-04','2026-09-01',null][index],due_date:index===4?'2026-09-25':index===0?null:'2026-09-09'}}));}
async function setup(page:Page,fail=false,data=rows()){const calls:string[]=[];const user={id:'synthetic-queue-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 await page.clock.setFixedTime(new Date('2026-09-10T05:00:00Z'));
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const q=r.request(),url=new URL(q.url()),p=url.pathname,scoped=data.filter(d=>url.searchParams.get('region')==='khao-lak'?['TLKL','WAKL','TLFO','TSAN'].includes(d.hotel):['KAT','TSK'].includes(d.hotel));calls.push(q.method()+' '+p);
 if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
 if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
 if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:scoped.map(d=>({id:d.account_id,hotel:d.hotel,name:d.account_name,type:d.account_type,open:d.open,items:1,over90:0})),refresh:{running:false,hotels:[]}}});
 if(p==='/api/collection-queue')return r.fulfill({status:fail?503:200,json:fail?{error:'unavailable'}:{rows:scoped,asOf:'2026-09-10'}});
 if(p==='/api/mail-reconciliation')return r.fulfill({json:{enabled:true,intervalMinutes:15,waiting:0,needsReview:0,last:{trigger:'scheduled',state:'complete',created_at:'2026-09-10T05:00:00Z',finished_at:'2026-09-10T05:00:02Z',checked:0,verified:0,needs_review:0,unavailable:0}}});
 if(p.startsWith('/api/accounts/'))return r.fulfill({json:{invoices:[]}});
 return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return calls;
}
for(const width of [1440,1280,390])test(`collection queue ${width}: correct stage labels, filters and scoped selection`,async({page})=>{const calls=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto('/?collections=1');await expect(page.getByRole('heading',{name:'Billing & Collection Queue',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Harbor Tours · Synthetic',exact:true})).toBeVisible();await page.screenshot({path:`evidence/collection-queue-${width}.png`,fullPage:true});
 await page.getByLabel('Queue stage',{exact:true}).selectOption('Follow 2');await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);await expect(page.locator('.queue-work tbody')).toContainText('Follow-up 2');await page.getByRole('button',{name:'Harbor Tours · Synthetic',exact:true}).click();await page.getByLabel('Queue select INV-2',{exact:true}).check();if(width===390)await page.screenshot({path:'evidence/collection-queue-390-drawer.png'});await page.getByRole('button',{name:'Prepare collection documents',exact:true}).click();await expect(page.getByRole('dialog').getByRole('combobox',{name:'Purpose',exact:true})).toHaveValue('collection');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();if(width===390)await page.getByRole('button',{name:'Close queue details',exact:true}).click();expect(calls.some(c=>c.includes('/send')||c.includes('/gmail-draft')||c==='POST /api/documents')).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('latest sent filter and back navigation preserve queue context',async({page})=>{await setup(page);await page.goto('/?collections=1');await page.getByLabel('Queue latest sent stage',{exact:true}).selectOption('Follow 1');await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'Open account details',exact:true}).click();await expect(page.getByRole('heading',{name:'Harbor Tours · Synthetic',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to collections',exact:true}).click();await expect(page.getByLabel('Queue latest sent stage',{exact:true})).toHaveValue('Follow 1');await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);});
test('queue API failure does not become zero work',async({page})=>{await setup(page,true);await page.goto('/?collections=1');await expect(page.getByRole('alert')).toContainText('Collection data is unavailable');await expect(page.locator('.queue-metrics strong').first()).toHaveText('—');await expect(page.getByText('No work matches these filters',{exact:true})).toHaveCount(0);});

test('Collection due card matches its drill-down count and excludes separate Urgent work',async({page})=>{await setup(page);await page.goto('/?collections=1');await page.getByRole('button',{name:/Collection due 3/}).click();await expect(page.locator('.queue-work tbody tr')).toHaveCount(3);await expect(page.locator('.queue-work tbody')).not.toContainText('Urgent');});

for(const region of ['phuket','khao-lak'])test(`queue hotel change clears foreign account while preserving valid account and All scope in ${region}`,async({page})=>{
 const data=rows().map((row,index)=>({...row,hotel:region==='phuket'?row.hotel:['TLKL','WAKL','TLFO','TSAN'][index%4]}));
 const selectedHotel=region==='phuket'?'TSK':'WAKL',nextHotel=region==='phuket'?'KAT':'TLFO',selectedAccount=selectedHotel+':2';
 await setup(page,false,data);await page.goto('/?collections=1&region='+region);
 await page.getByLabel('Queue account',{exact:true}).selectOption(selectedAccount);
 await page.getByRole('button',{name:'Harbor Tours · Synthetic',exact:true}).click();
 const selectedFocus=new URL(page.url()).searchParams.get('qfocus');expect(selectedFocus).toBeTruthy();
 for(const hotel of [selectedHotel,'All Hotels']){
  await page.getByRole('button',{name:hotel,exact:true}).click();
  await expect(page.getByLabel('Queue account',{exact:true})).toHaveValue(selectedAccount);
  await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('qfocus')).toBe(selectedFocus);
 }
 await page.getByRole('button',{name:nextHotel,exact:true}).click();
 await expect(page.getByLabel('Queue account',{exact:true})).toHaveValue('All');
 await expect(page.locator('.queue-work tbody tr')).toHaveCount(region==='phuket'?5:2);
 expect(new URL(page.url()).searchParams.has('qaccount')).toBe(false);
 expect(new URL(page.url()).searchParams.has('qfocus')).toBe(false);
});

test('queue KPI drill clears a conflicting latest sent filter so its invoice count matches the card',async({page})=>{
 await setup(page);await page.goto('/?collections=1');
 await page.getByLabel('Queue latest sent stage',{exact:true}).selectOption('Final');
 await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);
 const billing=page.locator('.queue-metrics button').filter({hasText:'Billing due'});
 await expect(billing.locator('strong')).toHaveText('1');await billing.click();
 await expect(page.getByLabel('Queue latest sent stage',{exact:true})).toHaveValue('All');
 await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);
 await expect(page.locator('.queue-work tbody')).toContainText('Azure Travel · Synthetic');
 expect(new URL(page.url()).searchParams.has('qsent')).toBe(false);
});

test('queue client filters and sorting reuse the catalog while explicit reload and region changes fetch fresh work',async({page})=>{
 const data=[...rows(),...rows().slice(0,4).map((row,index)=>({...row,hotel:['TLKL','WAKL','TLFO','TSAN'][index]}))];
 const calls=await setup(page,false,data),queueReads=()=>calls.filter(call=>call==='GET /api/collection-queue').length;
 await page.goto('/?collections=1');await expect(page.getByRole('button',{name:'Reload queue',exact:true})).toBeEnabled();await page.waitForLoadState('networkidle');
 const loaded=queueReads();expect(loaded).toBeGreaterThan(0);
 await page.getByLabel('Queue stage',{exact:true}).selectOption('Billing');
 await page.getByLabel('Queue account type').selectOption('OTA');
 await page.getByLabel('Search collection queue').fill('Azure');
 await page.getByRole('columnheader').getByRole('button',{name:'Open amount',exact:true}).click();
 await expect(page.locator('.queue-work tbody tr')).toHaveCount(1);await page.waitForLoadState('networkidle');
 expect(queueReads()).toBe(loaded);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.waitForLoadState('networkidle');expect(queueReads()).toBe(loaded);
 await page.getByRole('button',{name:'Reload queue',exact:true}).click();await expect.poll(queueReads).toBe(loaded+1);await page.waitForLoadState('networkidle');expect(queueReads()).toBe(loaded+1);
 await page.getByRole('button',{name:'Reload saved data',exact:true}).click();await expect.poll(queueReads).toBe(loaded+2);await page.waitForLoadState('networkidle');expect(queueReads()).toBe(loaded+2);
 await page.getByLabel('Region',{exact:true}).selectOption('khao-lak');await expect(page.locator('.queue-work tbody tr')).toHaveCount(4);await page.waitForLoadState('networkidle');expect(queueReads()).toBeGreaterThan(loaded+2);
 await expect(page.getByLabel('Queue account',{exact:true})).toContainText('TLKL');await expect(page.getByLabel('Queue account',{exact:true})).not.toContainText('KAT');
});

for(const failAfter of [false,true])test(`saved OPERA publication ${failAfter?'retains queue on read failure':'updates queue and preserves valid selection'}`,async({page})=>{
 await setup(page);let published=false,queueReads=0,publication=0;
 const first={...rows()[0],open:100},keep={...first,id:'SYN-KEEP',invoice_no:'INV-KEEP',open:200},stay={...first,id:'SYN-STAY',invoice_no:'INV-STAY',open:300};
 await page.route('**/api/portfolio',r=>r.fulfill({json:{status:'connected',accounts:[{id:first.account_id,hotel:first.hotel,name:first.account_name,type:first.account_type,open:published?500:600,items:published?2:3,over90:0,verification_state:'verified',synced_at:`2026-09-10T0${5+publication}:00:00Z`}],refresh:{running:false,hotels:[]}}}));
 await page.route('**/api/collection-queue',r=>{queueReads++;return r.fulfill({status:published&&failAfter?503:200,json:published&&failAfter?{error:'unavailable'}:{rows:published?[keep,stay]:[first,keep,stay],asOf:'2026-09-10'}});});
 await page.goto('/?collections=1');await page.getByLabel('Queue stage',{exact:true}).selectOption('Billing');await page.getByLabel('Queue account type').selectOption('OTA');
 await page.getByLabel('Queue select INV-1',{exact:true}).check();await page.getByLabel('Queue select INV-KEEP',{exact:true}).check();
 const before=queueReads;published=true;publication++;await page.getByRole('button',{name:'Reload saved data',exact:true}).click();
 await expect.poll(()=>queueReads).toBeGreaterThan(before);
 await expect(page.getByLabel('Queue stage',{exact:true})).toHaveValue('Billing');await expect(page.getByLabel('Queue account type')).toHaveValue('OTA');
 await expect(page.getByLabel('Queue select INV-KEEP',{exact:true})).toBeChecked();
 if(failAfter){await expect(page.getByRole('alert')).toContainText('Showing the last successfully loaded queue');await expect(page.getByLabel('Queue select INV-1',{exact:true})).toBeChecked();await expect(page.locator('.queue-metrics strong').first()).toHaveText('3');}
 else{await expect(page.getByLabel('Queue select INV-1',{exact:true})).toHaveCount(0);await expect(page.locator('.queue-metrics strong').first()).toHaveText('2');await expect(page.locator('.queue-detail')).toContainText('1 invoices');await expect(page.locator('.queue-detail-balance')).toContainText('THB 500');
  // An invoice that later returns to the queue requires a fresh human selection.
  published=false;publication++;await page.getByRole('button',{name:'Reload saved data',exact:true}).click();
  await expect(page.getByLabel('Queue select INV-1',{exact:true})).toBeVisible();await expect(page.getByLabel('Queue select INV-1',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Queue select INV-KEEP',{exact:true})).toBeChecked();}
});

for(const newOwner of [false,true])test(`queue read failure after ${newOwner?'owner change clears prior data':'same-owner token refresh retains selection'}`,async({page})=>{
 await setup(page);const refreshed:string[]=[];
 await page.route('**/api/collection-queue',r=>{const auth=r.request().headers().authorization??'';if(auth!=='Bearer synthetic-renewed-token')return r.fallback();refreshed.push(auth);return r.fulfill({status:503,json:{error:'unavailable'}});});
 await page.goto('/?collections=1');await page.getByLabel('Queue stage',{exact:true}).selectOption('Billing');await page.getByLabel('Queue select INV-1',{exact:true}).check();
 await page.evaluate(changeOwner=>{const session=JSON.parse(localStorage.getItem('sb-example-auth-token')!);session.access_token='synthetic-renewed-token';session.expires_at=Math.floor(Date.now()/1000)+172800;if(changeOwner)session.user.id='synthetic-new-queue-owner';localStorage.setItem('sb-example-auth-token',JSON.stringify(session));const channel=new BroadcastChannel('sb-example-auth-token');channel.postMessage({event:changeOwner?'SIGNED_IN':'TOKEN_REFRESHED',session});channel.close();},newOwner);
 await expect.poll(()=>refreshed.length).toBeGreaterThan(0);await expect(page.getByRole('alert')).toContainText('Collection data is unavailable');
 if(newOwner){await expect(page.getByLabel('Queue select INV-1',{exact:true})).toHaveCount(0);await expect(page.locator('.queue-metrics strong').first()).toHaveText('—');await expect(page.getByRole('alert')).not.toContainText('Showing the last');}
 else{await expect(page.getByLabel('Queue select INV-1',{exact:true})).toBeChecked();await expect(page.getByRole('alert')).toContainText('Showing the last successfully loaded queue');}
});
