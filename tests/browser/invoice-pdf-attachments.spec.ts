import {test,expect,type Page} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
async function pdf(name:string,pages=1,form=false){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);for(let i=1;i<=pages;i++)doc.addPage([420,595]).drawText(`${name} PAGE ${i}`,{x:35,y:540,font,size:18});if(form)doc.getForm().createTextField('active').setText('Synthetic');return Buffer.from(await doc.save());}
async function open(page:Page){await page.goto('/tests/browser/pdf-editor-harness.html?attachments=1');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();}
async function add(page:Page,invoice:string,files:{name:string;buffer:Buffer}[]){await page.getByRole('combobox',{name:'Invoice for new PDFs',exact:true}).selectOption(invoice);await page.getByLabel('Add PDFs to invoice',{exact:true}).setInputFiles(files.map(f=>({...f,mimeType:'application/pdf'})));for(const f of files)await expect(page.getByRole('combobox',{name:'Invoice for '+f.name,exact:true})).toBeVisible();}
async function save(page:Page){await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true}).locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();return page.evaluate(async()=>{const api=(window as any).pdfTest,result=[];for(const f of api.saved.files){const doc=await api.PDFDocument.load(f.bytes),task=api.getDocument({data:f.bytes.slice()}),reader=await task.promise,text=[];for(let i=1;i<=reader.numPages;i++)text.push((await(await reader.getPage(i)).getTextContent()).items.map((v:any)=>v.str??'').join(' '));await task.destroy();result.push({name:f.name,text,sizes:doc.getPages().map((p:any)=>[p.getWidth(),p.getHeight()])});}return result;});}
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
 await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview',exact:true});await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
 await preview.getByRole('button',{name:action,exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).pdfTest.continued)).toBe(action==='Continue to email'?'email':'download');
 const result=await page.evaluate(async()=>{const api=(window as any).pdfTest,files=api.reviewed.files;return {length:files.length,pages:await Promise.all(files.map(async(f:any)=>(await api.PDFDocument.load(f.bytes)).getPageCount()))};});
 expect(result).toEqual({length:3,pages:[1,2,3]});
});
