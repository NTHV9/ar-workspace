import {test,expect,type Page} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
import {setupDepth} from './fixtures/ui-depth';
import {memberLogin,type AccessMember} from '../../src/access/model';

const memberId='00000000-0000-4000-8000-000000000081';
const owner:AccessMember={memberId:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',administrator:true,active:true,registered:true,regions:['phuket','khao-lak'],revision:1,setupState:'ready'};
const syntheticPassword='Synthetic-browser-only-17';
async function setup(page:Page,options:{pendingCreate?:boolean;pendingDelete?:boolean;failCreate?:boolean}={}){
 const base=await setupRegional(page),writes:{path:string;body:Record<string,unknown>}[]=[];let members:AccessMember[]=[owner],checkCount=0;
 await page.route('**/api/access/users**',route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(req.method()==='GET')return route.fulfill({json:{rows:members.filter(m=>memberLogin(m).includes(url.searchParams.get('search')??'')),total:members.length}});
  const body=req.postDataJSON();writes.push({path,body});
  if(path.endsWith('/create')){
   if(options.failCreate)return route.fulfill({status:409,json:{error:'access_user_exists'}});
   const email=body.login.includes('@');members.push({memberId,email:email?body.login:null,username:email?undefined:body.login,accountKind:email?'email':'username',administrator:false,active:!options.pendingCreate,registered:!options.pendingCreate,regions:body.regions,revision:2,setupState:options.pendingCreate?'creating':'ready',pendingCommand:options.pendingCreate?body.commandId:null});
   return route.fulfill({status:options.pendingCreate?202:200,json:{state:options.pendingCreate?'pending':'complete',kind:'create',commandId:body.commandId}});
  }
  if(path.endsWith('/delete')){
   if(options.pendingDelete){members=members.map(m=>m.memberId===memberId?{...m,active:false,setupState:'deleting',pendingCommand:body.commandId}:m);return route.fulfill({status:202,json:{state:'pending',kind:'delete',commandId:body.commandId}});}
   members=members.filter(m=>m.memberId!==memberId);return route.fulfill({json:{state:'complete',kind:'delete',memberId}});
  }
  if(path.endsWith('/check')){checkCount++;const deleting=members.some(m=>m.setupState==='deleting');members=deleting?[owner]:members.map(m=>({...m,active:true,registered:true,setupState:'ready',pendingCommand:null}));return route.fulfill({json:{state:'complete',kind:deleting?'delete':'create'}});}
  return route.fulfill({status:501,json:{error:'unexpected_test_request'}});
 });
 return {...base,writes,checks:()=>checkCount};
}
async function create(page:Page,login='synthetic.user'){
 await page.getByLabel('Username or email',{exact:true}).fill(login);
 await page.getByLabel('Password',{exact:true}).fill(syntheticPassword);
 await page.getByLabel('Confirm password',{exact:true}).fill(syntheticPassword);
 await page.getByRole('checkbox',{name:'Khao Lak',exact:true}).check();
 await page.getByRole('button',{name:'Create user',exact:true}).click();
}
for(const width of [1440,390])test(`create and delete username with protected administrator at ${width}px`,async({page})=>{
 const c=await setup(page);await page.setViewportSize({width,height:1000});await page.goto('/?usersAccess=1');
 await create(page);await expect(page.getByRole('status').filter({hasText:'User created.'})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');await expect(page.getByLabel('Confirm password',{exact:true})).toHaveValue('');
 await expect(page.getByRole('cell',{name:'synthetic.user',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Delete ar@katathani.com',exact:true})).toHaveCount(0);
 expect(c.writes[0]).toMatchObject({path:'/api/access/users/create',body:{login:'synthetic.user',regions:['phuket','khao-lak'],password:syntheticPassword}});
 const stored=await page.evaluate(()=>({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage),identity:JSON.parse(localStorage.getItem('sb-example-auth-token')!).user.email}));
 expect(stored.identity).toBe('ar@katathani.com');expect(stored.local+stored.session).not.toContain(syntheticPassword);
 await page.screenshot({path:`.tmp/user-lifecycle-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.getByRole('button',{name:'Delete synthetic.user',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Billing, collection and document history will be kept.');
 await page.screenshot({path:`.tmp/user-delete-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(c.writes).toHaveLength(1);
 await page.getByRole('button',{name:'Delete synthetic.user',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete user',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'User deleted.'})).toBeVisible();await expect(page.getByRole('cell',{name:'synthetic.user',exact:true})).toHaveCount(0);
 expect(c.writes[1]).toMatchObject({path:`/api/access/users/${memberId}/delete`,body:{confirmed:true,revision:2}});expect(c.errors).toEqual([]);
});
test('email creation retains real email and Google-compatible sign-in label',async({page})=>{
 const c=await setup(page);await page.goto('/?usersAccess=1');await create(page,'Synthetic.Email@example.invalid');
 await expect(page.getByRole('cell',{name:'synthetic.email@example.invalid',exact:true})).toBeVisible();expect(c.writes[0].body.login).toBe('synthetic.email@example.invalid');
 await expect(page.getByRole('row').filter({hasText:'synthetic.email@example.invalid'})).toContainText('Email / Google');
});
test('pending creation clears password and checks the same command without creating twice',async({page})=>{
 const c=await setup(page,{pendingCreate:true});await page.goto('/?usersAccess=1');await create(page);await expect(page.getByText('Setup pending', {exact:true})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');await expect(page.getByLabel('Password',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Check creation',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'User created.'})).toBeVisible();
 expect(c.writes.filter(r=>r.path.endsWith('/create'))).toHaveLength(1);expect(c.writes[1].path).toContain(String(c.writes[0].body.commandId));expect(c.writes[1].body).toEqual({});expect(c.checks()).toBe(1);
});
test('pending deletion shows revoked access and allows exact cleanup check',async({page})=>{
 const c=await setup(page,{pendingDelete:true});await page.goto('/?usersAccess=1');await create(page);await expect(page.getByRole('cell',{name:'synthetic.user',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Delete synthetic.user',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete user',exact:true}).click();
 await expect(page.getByText('Deleting · access revoked',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit access for synthetic.user'})).toHaveCount(0);
 await page.getByRole('button',{name:'Check deletion',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'User deleted.'})).toBeVisible();expect(c.checks()).toBe(1);
});
test('password mismatch does not submit and duplicate login never resets password',async({page})=>{
 const c=await setup(page,{failCreate:true});await page.goto('/?usersAccess=1');await page.getByLabel('Username or email',{exact:true}).fill('synthetic.user');
 await page.getByLabel('Password',{exact:true}).fill(syntheticPassword);await page.getByLabel('Confirm password',{exact:true}).fill(syntheticPassword+'x');await page.getByRole('button',{name:'Create user',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Passwords do not match');expect(c.writes).toHaveLength(0);
 await page.getByLabel('Confirm password',{exact:true}).fill(syntheticPassword);await page.getByRole('button',{name:'Create user',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Its password has not been changed');
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');expect(c.writes).toHaveLength(1);
});
test('username sign-in uses private login endpoint and generic failure; Google remains available',async({page})=>{
 await setupDepth(page,{anonymous:true});const attempts:Record<string,unknown>[]=[];
 await page.route('**/api/config',route=>route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key',googleEnabled:true}}));
 await page.route('**/api/access/login',route=>{attempts.push(route.request().postDataJSON());return route.fulfill({status:401,json:{error:'invalid_credentials'}});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();await page.getByLabel('Username or email',{exact:true}).fill('SYNTHETIC.USER');await page.getByLabel('Password',{exact:true}).fill(syntheticPassword);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Check your username and password');expect(attempts).toHaveLength(1);expect(attempts[0]).toMatchObject({username:'SYNTHETIC.USER',password:syntheticPassword});
});
test('successful username password sign-in opens only the granted region',async({page})=>{
 const c=await setupRegional(page);await page.addInitScript(()=>localStorage.removeItem('sb-example-auth-token'));
 const user={id:memberId,email:memberId+'@users.ar-workspace.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-17T00:00:00Z'};
 const token=[{alg:'HS256',typ:'JWT'},{sub:memberId,exp:Math.floor(Date.now()/1000)+86400},'synthetic-signature'].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 await page.route('https://example.supabase.co/**',route=>route.fulfill({json:{user}}));
 await page.route('**/api/access/login',route=>route.fulfill({json:{access_token:token,refresh_token:'synthetic-username-refresh',user}}));
 await page.route('**/api/access/me',route=>route.fulfill({json:{memberId,email:null,username:'synthetic.user',accountKind:'username',administrator:false,regions:['khao-lak'],revision:2}}));
 await page.goto('/');await page.getByLabel('Username or email',{exact:true}).fill('synthetic.user');await page.getByLabel('Password',{exact:true}).fill(syntheticPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Current Aging · Khao Lak',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('combobox',{name:'Region'}).locator('option')).toHaveCount(1);await expect(page.getByRole('combobox',{name:'Region'})).toHaveValue('khao-lak');await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);expect(c.errors).toEqual([]);
});
