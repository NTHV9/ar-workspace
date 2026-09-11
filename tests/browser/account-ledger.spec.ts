import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';
import {assertButtonVisibility} from './fixtures/button-visibility';
const buckets=['Up to 30','31 - 60','61 - 90','91 - 120','121 - 150','151 and Over'].map((label,i)=>({label,start:i?i*30+1:0,end:i===5?null:(i+1)*30,sequence:i,amount:100,debit:100,credit:0}));
const workflow={revision:1,billing_required:true,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:null};
const entries=[
 {id:'1',guest:'A Pending · Synthetic',age:5,aging:buckets[0].label,workflow},
 {id:'2',guest:'B Billed · Synthetic',age:40,aging:buckets[1].label,workflow:{...workflow,first_billing_date:'2026-09-01'}},
 {id:'3',guest:'C Exempt · Synthetic',age:75,aging:buckets[2].label,workflow:{...workflow,billing_required:false}},
 {id:'4',guest:'D Final · Synthetic',age:130,aging:buckets[4].label,workflow:{...workflow,last_reminder_stage:'Final',last_reminder_date:'2026-09-10'}},
 {id:'5',guest:'E Older · Synthetic',age:190,aging:buckets[5].label,workflow},
 {id:'6',guest:'F Mid · Synthetic',age:50,aging:buckets[1].label,workflow},
 {id:'7',guest:'G Unknown · Synthetic',age:null,aging:'Unknown',workflow:null},
 {id:'8',guest:'H Range · Synthetic',age:null,aging:buckets[3].label,workflow:{...workflow,billing_required:null}},
];
async function setup(page:Page,count=entries.length){
 const invoiceRows=Array.from({length:count},(_,i)=>i<entries.length?entries[i]:{...entries[0],id:String(i+1),guest:`Extra invoice ${i+1} · Synthetic`});
 const unexpected:string[]=[];
 const user={id:'synthetic-ledger-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-11T00:00:00Z'};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(p==='/api/refresh')return r.fulfill({json:{running:false,jobs:[],hotels:[]}});
  if(p==='/api/account-settings/KAT/SYN-A')return r.fulfill({json:{billing_method:'email',billing_portal:null}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[{hotel:'KAT',id:'SYN-A',name:'Synthetic Ledger Account',type:'Agent',open:count*100,over90:300,items:count,agingBuckets:buckets}],refresh:{running:false,hotels:[]}}});
  if(p==='/api/accounts/KAT/SYN-A')return r.fulfill({json:{invoices:invoiceRows.map(e=>({...e,hotel:'KAT',account_id:'SYN-A',invoice_no:'SYN-'+e.id,folio_no:'FOL-'+e.id,transaction_date:'2026-09-01',original:100,open:100,collection_role:'standalone',collection_selectable:true,verification_state:'verified'}))}});
  if(p.startsWith('/api/invoice-exceptions/'))return r.fulfill({status:503,json:{error:'synthetic_exception_unavailable'}});
  unexpected.push(r.request().method()+' '+p);return r.fulfill({status:501,json:{error:'unmocked_synthetic_api'}});
 });page.on('pageerror',e=>unexpected.push(e.message));return unexpected;
}

test('Aging uses source days/ranges in both directions and missing ages stay last',async({page})=>{
 const errors=await setup(page);await page.goto('/?account=SYN-A&property=KAT');
 await page.getByRole('button',{name:'Aging',exact:true}).click();
 const order=()=>page.locator('.ledger tbody tr').evaluateAll(rows=>rows.map(r=>r.querySelectorAll('td')[2].textContent));
 await expect.poll(order,{timeout:1500}).toEqual(['SYN-1','SYN-2','SYN-6','SYN-3','SYN-8','SYN-4','SYN-5','SYN-7']);
 await page.getByRole('button',{name:'Aging',exact:true}).click();await expect.poll(order).toEqual(['SYN-5','SYN-4','SYN-8','SYN-3','SYN-6','SYN-2','SYN-1','SYN-7']);
 await page.getByLabel('Select SYN-2',{exact:true}).check();await page.getByPlaceholder('Search guest / invoice / folio').fill('B Billed');await expect(page.locator('.selection-bar')).toContainText('1 items selected');expect(errors).toEqual([]);
});
test('invoice action and history buttons stay readable without changing records',async({page})=>{
 const errors=await setup(page);await page.goto('/?account=SYN-A&property=KAT');await expect(page.getByLabel('Select SYN-1',{exact:true})).toBeVisible();await assertButtonVisibility(page,page.locator('.selection-bar'));await page.getByLabel('Select SYN-1',{exact:true}).check();await assertButtonVisibility(page,page.locator('.selection-bar'));
 await page.locator('.history-editor summary').click();await assertButtonVisibility(page,page.locator('.history-editor'));expect(errors).toEqual([]);
});

