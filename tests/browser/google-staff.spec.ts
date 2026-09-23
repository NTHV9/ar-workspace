import {test,expect,type BrowserContext,type Page} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{providers:['google']},user_metadata:{},created_at:'2026-09-23T00:00:00Z'};
async function setup(context:BrowserContext){
 const writes:Record<string,unknown>[]=[];let rows=[{memberId:user.id,email:user.email,administrator:true,active:true,registered:true,regions:['phuket','khao-lak'],revision:1,displayName:null as string|null}];
 await context.route('https://example.supabase.co/**',route=>{
  if(route.request().url().includes('/token'))return route.fulfill({json:{access_token:'synthetic-google-token',refresh_token:'synthetic-google-refresh',expires_in:3600,token_type:'bearer',user}});
  return route.fulfill({json:{user}});
 });
 await context.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key',googleEnabled:true}});
  if(path==='/api/access/me')return route.fulfill({json:rows[0]});
  if(path==='/api/access/users'){
   if(route.request().method()==='POST'){const value=route.request().postDataJSON();writes.push(value);rows.push({...value,memberId:'00000000-0000-4000-8000-000000000003',administrator:false,registered:false,revision:1});return route.fulfill({json:rows.at(-1)});}
   return route.fulfill({json:{rows,total:rows.length}});
  }
  return route.fulfill({json:{}});
 });return {writes};
}
async function googleReturn(page:Page){
 await page.goto('/?usersAccess=1');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key+'-code-verifier',JSON.stringify('synthetic-code-verifier'));});
 await page.goto('/?usersAccess=1&code=synthetic-code');
 await expect(page.getByRole('heading',{name:'Users & Access'})).toBeVisible();
}
for(const width of [1440,390])test(`Google-only named staff form at ${width}px`,async({context,page})=>{
 const c=await setup(context);await page.setViewportSize({width,height:1000});await googleReturn(page);
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Edit access for ar@katathani.com'})).toHaveCount(0);
 await page.getByLabel('Google email',{exact:true}).fill('synthetic.staff@gmail.com');await page.getByLabel('Name',{exact:true}).fill('Synthetic Staff');
 await page.getByRole('button',{name:'Create user',exact:true}).click();await expect(page.getByRole('cell',{name:'Synthetic Staff synthetic.staff@gmail.com'})).toBeVisible();
 expect(c.writes[0]).toMatchObject({email:'synthetic.staff@gmail.com',displayName:'Synthetic Staff',regions:['phuket']});
 expect(Object.keys(c.writes[0])).not.toContain('password');
 await page.screenshot({path:`.tmp/google-staff-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
test('refresh keeps login; new tab and a fresh opening do not inherit it',async({context,page})=>{
 await setup(context);await googleReturn(page);await page.reload();await expect(page.getByRole('heading',{name:'Users & Access'})).toBeVisible();
 const other=await context.newPage();await other.goto('/?usersAccess=1');await expect(other.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
 const popupPromise=page.waitForEvent('popup');await page.evaluate(()=>window.open('/?usersAccess=1','_blank'));const popup=await popupPromise;
 await expect(popup.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();await popup.close();
 await page.goto('/?usersAccess=1');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
});
test('legacy persistent password login is discarded and no password controls are exposed',async({context,page})=>{
 await setup(context);await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'old',refresh_token:'old',expires_at:9999999999,user:u})),user);
 await page.goto('/?usersAccess=1');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('sb-example-auth-token'))).toBeNull();
});
