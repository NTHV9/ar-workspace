import {test,expect,type Page} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
async function pdf(name:string,pages=1,form=false){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);for(let i=1;i<=pages;i++)doc.addPage([420,595]).drawText(`${name} PAGE ${i}`,{x:35,y:540,font,size:18});if(form)doc.getForm().createTextField('active').setText('Synthetic');return Buffer.from(await doc.save());}
async function open(page:Page){await page.goto('/tests/browser/pdf-editor-harness.html?attachments=1');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();}
async function add(page:Page,invoice:string,files:{name:string;buffer:Buffer}[]){await page.getByRole('combobox',{name:'Invoice for new PDFs',exact:true}).selectOption(invoice);await page.getByLabel('Add PDFs to invoice',{exact:true}).setInputFiles(files.map(f=>({...f,mimeType:'application/pdf'})));for(const f of files)await expect(page.getByRole('combobox',{name:'Invoice for '+f.name,exact:true})).toBeVisible();}
async function save(page:Page){await page.getByRole('button',{name:'Preview PDFs',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true}).locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();return page.evaluate(async()=>{const api=(window as any).pdfTest,result=[];for(const f of api.saved.files){const doc=await api.PDFDocument.load(f.bytes),task=api.getDocument({data:f.bytes.slice()}),reader=await task.promise,text=[];for(let i=1;i<=reader.numPages;i++)text.push((await(await reader.getPage(i)).getTextContent()).items.map((v:any)=>v.str??'').join(' '));await task.destroy();result.push({name:f.name,text,sizes:doc.getPages().map((p:any)=>[p.getWidth(),p.getHeight()])});}return result;});}
for(const layout of ['One combined PDF','Statement + combined Invoices','Statement + each Invoice'])test(`attaches multiple PDFs to the correct invoice: ${layout}`,async({page})=>{
 await open(page);await add(page,'Invoice-A',[{name:'support-a1.pdf',buffer:await pdf('SUPPORT-A1',2)},{name:'support-a2.pdf',buffer:await pdf('SUPPORT-A2')}]);
 await add(page,'Invoice-B',[{name:'support-b.pdf',buffer:await pdf('SUPPORT-B')}]);await expect(page.getByRole('button',{name:'Select page 8',exact:true})).toBeVisible();
 await page.getByRole('button',{name:layout,exact:true}).click();const files=await save(page),text=files.flatMap(f=>f.text);
 expect(files.map(f=>f.text.length)).toEqual(layout==='One combined PDF'?[8]:layout==='Statement + combined Invoices'?[1,7]:[1,5,2]);
 expect(text[0]).toContain('Billing statement');expect(text[1]).toContain('Page 1 of 2 - Invoice-A');expect(text[2]).toContain('Page 2 of 2 - Invoice-A');expect(text[3]).toContain('SUPPORT-A1 PAGE 1');expect(text[4]).toContain('SUPPORT-A1 PAGE 2');expect(text[5]).toContain('SUPPORT-A2');expect(text[6]).toContain('Page 1 of 1 - Invoice-B');expect(text[7]).toContain('SUPPORT-B');
 expect(files.flatMap(f=>f.sizes)[3]).toEqual([420,595]);
});
test('reassignment, attachment ordering, remove and Undo keep original PDF edits',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Edit original text: CONFIDENTIAL ORIGINAL WORDING',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('EDIT KEPT THROUGH IMPORT');
 await add(page,'Invoice-A',[{name:'one.pdf',buffer:await pdf('FIRST')},{name:'two.pdf',buffer:await pdf('SECOND')}]);
 await page.getByRole('combobox',{name:'Invoice for one.pdf',exact:true}).selectOption('Invoice-B');await page.getByRole('combobox',{name:'Invoice for two.pdf',exact:true}).selectOption('Invoice-B');
 await page.getByRole('button',{name:'Move two.pdf earlier',exact:true}).click();await page.getByRole('button',{name:'Remove one.pdf',exact:true}).click();await expect(page.getByRole('combobox',{name:'Invoice for one.pdf',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('combobox',{name:'Invoice for one.pdf',exact:true})).toBeVisible();
 await page.locator('.pdf-invoice-attachments').scrollIntoViewIfNeeded();await page.screenshot({path:'.tmp/invoice-pdfs/editor.png',fullPage:true});
 const files=await save(page);expect(files[0].text).toHaveLength(6);expect(files[0].text[4]).toContain('SECOND');expect(files[0].text[5]).toContain('FIRST');
 expect(await page.evaluate(()=>(window as any).pdfTest.saved.project.pages[0].layers[0].text)).toBe('EDIT KEPT THROUGH IMPORT');
 await page.getByRole('combobox',{name:'PDF page',exact:true}).selectOption({value:'4'});await expect(page.getByRole('img',{name:'Final PDF page 5',exact:true})).toBeVisible();await page.screenshot({path:'.tmp/invoice-pdfs/preview.png',fullPage:true});
});
test('a rejected multi-file import leaves the existing package intact',async({page})=>{
 await open(page);await page.getByLabel('Add PDFs to invoice',{exact:true}).setInputFiles([{name:'good.pdf',mimeType:'application/pdf',buffer:await pdf('GOOD')},{name:'form.pdf',mimeType:'application/pdf',buffer:await pdf('FORM',1,true)}]);
 await expect(page.getByRole('alert')).toContainText('forms, scripts or embedded files');await expect(page.getByRole('combobox',{name:'Invoice for good.pdf',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Select page 5',exact:true})).toHaveCount(0);
 await add(page,'Invoice-A',[{name:'valid.pdf',buffer:await pdf('VALID')}]);const files=await save(page);expect(files[0].text).toHaveLength(5);expect(files[0].text[3]).toContain('VALID');
});

for(const action of ['Continue to email','Download reviewed PDFs'])test(`transient handoff keeps merged invoice bytes for ${action}`,async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html?attachments=1&transient=1');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await add(page,'Invoice-B',[{name:'handoff.pdf',buffer:await pdf('REVIEWED SUPPORT',2)}]);
 await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();await page.getByRole('textbox',{name:'Output filename 3',exact:true}).fill('ใบแจ้งหนี้ B');await page.getByRole('textbox',{name:'Output filename 3',exact:true}).press('Enter');await page.getByRole('button',{name:'Preview PDFs',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview',exact:true});await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
 await preview.getByRole('button',{name:action,exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).pdfTest.continued)).toBe(action==='Continue to email'?'email':'download');
 const result=await page.evaluate(async()=>{const api=(window as any).pdfTest,files=api.reviewed.files;return {length:files.length,names:files.map((f:any)=>f.name),pages:await Promise.all(files.map(async(f:any)=>(await api.PDFDocument.load(f.bytes)).getPageCount()))};});
 expect(result).toEqual({length:3,names:['01-Statement.pdf','02-Invoice-A.pdf','ใบแจ้งหนี้ B.pdf'],pages:[1,2,3]});
});

test('filename editing validates, follows Undo and keeps imported source identity and bytes',async({page})=>{
 await open(page);await add(page,'Invoice-A',[{name:'original-scan.pdf',buffer:await pdf('SOURCE BYTES KEPT')}]);
 const scan=page.getByRole('textbox',{name:'Scan filename for original-scan.pdf',exact:true});await scan.fill('Renamed scan');await scan.press('Enter');await expect(scan).toHaveValue('Renamed scan.pdf');await expect(page.getByRole('combobox',{name:'Invoice for Renamed scan.pdf',exact:true})).toHaveValue('Invoice-A');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(scan).toHaveValue('original-scan.pdf');await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(scan).toHaveValue('Renamed scan.pdf');
 await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();const output=page.getByRole('textbox',{name:'Output filename 2',exact:true});await output.fill('../bad.pdf');await output.press('Enter');await expect(page.getByRole('alert')).toContainText('without paths');await expect(page.getByRole('button',{name:'Preview PDFs',exact:true})).toBeDisabled();await output.press('Escape');await expect(output).toHaveValue('02-Invoice-A.pdf');
 await output.fill('03-Invoice-B.pdf');await output.press('Enter');await expect(page.getByRole('alert')).toContainText('different filename');await output.fill('Final Invoice A.pdf');await output.press('Enter');await expect(output).toHaveValue('Final Invoice A.pdf');
 await page.getByRole('button',{name:'One combined PDF',exact:true}).click();await expect(page.getByRole('textbox',{name:'Output filename 1',exact:true})).toHaveValue('01-Documents.pdf');await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();await expect(output).toHaveValue('Final Invoice A.pdf');
 await page.locator('.pdf-package').evaluate(element=>element.scrollTop=element.scrollHeight);await page.screenshot({path:'.tmp/invoice-pdfs/filename-editor.png',fullPage:true});
 const files=await save(page);expect(files[1].name).toBe('Final Invoice A.pdf');expect(files[1].text[2]).toContain('SOURCE BYTES KEPT');
 await page.getByRole('button',{name:'Close final preview',exact:true}).click();await output.fill('Latest Invoice.pdf');await output.press('Enter');await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(output).toHaveValue('Final Invoice A.pdf');
});

test('Undo and Redo clear pending filename drafts when the applied value changes',async({page})=>{
 await open(page);const output=page.getByRole('textbox',{name:'Output filename 1',exact:true}),preview=page.getByRole('button',{name:'Preview PDFs',exact:true});
 await output.fill('Applied.pdf');await output.press('Enter');await output.fill('Pending.pdf');await expect(preview).toBeDisabled();await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(output).toHaveValue('01-Documents.pdf');await expect(page.getByRole('button',{name:'Apply name',exact:true})).toHaveCount(0);await expect(preview).toBeEnabled();
 await output.fill('Pending redo.pdf');await expect(preview).toBeDisabled();await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(output).toHaveValue('Applied.pdf');await expect(page.getByRole('button',{name:'Apply name',exact:true})).toHaveCount(0);await expect(preview).toBeEnabled();
 const files=await save(page);expect(files[0].name).toBe('Applied.pdf');
});

test('initial separate delivery opens valid source PDFs with punctuation in their original names',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await open(page);
 for(const name of ['Invoice123..45.pdf','Invoice.pdf.pdf','Invoice. .pdf']){
  await page.evaluate(name=>{const api=(window as any).pdfTest;api.mount(undefined,[{...api.sources[1],name}],'separate');},name);
  await expect(page.getByRole('textbox',{name:'Output filename 1',exact:true})).toHaveValue(name==='Invoice123..45.pdf'?'01-Invoice123.45.pdf':'01-Invoice.pdf');await expect(page.getByRole('button',{name:'Preview PDFs',exact:true})).toBeEnabled();await expect(page.locator('.pdf-workspace')).toHaveCount(1);
 }
 const files=await save(page);expect(files[0].name).toBe('01-Invoice.pdf');expect(files[0].text).toHaveLength(2);expect(errors).toEqual([]);
});

test('a group deletion that would collide with a chosen output name keeps the previous package',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();const output=page.getByRole('textbox',{name:'Output filename 1',exact:true});await output.fill('02-Invoice-B.pdf');await output.press('Enter');
 await page.getByRole('button',{name:'Select page 2',exact:true}).click();await page.getByRole('button',{name:'Delete page',exact:true}).click();await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Select page 2',exact:true}).click();await page.getByRole('button',{name:'Delete page',exact:true}).click();await expect(page.getByRole('alert')).toContainText('different filename');await expect(page.getByRole('button',{name:'Select page 3',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Output filename 3',exact:true})).toHaveValue('03-Invoice-B.pdf');await expect(output).toHaveValue('02-Invoice-B.pdf');await expect(page.getByRole('button',{name:'Preview PDFs',exact:true})).toBeEnabled();
});
