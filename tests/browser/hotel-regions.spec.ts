import {test,expect} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
for(const width of [1440,1280,390])test('regional Aging keeps all hotel rows and six ranges '+width,async({page})=>{
 const c=await setupRegional(page);await page.setViewportSize({width,height:900});await page.goto('/?dashboard=1&dashboardView=aging&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 await page.getByLabel('Region',{exact:true}).selectOption('khao-lak');
 const table=page.getByRole('table',{name:'Current source aging comparison'});
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(1);
 for(const h of ['TLKL','WAKL','TLFO','TSAN'])await expect(page.locator('.hotel-switch').getByRole('button',{name:h,exact:true})).toBeVisible();
 await expect(page.locator('.hotel-switch').getByRole('button',{name:'KAT',exact:true})).toHaveCount(0);
 if(width>1050){await expect(table.locator('tbody tr')).toHaveCount(5);await expect(table.locator('thead th').last()).toContainText('Net open');expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);}
 else await expect(table.locator('thead th')).toHaveCount(6);
 for(const range of ['0–30','31–60','61–90','91–120','121–150','151+'])await expect(page.getByRole('button',{name:'Compare '+range+' days',exact:true})).toBeVisible();
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);if(width>900)expect(await page.locator('.main-nav').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:'.tmp/khao-lak-ui-results/aging-'+width+'.png',fullPage:true});
 await table.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(1);
 await page.getByRole('button',{name:'Period analysis',exact:true}).click();await expect(page.getByLabel('From',{exact:true})).toHaveValue('2026-09-01');
 for(const h of ['TLKL','WAKL','TLFO','TSAN'])await expect(page.getByTestId('metric-open-'+h)).toContainText('1 invoices');
 await page.getByLabel('Region',{exact:true}).selectOption('phuket');await expect(page.getByTestId('metric-open-KAT')).toContainText('1 invoices');expect(c.errors).toEqual([]);
});
test('regional reads and matched account count drills preserve scope and back navigation',async({page})=>{
 const c=await setupRegional(page);await page.goto('/?region=khao-lak&dashboard=1&dashboardView=aging');const table=page.getByRole('table',{name:'Current source aging comparison'});
 await table.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await table.getByRole('button',{name:'View invoice statuses for Regional Travel · Synthetic · Total · All ages',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Regional Travel · Synthetic · Invoice details',exact:true})).toBeVisible();
 expect(c.regionalCalls.some(c=>c.path==='/api/dashboard/aging-invoices'&&c.query.get('region')==='khao-lak'&&JSON.parse(c.query.get('accounts')??'[]').length===4)).toBe(true);
 for(const label of ['Collections','Reports','Remittances']){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:label==='Collections'?'Billing & Collection Queue':label,exact:true}).first()).toBeVisible();}
 for(const path of ['/api/collection-queue','/api/external-billing','/api/remittances/options','/api/remittances'])expect(c.regionalCalls.some(c=>c.path===path&&c.query.get('region')==='khao-lak')).toBe(true);
 expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
test('old explicit Khao Lak account URLs infer region and dirty account changes guard region switches',async({page})=>{
 const c=await setupRegional(page);await page.goto('/?account=same-id&property=TLKL');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');
 await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByLabel('Billing requirement')).toHaveValue('unset');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('');
 await page.getByLabel('Credit term (calendar days)').fill('30');page.once('dialog',dialog=>dialog.dismiss());await page.getByLabel('Region',{exact:true}).selectOption('phuket');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');await expect(page.getByLabel('Credit term (calendar days)')).toHaveValue('30');
 page.once('dialog',dialog=>dialog.accept());await page.getByLabel('Region',{exact:true}).selectOption('phuket');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();await expect(page).not.toHaveURL(/account=|property=/);expect(c.errors).toEqual([]);
});

test('Khao Lak portfolio compares four separate ledgers and preserves region through account return',async({page})=>{
 const c=await setupRegional(page);await page.goto('/?region=khao-lak');const table=page.getByRole('region',{name:'Accounts comparison'}).getByRole('table');
 await expect(table.locator('tbody tr')).toHaveCount(1);await expect(table.locator('thead th').filter({hasText:/^(TLKL|WAKL|TLFO|TSAN)$/})).toHaveText(['TLKL','WAKL','TLFO','TSAN']);
 await expect(table.locator('tbody .total-cell')).toContainText('10.8K');
 await table.locator('tbody .tlfo .amount-link').click();await expect(page).toHaveURL(/property=TLFO/);await expect(page.locator('.account-page')).toContainText('TLFO');
 await page.locator('.account-page .breadcrumb').click();await expect(table.locator('tbody .total-cell')).toContainText('10.8K');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');
 await page.getByLabel('Region',{exact:true}).selectOption('phuket');await expect(table.locator('tbody .total-cell')).toContainText('1.8K');expect(c.errors).toEqual([]);
});

