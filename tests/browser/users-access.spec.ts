import {test,expect,type Page} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
import {setupDepth,depthJobId} from './fixtures/ui-depth';
import type {AccessMember} from '../../src/access/model';
import type {RegionId} from '../../src/domain/hotels';
const owner:AccessMember={email:'ar@katathani.com',administrator:true,active:true,regions:['phuket','khao-lak'],revision:1,registered:true};
async function adminSetup(page:Page,extra=0){
 const context=await setupRegional(page),writes:Record<string,unknown>[]=[];let conflict=false;
 let members:AccessMember[]=[owner,{email:'synthetic.phuket@example.invalid',administrator:false,active:true,regions:['phuket'],revision:1,registered:false},{email:'synthetic.khaolak@example.invalid',administrator:false,active:false,regions:['khao-lak'],revision:2,registered:true},...Array.from({length:extra},(_,i)=>({email:`synthetic.${String(i).padStart(3,'0')}@example.invalid`,administrator:false,active:true,regions:['phuket'] as RegionId[],revision:1,registered:false}))];
 await page.route('**/api/access/users*',route=>{const r=route.request(),url=new URL(r.url());if(r.method()==='POST'){const input=r.postDataJSON();writes.push(input);if(conflict)return route.fulfill({status:409,json:{error:'access_revision_conflict'}});const found=members.find(m=>m.email===input.email);const row={...input,administrator:false,registered:found?.registered??false,revision:(found?.revision??0)+1};members=members.filter(m=>m.email!==input.email).concat(row);return route.fulfill({json:row});}const selected=members.filter(m=>(m.email??'').includes(url.searchParams.get('search')??'')),page=Number(url.searchParams.get('page')??0);return route.fulfill({json:{rows:selected.slice(page*25,page*25+25),total:selected.length}});});
 return {...context,writes,conflict:()=>{conflict=true;}};
}
for(const width of [1440,390])test(`administrator manages future regional access at ${width}px`,async({page})=>{
 const c=await adminSetup(page);await page.setViewportSize({width,height:1000});await page.goto('/?usersAccess=1');
 await expect(page.getByRole('heading',{name:'Users & Access'})).toBeVisible();await expect(page.getByText('Administrator · protected')).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit access for ar@katathani.com'})).toHaveCount(0);
 await expect(page.getByText('Email delivery is not enabled.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Approve email only',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('Synthetic.Future@example.invalid');await page.getByRole('checkbox',{name:'Khao Lak',exact:true}).check();
 await page.getByRole('button',{name:'Approve access'}).click();await expect(page.getByRole('status').filter({hasText:'Access saved.'})).toContainText('Access saved. No invitation email was sent.');
 expect(c.writes).toHaveLength(1);expect(c.writes[0]).toMatchObject({email:'synthetic.future@example.invalid',regions:['phuket','khao-lak'],active:true,revision:0});
 await expect(page.getByRole('cell',{name:'synthetic.future@example.invalid',exact:true})).toBeVisible();
 await page.screenshot({path:`.tmp/users-access-${width}.png`,fullPage:true});
 const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.access-table-scroll')).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))}));
 expect(geometry.scroll,JSON.stringify(geometry)).toBeLessThanOrEqual(width);expect(c.errors).toEqual([]);
});
test('keeps conflicting edits and paginates every approved email',async({page})=>{
 const c=await adminSetup(page,30);await page.goto('/?usersAccess=1');await expect(page.getByText('1–25 of 33')).toBeVisible();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('26–33 of 33')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search users'}).fill('synthetic.phuket');await expect(page.getByText('1–1 of 1')).toBeVisible();
 await page.getByRole('button',{name:'Edit access for synthetic.phuket@example.invalid'}).click();await page.getByRole('checkbox',{name:'Khao Lak',exact:true}).check();c.conflict();
 await page.getByRole('button',{name:'Save access',exact:true}).click();await expect(page.getByRole('alert')).toContainText('changed since you opened it');await expect(page.getByLabel('Email',{exact:true})).toHaveValue('synthetic.phuket@example.invalid');await expect(page.getByRole('checkbox',{name:'Khao Lak',exact:true})).toBeChecked();
});
async function staffSetup(page:Page,regions:RegionId[]){
 const context=await setupRegional(page);let active=true;
 await page.addInitScript(()=>{const key='sb-example-auth-token',data=JSON.parse(localStorage.getItem(key)!);data.user={...data.user,id:'00000000-0000-4000-8000-000000000044',email:'synthetic.staff@example.invalid'};localStorage.setItem(key,JSON.stringify(data));});
 await page.route('**/api/access/me',route=>route.fulfill(active?{json:{email:'synthetic.staff@example.invalid',administrator:false,regions,revision:1}}:{status:403,json:{error:'access_forbidden'}}));
 return {...context,revoke:()=>{active=false;}};
}
for(const regions of [['phuket'],['khao-lak'],['phuket','khao-lak']] as RegionId[][])test(`staff sees only granted regions ${regions.join(',')}`,async({page})=>{
 const c=await staffSetup(page,regions);await page.goto('/?region=phuket');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Region'}).locator('option')).toHaveCount(regions.length);
 await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Storage',exact:true})).toHaveCount(0);
 expect(c.regionalCalls.filter(c=>['/api/portfolio','/api/refresh'].includes(c.path)).every(c=>regions.includes((c.query.get('region')??(c.method==='POST'?'khao-lak':'phuket')) as RegionId)||c.method==='POST')).toBe(true);
 await page.goto('/?usersAccess=1&region='+regions[0]);await expect(page.getByRole('heading',{name:'Administrator access required'})).toBeVisible();expect(c.errors).toEqual([]);
});
test('revoked staff access clears the visible workspace on focus recheck',async({page})=>{
 const c=await staffSetup(page,['khao-lak']);await page.goto('/?region=khao-lak');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();c.revoke();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Workspace access unavailable'})).toBeVisible();await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toHaveCount(0);await expect(page.getByText('Regional Travel · Synthetic',{exact:true})).toHaveCount(0);
});
test('Khao Lak reviewed documents retain downloads and cannot enter email preparation',async({page})=>{
 const c=await setupDepth(page);const original={id:depthJobId,owner:'00000000-0000-4000-8000-000000000001',account_id:'SYNTHETIC',account_name:'Synthetic Khao Lak',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:['SYNTHETIC'],manifest:[{id:'SYNTHETIC',invoice_no:'SYNTHETIC'}],revision:1,lifecycle:'transient',files:[],created_at:'2026-09-12T02:59:00Z'};
 await page.route('**/api/documents/'+depthJobId,route=>route.fulfill({json:{...original,hotel:'TLKL',state:'ready',acknowledged:true,exports:[{name:'Synthetic.pdf',storage_key:`jobs/${depthJobId}/exports/synthetic.pdf`,byte_count:100,sha256:'a'.repeat(64)}]}}));
 await page.goto('/?region=khao-lak&documentJob='+depthJobId+'&compose=1');await expect(page.getByText('Email delivery is not enabled for Khao Lak.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Synthetic.pdf · Download'})).toBeVisible();
 expect(c.methods).not.toContain('POST /api/email/open');
});
test('approved users can start password enrollment explicitly without automatic invitations',async({page})=>{
 await setupDepth(page,{anonymous:true});const signups:Record<string,unknown>[]=[];
 await page.route('https://example.supabase.co/auth/v1/signup*',route=>{signups.push(route.request().postDataJSON());return route.fulfill({json:{user:{id:'00000000-0000-4000-8000-000000000066',email:'synthetic.new@example.invalid',identities:[]},session:null}});});
 await page.goto('/');await page.getByRole('button',{name:'Create web app password',exact:true}).click();expect(signups).toHaveLength(0);
 await page.getByLabel('Email',{exact:true}).fill('synthetic.new@example.invalid');await page.getByLabel('Password',{exact:true}).fill('Synthetic-only-password-17');
 await page.getByRole('button',{name:'Create web app password',exact:true}).click();await expect(page.getByRole('status')).toContainText('Check your email to confirm');expect(signups).toHaveLength(1);expect(signups[0].email).toBe('synthetic.new@example.invalid');
});
test('administrator can suspend an existing user without losing the selected region',async({page})=>{
 const c=await adminSetup(page);await page.goto('/?usersAccess=1');await page.getByRole('button',{name:'Edit access for synthetic.phuket@example.invalid'}).click();
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('suspended');await page.getByRole('button',{name:'Save access',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Access suspended.'})).toBeVisible();expect(c.writes[0]).toMatchObject({email:'synthetic.phuket@example.invalid',regions:['phuket'],active:false,revision:1});
});
test('regional staff collections do not poll or expose global mailbox administration',async({page})=>{
 const c=await staffSetup(page,['phuket']);await page.goto('/?collections=1&region=phuket');await expect(page.getByRole('heading',{level:1,name:'Billing & Collection Queue'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Check sent status now'})).toHaveCount(0);await expect(page.getByText('Sent-check status unavailable.',{exact:true})).toHaveCount(0);expect(c.regionalCalls.some(c=>c.path==='/api/mail-reconciliation')).toBe(false);
});
