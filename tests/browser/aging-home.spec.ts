import {test,expect} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';

for(const width of [1440,390])test(`opening the workspace starts on Current Aging at ${width}`,async({page})=>{
 const c=await setupRegional(page);await page.setViewportSize({width,height:950});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Current Aging · KAT / TSK',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('table',{name:'Current source aging comparison'})).toBeVisible();
 await expect(page).toHaveURL(/dashboard=1&dashboardView=aging/);await expect(page.getByRole('region',{name:'Period filters'})).toHaveCount(0);
 await page.screenshot({path:`.tmp/aging-home-${width}.png`,fullPage:true});expect(c.errors).toEqual([]);
});
test('Portfolio selection survives reload and Back returns to the Aging landing page',async({page})=>{
 await setupRegional(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Portfolio',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();await expect(page).toHaveURL(/portfolio=1/);
 await page.reload();await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
 await page.goBack();await expect(page.getByRole('button',{name:'Current Aging · KAT / TSK',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('explicit Period analysis and existing region-only Portfolio bookmarks retain their destination',async({page})=>{
 await setupRegional(page);await page.goto('/?dashboard=1&dashboardView=period');await expect(page.getByRole('button',{name:'Period analysis',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.goto('/?region=khao-lak');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');
});
test('Khao Lak-only staff land on Current Aging within their grant',async({page})=>{
 const c=await setupRegional(page);await page.addInitScript(()=>{const key='sb-example-auth-token',v=JSON.parse(localStorage.getItem(key)!);v.user={...v.user,id:'00000000-0000-4000-8000-000000000045',email:'synthetic.home@example.invalid'};localStorage.setItem(key,JSON.stringify(v));});
 await page.route('**/api/access/me',route=>route.fulfill({json:{email:'synthetic.home@example.invalid',administrator:false,regions:['khao-lak'],revision:1}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Current Aging · Khao Lak',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('Region',{exact:true})).toHaveValue('khao-lak');
 await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);expect(c.regionalCalls.filter(c=>c.path==='/api/portfolio').every(c=>c.query.get('region')==='khao-lak')).toBe(true);expect(c.errors).toEqual([]);
});
test('Google callback reaches Aging and its one-time code never returns in navigation',async({page})=>{
 const c=await setupRegional(page),exchanges:Record<string,unknown>[]=[];
 const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-09-17T00:00:00Z'};
 await page.addInitScript(()=>{localStorage.removeItem('sb-example-auth-token');localStorage.setItem('sb-example-auth-token-code-verifier',JSON.stringify('synthetic-home-verifier'));});
 await page.route('https://example.supabase.co/auth/v1/token*',route=>{exchanges.push(route.request().postDataJSON());return route.fulfill({json:{access_token:'synthetic-home-token',refresh_token:'synthetic-home-refresh',token_type:'bearer',expires_in:3600,user}});});
 await page.goto('/?code=synthetic-home-code');await expect(page.getByRole('button',{name:'Current Aging · KAT / TSK',exact:true})).toHaveAttribute('aria-pressed','true');expect(exchanges).toEqual([{auth_code:'synthetic-home-code',code_verifier:'synthetic-home-verifier'}]);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Portfolio',exact:true}).click();await expect(page).toHaveURL(/portfolio=1/);await expect(page).not.toHaveURL(/code=/);expect(c.errors).toEqual([]);
});
test('entry normalization preserves URL fragments for authentication processing',async({page})=>{
 await setupRegional(page);await page.goto('/#synthetic-fragment');await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await expect(page).toHaveURL(/dashboardView=aging#synthetic-fragment$/);
});