test('refresh completion after region switch reloads only the active regional catalog',async({page})=>{
 const {regionalAccounts}=await import('./fixtures/hotel-regions');const c=await setupRegional(page);let running=true;const catalogRegions:string[]=[];
 await page.route('**/api/portfolio**',route=>{const region=new URL(route.request().url()).searchParams.get('region')??'phuket';catalogRegions.push(region);return route.fulfill({json:{status:'connected',accounts:regionalAccounts.filter(a=>region==='phuket'?['KAT','TSK'].includes(a.hotel):!['KAT','TSK'].includes(a.hotel)),refresh:{running,hotels:[]}}});});
 await page.route('**/api/refresh**',route=>route.fulfill({json:{jobs:[],running,hotels:[]}}));
 await page.goto('/');const table=page.getByRole('region',{name:'Accounts comparison'}).getByRole('table');await expect(table.locator('tbody .total-cell')).toContainText('1.8K');
 await page.getByLabel('Region',{exact:true}).selectOption('khao-lak');await expect(table.locator('tbody .total-cell')).toContainText('10.8K');running=false;
 await expect.poll(()=>catalogRegions.length).toBeGreaterThan(2);expect(catalogRegions).toEqual(['phuket','khao-lak','khao-lak']);await expect(table.locator('tbody .total-cell')).toContainText('10.8K');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');expect(c.errors).toEqual([]);
});
test('Phuket desktop navigation keeps all seven controls inside the header',async({page})=>{
 await setupRegional(page);await page.setViewportSize({width:1280,height:900});await page.goto('/');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav.getByRole('button')).toHaveCount(7);expect(await nav.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:'.tmp/khao-lak-ui-results/phuket-header-1280.png',fullPage:false});
});

for(const pending of ['status','catalog'] as const)test('region switch aborts an in-flight '+pending+' response from the old region',async({page})=>{
 const {regionalAccounts}=await import('./fixtures/hotel-regions');const c=await setupRegional(page);const catalogRegions:string[]=[];let held=false,released=false,phuketStatusReads=0,phuketCatalogReads=0;
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const failed:string[]=[];page.on('requestfailed',request=>failed.push(new URL(request.url()).pathname));
 await page.route('**/api/portfolio**',async route=>{const region=new URL(route.request().url()).searchParams.get('region')??'phuket';catalogRegions.push(region);const hold=pending==='catalog'&&region==='phuket'&&++phuketCatalogReads===2;if(hold){held=true;await gate;}
  await route.fulfill({json:{status:'connected',accounts:regionalAccounts.filter(a=>region==='phuket'?['KAT','TSK'].includes(a.hotel):!['KAT','TSK'].includes(a.hotel)),refresh:{running:pending==='status'&&region==='phuket',hotels:[]}}});if(hold)released=true;
 });
 await page.route('**/api/refresh**',async route=>{const region=new URL(route.request().url()).searchParams.get('region')??'phuket';const hold=pending==='status'&&route.request().method()==='GET'&&region==='phuket'&&++phuketStatusReads===2;if(hold){held=true;await gate;}await route.fulfill({json:{jobs:[],running:!hold&&pending==='status'&&region==='phuket',hotels:[]}});if(hold)released=true;});
 await page.goto('/');const table=page.getByRole('region',{name:'Accounts comparison'}).getByRole('table');await expect(table.locator('tbody .total-cell')).toContainText('1.8K');if(pending==='catalog')await page.getByRole('button',{name:'Reload saved data',exact:true}).click();await expect.poll(()=>held).toBe(true);
 await page.getByLabel('Region',{exact:true}).selectOption('khao-lak');await expect(table.locator('tbody .total-cell')).toContainText('10.8K');await expect.poll(()=>failed.includes(pending==='status'?'/api/refresh':'/api/portfolio')).toBe(true);
 release();await expect.poll(()=>released).toBe(true);await expect(table.locator('tbody .total-cell')).toContainText('10.8K');expect(catalogRegions.slice(catalogRegions.indexOf('khao-lak'))).not.toContain('phuket');expect(c.errors).toEqual([]);
});