for(const [width,height] of [[1440,900],[1100,800],[390,844]])test(`selected actions stay above an 84-invoice ledger while scrolling at ${width}`,async({page})=>{
 await page.setViewportSize({width,height});const errors=await setup(page,84);await page.goto('/?account=SYN-A&property=KAT');await expect(page.locator('.ledger tbody tr')).toHaveCount(84);
 for(const id of [1,2,3])await page.getByLabel('Select SYN-'+id,{exact:true}).check();const bar=page.locator('.selection-bar');
 expect(await bar.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.ledger')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,1600));await expect(bar).toBeInViewport();const box=await bar.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y).toBeLessThanOrEqual(16);
 await expect(bar).toContainText('3 items selected');await expect(bar).toContainText('THB 300');expect(await bar.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:`evidence/selected-actions-sticky-${width}.png`,animations:'disabled'});
  await bar.getByRole('button',{name:'Prepare documents',exact:true}).click();await expect(page.locator('.document-dialog')).toBeVisible();await expect(page.locator('.document-dialog')).toContainText('3 selected invoices');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await bar.getByRole('button',{name:'Record external billing',exact:true}).click();await expect(page.getByRole('dialog',{name:'Record actual external billing'})).toBeVisible();await page.getByRole('button',{name:'Close external billing'}).click();
 await bar.getByRole('button',{name:'Clear selection',exact:true}).click();await expect(bar).toContainText('0 items selected');await expect(bar.getByRole('button',{name:'Prepare documents',exact:true})).toBeDisabled();expect(errors).toEqual([]);
});
test('latest activity distinguishes unbilled, billed, exempt, unknown and actual Final history',async({page})=>{
 await setup(page);await page.goto('/?account=SYN-A&property=KAT');
 const badge=(id:string)=>page.locator('.ledger tbody tr').filter({hasText:'SYN-'+id}).locator('td').last();
 await expect(badge('1')).toHaveText('No billing sent',{timeout:1500});await expect(badge('2')).toHaveText('Billed');await expect(badge('3')).toHaveText('No reminders sent');await expect(badge('4')).toHaveText('Final · Urgent');await expect(badge('7')).toHaveText('Not available');await expect(badge('8')).toHaveText('Billing setup needed');
 await page.getByRole('button',{name:'C Exempt · Synthetic',exact:true}).click();await expect(page.locator('.detail-fields').getByText('Not required',{exact:true})).toBeVisible();
});
for(const width of [900,1000,390])test(`selected item stays against the right edge at ${width}px and returns focus on Escape`,async({page})=>{
 await page.setViewportSize({width,height:800});await setup(page);await page.goto('/?account=SYN-A&property=KAT');
 const trigger=page.getByRole('button',{name:'A Pending · Synthetic',exact:true});await trigger.click();const drawer=page.getByRole('dialog',{name:'Invoice details',exact:true});await expect(drawer).toBeVisible();
 const box=await drawer.boundingBox();expect(box).not.toBeNull();expect(Math.abs(width-box!.x-box!.width-15)).toBeLessThanOrEqual(2);if(width>600)expect(box!.x).toBeGreaterThan(width/2);
 await page.screenshot({path:`evidence/account-ledger-drawer-${width}.png`,animations:'disabled'});
 await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(trigger).toBeFocused();
});

for(const width of [1024,1100,1200])test(`laptop ${width}: details stay beside the ledger without dimming or blocking selection`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);await page.goto('/?account=SYN-A&property=KAT');
 await page.getByRole('button',{name:'A Pending · Synthetic',exact:true}).click();
 const panel=page.locator('.invoice-detail');await expect(panel).toBeVisible();
 expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(false);
 const side=await panel.boundingBox(),ledger=await page.locator('.ledger-panel').boundingBox();expect(side!.x).toBeGreaterThanOrEqual(ledger!.x+ledger!.width);
 await page.getByLabel('Select SYN-2',{exact:true}).check();await expect(page.locator('.selection-bar')).toContainText('1 items selected');
 expect(await page.locator('.selection-bar').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 if(width===1100)await page.screenshot({path:'evidence/account-panel-inline-1100.png',animations:'disabled'});
 await page.setViewportSize({width:900,height:800});await expect(page.getByRole('dialog',{name:'Invoice details'})).toBeVisible();expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(true);
 await page.setViewportSize({width,height:900});await expect(page.getByRole('complementary',{name:'Invoice details'})).toBeVisible();expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(false);await expect(page.getByLabel('Select SYN-2',{exact:true})).toBeChecked();
});
