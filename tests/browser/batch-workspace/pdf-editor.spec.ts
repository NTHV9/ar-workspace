import {test,expect,type Page} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {choosePdfTool} from '../fixtures/pdf-tools';
const serverKey='ar-batch-fixture-server-v1';
for(const outcome of ['pending','protected'])test(`explicit batch exit clears resume state after accepted ${outcome} cleanup`,async({page})=>{
 await begin(page);await page.evaluate(value=>{(window as any).batchCleanupOutcome=value;},outcome);await page.locator('#allow-confirm').evaluate((input:HTMLInputElement)=>{input.checked=true;});
 await page.locator('.batch-heading').getByRole('button',{name:'Collections',exact:true}).click();await expect(page.locator('.batch-heading')).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('ar-account-batch:')||key.startsWith('ar-account-batch-active:')))).toEqual([]);
 const proof=await state(page);expect(proof.requests.some((request:string)=>request.endsWith('/abandon'))).toBe(true);expect(proof.sends).toEqual([]);
});
async function state(page:Page){return page.evaluate(key=>{const db=JSON.parse(sessionStorage.getItem(key)!);return {jobs:Object.values(db.jobs).map((j:any)=>({id:j.id,hotel:j.hotel,accountId:j.account_id,ids:j.invoice_ids,exports:j.exports,revision:j.revision,closed:j.closed_reason})),drafts:Object.values(db.drafts).map((d:any)=>({id:d.id,jobId:d.document_job_id,hotel:d.hotel,accountId:d.account_id,subject:d.subject,recipients:d.recipients,exports:d.exports,delivery:d.delivery})),sends:db.sends,requests:db.requests};},serverKey);}
async function begin(page:Page,layout='combined',second='Bay Travel · Synthetic'){
 await page.goto('/tests/browser/batch-workspace/harness.html');await page.getByRole('button',{name:'Collections',exact:true}).click();
 await page.getByRole('button',{name:'Open KAT account Azure Travel · Synthetic',exact:true}).click();await page.getByRole('checkbox',{name:'Queue select 1001',exact:true}).check();await page.getByRole('checkbox',{name:'Queue select 1002',exact:true}).check();
 await page.getByRole('button',{name:`Open ${second.startsWith('Bay')?'TSK':'KAT'} account ${second}`,exact:true}).click();await page.getByRole('checkbox',{name:`Queue select ${second.startsWith('Bay')?'2001':'3001'}`,exact:true}).check();
 await page.getByRole('button',{name:'Prepare documents',exact:true}).click();await page.getByRole('combobox',{name:'Files for each account',exact:true}).selectOption(layout);await page.getByRole('button',{name:'Prepare accounts',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
}
async function tab(page:Page,name:string){await page.getByRole('navigation',{name:'Accounts in this batch',exact:true}).getByRole('button',{name:new RegExp(name)}).click();}
async function retainedText(page:Page,value:string){await expect(page.locator('.pdf-differences')).toContainText(value);await page.locator('.pdf-differences').getByRole('button',{name:new RegExp(value)}).click();await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue(value);}
async function edit(page:Page,value:string){await page.getByRole('button',{name:'Edit original text: EDIT THIS ADDRESS',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill(value);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');}
for(const [layout,count]of [['combined',1],['statement_bundle',2],['separate',2]] as const)test(`batch ${layout}: hotel/account scope and edits survive unified PDF/email phases`,async({page})=>{
 await begin(page,layout);await edit(page,'AZURE ONLY');if(layout==='combined'){const scan=await PDFDocument.create();scan.addPage([420,595]).drawText('AZURE ATTACHMENT',{x:40,y:500,size:16});await page.getByRole('combobox',{name:'Invoice for new PDFs',exact:true}).selectOption('101');await page.getByLabel('Add PDFs to invoice',{exact:true}).setInputFiles({name:'AZURE-SUPPORT.pdf',mimeType:'application/pdf',buffer:Buffer.from(await scan.save())});await expect(page.getByRole('combobox',{name:'Invoice for AZURE-SUPPORT.pdf',exact:true})).toBeVisible();}await tab(page,'Bay Travel');if(layout==='combined')await expect(page.getByRole('combobox',{name:'Invoice for AZURE-SUPPORT.pdf',exact:true})).toHaveCount(0);await edit(page,'BAY ONLY');await tab(page,'Azure Travel');await retainedText(page,'AZURE ONLY');if(layout==='combined')await expect(page.getByRole('combobox',{name:'Invoice for AZURE-SUPPORT.pdf',exact:true})).toBeVisible();await tab(page,'Bay Travel');await retainedText(page,'BAY ONLY');
 expect((await state(page)).sends).toEqual([]);await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('ar@katathani.com');await page.getByLabel('Email CC',{exact:true}).fill('bay-copy@example.test');await tab(page,'Azure Travel');await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('ar@katathani.com');await page.getByLabel('Email CC',{exact:true}).fill('azure-copy@example.test');await page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true}).click();
 // The button starts an async save; the review view is the completed-save boundary.
 await expect(page.getByRole('heading',{name:'Separate emails for each account',exact:true})).toBeVisible();
 const proof=await state(page);expect(proof.jobs).toHaveLength(2);expect(proof.jobs.map(j=>[j.hotel,j.accountId])).toEqual([['KAT','10'],['TSK','10']]);expect(proof.jobs.every(j=>j.exports.length===(layout==='separate'&&j.hotel==='KAT'?3:count))).toBe(true);expect(proof.drafts).toHaveLength(2);for(const draft of proof.drafts){const job=proof.jobs.find(j=>j.id===draft.jobId)!;expect([draft.hotel,draft.accountId]).toEqual([job.hotel,job.accountId]);expect(draft.exports).toEqual(job.exports);expect(draft.recipients.to).toEqual([draft.hotel.toLowerCase()+'@synthetic.example']);expect(draft.recipients.cc).toEqual([draft.hotel==='KAT'?'azure-copy@example.test':'bay-copy@example.test','ar@katathani.com']);}expect(proof.sends).toEqual([]);const bytes=await page.evaluate(()=>(window as any).inspectBatchExports());for(const account of bytes){const content=account.files.map((f:any)=>f.text).join(' ');expect(content).toContain(account.hotel==='KAT'?'AZURE ONLY':'BAY ONLY');expect(content).not.toContain(account.hotel==='KAT'?'BAY ONLY':'AZURE ONLY');expect(account.files.reduce((n:number,f:any)=>n+f.pages,0)).toBe(account.hotel==='KAT'?(layout==='combined'?4:3):2);if(layout==='combined'){if(account.hotel==='KAT')expect(content).toContain('AZURE ATTACHMENT');else expect(content).not.toContain('AZURE ATTACHMENT');}}
 await page.locator('.batch-heading').getByRole('button',{name:'Back to emails',exact:true}).click();await page.locator('.batch-heading').getByRole('button',{name:'Back to PDFs',exact:true}).click();await retainedText(page,'AZURE ONLY');await tab(page,'Bay Travel');await retainedText(page,'BAY ONLY');
});
test('batch review retry retains export receipts and creates each account email once',async({page})=>{
 await begin(page);await page.locator('#lost-pdf-review').evaluate((button:HTMLButtonElement)=>button.click());await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();await expect(page.locator('.batch-error')).toContainText('simulated lost pdf response');expect((await state(page)).drafts).toHaveLength(0);await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();const proof=await state(page);expect(proof.jobs.every(j=>j.revision===1&&j.exports.length===1)).toBe(true);expect(proof.requests.filter((p:string)=>p.endsWith('/upload'))).toHaveLength(2);expect(proof.drafts).toHaveLength(1);expect(proof.sends).toEqual([]);
});
test('batch send uncertainty retains protected files and is checked without resending',async({page})=>{
 await begin(page);await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();await tab(page,'Bay Travel');await expect(page.getByRole('textbox',{name:'Email message',exact:true})).toBeVisible();await page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true}).click();await page.getByRole('checkbox',{name:/^Send Azure Travel/}).check();await page.getByRole('checkbox',{name:/^Send Bay Travel/}).check();await page.locator('#uncertain-next').evaluate((button:HTMLButtonElement)=>button.click());await page.getByRole('button',{name:'Send 2 emails',exact:true}).click();await expect.poll(async()=>(await state(page)).sends.length).toBe(2);const before=await state(page);const uncertain=before.drafts.find(d=>d.delivery?.state==='awaiting_evidence')!;expect(uncertain).toBeTruthy();const pending=before.jobs.find(j=>j.id===uncertain.jobId)!;expect(pending.closed).not.toBe('discarded');expect(pending.exports.length).toBeGreaterThan(0);expect(before.requests.some((p:string)=>p.endsWith('/abandon')||p.endsWith('/discard'))).toBe(false);const retained=await page.evaluate(()=>(window as any).inspectBatchExports());expect(retained.find((j:any)=>j.hotel===uncertain.hotel&&j.accountId===uncertain.accountId).files.length).toBeGreaterThan(0);await page.getByRole('button',{name:'Check status',exact:true}).filter({visible:true}).and(page.locator('button:not([disabled])')).click();await expect(page.getByRole('heading',{name:'All selected emails sent',exact:true})).toBeVisible();expect((await state(page)).sends).toEqual(before.sends);
});

for(const fail of [false,true])test(`batch ${fail?'failed save retains manual CC for retry':'review waits for the saved CC snapshot'} without sending`,async({page})=>{
 await begin(page);
 await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();
 const cc=page.getByLabel('Email CC',{exact:true}),review=page.getByRole('heading',{name:'Separate emails for each account',exact:true});
 await expect(cc).toHaveValue('ar@katathani.com');
 await cc.fill('azure-copy@example.test, AR@KATATHANI.COM');
 await page.evaluate(()=>(window as any).pauseNextBatchMailSave());
 await page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true}).click();
 await expect.poll(()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!).heldMailSave,serverKey)).toBeTruthy();
 // A click has completed, but neither the server nor review may claim saved recipients yet.
 expect((await state(page)).drafts[0].recipients.cc).toEqual([]);
 await expect(review).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'Accounts in this batch',exact:true}).getByRole('button',{name:/Bay Travel/})).toBeDisabled();
 await expect(page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true})).toBeDisabled();
 await page.evaluate(failed=>(window as any).resumeBatchMailSave(failed),fail);
 if(fail){
  await expect(page.locator('.batch-error')).toContainText('another session');
  await expect(review).toHaveCount(0);
  await expect(cc).toHaveValue('azure-copy@example.test, ar@katathani.com');
  expect((await state(page)).drafts[0].recipients.cc).toEqual([]);
  await page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true}).click();
 }
 await expect(review).toBeVisible();
 const proof=await state(page);
 expect(proof.drafts[0].recipients.cc).toEqual(['azure-copy@example.test','ar@katathani.com']);
 expect(proof.requests.filter((request:string)=>request.startsWith('PUT /api/email/'))).toHaveLength(fail?2:1);
 expect(proof.sends).toEqual([]);
 await page.locator('.batch-review tbody tr').first().locator('summary').click();
 await expect(page.locator('.batch-review tbody tr').first()).toContainText('CC: azure-copy@example.test, ar@katathani.com');
});

