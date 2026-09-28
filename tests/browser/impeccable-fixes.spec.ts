import {test,expect} from '@playwright/test';
import {auditWorkspace,auditLogin,auditRoute} from './fixtures/audit-workspace';
import {choosePdfTool} from './fixtures/pdf-tools';
test('internal recovery links preserve the current tab session, region and route',async({page,context})=>{
 await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'storage=1&region=khao-lak&hotel=TLKL');
 await expect(page.getByRole('heading',{name:'Storage',exact:true})).toBeVisible();await page.getByRole('link',{name:'Operations & recovery →',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Operations & recovery',exact:true})).toBeVisible();await expect(page).toHaveURL(/operations=1/);expect(new URL(page.url()).searchParams.get('region')).toBe('khao-lak');expect(new URL(page.url()).searchParams.get('hotel')).toBe('TLKL');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Operations & recovery',exact:true})).toBeVisible();
 const fresh=await context.newPage();await auditWorkspace(fresh);await fresh.goto('/');await expect(fresh.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();await fresh.close();
});
for(const width of [1440,1280,390])test(`account ${width}: compact summary, precise amounts and accessible selection`,async({page})=>{
 await page.setViewportSize({width,height:720});await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'account=A&property=KAT');
 await expect(page.getByRole('heading',{name:'Synthetic Travel',exact:true})).toBeVisible();await expect(page.locator('.account-summary')).not.toHaveAttribute('open','');
 await page.getByLabel('Select SYN-10085',{exact:true}).check();await expect(page.getByRole('region',{name:'Selected invoices'})).toContainText('THB 1,558,080.00');
 await page.getByRole('button',{name:'Open amount THB 1,558,080.00 · Invoice SYN-10085',exact:true}).click();
 const detail=page.getByRole(width<=1000?'dialog':'complementary',{name:'Invoice details',exact:true});await expect(detail.locator('.detail-balance')).toContainText('THB 1,558,080.00');await expect(detail).toContainText('Original amount');
 if(width<=1000)await detail.getByRole('button',{name:'Close invoice details'}).click();
 const ledger=page.getByRole('region',{name:'Invoice ledger'});if(width>800){const row=ledger.locator('tbody tr').first();await expect(row).toBeInViewport();expect(await ledger.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);}
 await page.screenshot({path:`.tmp/impeccable-fixes/account-${width}.png`,fullPage:false});
 await page.getByRole('button',{name:'Account settings',exact:true}).click();await expect(page.getByRole('button',{name:'Account settings',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('invalid account fields are identified and focus follows errors across recipient sections',async({page})=>{
 const {writes}=await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'account=A&property=KAT');await page.getByRole('button',{name:'Account settings',exact:true}).click();
 const term=page.getByLabel('Credit term (calendar days)',{exact:true});await term.fill('-1');await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(term).toHaveAttribute('aria-invalid','true');await expect(term).toBeFocused();await term.fill('30');
 await page.getByRole('button',{name:'Billing recipients',exact:true}).click();const to=page.getByLabel('Billing To',{exact:true});await to.fill('not-an-email');await page.getByRole('button',{name:'Collection recipients',exact:true}).click();await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(to).toBeFocused();await expect(to).toHaveAttribute('aria-invalid','true');expect(writes.some(w=>w.path.startsWith('/api/account-settings'))).toBe(false);
 await page.screenshot({path:'.tmp/impeccable-fixes/settings-invalid.png',fullPage:false});await to.fill('synthetic@example.invalid');await page.getByRole('button',{name:'Save account settings',exact:true}).click();await expect(page.getByRole('status')).toContainText('Account settings saved');expect(writes.filter(w=>w.path.startsWith('/api/account-settings'))).toHaveLength(1);
});
test('collection-rule validation identifies the reason and offset without publishing',async({page})=>{
 const {writes}=await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'collectionPolicy=1');const days=page.getByLabel('Round 3 days',{exact:true});await days.fill('-1');await page.getByRole('button',{name:'Review rule changes',exact:true}).click();await expect(days).toHaveAttribute('aria-invalid','true');await expect(days).toBeFocused();await days.fill('7');await page.getByRole('button',{name:'Review rule changes',exact:true}).click();await expect(page.getByLabel('Reason for rule change',{exact:true})).toBeFocused();expect(writes.some(w=>w.path==='/api/collection-policy')).toBe(false);
});
test('template save status follows changes and selected template exposes its state',async({page})=>{
 await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'templates=1');const saved=page.locator('.template-choice').first();await saved.click();await expect(saved).toHaveAttribute('aria-pressed','true');await page.getByLabel('Template subject',{exact:true}).fill('Changed synthetic subject');await expect(page.locator('.template-editor-title')).toContainText('Unsaved changes');await page.screenshot({path:'.tmp/impeccable-fixes/template-unsaved.png',fullPage:false});await page.getByRole('button',{name:'Save template',exact:true}).click();await expect(page.locator('.template-editor-title')).toContainText('Saved');
});
for(const height of [720,800])test(`plain and rich email stay above signature at 1280x${height}`,async({page})=>{
 await page.setViewportSize({width:1280,height});const {writes}=await auditWorkspace(page);await page.goto('/tests/browser/audit-email/harness.html');const body=page.getByRole('textbox',{name:'Email message',exact:true}),signature=page.getByLabel('Email signature',{exact:true});await expect(signature).toBeVisible();
 const a=await body.boundingBox(),b=await signature.boundingBox();expect(a!.y+a!.height).toBeLessThanOrEqual(b!.y+1);
 await body.fill('Updated synthetic message');await expect(page.locator('#email-handoff-reason')).toContainText('Save your message');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();
 await page.screenshot({path:`.tmp/impeccable-fixes/email-${height}.png`,fullPage:false});await page.getByRole('button',{name:'Rich text',exact:true}).click();const editor=page.locator('.email-message .rich-message-editor');const c=await editor.boundingBox(),d=await signature.boundingBox();expect(c!.y+c!.height).toBeLessThanOrEqual(d!.y+1);expect(writes.some(w=>/\/send|gmail-draft/.test(w.path))).toBe(false);
});
test('Move lines selects with Enter, nudges with arrows and retains Undo',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await choosePdfTool(page,'Move lines');const line=page.getByRole('button',{name:/^Move line /}).first();await line.press('Enter');const area=page.getByRole('button',{name:'Move selected table or area',exact:true});await expect(area).toBeFocused();const before=await area.getAttribute('style');await area.press('ArrowDown');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await expect(area).not.toHaveAttribute('style',before!);await area.press('Escape');await expect(area).toHaveCount(0);await expect(line).toBeFocused();
 await choosePdfTool(page,'Move table / area');await page.getByLabel('Width',{exact:true}).fill('-1');await page.getByRole('button',{name:'Select area',exact:true}).click();await expect(page.getByRole('alert')).toContainText('positive width');await page.getByLabel('Width',{exact:true}).fill('100');await page.getByRole('button',{name:'Select area',exact:true}).click();await expect(area).toBeFocused();
 await page.screenshot({path:'.tmp/impeccable-fixes/pdf-tools.png',fullPage:false});
 const menu=page.locator('summary[aria-label^="Move tools"]');await menu.press('Enter');await menu.press('Escape');await expect(menu).toBeFocused();expect(await menu.evaluate(e=>(e.parentElement as HTMLDetailsElement).open)).toBe(false);await expect(area).toHaveCount(1);
});

