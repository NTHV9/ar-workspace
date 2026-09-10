import {policyFixture} from './fixtures/collection-policy';
import {test, expect, type Page, type Locator} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const sizes = [{width:1440,height:900},{width:1280,height:800},{width:390,height:844}];
async function noPageOverflow(page:Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A clipped shell can conceal overflow even though document.scrollWidth is correct.
  const clipped = await page.locator('.page,.app-header,.live-status').evaluateAll(elements=>elements.map(e=>({
    surface:e.className,width:e.clientWidth,content:e.scrollWidth,
  })).filter(e=>e.content>e.width+1));
  expect(clipped).toEqual([]);
}
async function touchTarget(target:Locator) {
  const box=await target.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
}
async function screenshot(page:Page,name:string,width:number) {
  await page.evaluate(()=>document.fonts.ready);
  mkdirSync('evidence',{recursive:true});
  await page.screenshot({path:`evidence/responsive-${name}-${width}.png`,fullPage:!name.includes('drawer'),animations:'disabled'});
}
async function noBackgroundFocus(dialog:Locator) {
  // Native dialogs may let Tab visit browser chrome (activeElement is body),
  // but their inert background must never receive keyboard focus.
  expect(await dialog.evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body)).toBe(true);
}
async function syntheticQueue(page:Page) {
  const names=['Azure Travel · Synthetic','Harbor Tours · Synthetic','Coral Travel · Synthetic'];
  const rows=names.map((name,index)=>({hotel:index===1?'TSK':'KAT',account_id:String(index+1),id:String(index+100),guest:`Synthetic Guest ${index+1}`,invoice_no:`INV-${index+1}`,folio_no:`FOL-${index+1}`,open:10000*(index+1),transaction_date:'2026-08-01',collection_role:'standalone',collection_selectable:true,verification_state:'verified',account_name:name,account_type:'OTA',workflow:{revision:0,billing_required:false,credit_term:30,first_billing_date:null,last_reminder_stage:index===2?'Final':null,last_reminder_date:index===2?'2026-09-09':null,due_date:'2026-09-01'}}));
  const calls:string[]=[];
  const user={id:'synthetic-responsive-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
  await page.clock.setFixedTime(new Date('2026-09-10T05:00:00Z'));
  await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user:u})),user);
  await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
  await page.route('**/api/**',r=>{
    const request=r.request(),path=new URL(request.url()).pathname;calls.push(request.method()+' '+path);
    if(path==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
    if(path==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
    if(path==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:rows.map(row=>({id:row.account_id,hotel:row.hotel,name:row.account_name,type:row.account_type,open:row.open,items:1,over90:0})),refresh:{running:false,hotels:[]}}});
    if(path==='/api/collection-queue')return r.fulfill({json:{rows,asOf:'2026-09-10'}});
    if(path==='/api/mail-reconciliation')return r.fulfill({json:{enabled:true,intervalMinutes:15,waiting:0,needsReview:0,last:null}});
    if(path.startsWith('/api/accounts/'))return r.fulfill({json:{invoices:[]}});
    return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
  });
  return calls;
}

