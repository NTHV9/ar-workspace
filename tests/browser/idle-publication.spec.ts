import {test,expect} from '@playwright/test';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
import {auditLogin,auditRoute} from './fixtures/audit-workspace';

for(const metadataDelay of [0,2000])test(`an idle signed-in page observes a new background publication${metadataDelay?' after a slow metadata reply':''}`,async({page})=>{
 await page.clock.install({time:new Date('2026-09-12T03:00:00Z')});await setupRegional(page,true);let fresh=false,reads=0;
 const publishedAt='2026-09-12T03:05:00Z';
 const refresh=()=>({running:false,hotels:['KAT','TSK'].map(hotel=>({hotel,status:'succeeded',last_success_at:fresh?publishedAt:'2026-09-12T02:59:00Z'}))});
 await page.route('**/api/portfolio*',r=>{reads++;return r.fulfill({json:{status:'connected',refresh:refresh(),accounts:regionalAccounts.filter(a=>['KAT','TSK'].includes(a.hotel))}});});
 await page.route('**/api/refresh*',async r=>{
  if(r.request().method()==='POST')return r.fulfill({json:{jobs:[]}});
  const value=refresh();
  if(fresh&&metadataDelay)await new Promise(resolve=>setTimeout(resolve,metadataDelay));
  return r.fulfill({json:value});
 });
 const initialMetadata=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/refresh'&&response.request().method()==='GET');
 await auditLogin(page);await auditRoute(page,'dashboard=1&dashboardView=aging');await expect(page.getByRole('heading',{name:'Age of open balances'})).toBeVisible();await initialMetadata;await expect(page.locator('.opera-status-trigger i')).toHaveAttribute('data-state','connected');const initial=reads;
 // Advancing page time fires a poll but does not complete its asynchronous network reply.
 // Start the catalog reaction deadline only after the new publication metadata is available.
 const publication=page.waitForResponse(async response=>{
  if(new URL(response.url()).pathname!=='/api/refresh'||response.request().method()!=='GET')return false;
  const result=await response.json();
  return result.hotels?.some((hotel:{last_success_at?:string})=>hotel.last_success_at===publishedAt)===true;
 },{timeout:10000});
 fresh=true;await page.clock.runFor(6*60*1000);await publication;
 await expect.poll(()=>reads,{timeout:1500}).toBeGreaterThan(initial);
});