test('functional text contrast and selected navigation states meet the audited requirements',async({page})=>{
 await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'account=A&property=KAT');await expect(page.getByRole('heading',{name:'Synthetic Travel',exact:true})).toBeVisible();
 const colors=await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Dashboard',exact:true}).evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e.closest('nav')!).backgroundColor}));
 const luminance=(color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=luminance(colors.fg),b=luminance(colors.bg);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Aging',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('button',{name:'Invoice / Folio',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('history invalid dates focus the actual field without sending a write',async({page})=>{
 const {writes}=await auditWorkspace(page);await auditLogin(page);await auditRoute(page,'account=A&property=KAT');await page.locator('.history-editor summary').click();const date=page.getByLabel('First actual billing date',{exact:true});await date.fill('2099-01-01');await page.getByRole('button',{name:'Save history',exact:true}).click();await expect(date).toBeFocused();await expect(date).toHaveAttribute('aria-invalid','true');expect(writes.some(w=>w.path.startsWith('/api/invoice-history'))).toBe(false);
});
test('remittance work and retention guidance stay compact and explicit',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await auditWorkspace(page);await auditLogin(page);await page.getByRole('button',{name:'Remittances',exact:true}).click();await expect(page.getByRole('button',{name:'Open SYNTH-REMIT',exact:true})).toBeInViewport();await expect(page.getByTestId('remittance-summary')).toContainText('THB 1,000.00');expect((await page.getByTestId('remittance-summary').boundingBox())!.height).toBeLessThan(100);await page.screenshot({path:'.tmp/impeccable-fixes/remittances.png',fullPage:false});
 await page.getByRole('button',{name:'Storage',exact:true}).click();await expect(page.locator('.storage-lifecycle')).toContainText('pending drafts and uncertain sends remain protected');await expect(page.locator('.storage-setup')).not.toHaveAttribute('open','');await expect(page.getByRole('heading',{name:'Retained evidence and older files'})).toBeVisible();await page.screenshot({path:'.tmp/impeccable-fixes/storage.png',fullPage:false});
});
