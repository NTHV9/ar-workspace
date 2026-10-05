import {test,expect} from '@playwright/test';
import {auditWorkspace,auditLogin,auditRoute} from './fixtures/audit-workspace';
for(const width of [1280,390])test(`tracker status and reviewed differences ${width}`,async({page})=>{
 await page.setViewportSize({width,height:800});await auditWorkspace(page);const commands:unknown[]=[];
 await page.route('**/api/reports/sheets',r=>r.fulfill({json:{rows:[{region:'phuket',url:'https://docs.google.com/spreadsheets/d/synthetic_phuket_sheet_12345/edit'}]}}));
 await page.route('**/api/reports/tracker?region=phuket',async r=>{
  if(r.request().method()==='POST'){commands.push(r.request().postDataJSON());await r.fulfill({json:{resolved:true}});return;}
  await r.fulfill({json:{connected:true,enabled:true,available:true,bootstrapConfirmed:true,revision:1,lastCheckedAt:'2026-09-30T00:00:00Z',pending:2,conflictCount:1,conflicts:[{id:'00000000-0000-4000-8000-000000000001',rowKey:'KAT · Synthetic account · 00001',field:'R',reason:'concurrent_or_unmapped_edit',sheetValue:'2026-09-01',webValue:'2026-09-02',revision:3}]}});
 });
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=sheets');
 await expect(page.getByRole('status')).toContainText('2 pending writes');expect(commands).toHaveLength(0);
 await page.getByRole('button',{name:'Review differences (1)'}).click();await expect(page.getByText('2026-09-01',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Keep AR value'}).click();expect(commands).toEqual([{action:'resolve',conflictId:'00000000-0000-4000-8000-000000000001',revision:3,choice:'keep_web'}]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.tmp/tracker-sync/tracker-${width}.png`,fullPage:false});
});
test('initial import requires a reviewed preview and exact snapshot confirmation',async({page})=>{
 await auditWorkspace(page);let confirmed=false;const commands:Record<string,unknown>[]=[];
 await page.route('**/api/reports/sheets',r=>r.fulfill({json:{rows:[{region:'phuket',url:'https://docs.google.com/spreadsheets/d/synthetic_phuket_sheet_12345/edit'}]}}));
 await page.route('**/api/reports/tracker?region=phuket',async r=>{
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();commands.push(input);
   if(input.action==='preview'){await r.fulfill({json:{previewId:'00000000-0000-4000-8000-000000000007',snapshotHash:'a'.repeat(64),rowCount:1,matchedRows:1,heldRows:0,eligibleFields:1,conflictingFields:0,details:[{rowKey:'Synthetic tracker invoice 00001',field:'R',sheetValue:'2026-09-01',webValue:null,decision:'eligible'}]}});return;}
   confirmed=true;await r.fulfill({json:{confirmed:true}});return;
  }
  await r.fulfill({json:{connected:true,enabled:true,available:true,bootstrapConfirmed:confirmed,revision:1,lastCheckedAt:null,pending:0,conflictCount:0,conflicts:[]}});
 });
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=sheets');await expect(page.getByRole('button',{name:'Check changes',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Preview tracker import'}).click();await expect(page.getByText('1 eligible fields',{exact:false})).toBeVisible();expect(commands).toEqual([{action:'preview'}]);
 await page.getByRole('button',{name:'Confirm initial import'}).click();await expect(page.getByRole('button',{name:'Check changes',exact:true})).toBeVisible();
 expect(commands[1]).toEqual({action:'confirm_preview',previewId:'00000000-0000-4000-8000-000000000007',snapshotHash:'a'.repeat(64)});
});
test('Register keeps raw Sheet status visible and separate from canonical status and sender',async({page})=>{
 const {writes}=await auditWorkspace(page);
 const row={hotel:'KAT',account_id:'A',id:'I1',account_name:'Synthetic Travel',account_no:'0002',account_type:'Agent',guest:'Synthetic guest',invoice_no:'00001',folio_no:'7',transaction_date:'2026-09-01',original:100,open:100,age:30,aging:'Up to 30',verification_state:'verified',collection_role:'standalone',collection_selectable:true,workflow:null,workflow_revision:1,tracking_revision:1,exception_revision:0,billing_required:true,credit_term:30,first_billing_date:null,due_date:null,last_reminder_stage:null,last_reminder_date:null,promised_date:null,tracking_status:'Promised payment',owner_name:'Responsible person',reported_received:null,note:'',edited_at:null,hidden:false,sourceTrackingStatusRaw:'ติดตามชำระ',sourceTrackingStatusObservedAt:'2026-09-30T00:00:00Z',sourceTrackingStatusProvenance:'Sheet record; editor unavailable'};
 await page.route('**/api/invoice-register?*',r=>r.fulfill({json:{rows:[row],total:1,hiddenTotal:0,snapshot:'a'.repeat(32),summary:{invoices:1,open:100,unverified:0}}}));
 await page.route('**/api/invoice-register/KAT/A/I1/history*',r=>r.fulfill({json:{total:1,rows:[{id:-3,actor:'Sheet record · editor unavailable; imported by Synthetic Staff',recorded_at:'2026-09-30T00:00:00Z',before_value:{},after_value:{},source:'sheet_reported_status',sourceTrackingStatusBefore:null,sourceTrackingStatusAfter:'ติดตามชำระ'}]}}));
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=register');
 const tracking=page.getByRole('button',{name:'Tracking status · KAT 00001',exact:true});
 await expect(tracking).toHaveAttribute('title',/Read-only sheet status: ติดตามชำระ.*editor unavailable/);await expect(tracking).toContainText('Promised payment');await expect(tracking).toContainText('Sheet: ติดตามชำระ');
 await page.getByRole('button',{name:'History invoice KAT 00001',exact:true}).click();const history=page.getByRole('region',{name:'Register edit history'});await expect(history).toContainText('editor unavailable');await expect(history).toContainText('Read-only sheet status: Blank → ติดตามชำระ');
 expect(writes.filter(w=>w.path.includes('invoice-register'))).toHaveLength(0);
});
test('committed tracker revisions refresh a clean Register and preserve a dirty editor without an OPERA publication',async({page})=>{
 await page.clock.install();await auditWorkspace(page);let revision=1,revisionReads=0,registerReads=0;
 const row=()=>({hotel:'KAT',account_id:'A',id:'I1',account_name:'Synthetic Travel',account_no:'0002',account_type:'Agent',guest:'Synthetic guest',invoice_no:'00001',folio_no:'7',transaction_date:'2026-09-01',original:100,open:100,age:30,aging:'Up to 30',verification_state:'verified',collection_role:'standalone',collection_selectable:true,workflow:null,workflow_revision:1,tracking_revision:1,exception_revision:0,billing_required:true,credit_term:30,first_billing_date:null,due_date:null,last_reminder_stage:null,last_reminder_date:null,promised_date:null,tracking_status:'Promised payment',owner_name:'',reported_received:null,note:'',edited_at:null,hidden:false,sourceTrackingStatusRaw:`Reported source ${revision}`,sourceTrackingStatusProvenance:'Sheet record; editor unavailable'});
 await page.route('**/api/reports/tracker-revisions',r=>{revisionReads++;return r.fulfill({json:{rows:[{region:'phuket',revision:String(revision)}]}});});
 await page.route('**/api/invoice-register?*',r=>{registerReads++;return r.fulfill({json:{rows:[row()],total:1,hiddenTotal:0,snapshot:String(revision).repeat(32),summary:{invoices:1,open:100,unverified:0}}});});
 await page.route('**/api/invoice-register/KAT/A/I1',r=>r.fulfill({json:row()}));
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=register');const tracking=page.getByRole('button',{name:'Tracking status · KAT 00001',exact:true});
 await expect(tracking).toContainText('Reported source 1');await expect.poll(()=>revisionReads).toBeGreaterThan(0);
 revision=2;await page.clock.fastForward(61000);await expect(tracking).toContainText('Reported source 2');
 await tracking.click();const input=page.getByLabel('Tracking status',{exact:true});await input.selectOption('Disputed');const before=registerReads;
 revision=3;await page.clock.fastForward(61000);await expect(input).toHaveValue('Disputed');expect(registerReads).toBe(before);
});
