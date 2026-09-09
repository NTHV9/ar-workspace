import {test,expect,type Page} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {createHash} from 'node:crypto';
const jobId='00000000-0000-4000-8000-000000000011',draftId='00000000-0000-4000-8000-000000000012';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
async function setup(page:Page,mode:'normal'|'rejected'|'lost'='normal'){
 const pdf=await PDFDocument.create();for(let n=1;n<=2;n++){const p=pdf.addPage([500,600]);p.drawText(`Synthetic attachment page ${n}`,{x:40,y:550,size:18});}const pdfBytes=Buffer.from(await pdf.save());
 const user={id:'synthetic-supplemental-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
 const exports=[{name:'Reviewed-package.pdf',storage_key:`jobs/${jobId}/exports/test.pdf`,byte_count:120000,sha256:'a'.repeat(64)}];
 let draft:any={id:draftId,document_job_id:jobId,document_revision:2,revision:0,hotel:'KAT',account_id:'example',account_name:'Synthetic attachment account',invoice_ids:['1'],purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic billing message',body:'Please review the attached synthetic documents.',exports,attachments:[],package_changed:false};
 const bodies=new Map<string,Buffer>(),uploadIds:string[]=[],requests:string[]=[];let lost=false;
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const req=r.request(),url=new URL(req.url()),path=url.pathname;requests.push(req.method()+' '+path);
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(path===`/api/documents/${jobId}`)return r.fulfill({json:{id:jobId,hotel:'KAT',account_id:'example',account_name:draft.account_name,invoice_ids:['1'],state:'ready',revision:2,acknowledged:true,files:[],exports}});
  if(path==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com',maxAttachmentBytes:10485760}});
  if(path==='/api/email/open')return r.fulfill({json:draft});
  if(path===`/api/email/${draftId}`){draft={...draft,...req.postDataJSON(),revision:draft.revision+1};return r.fulfill({json:draft});}
  const match=new RegExp(`^/api/email/${draftId}/attachments/([a-f0-9-]+)$`).exec(path);
  if(match){const id=match[1];if(req.method()==='POST'){
   uploadIds.push(id);if(mode==='rejected')return r.fulfill({status:400,json:{error:'attachment_active_pdf'}});
   if(!bodies.has(id)){const bytes=req.postDataBuffer()!;bodies.set(id,bytes);draft={...draft,revision:draft.revision+1,attachments:[...draft.attachments,{id,name:url.searchParams.get('name'),storage_key:`jobs/${jobId}/email/${draftId}/${id}`,mime:req.headers()['content-type'],byte_count:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),inspection:{version:1,pages:2}}]};}
   if(mode==='lost'&&!lost){lost=true;return r.abort('failed');}return r.fulfill({json:draft});
  }if(req.method()==='GET')return r.fulfill({contentType:draft.attachments.find((a:any)=>a.id===id).mime,body:bodies.get(id)!});
  if(req.method()==='DELETE'){draft={...draft,revision:draft.revision+1,attachments:draft.attachments.filter((a:any)=>a.id!==id)};return r.fulfill({json:draft});}}
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });return {pdfBytes,uploadIds,requests};
}
for(const width of [1440,1280,390])test(`supplemental ${width}: add, preview all pages, review membership and remove`,async({page})=>{
 const fixture=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto(`/?documentJob=${jobId}&compose=1`);
 await page.getByLabel('Select supplemental file',{exact:true}).setInputFiles({name:'Supporting-document.pdf',mimeType:'application/pdf',buffer:fixture.pdfBytes});
 await expect(page.getByRole('button',{name:'Supporting-document.pdf',exact:true})).toBeVisible();await page.getByRole('button',{name:'Supporting-document.pdf',exact:true}).click();await expect(page.locator('.email-attachment-preview').getByRole('status')).toContainText('Page 1 of 2');await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('.email-attachment-preview').getByRole('status')).toContainText('Page 2 of 2');await page.screenshot({path:`evidence/supplemental-preview-${width}.png`});await page.getByRole('button',{name:'Close attachment preview',exact:true}).click();await page.screenshot({path:`evidence/supplemental-composer-${width}.png`});
 await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.locator('.email-send-confirm')).toContainText('Supporting-document.pdf · Supplemental file');await page.getByRole('button',{name:'Back to editing',exact:true}).click();await page.getByRole('button',{name:'Remove Supporting-document.pdf',exact:true}).click();await expect(page.getByRole('button',{name:'Supporting-document.pdf',exact:true})).toHaveCount(0);expect(fixture.requests.some(s=>s.endsWith('/send')||s.endsWith('/gmail-draft'))).toBe(false);
});
test('a rejected supplemental file blocks handoff until explicitly removed',async({page})=>{const fixture=await setup(page,'rejected');await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Select supplemental file',{exact:true}).setInputFiles({name:'Interactive.pdf',mimeType:'application/pdf',buffer:fixture.pdfBytes});await expect(page.getByRole('alert')).toContainText('scripts, forms or embedded files');await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Remove failed selection',exact:true}).click();await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeEnabled();});
test('lost upload response retries the same command and never adds twice',async({page})=>{const fixture=await setup(page,'lost');await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Select supplemental file',{exact:true}).setInputFiles({name:'Receipt.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('button',{name:'Retry this upload',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Retry this upload',exact:true}).click();await expect(page.getByRole('button',{name:'Receipt.png',exact:true})).toHaveCount(1);expect(fixture.uploadIds).toHaveLength(2);expect(fixture.uploadIds[0]).toBe(fixture.uploadIds[1]);});

test('PNG preview renders the uploaded bytes',async({page})=>{await setup(page);await page.goto(`/?documentJob=${jobId}&compose=1`);await page.getByLabel('Select supplemental file',{exact:true}).setInputFiles({name:'Receipt.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Receipt.png',exact:true}).click();await expect(page.locator('.email-attachment-preview').getByRole('status')).toHaveText('Image loaded');expect(await page.getByRole('img',{name:'Preview of Receipt.png',exact:true}).evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(1);});
