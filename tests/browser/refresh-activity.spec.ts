import {test,expect} from '@playwright/test';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
import {auditLogin,auditRoute} from './fixtures/audit-workspace';

test('shows saved accounts while OPERA is held, then adopts the verified publication with independent activity',async({page})=>{
 await setupRegional(page,true);let published=false,release:(()=>void)|undefined;
 const held=new Promise<void>(resolve=>{release=resolve;});const activities:unknown[]=[];
 const refresh=()=>({running:!published,hotels:['KAT','TSK'].map(hotel=>({hotel,status:published?'succeeded':'running',last_success_at:published?'2026-10-25T01:10:00Z':'2026-10-25T00:00:00Z'}))});
 await page.route('**/api/portfolio*',r=>r.fulfill({json:{status:'connected',accounts:regionalAccounts.filter(a=>['KAT','TSK'].includes(a.hotel)).map(a=>({...a,name:published?'Updated synthetic account':a.name})),refresh:refresh()}}));
 await page.route('**/api/refresh',async r=>{
  if(r.request().method()==='POST'){await held;return r.fulfill({json:{jobs:[]}});}
  return r.fulfill({json:refresh()});
 });
 await page.route('**/api/refresh/activity',r=>{activities.push(r.request().postDataJSON());return r.fulfill({json:{active:true}});});
 await auditLogin(page);await auditRoute(page,'portfolio=1&region=phuket');
 try{
  const aging=page.getByRole('region',{name:'Current Aging',exact:true});
  await expect(aging).toContainText(regionalAccounts[0].name);
  await expect.poll(()=>activities.length).toBeGreaterThan(0);expect(activities.every(v=>JSON.stringify(v)==='{"region":"phuket"}')).toBe(true);
  await expect(aging).not.toContainText('Updated synthetic account');
  published=true;release!();await expect(aging).toContainText('Updated synthetic account');
 }finally{release!();}
});
