import {test,expect} from '@playwright/test';
test('deployed collection selection validation rejects missing or invalid login',async({request})=>{
 const data={hotel:'KAT',accountId:'fictional',ids:['fictional']};
 expect((await request.post('/api/collection/validate-selection',{data})).status()).toBe(401);
 expect((await request.post('/api/collection/validate-selection',{data,headers:{Authorization:'Bearer invalid'}})).status()).toBe(401);
});
test('compressed children and unverified rows cannot enter selection or its total',async({page})=>{
 const user={id:'synthetic-compression-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 await page.addInitScript(user=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-session',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
 await page.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key'}}));
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/refresh',r=>r.fulfill({json:{jobs:[],running:false,hotels:[]}}));
 await page.route('**/api/portfolio',r=>r.fulfill({json:{status:'connected',accounts:[{hotel:'KAT',id:'fictional',name:'Synthetic compression account',type:'Agent',open:100,over90:0,items:3}],refresh:{hotels:[],running:false}}}));
 const base={hotel:'KAT',account_id:'fictional',folio_no:'—',transaction_date:'2026-09-01',original:100,open:100,aging:'Up to 30',verification_state:'verified'};
 await page.route('**/api/accounts/KAT/fictional',r=>r.fulfill({json:{invoices:[
  {...base,id:'1',guest:'Synthetic child',invoice_no:'CHILD-1',collection_role:'child',collection_selectable:false,parent_invoice_no:'PARENT-0',parent_invoice_id:'0',parent_open:0},
  {...base,id:'2',guest:'Synthetic standalone',invoice_no:'ROOT-2',collection_role:'standalone',collection_selectable:true},
  {...base,id:'3',guest:'Synthetic unknown',invoice_no:'UNKNOWN-3',collection_role:'unverified',collection_selectable:false}
 ]}}));
 await page.goto('/');await page.locator('.accounts-panel td.kat button').click();
 await expect(page.getByLabel('Select CHILD-1',{exact:true})).toBeDisabled();
 await expect(page.getByLabel('Select UNKNOWN-3',{exact:true})).toBeDisabled();
 await page.getByLabel('Select all visible invoices',{exact:true}).check();
 await expect(page.locator('.selection-bar')).toContainText('1 items selected');
 await expect(page.locator('.selection-bar')).toContainText('THB 100');
 await page.getByRole('button',{name:'Synthetic child',exact:true}).click();
 await expect(page.locator('.invoice-detail')).toContainText('cannot collect separately');
 await expect(page.locator('.invoice-detail')).toContainText('Parent open balance: THB 0.00');
 await page.screenshot({path:'evidence/compression-1440.png',animations:'disabled'});
 await page.setViewportSize({width:1100,height:760});
 await expect(page.locator('.invoice-detail.drawer-open')).toBeVisible();
});