test('rapid account switches wait for each saved manual CC and never cross account identities',async({page})=>{
 await begin(page);
 await page.locator('.batch-heading').getByRole('button',{name:'Go to email',exact:true}).click();
 const cc=page.getByLabel('Email CC',{exact:true});await expect(cc).toHaveValue('ar@katathani.com');
 await cc.fill('azure-copy@example.test');await page.evaluate(()=>(window as any).pauseNextBatchMailSave());
 await tab(page,'Bay Travel');
 await expect.poll(()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!).heldMailSave,serverKey)).toBeTruthy();
 await expect(cc).toBeDisabled();await expect(cc).toHaveValue('azure-copy@example.test, ar@katathani.com');
 await page.evaluate(()=>(window as any).resumeBatchMailSave());
 await expect(page.locator('.email-heading')).toContainText(/TSK.*Bay Travel/);
 await expect(cc).toHaveValue('ar@katathani.com');await cc.fill('bay-copy@example.test');
 await tab(page,'Azure Travel');await expect(page.locator('.email-heading')).toContainText(/KAT.*Azure Travel/);
 await expect(cc).toHaveValue('azure-copy@example.test, ar@katathani.com');
 await tab(page,'Bay Travel');await expect(cc).toHaveValue('bay-copy@example.test, ar@katathani.com');
 await page.locator('.batch-heading').getByRole('button',{name:'Review & send',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Separate emails for each account',exact:true})).toBeVisible();
 const proof=await state(page);
 expect(proof.drafts.map(draft=>[draft.hotel,draft.accountId,draft.recipients.cc])).toEqual([
  ['KAT','10',['azure-copy@example.test','ar@katathani.com']],['TSK','10',['bay-copy@example.test','ar@katathani.com']]
 ]);
 expect(proof.requests.filter((request:string)=>request.startsWith('PUT /api/email/'))).toHaveLength(2);
 expect(proof.sends).toEqual([]);
});
