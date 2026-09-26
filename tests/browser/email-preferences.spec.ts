import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {plainMessage,richText} from '../../src/email/rich-message';
import {signatureWorkplace} from '../../src/email/signature';
import {HOTEL_IDS} from '../../src/domain/hotels';
import {starterTemplates} from '../../src/email/templates';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{providers:['google']},user_metadata:{},created_at:'2026-09-23T00:00:00Z'};
async function setup(context:BrowserContext){
 const writes:Record<string,unknown>[]=[];let rows=[{memberId:user.id,email:user.email,administrator:true,active:true,registered:true,regions:['phuket','khao-lak'],revision:1,displayName:null as string|null}];
 await context.route('https://example.supabase.co/**',route=>{
  if(route.request().url().includes('/token'))return route.fulfill({json:{access_token:'synthetic-google-token',refresh_token:'synthetic-google-refresh',expires_in:3600,token_type:'bearer',user}});
  return route.fulfill({json:{user}});
 });
 await context.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic-key',googleEnabled:true}});
  if(path==='/api/portfolio')return route.fulfill({json:{accounts:[],status:'connected',refresh:{running:false,hotels:[]}}});
  if(path==='/api/refresh')return route.fulfill({json:{running:false,hotels:[]}});
  if(path==='/api/access/me')return route.fulfill({json:rows[0]});
  if(path==='/api/access/users'){
   if(route.request().method()==='POST'){const value=route.request().postDataJSON();writes.push(value);rows.push({...value,memberId:'00000000-0000-4000-8000-000000000003',administrator:false,registered:false,revision:1});return route.fulfill({json:rows.at(-1)});}
   return route.fulfill({json:{rows,total:rows.length}});
  }
  return route.fulfill({json:{}});
 });return {writes};
}
async function googleReturn(page:Page){
 await page.goto('/?usersAccess=1');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key+'-code-verifier',JSON.stringify('synthetic-code-verifier'));});
 await page.goto('/?usersAccess=1&code=synthetic-code');
 await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/dashboard=1&dashboardView=aging$/);
 await expect(page.getByRole('button',{name:'Aging',exact:true})).toHaveClass('active');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Users & Access'})).toBeVisible();
}

