import {test,expect} from '@playwright/test';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
import {auditLogin,auditRoute} from './fixtures/audit-workspace';
test('an idle signed-in page observes a new background publication',async({page})=>{
 await page.clock.install({time:new Date('2026-09-12T03:00:00Z')});await setupRegional(page,true);let fresh=false,reads=0;
 const refresh=()=>({running:false,hotels:['KAT','TSK'].map(hotel=>({hotel,status:'succeeded',last_success_at:fresh?'2026-09-12T03:05:00Z':'2026-09-12T02:59:00Z'}))});
 await page.route('**/api/portfolio*',r=>{reads++;return r.fulfill({json:{status:'connected',refresh:refresh(),accounts:regionalAccounts.filter(a=>['KAT','TSK'].includes(a.hotel))}});});
 await page.route('**/api/refresh*',r=>r.fulfill({json:r.request().method()==='POST'?{jobs:[]}:refresh()}));
 await auditLogin(page);await auditRoute(page,'dashboard=1&dashboardView=aging');await expect(page.getByRole('heading',{name:'Age of open balances'})).toBeVisible();const initial=reads;fresh=true;
 await page.clock.fastForward(6*60*1000);await expect.poll(()=>reads,{timeout:1500}).toBeGreaterThan(initial);
});
