import { test, expect } from '@playwright/test';

// Controlled browser regression only. These fictional sessions/responses never reach the real API.
test('same-user snapshot survives a transient service error and invoice retry reloads the ledger',async({page})=>{
  const user={id:'synthetic-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-08T00:00:00Z'};
  await page.addInitScript(user=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-test-session',refresh_token:'synthetic-test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-test-key',googleEnabled:false}}));
  await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
  let reads=0,invoiceReads=0;
  await page.route('**/api/portfolio',r=>{reads++;return r.fulfill(reads===2?{status:503,json:{error:'supabase_unavailable'}}:{json:{accounts:[{hotel:'KAT',id:'synthetic',name:'Fictional regression account',type:'Agent',open:100,over90:0,items:1}]}});});
  await page.route('**/api/accounts/KAT/synthetic',r=>{invoiceReads++;return r.fulfill(invoiceReads===1?{status:503,json:{error:'supabase_unavailable'}}:{json:{invoices:[{hotel:'KAT',account_id:'synthetic',id:'test',guest:'Fictional guest',invoice_no:'SYN-1',folio_no:'SYN-2',transaction_date:'2026-09-08',original:100,open:100,aging:'Unknown'}]}});});
  await page.goto('/');
  await expect(page.locator('.accounts-panel')).toContainText('Fictional regression account');
  await page.getByRole('button',{name:'Reload saved data'}).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.locator('.accounts-panel')).toContainText('Fictional regression account');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.locator('.accounts-panel td.kat button').click();
  await expect(page.getByRole('alert')).toContainText('Invoice data is unavailable');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('.ledger')).toContainText('SYN-1');
  expect(invoiceReads).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.ledger')).not.toContainText('Not billed');
});