const regionalJobId='00000000-0000-4000-8000-000000000071';
async function regionalDocument(page:import('@playwright/test').Page){
 const c=await setupRegional(page),exports=[{name:'Synthetic-reviewed.pdf',storage_key:'jobs/'+regionalJobId+'/exports/synthetic.pdf',byte_count:1000,sha256:'a'.repeat(64)}];
 const job={id:regionalJobId,lifecycle:'transient',hotel:'TLKL',account_id:'same-id',account_name:'Regional Travel · Synthetic',invoice_ids:['invoice-0'],state:'ready',revision:1,acknowledged:true,files:[],exports,manifest:[]};let reads=0;
 await page.route('**/api/documents/'+regionalJobId,route=>{reads++;return route.fulfill({json:job});});
 await page.route('**/api/gmail/status',route=>route.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com'}}));
 await page.route('**/api/email/open',route=>route.fulfill({json:{id:'synthetic-regional-draft',document_job_id:regionalJobId,document_revision:1,hotel:'TLKL',account_id:'same-id',account_name:job.account_name,invoice_ids:job.invoice_ids,purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic regional subject',body:'Synthetic regional message',exports,attachments:[],revision:0,package_changed:false}}));
 return {...c,job,reads:()=>reads};
}
for(const stale of ['', '&region=phuket&hotel=KAT&account=same-id&property=KAT&accountFilter=Phuket','&property=TLKL&account=stale-account'])test('verified Khao Lak job-only composer fixes region and back scope '+(stale.includes('stale-account')?'with stale same-hotel account':stale?'with stale Phuket account':'without context'),async({page})=>{
 const c=await regionalDocument(page);await page.goto('/?documentJob='+regionalJobId+'&compose=1'+stale);await expect(page.getByLabel('Email message',{exact:true})).toBeVisible();await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');
 await expect(page).toHaveURL(/documentJob=/);await expect(page).toHaveURL(/compose=1/);await expect(page).not.toHaveURL(/account=|property=|hotel=KAT|accountFilter=/);expect(c.reads()).toBeLessThanOrEqual(2);if(!stale)await page.screenshot({path:'.tmp/khao-lak-ui-results/document-job-region.png'});
 await page.getByRole('button',{name:'Back to document preparation',exact:true}).click();await page.getByRole('button',{name:'Back to portfolio',exact:true}).click();await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');await expect(page.getByRole('region',{name:'Accounts comparison'}).locator('tbody .total-cell')).toContainText('10.8K');expect(c.errors).toEqual([]);
});
for(const context of ['&region=khao-lak&account=same-id&property=TLKL&accountSection=Overview','&region=khao-lak&collections=1&qtype=Agent&qaccount=TLKL%3Asame-id&qwhen=Ready'])test('verified document identity preserves valid return context '+(context.includes('collections')?'Collections':'Account'),async({page})=>{
 const c=await regionalDocument(page);await page.goto('/?documentJob='+regionalJobId+'&compose=1'+context);await expect(page.getByLabel('Email message',{exact:true})).toBeVisible();const before=c.reads();
 await page.getByLabel('Email message',{exact:true}).fill('Synthetic unsaved regional edit');await expect(page.getByLabel('Email message',{exact:true})).toHaveValue('Synthetic unsaved regional edit');expect(c.reads()).toBe(before);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Back to document preparation',exact:true}).click();await page.getByRole('button',{name:context.includes('collections')?'Back to Collections':'Back to account',exact:true}).click();
 if(context.includes('collections')){await expect(page.getByRole('heading',{name:'Billing & Collection Queue'})).toBeVisible();await expect(page).toHaveURL(/qaccount=TLKL%3Asame-id/);await expect(page).toHaveURL(/qwhen=Ready/);}else{await expect(page.getByLabel('Billing requirement')).toBeVisible();await expect(page).toHaveURL(/property=TLKL/);}
 expect(c.errors).toEqual([]);
});
test('an unmounted delayed document read cannot change the next page region',async({page})=>{
 const c=await regionalDocument(page);let release!:()=>void,held=false,released=false;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/documents/'+regionalJobId,async route=>{held=true;await gate;await route.fulfill({json:c.job});released=true;});
 await page.goto('/?documentJob='+regionalJobId+'&compose=1');await expect.poll(()=>held).toBe(true);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Portfolio',exact:true}).click();await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();release();await expect.poll(()=>released).toBe(true);
 await expect(page.getByLabel('Region',{exact:true})).toHaveValue('phuket');await expect(page).not.toHaveURL(/documentJob=/);expect(c.errors).toEqual([]);
});
test('a mismatched document response cannot publish hotel identity',async({page})=>{
 const c=await regionalDocument(page);await page.route('**/api/documents/'+regionalJobId,route=>route.fulfill({json:{...c.job,id:'different-job'}}));await page.goto('/?documentJob='+regionalJobId+'&compose=1');await expect(page.getByRole('alert')).toContainText('Document identity could not be verified');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('phuket');await expect(page.getByLabel('Email message',{exact:true})).toHaveCount(0);
});

test('legacy property-only valid account context keeps region after returning through Account to Portfolio',async({page})=>{
 const c=await regionalDocument(page);await page.goto('/?documentJob='+regionalJobId+'&compose=1&property=TLKL&account=same-id');await expect(page.getByLabel('Email message',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to document preparation',exact:true}).click();await page.getByRole('button',{name:'Back to account',exact:true}).click();await expect(page.locator('.account-page')).toBeVisible();await page.locator('.account-page .breadcrumb').click();
 await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');await expect(page.getByRole('region',{name:'Accounts comparison'}).locator('tbody .total-cell')).toContainText('10.8K');expect(c.errors).toEqual([]);
});

for(const publication of ['missing','verified-zero','retained'] as const)test('Portfolio distinguishes '+publication+' hotel publication from a zero balance',async({page})=>{
 const {regionalAccounts}=await import('./fixtures/hotel-regions');const c=await setupRegional(page),at='2026-09-12T02:59:00Z';
 const accounts=regionalAccounts.filter(a=>!['KAT','TSK'].includes(a.hotel)&&(publication==='retained'||a.hotel!=='TLFO'));
 const refresh={running:false,hotels:['TLKL','WAKL','TLFO','TSAN'].map(hotel=>({hotel,status:hotel==='TLFO'&&publication!=='verified-zero'?'failed':'succeeded',last_success_at:hotel==='TLFO'&&publication==='missing'?null:at}))};
 await page.route('**/api/portfolio**',r=>r.fulfill({json:{accounts,status:'connected',refresh}}));await page.route('**/api/refresh**',r=>r.fulfill({json:{...refresh,jobs:[]}}));
 await page.goto('/?region=khao-lak');const contribution=page.locator('.portfolio-hotel-card[data-hotel=TLFO]'),hero=page.locator('.portfolio-total'),table=page.getByRole('region',{name:'Accounts comparison'}).getByRole('table');
 await expect(table.locator('tbody tr')).toHaveCount(1);
 if(publication==='missing'){
  await expect(hero).toContainText('Partial open AR');await expect(hero.locator('strong')).toHaveText('7.8K');await expect(contribution).toContainText('Unavailable');await expect(contribution.locator('strong')).toHaveText('—');await expect(contribution).not.toContainText('0%');await expect(page.getByRole('status').filter({hasText:'Partial portfolio'})).toContainText('TLFO');await expect(table.locator('thead')).toContainText('Partial total open');
  await expect(page.getByRole('region',{name:'Account type comparison'}).locator('tbody .tlfo')).toContainText('Unavailable');await page.screenshot({path:'.tmp/khao-lak-ui-results/portfolio-partial-1440.png',fullPage:true});
 }else{
  await expect(hero).toContainText('Total open AR');await expect(hero).not.toContainText('Partial');await expect(contribution.locator('strong')).toHaveText(publication==='verified-zero'?'0':'3K');await expect(hero.locator('strong')).toHaveText(publication==='verified-zero'?'7.8K':'10.8K');
  if(publication==='verified-zero')await expect(table.locator('tbody .tlfo')).toHaveText('—');
 }
 expect(c.errors).toEqual([]);
});

for(const published of [false,true])test('empty regional Portfolio distinguishes unavailable from verified zero '+published,async({page})=>{
 await setupRegional(page);const refresh={running:false,hotels:['TLKL','WAKL','TLFO','TSAN'].map(hotel=>({hotel,status:published?'succeeded':'failed',last_success_at:published?'2026-09-12T02:59:00Z':null}))};
 await page.route('**/api/portfolio**',r=>r.fulfill({json:{accounts:[],status:'connected',refresh}}));await page.route('**/api/refresh**',r=>r.fulfill({json:{...refresh,jobs:[]}}));await page.goto('/?region=khao-lak');
 await expect(page.locator('.portfolio-total strong')).toHaveText(published?'0':'—');await expect(page.locator('.portfolio-total .metric-label')).toHaveText(published?'Total open AR':'Open AR unavailable');
});
