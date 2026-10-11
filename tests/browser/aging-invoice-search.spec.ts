import {agingFixtureStamp,publishedAgingAccounts} from './fixtures/aging-published';
import {currentAgingAccounts} from './fixtures/current-aging';
import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
for(const width of [1280,390])test(`account invoice list searches and sorts every column without pagination ${width}`,async({page})=>{
 await setupDashboard(page,{tabSession:true});await page.setViewportSize({width,height:900});
 const rows=Array.from({length:65},(_,n)=>({hotel:'KAT',account_id:'kat-azure',id:String(n+1),invoice_no:String(n+1),folio_no:String(100+n),guest:n===64?'Needle Guest':`Guest ${n+1}`,transaction_date:'2026-09-01',open:n+1,original:n+1,age:n,collection_role:'standalone',collection_selectable:true,verification_state:'verified',synced_at:agingFixtureStamp,workflow:{revision:1,billing_required:true,credit_term:30,first_billing_date:n===0?null:'2026-09-01',last_reminder_stage:n===3?'Follow 1':null,last_reminder_date:n===3?'2026-09-11':null,due_date:n===3?'2026-09-10':'2026-10-01'},exception_status:'available',exceptions:{held:n===4,needsReview:false}}));
 await page.route('**/api/accounts/KAT/kat-azure',r=>r.fulfill({json:{synced_at:agingFixtureStamp,invoices:rows}}));
 await page.route('**/api/accounts/TSK/tsk-azure',r=>r.fulfill({json:{synced_at:agingFixtureStamp,invoices:[]}}));
 const catalog=publishedAgingAccounts(currentAgingAccounts.filter(a=>a.account_no==='SYN-A').map(a=>a.account_no==='SYN-A'?{...a,open:a.hotel==='KAT'?2145:0,items:a.hotel==='KAT'?65:0,agingBuckets:a.agingBuckets!.map(b=>{const amount=a.hotel==='KAT'?rows.filter(r=>r.age>=b.start!&&(b.end===null||r.age<=b.end)).reduce((n,r)=>n+r.open,0):0;return {...b,amount,debit:amount,credit:0};})}:a));
 await page.route('**/api/portfolio',r=>r.fulfill({json:{status:'connected',accounts:catalog,refresh:{running:false,hotels:['KAT','TSK'].map(hotel=>({hotel,status:'succeeded',last_success_at:agingFixtureStamp}))}}}));
 await page.route('**/api/dashboard/aging-invoices**',r=>{const accounts=catalog.map(a=>{const selected=a.id==='kat-azure'?rows:[],buckets=a.agingBuckets!.map(b=>({key:JSON.stringify([b.label,b.start,b.end,b.sequence]),count:selected.filter(i=>i.age>=b.start!&&(b.end===null||i.age<=b.end)).length,amount:b.debit.toFixed(2),creditAmount:'0.00',complete:true}));return {hotel:a.hotel,accountId:a.id,accountType:a.type,syncedAt:agingFixtureStamp,membership:a.membership,complete:true,unverified:0,buckets:[...buckets,{key:null,count:selected.length,amount:a.open.toFixed(2),creditAmount:'0.00',complete:true}]};});return r.fulfill({json:{asOfDate:'2026-09-12',publications:['KAT','TSK'].map(hotel=>({hotel,sourceAt:agingFixtureStamp})),accounts,summary:{complete:true,count:65,amount:'2145.00',creditAmount:'0.00',billing:[],followup:[],due:[],flags:[]},rows:[],total:0,complete:true}});});
 await page.goto('/?dashboard=1&dashboardView=aging');
 await page.getByRole('combobox',{name:'Aging view',exact:true}).selectOption('accounts');
 await page.getByRole('button',{name:'Open invoices for Azure Travel · Synthetic',exact:true}).click();
 const section=page.locator('.aging-invoice-drill'),table=section.getByRole('table',{name:'Current aging invoices'});
 await expect(table.locator('tbody tr')).toHaveCount(65);
 await expect(table).toContainText('Not billed');await expect(table).toContainText('Billed');await expect(table).toContainText('Follow-up 1 · Past due');await expect(table).toContainText('On hold');
 const statusSearch=section.getByRole('searchbox',{name:'Search account invoices',exact:true});await statusSearch.fill('follow-up');await expect(table.locator('tbody tr')).toHaveCount(1);await statusSearch.fill('');
 await expect(section.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
 for(const [index,label] of ['Hotel','Invoice No.','Folio No.','Guest','Source date','OPERA age','Status','Open · THB'].entries()){
  const button=table.getByRole('button',{name:'Sort invoices by '+label,exact:true});await button.click();
  const header=table.getByRole('columnheader').nth(index);const first=await header.getAttribute('aria-sort');await button.click();expect(await header.getAttribute('aria-sort')).not.toBe(first);
 }
 await table.getByRole('button',{name:'Sort invoices by Invoice No.',exact:true}).click();
 await expect(table.locator('tbody tr').first()).toContainText('Guest 1');
 const search=section.getByRole('searchbox',{name:'Search account invoices',exact:true});await search.fill('Needle');
 await expect(table.locator('tbody tr')).toHaveCount(1);await expect(table).toContainText('65');
 await page.screenshot({path:`.tmp/audit-ui/aging-invoice-search-${width}.png`,fullPage:false});
 await table.getByRole('button',{name:'Open invoice 65',exact:true}).click();
 await page.locator('.account-page .breadcrumb').click();await expect(search).toHaveValue('Needle');
 await expect(table.getByRole('columnheader').nth(1)).toHaveAttribute('aria-sort','ascending');
 await search.fill('');await expect(table.locator('tbody tr')).toHaveCount(65);
});
