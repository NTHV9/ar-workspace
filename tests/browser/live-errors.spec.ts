import { test, expect } from '@playwright/test';
import {auditWorkspace,auditLogin,auditRoute} from './fixtures/audit-workspace';

// Controlled browser regression only. These fictional sessions/responses never reach the real API.
test('same-user snapshot survives a transient service error and invoice retry reloads the ledger',async({page})=>{
  await auditWorkspace(page);
  let failCatalog=false,invoiceReads=0;
  await page.route('**/api/portfolio',r=>{return r.fulfill(failCatalog?{status:503,json:{error:'supabase_unavailable'}}:{json:{accounts:[{hotel:'KAT',id:'synthetic',name:'Fictional regression account',type:'Agent',open:100,over90:0,items:1,verification_state:'verified',agingBuckets:[{label:'Up to 30',start:0,end:30,sequence:0,amount:100,debit:100,credit:0}]}]}});});
  await page.route('**/api/accounts/KAT/synthetic',r=>{invoiceReads++;return r.fulfill(invoiceReads===1?{status:503,json:{error:'supabase_unavailable'}}:{json:{invoices:[{hotel:'KAT',account_id:'synthetic',id:'test',guest:'Fictional guest',invoice_no:'SYN-1',folio_no:'SYN-2',transaction_date:'2026-09-08',original:100,open:100,aging:'Unknown'}]}});});
  await auditLogin(page);await page.getByLabel('Aging view',{exact:true}).selectOption('accounts');
  await expect(page.locator('.aging-desktop-table')).toContainText('Fictional regression account');
  await page.getByRole('button',{name:'OPERA data status',exact:true}).click();
  failCatalog=true;await page.getByRole('button',{name:'Reload saved data'}).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.locator('.aging-desktop-table')).toContainText('Fictional regression account');
  failCatalog=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
  await auditRoute(page,'dashboard=1&dashboardView=aging&account=synthetic&property=KAT');
  await expect(page.getByRole('alert')).toContainText('Invoice data is unavailable');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('.ledger')).toContainText('SYN-1');
  expect(invoiceReads).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.ledger')).not.toContainText('Not billed');
});