for(const size of sizes) {
  test(`portfolio/account ${size.width}: complete matrices, accessible selection and return`,async({page})=>{
    await page.setViewportSize(size);
    await page.route('**/api/**',route=>route.fulfill({json:{}}));
    await page.goto('/?mode=review');
    await expect(page.locator('.accounts-panel tbody tr')).toHaveCount(10);
    await expect(page.locator('.table-panel').first().locator('tbody tr')).toHaveCount(6);
    for(const header of ['TSK','KAT','Total open'])await expect(page.locator('.accounts-panel').getByRole('button',{name:header,exact:true})).toBeVisible();
    await screenshot(page,'portfolio',size.width);
    await noPageOverflow(page);
    if(size.width===390) {
      await touchTarget(page.getByLabel('Account Type',{exact:true}));
      await touchTarget(page.locator('.accounts-panel .name-link').first());
      await page.getByRole('region',{name:'Accounts comparison',exact:true}).focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(()=>page.getByRole('region',{name:'Accounts comparison',exact:true}).evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByLabel('Account Type',{exact:true}).selectOption('OTA / Agent');
    await page.getByPlaceholder('Search Account / Account ID').fill('Account A');
    await page.locator('.accounts-panel td.kat button').click();
    await expect(page.getByRole('heading',{name:'Account A · Synthetic',exact:true})).toBeVisible();
    await page.getByLabel('Select INV-10085',{exact:true}).check();
    await page.getByLabel('Select INV-13776',{exact:true}).check();
    await page.getByPlaceholder('Search guest / invoice / folio').fill('Guest A');
    await expect(page.locator('.selection-bar')).toContainText('2 items selected');
    await page.getByPlaceholder('Search guest / invoice / folio').fill('');
    await screenshot(page,'account',size.width);
    await noPageOverflow(page);
    if(size.width===390) {
      await touchTarget(page.getByRole('button',{name:'Clear selection',exact:true}));
      await touchTarget(page.locator('.ledger .name-link').first());
    }
    await page.getByRole('button',{name:'Back to portfolio',exact:false}).click();
    await expect(page.getByLabel('Account Type',{exact:true})).toHaveValue('OTA / Agent');
    await expect(page.getByPlaceholder('Search Account / Account ID')).toHaveValue('Account A');
    await expect(page.locator('.accounts-panel tbody tr')).toHaveCount(1);
  });

  test(`queue ${size.width}: awareness, readable filters and complete work`,async({page})=>{
    await page.setViewportSize(size);
    const calls=await syntheticQueue(page);
    await page.goto('/?collections=1');
    await expect(page.locator('.queue-work tbody tr')).toHaveCount(3);
    await expect(page.locator('.queue-work tbody')).toContainText('Urgent');
    await screenshot(page,'queue',size.width);
    await noPageOverflow(page);
    if(size.width===390) {
      await touchTarget(page.getByLabel('Queue account',{exact:true}));
      await touchTarget(page.getByRole('button',{name:'Azure Travel · Synthetic',exact:true}));
    }
    expect(calls.filter(c=>c.startsWith('POST ')&&!c.endsWith('/api/refresh'))).toEqual([]);
  });
}

test('hotel picker traps keyboard focus, closes with Escape and restores its trigger',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:{}}));
  await page.goto('/?mode=review');
  const trigger=page.locator('.accounts-panel .name-link').first();
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Choose account hotel'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.hotel-choice').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await noBackgroundFocus(dialog);
  await page.keyboard.press('Tab');
  await noBackgroundFocus(dialog);
  await dialog.locator('.hotel-choice').first().focus();
  await expect(dialog.locator('.hotel-choice').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('mobile invoice drawer isolates focus, keeps selection and returns to its invoice',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/**',route=>route.fulfill({json:{}}));
  await page.goto('/?mode=review&account=sample-0-0&property=KAT');
  await page.getByLabel('Select INV-10085',{exact:true}).check();
  const trigger=page.locator('.ledger .name-link').first();
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Invoice details'});
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button',{name:'Close invoice details',exact:true})).toBeFocused();
  await screenshot(page,'invoice-drawer',390);
  await page.keyboard.press('Tab');
  await noBackgroundFocus(dialog);
  await page.keyboard.press('Tab');
  await noBackgroundFocus(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator('.selection-bar')).toContainText('1 items selected');
});

test('mobile queue drawer returns focus and keeps account scope through a nested preparation dialog',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const calls=await syntheticQueue(page);
  await page.goto('/?collections=1&qstage=Follow+1');
  const trigger=page.getByRole('button',{name:'Azure Travel · Synthetic',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Collection work details'});
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button',{name:'Close queue details',exact:true})).toBeFocused();
  await page.getByLabel('Queue select INV-1',{exact:true}).check();
  await screenshot(page,'queue-drawer',390);
  await page.getByRole('button',{name:'Prepare collection documents',exact:true}).click();
  const preparation=page.locator('.document-dialog');
  await expect(preparation).toBeVisible();
  await preparation.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByLabel('Queue select INV-1',{exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Open account details',exact:true}).click();
  await page.getByRole('button',{name:'Back to collections',exact:true}).click();
  await expect(page.getByLabel('Queue stage',{exact:true})).toHaveValue('Follow 1');
  expect(calls.filter(c=>c.startsWith('POST ')&&!c.endsWith('/api/refresh'))).toEqual([]);
});