const jobId='00000000-0000-4000-8000-000000000071',draftId='00000000-0000-4000-8000-000000000072',templateId='00000000-0000-4000-8000-000000000073';
async function preferences(context:BrowserContext){
 await setup(context);let profile={revision:0,enabled:true,signature:{staffId:user.id,name:'Synthetic Staff',title:'AR Officer',workplace:''}};
 let template={...starterTemplates[0],id:templateId,revision:1,updated_at:'2026-09-23T00:00:00Z'};const savedMessages:Record<string,any>[]=[];
 const exports=[{name:'Synthetic.pdf',storage_key:'synthetic/reviewed.pdf',byte_count:100,sha256:'a'.repeat(64)}];
 const job={id:jobId,owner:user.id,hotel:'TSK',account_id:'synthetic',account_name:'Synthetic Account',content:'both',layout:'combined',purpose:'billing',invoice_ids:['synthetic'],manifest:[{id:'synthetic',invoice_no:'SYN-1'}],state:'ready',revision:1,project_key:null,exports,acknowledged:true,files:[],created_at:'2026-09-23T00:00:00Z'};
 let draft:any={id:draftId,owner:user.id,document_job_id:jobId,document_revision:1,hotel:'TSK',account_id:'synthetic',account_name:'Synthetic Account',invoice_ids:['synthetic'],purpose:'billing',recipients:{to:['synthetic@example.invalid'],cc:[],bcc:[]},subject:'Synthetic',body:'Dear customer',rich_body:plainMessage('Dear customer'),exports,attachments:[],revision:1,package_changed:false,billing_method:'email'};
 await context.route('**/api/access/signature',async route=>{if(route.request().method()==='PUT'){profile={...route.request().postDataJSON(),revision:profile.revision+1};}return route.fulfill({json:profile});});
 await context.route('**/api/email/templates*',async route=>{if(route.request().method()==='PUT'){template={...route.request().postDataJSON().content,id:templateId,revision:template.revision+1,updated_at:template.updated_at};return route.fulfill({json:template});}return route.fulfill({json:{items:[template],nextOffset:null}});});
 await context.route('**/api/email/templates/'+templateId,route=>route.fulfill({json:{items:[{...template,subject:'Newest template subject'}],nextOffset:null}}));
 await context.route('**/api/documents/'+jobId,route=>route.fulfill({json:job}));
 await context.route('**/api/email/open',route=>route.fulfill({json:draft}));
 await context.route('**/api/email/'+draftId,route=>{const input=route.request().postDataJSON();savedMessages.push(input);draft={...draft,...input,rich_body:input.richBody,template_ref:input.templateRef,revision:draft.revision+1};return route.fulfill({json:draft});});
 await context.route('**/api/gmail/status',route=>route.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com'}}));
 return {savedMessages};
}
for(const width of [1440,390])test(`signature settings and hotel names at ${width}px`,async({context,page})=>{
 await preferences(context);await page.setViewportSize({width,height:1000});await googleReturn(page);
 await page.getByRole('button',{name:'My email signature',exact:true}).click();await expect(page.getByRole('heading',{name:'My email signature',exact:true})).toBeVisible();
 await page.getByLabel('Name',{exact:true}).fill('Synthetic Example');await page.getByLabel('Position',{exact:true}).fill('Supervisor');
 await page.getByRole('button',{name:'Save signature',exact:true}).click();await expect(page.getByRole('status')).toContainText('Email signature saved.');
 const preview=page.getByRole('region',{name:'Signature preview',exact:true});
 for(const hotel of HOTEL_IDS){await page.getByRole('combobox',{name:'Signature preview hotel'}).selectOption(hotel);await expect(preview).toContainText(signatureWorkplace(hotel));}
 await expect(preview.getByRole('img',{name:'Katathani Collection',exact:true})).toBeVisible();
 await page.screenshot({path:`.tmp/email-signature-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
test('ordinary staff can edit their signature without seeing user administration',async({context,page})=>{
 await preferences(context);await context.route('**/api/access/me',route=>route.fulfill({json:{email:'synthetic.staff@example.invalid',administrator:false,regions:['phuket'],revision:1,displayName:'Synthetic Staff'}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in with Google'})).toBeEnabled();
 await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));sessionStorage.setItem(sessionStorage.getItem('ar-google-tab-v1')!+'-code-verifier',JSON.stringify('synthetic-code'));});
 await page.goto('/?code=synthetic');await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'My email signature',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Users & Access'})).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Signature preview hotel'}).locator('option')).toHaveCount(2);
});
test('template library only offers the current template, with no version controls',async({context,page})=>{
 await preferences(context);await googleReturn(page);await page.getByRole('button',{name:'Templates',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Email templates',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'View version history'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save template',exact:true})).toBeVisible();await expect(page.getByText(/Version \d/)).toHaveCount(0);
});
test('composer previews and saves one signature for the document hotel, and reload does not duplicate it',async({context,page})=>{
 const c=await preferences(context);await googleReturn(page);await page.evaluate(id=>history.replaceState(null,'',`/?documentJob=${id}&compose=1`),jobId);await page.reload();
 const dialog=page.getByRole('dialog',{name:'Email workspace'});await expect(dialog.getByLabel('Email signature')).toContainText('The Shore at Katathani');await expect(dialog.getByLabel('Email signature')).toContainText('Synthetic Staff');
 await dialog.getByRole('button',{name:'Save workspace draft',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Workspace draft saved');
 expect(c.savedMessages).toHaveLength(1);expect(c.savedMessages[0].body).toBe(richText(c.savedMessages[0].richBody));expect(c.savedMessages[0].body.split('Synthetic Staff')).toHaveLength(2);
 await page.reload();await expect(page.getByLabel('Email signature')).toHaveCount(1);await expect(page.getByRole('button',{name:'Save workspace draft',exact:true})).toBeDisabled();
 await page.getByLabel('Email signature').scrollIntoViewIfNeeded();
 const signatureBox=await page.getByLabel('Email signature').boundingBox(),footerBox=await page.locator('.email-message>footer').boundingBox();expect(signatureBox!.y+signatureBox!.height).toBeLessThanOrEqual(footerBox!.y+1);
 await page.screenshot({path:'.tmp/email-signature-composer.png',fullPage:true});
 await page.getByRole('button',{name:'Choose template',exact:true}).click();await page.locator('.template-choice').filter({hasText:'Billing'}).click();await page.getByRole('button',{name:'Apply to message',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Email subject',exact:true})).toHaveValue('Newest template subject');await expect(page.getByLabel('Email signature')).toHaveCount(1);await expect(dialog).not.toContainText(/version \d+/);
});

test('six signature previews require confirmation and retain the same batch without auto-resending',async({context,page})=>{
 await preferences(context);const sent:Record<string,unknown>[]=[];
 await context.route('**/api/email/test-send',route=>{sent.push(route.request().postDataJSON());return route.fulfill({json:{state:'sent',recorded:false}});});
 await googleReturn(page);await page.getByRole('button',{name:'My email signature',exact:true}).click();
 await page.getByRole('textbox',{name:'Test recipient',exact:true}).fill('synthetic-preview@example.invalid');
 await page.getByRole('button',{name:'Send 6 preview emails',exact:true}).click();await page.getByRole('button',{name:'Cancel test emails',exact:true}).click();expect(sent).toHaveLength(0);
 await page.getByRole('button',{name:'Send 6 preview emails',exact:true}).click();await page.getByRole('button',{name:'Confirm send 6 preview emails',exact:true}).click();
 await expect(page.getByText('Sent and verified',{exact:true})).toHaveCount(6);expect(sent.map(s=>s.signatureHotel)).toEqual([...HOTEL_IDS]);expect(new Set(sent.map(s=>s.commandId)).size).toBe(6);
 await expect(page.getByRole('button',{name:'Send 6 preview emails',exact:true})).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'My email signature',exact:true}).click();await expect(page.getByText('Sent and verified',{exact:true})).toHaveCount(6);expect(sent).toHaveLength(6);
 await expect(page.getByRole('textbox',{name:'Test recipient',exact:true})).toHaveValue('');
});
