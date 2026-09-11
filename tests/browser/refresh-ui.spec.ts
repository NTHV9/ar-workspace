import { test, expect } from '@playwright/test';
test('refresh is shared on open, polls only active jobs, then supports scoped manual refresh',async({page})=>{
  const user={id:'synthetic-refresh-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-08T00:00:00Z'};
  await page.addInitScript(user=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-session',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})),user);
  await page.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key'}}));
  await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
  const commands:unknown[]=[];let statusReads=0,portfolioReads=0;
  const idle={running:false,hotels:[{hotel:'KAT',status:'succeeded',last_success_at:'2026-09-08T12:00:00Z'}]};
  await page.route('**/api/refresh',r=>{
    if(r.request().method()==='POST'){commands.push(r.request().postDataJSON());return r.fulfill({json:{jobs:[{status:'queued',created:true}]}});}
    statusReads++;return r.fulfill({json:statusReads===1?{...idle,running:true,hotels:[{...idle.hotels[0],status:'running'}]}:idle});
  });
  await page.route('**/api/portfolio',r=>{portfolioReads++;return r.fulfill({json:{status:'connected',accounts:[{hotel:'KAT',id:'fictional',name:'Fictional refresh account',type:'Agent',open:100,over90:0,items:1}],refresh:statusReads===1?{...idle,running:true}:idle}});});
  await page.route('**/api/accounts/KAT/fictional',r=>r.fulfill({json:{invoices:[]}}));
  await page.goto('/');
  await expect(page.locator('.accounts-panel')).toContainText('Fictional refresh account');
  await expect.poll(()=>portfolioReads).toBe(2);
  expect(commands).toEqual([{hotel:'All',reason:'open'}]);
  const settledReads=statusReads;
  await page.waitForTimeout(3300);
  expect(statusReads).toBe(settledReads);
  await page.locator('.accounts-panel td.kat button').click();
  await page.getByRole('button',{name:'Refresh OPERA',exact:true}).click();
  await expect.poll(()=>commands.length).toBe(2);
  expect(commands[1]).toEqual({hotel:'KAT',accountId:'fictional',reason:'manual'});
});
