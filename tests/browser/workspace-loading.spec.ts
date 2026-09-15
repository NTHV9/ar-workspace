import {test,expect,type Page} from '@playwright/test';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
import {hotelInRegion,regionHotels,type RegionId} from '../../src/domain/hotels';

async function setup(page:Page,region:RegionId,noPublication=false,fastCompletion=false){
 const context=await setupRegional(page),hotels=regionHotels(region),oldAt='2026-09-12T02:59:00Z',newAt='2026-09-12T03:01:00Z';
 let published=false,finished=false,finishedPolls=0,reads=0,hold:Promise<void>|undefined;
 let catalogSent=()=>{};const initialCatalogSent=new Promise<void>(resolve=>{catalogSent=resolve;});
 const refresh=()=>({running:!finished,hotels:hotels.map((hotel,index)=>({hotel,status:finished||published&&index===0?'succeeded':'running',last_success_at:finished||published&&index===0?newAt:noPublication?null:oldAt}))});
 await page.route('**/api/refresh*',async route=>{if(fastCompletion&&route.request().method()==='POST'){await initialCatalogSent;published=true;finished=true;return route.fulfill({json:{jobs:[{status:'succeeded',created:false}]}});}if(route.request().method()==='GET'&&finished)finishedPolls++;return route.fulfill({json:route.request().method()==='POST'?{jobs:[{status:'running',created:false}]}:refresh()});});
 await page.route('**/api/portfolio*',async route=>{
  reads++;const data={status:'connected',refresh:refresh(),accounts:regionalAccounts.filter(a=>hotelInRegion(a.hotel,region)).map((a,index)=>({...a,...published&&index===0?{name:(finished?'Final':'Fresh')+' publication · Synthetic',open:a.open+100}:{}}))};
  if(hold)await hold;await route.fulfill({json:data});catalogSent();
 });
 return {...context,publish:()=>{published=true;},finish:()=>{published=true;finished=true;},finishedPolls:()=>finishedPolls,reads:()=>reads,hold:(wait:Promise<void>)=>{hold=wait;}};
}

for(const region of ['phuket','khao-lak'] as const){
 test(`${region}: updates Dashboard figures when one hotel finishes`,async({page})=>{
  const state=await setup(page,region);await page.goto('/?dashboard=1&region='+region);
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  const requests=()=>state.regionalCalls.filter(c=>c.path==='/api/dashboard/hotel-overview').length;
  await expect.poll(requests).toBeGreaterThan(0);await expect(page.getByRole('button',{name:'Reload saved data',exact:true})).toBeEnabled();
  const before=requests();state.publish();await expect.poll(requests,{timeout:6000}).toBe(before+1);expect(state.errors).toEqual([]);
 });
 test(`${region}: shows a completed hotel publication while the other hotels keep refreshing`,async({page})=>{
  const state=await setup(page,region);await page.goto('/?region='+region);
  await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
  await expect(page.locator('.accounts-panel')).toContainText('Regional Travel');
  state.publish();await expect(page.locator('.accounts-panel')).toContainText('Fresh publication',{timeout:6000});
  expect(state.reads()).toBe(2);expect(state.errors).toEqual([]);
 });
 test(`${region}: keeps the current portfolio usable while saved data is reloading`,async({page})=>{
  const state=await setup(page,region);await page.goto('/?region='+region);
  const heading=page.getByRole('heading',{name:'Receivables portfolio'});await expect(heading).toBeVisible();await expect(page.locator('.accounts-panel')).toContainText('Regional Travel');
  let release=()=>{};state.hold(new Promise<void>(resolve=>{release=resolve;}));
  try{
   await page.getByRole('button',{name:'Reload saved data',exact:true}).click();await expect.poll(state.reads).toBe(2);
   await expect(heading).toBeVisible({timeout:1000});await expect(page.getByText('Loading your workspace…',{exact:true})).toHaveCount(0);
   await page.getByRole('textbox',{name:'Search Account / Account ID'}).fill('Regional');
  }finally{release();}
  await expect(page.locator('.accounts-panel')).toContainText('Regional Travel');expect(state.errors).toEqual([]);
 });
}

test('Dashboard refreshes after the first ever publication while another hotel has no completed snapshot',async({page})=>{
 const state=await setup(page,'phuket',true);await page.goto('/?dashboard=1');
 await expect(page.locator('.live-status')).toContainText('Never refreshed');await expect(page.getByRole('button',{name:'Reload saved data',exact:true})).toBeEnabled();
 const requests=()=>state.regionalCalls.filter(c=>c.path==='/api/dashboard/hotel-overview').length;await expect.poll(requests).toBeGreaterThan(0);
 const before=requests();state.publish();await expect.poll(requests,{timeout:6000}).toBe(before+1);expect(state.errors).toEqual([]);
});

test('loads a fast completed publication even if no active job remains to poll',async({page})=>{
 const state=await setup(page,'phuket',false,true);await page.goto('/?region=phuket');
 await expect(page.locator('.accounts-panel')).toContainText('Final publication');expect(state.reads()).toBe(2);expect(state.errors).toEqual([]);
});

test('coalesces polls during a slow reload and catches a final publication arriving in flight',async({page})=>{
 const state=await setup(page,'phuket');await page.goto('/?region=phuket');await expect(page.locator('.accounts-panel')).toContainText('Regional Travel');
 let release=()=>{};state.hold(new Promise<void>(resolve=>{release=resolve;}));
 try{
  state.publish();await expect.poll(state.reads,{timeout:6000}).toBe(2);
  state.finish();await expect.poll(state.finishedPolls,{timeout:6000}).toBeGreaterThan(0);
  expect(state.reads()).toBe(2);await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
 }finally{release();}
 await expect(page.locator('.accounts-panel')).toContainText('Final publication');expect(state.reads()).toBe(3);expect(state.errors).toEqual([]);
});
