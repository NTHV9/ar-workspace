import {test,expect} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';

for(const [region,hotels,otherHotel] of [
 ['phuket',['KAT','TSK'],'TLKL'],
 ['khao-lak',['TLKL','WAKL','TLFO','TSAN'],'KAT'],
] as const)test(`completed ${region} history is released while another region is still running`,async({page})=>{
 const c=await setupRegional(page),posted:string[]=[],statusRegions:string[]=[];
 const completed:{hotel:string;from:string;to:string;status:string;finishedAt:string}[]=[];
 await page.route('**/api/financial/status**',route=>{
  const requested=new URL(route.request().url()).searchParams.get('region')??'phuket';statusRegions.push(requested);
  // The regional service contract hides unrelated work before computing running.
  // An unscoped request from Khao Lak instead sees Phuket's active work.
  return route.fulfill({json:{enabled:true,running:requested!==region,runs:requested===region?completed:[...completed,{hotel:otherHotel,from:'2026-09-01',to:'2026-09-12',status:'running',finishedAt:null}]}});
 });
 await page.route('**/api/financial/refresh',route=>{
  const input=route.request().postDataJSON();posted.push(input.hotel);
  completed.push({hotel:input.hotel,from:input.from,to:input.to,status:'succeeded',finishedAt:'2026-09-12T03:01:00Z'});
  return route.fulfill({json:{hotel:input.hotel,status:'succeeded'}});
 });
 await page.goto('/?dashboard=1&region='+region+'&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 const refresh=page.getByRole('button',{name:'Refresh OPERA for this period',exact:true});await expect(refresh).toBeEnabled();await refresh.click();
 await expect.poll(()=>posted).toEqual([...hotels]);await expect.poll(()=>statusRegions.length).toBeGreaterThan(1);
 await expect(refresh).toBeEnabled();
 await expect(page.getByText('OPERA is still reading source history.',{exact:false})).toHaveCount(0);
 expect(statusRegions.every(value=>value===region)).toBe(true);expect(c.errors).toEqual([]);
});
