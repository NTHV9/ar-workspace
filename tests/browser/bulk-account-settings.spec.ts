import {test,expect,type Page} from '@playwright/test';
import {auditWorkspace,auditLogin} from './fixtures/audit-workspace';
async function setup(page:Page,regional=false,defaults=false){
 await auditWorkspace(page);const calls:{path:string;body:any}[]=[],hotels=regional?['KAT','TSK']:['KAT','TSK','TLKL'];
 const rows=hotels.flatMap(hotel=>[{hotel,accountId:'same',name:'Synthetic Travel',type:'OTA',revision:1,billingRequired:true,creditTerm:30,billingMethod:'email',source:'account',invoices:12},{hotel,accountId:'new',name:'Synthetic New Account',type:'OTA',revision:0,billingRequired:null,creditTerm:null,billingMethod:null,source:'none',invoices:3}]);
 if(regional)await page.route('**/api/access/me',r=>r.fulfill({json:{email:'staff@example.com',administrator:false,regions:['phuket'],revision:1}}));
 let failOnce=false;
 await page.route('**/api/account-settings/bulk**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(r.request().method()==='GET')return r.fulfill({json:{rows,total:rows.length,defaults:defaults?[{hotel:'KAT',type:'OTA',revision:1,patch:{billingRequired:false,creditTerm:21}}]:[]}});
  const body=r.request().postDataJSON();calls.push({path,body});
  if(path.endsWith('/preview')){
   const chosen=body.mode==='accounts'?rows.filter(a=>body.accounts.some((t:any)=>a.hotel===t.hotel&&a.accountId===t.accountId)):rows.filter(a=>body.types.some((t:any)=>a.hotel===t.hotel&&a.type===t.type));
   const listed=chosen.map(a=>({...a,protected:body.mode==='types'&&a.source==='account',changed:body.mode==='accounts'||a.source!=='account',after:body.mode==='types'&&a.source==='account'?{billingRequired:a.billingRequired,creditTerm:a.creditTerm,billingMethod:a.billingMethod}:{billingRequired:body.patch.billingRequired??a.billingRequired,creditTerm:body.patch.creditTerm??a.creditTerm,billingMethod:a.billingMethod}}));
   return r.fulfill({json:{...body,accounts:chosen.map(({hotel,accountId,revision})=>({hotel,accountId,revision})),rows:listed,accountCount:chosen.length,changedCount:listed.filter(a=>a.changed).length,invoiceCount:listed.filter(a=>a.changed).reduce((n,a)=>n+a.invoices,0),defaultsCount:body.types.length}});
  }
  if(failOnce){failOnce=false;return r.fulfill({status:503,json:{error:'bulk_settings_unavailable'}});}
  return r.fulfill({json:{saved:true,changed:body.accounts.length,invoices:12,defaults:body.types.length}});
 });
 await auditLogin(page);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Account settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Account settings',exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true})).toBeVisible();
 return {calls,failNext:()=>{failOnce=true;}};
}
for(const width of [1440,390])test('multi-hotel settings keep unchecked fields and review exact accounts at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});const {calls}=await setup(page);
 await page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true}).check();await page.getByRole('checkbox',{name:'Select TLKL account Synthetic Travel',exact:true}).check();
 await page.getByRole('checkbox',{name:'Credit term',exact:true}).check();await page.getByLabel('New credit term',{exact:true}).fill('14');
 await page.screenshot({path:`evidence/bulk-account-editor-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Review changes',exact:true}).click();const review=page.getByRole('region',{name:'Review account settings'});await expect(review).toContainText('2 accounts');expect(calls[0].body.patch).toEqual({creditTerm:14});expect(calls[0].body.accounts.map((a:any)=>a.hotel)).toEqual(['KAT','TLKL']);
 await page.screenshot({path:`evidence/bulk-account-review-${width}.png`,fullPage:false});await page.getByRole('button',{name:'Apply changes',exact:true}).click();await expect(page.locator('.bulk-success')).toContainText('Saved 2 accounts');
 expect(calls.filter(c=>c.path.endsWith('/apply'))).toHaveLength(1);expect(await page.locator('.bulk-settings').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
test('type defaults preserve configured accounts and retry unknown save with the same command',async({page})=>{
 const {calls,failNext}=await setup(page);await page.getByRole('radio',{name:'Account types · fallback defaults'}).check();await page.getByRole('checkbox',{name:'OTA',exact:true}).check();
 await page.getByRole('checkbox',{name:'Billing requirement',exact:true}).check();await page.getByLabel('New billing requirement').selectOption('false');
 await page.getByRole('checkbox',{name:'Credit term',exact:true}).check();await page.getByLabel('New credit term').fill('7');await page.getByRole('button',{name:'Review changes',exact:true}).click();
 const review=page.getByRole('region',{name:'Review account settings'});await expect(review.getByText('Keeps Account settings',{exact:true})).toHaveCount(3);await expect(review).toContainText('6 type defaults');
 failNext();await page.getByRole('button',{name:'Apply changes',exact:true}).click();await expect(page.getByRole('button',{name:'Edit selection',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Retry save',exact:true}).click();await expect(page.locator('.bulk-success')).toContainText('Saved');
 const writes=calls.filter(c=>c.path.endsWith('/apply'));expect(writes[0].body).toEqual(writes[1].body);
});
test('regional staff see only permitted hotel choices and can replace recipient groups explicitly',async({page})=>{
 const {calls}=await setup(page,true);await expect(page.getByRole('checkbox',{name:'TLKL',exact:true})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true}).check();await page.getByRole('checkbox',{name:'Billing recipients',exact:true}).check();await page.getByLabel('Billing recipients TO',{exact:true}).fill('synthetic@example.invalid');
 await page.getByRole('button',{name:'Review changes',exact:true}).click();expect(calls[0].body.patch).toEqual({billingRecipients:{to:['synthetic@example.invalid'],cc:[],bcc:[]}});await expect(page.getByRole('region',{name:'Review account settings'})).toContainText('synthetic@example.invalid');
});

for(const width of [1440,390])test('bulk settings focus inline field errors at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 await page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true}).check();await page.getByRole('checkbox',{name:'Credit term',exact:true}).check();
 const term=page.getByLabel('New credit term',{exact:true});await term.fill('-1');await page.getByRole('button',{name:'Review changes',exact:true}).click();await expect(term).toBeFocused();await expect(term).toHaveAttribute('aria-invalid','true');await expect(page.locator('#bulk-error-creditTerm')).toBeVisible();
 await page.screenshot({path:`evidence/bulk-account-error-${width}.png`});await term.fill('14');await expect(term).not.toHaveAttribute('aria-invalid','true');await page.getByRole('button',{name:'Review changes',exact:true}).click();await expect(page.getByRole('region',{name:'Review account settings'})).toBeVisible();
});
test('saved type defaults reopen their exact hotel and values',async({page})=>{
 await setup(page,false,true);await page.locator('.bulk-saved-defaults summary').click();await page.getByRole('button',{name:'Edit KAT · OTA',exact:true}).click();await expect(page.getByLabel('New credit term')).toHaveValue('21');await expect(page.getByLabel('New billing requirement')).toHaveValue('false');
 await expect(page.getByRole('checkbox',{name:'KAT',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'TSK',exact:true})).not.toBeChecked();await page.getByRole('button',{name:'Review changes',exact:true}).click();await expect(page.getByRole('region',{name:'Review account settings'})).toContainText('1 type defaults');
});

for(const width of [1440,390])test('account headers sort and list filters preserve chosen scope at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 const list=page.getByRole('region',{name:'Account settings selection',exact:true}),rows=list.locator('tbody tr');
 await page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true}).check();
 await list.getByRole('button',{name:'Sort by Invoices',exact:true}).click();await expect(rows.first()).toContainText('12');await list.getByRole('button',{name:'Sort by Invoices',exact:true}).click();await expect(rows.first()).toContainText('3');
 for(const label of ['Select','Account','Hotel','Type','Billing','Term · days'])await list.getByRole('button',{name:'Sort by '+label,exact:true}).click();
 await page.getByLabel('Filter setting status',{exact:true}).selectOption('setup');await expect(rows).toHaveCount(3);await expect(page.getByText('1 selected',{exact:true})).toBeVisible();
 await page.getByLabel('Filter credit term',{exact:true}).selectOption('unset');await page.getByRole('searchbox',{name:'Search account settings',exact:true}).fill('TLKL New');await expect(rows).toHaveCount(1);
 await page.getByRole('button',{name:'Clear list filters',exact:true}).click();await expect(rows).toHaveCount(6);await expect(page.getByRole('checkbox',{name:'Select KAT account Synthetic Travel',exact:true})).toBeChecked();
 await page.screenshot({path:`evidence/account-settings-sort-filter-${width}.png`,fullPage:false});
 await page.getByRole('checkbox',{name:'Credit term',exact:true}).check();await page.getByLabel('New credit term').fill('14');await page.getByRole('button',{name:'Review changes',exact:true}).click();
 const review=page.getByRole('region',{name:'Accounts receiving changes',exact:true});for(const label of ['Hotel','Account','Type','Billing requirement','Credit term','Result'])await review.getByRole('button',{name:'Sort by '+label,exact:true}).click();await expect(review.locator('tbody tr')).toHaveCount(1);
});
test('display filters do not shrink a selected Account Type default group',async({page})=>{
 const {calls}=await setup(page);await page.getByRole('radio',{name:'Account types · fallback defaults'}).check();await page.getByRole('checkbox',{name:'OTA',exact:true}).check();
 await page.getByLabel('Filter setting status').selectOption('setup');await expect(page.getByRole('region',{name:'Account settings selection'}).locator('tbody tr')).toHaveCount(3);await expect(page.locator('.bulk-scope-count')).toContainText('all 6 accounts');
 await page.getByRole('checkbox',{name:'Credit term',exact:true}).check();await page.getByLabel('New credit term').fill('14');await page.getByRole('button',{name:'Review changes',exact:true}).click();expect(calls[0].body.accounts).toHaveLength(6);expect(calls[0].body.types).toHaveLength(6);
});
