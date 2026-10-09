import {expect,type Page} from '@playwright/test';
import {policyFixture} from './collection-policy';
import {starterTemplates} from '../../../src/email/templates';
const stamp='2026-09-28T03:00:00Z';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{providers:['google']},user_metadata:{},created_at:stamp};
export async function auditWorkspace(page:Page,{signature=true}={}){
 const writes:{path:string;body:Record<string,unknown>}[]=[],reads:string[]=[];
 const invoice={id:'I1',hotel:'KAT',account_id:'A',invoice_no:'SYN-10085',folio_no:'FOL-10085',guest:'Synthetic guest',transaction_date:'2026-09-01',original:1558080,open:1558080,age:27,aging:'Up to 30',collection_role:'standalone',collection_selectable:true,verification_state:'verified',workflow:{revision:1,billing_required:true,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:null}};
 const account={id:'A',hotel:'KAT',name:'Synthetic Travel',type:'Agent',open:invoice.open,over90:0,items:1,synced_at:stamp,verification_state:'verified',agingBuckets:[{label:'Up to 30',start:0,end:30,sequence:0,amount:invoice.open,debit:invoice.open,credit:0}]};
 let settings={revision:1,billing_required:true,credit_term:30,billing_recipients:{to:[],cc:[],bcc:[]},collection_recipients:{to:[],cc:[],bcc:[]},billing_method:'email',billing_portal:null,billing_instructions:'',collection_instructions:''};
 let template={...starterTemplates[0],id:'00000000-0000-4000-8000-000000000002',revision:1,updated_at:stamp};
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{access_token:'synthetic-audit-token',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user}}));
 await page.route('**/api/**',r=>{
  const request=r.request(),path=new URL(request.url()).pathname;reads.push(path);if(!['GET','HEAD'].includes(request.method()))writes.push({path,body:request.postDataJSON()??{}});
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic',googleEnabled:true}});
  if(path==='/api/access/me')return r.fulfill({json:{memberId:user.id,email:user.email,displayName:'Synthetic Staff',active:true,administrator:true,regions:['phuket','khao-lak'],revision:1}});
  if(path==='/api/access/signature')return r.fulfill({json:{revision:1,enabled:signature,signature:{staffId:user.id,name:'Synthetic Staff',title:'AR Officer',workplace:''}}});
  if(path==='/api/portfolio')return r.fulfill({json:{accounts:[account],status:'connected',refresh:{running:false,hotels:[{hotel:'KAT',status:'succeeded',last_success_at:stamp}]}}});
  if(path==='/api/refresh')return r.fulfill({json:{running:false,hotels:[{hotel:'KAT',status:'succeeded',last_success_at:stamp}]}});
  if(path==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(path==='/api/accounts/KAT/A')return r.fulfill({json:{invoices:[invoice]}});
  if(path==='/api/account-settings/KAT/A'){if(request.method()==='PUT'){const value=request.postDataJSON();settings={...settings,revision:settings.revision+1,billing_required:value.billingRequired,credit_term:value.creditTerm,billing_recipients:value.billingRecipients,collection_recipients:value.collectionRecipients};}return r.fulfill({json:settings});}
  if(path==='/api/invoice-exceptions/KAT/A/I1')return r.fulfill({json:{hotel:'KAT',accountId:'A',invoiceId:'I1',revision:1,note:'',dispute:'',held:false,holdReason:null,holdReviewDate:null,needsReview:false,reviewReason:null,reopenedAt:null,updatedAt:stamp,source:{open:'1558080.00',verification:'verified',collectionRole:'standalone',verifiedAt:stamp}}});
  if(path==='/api/invoice-register/KAT/A/I1')return r.fulfill({json:{...invoice,account_name:account.name,billing_required:true,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,promised_date:null,tracking_status:'',owner_name:'',reported_received:null,note:'',workflow_revision:1,tracking_revision:1,exception_revision:1}});
  if(path==='/api/drive/status')return r.fulfill({json:{configured:true,connected:true,email:user.email,folder:{configured:true,id:'synthetic-folder',name:'Synthetic archive',revision:1,ready:true,verifiedAt:stamp,visibility:'restricted'},cleanupDisabled:false,pickerConfigured:false}});
  if(path==='/api/operations/status')return r.fulfill({json:{enabled:false}});
  if(path==='/api/operations/retention')return r.fulfill({json:{enabled:true,summary:{waiting:0,blocked:0,uncertain:0,deleted:0},rows:[],total:0}});
  if(path==='/api/operations/queue')return r.fulfill({json:{rows:[],total:0,writeHold:false}});
  if(path==='/api/remittances/options')return r.fulfill({json:{accounts:[{hotel:'KAT',accountId:'A',name:account.name,type:'Agent',accountNo:'SYN-A',verified:true}],config:{maxFileBytes:10485760,maxFiles:50,maxTotalFileBytes:104857600}}});
  if(path==='/api/remittances')return r.fulfill({json:{rows:[{id:'00000000-0000-4000-8000-000000000020',revision:1,state:'active',hotel:'KAT',accountId:'A',accountName:account.name,accountType:'Agent',receivedDate:'2026-09-28',reference:'SYNTH-REMIT',reportedAmount:'1000.00',linkedOpen:'1558080.00',knownLinkedOpen:'1558080.00',invoiceCount:1,fileCount:0,unverifiedLines:0,resolution:'awaiting_opera'}],total:1,summary:{documents:1,invoices:1,reportedAmount:'1000.00',knownReportedAmount:'1000.00',unspecifiedAmounts:0,linkedOpen:'1558080.00',knownLinkedOpen:'1558080.00',unverifiedInvoices:0}}});
  if(path==='/api/email/templates')return r.fulfill({json:{items:[template],nextOffset:null}});
  if(path.startsWith('/api/email/templates/')){if(request.method()==='PUT')template={...template,...request.postDataJSON().content,revision:template.revision+1};return r.fulfill({json:request.method()==='GET'?{items:[template],nextOffset:null}:template});}
  if(path==='/api/gmail/status')return r.fulfill({json:{region:'phuket',expectedEmail:'ar@katathani.com',configured:true,connected:true,canRead:true,email:user.email}});
  if(path==='/api/email/open')return r.fulfill({json:{id:'draft-audit',document_job_id:'job-audit',document_revision:1,hotel:'KAT',account_id:'A',account_name:account.name,invoice_ids:['I1'],purpose:'billing',recipients:{to:['synthetic@example.invalid'],cc:[],bcc:[]},subject:'Synthetic invoice message',body:'Please find the reviewed documents attached.\n\nThank you.',rich_body:null,exports:[],attachments:[],revision:1,package_changed:false,billing_method:'email'}});
  return r.fulfill({status:503,json:{error:'synthetic_endpoint_not_needed'}});
 });return {writes,reads};
}
export async function auditLogin(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();await page.evaluate(()=>{sessionStorage.setItem('ar-google-tab-v1-oauth',String(Date.now()));const key=sessionStorage.getItem('ar-google-tab-v1')!;sessionStorage.setItem(key+'-code-verifier',JSON.stringify('synthetic-code'));});await page.goto('/?code=synthetic-code');await expect(page.getByRole('button',{name:'Aging',exact:true})).toBeVisible();}
export async function auditRoute(page:Page,query:string){await page.evaluate(q=>{history.pushState(null,'','/?'+q);dispatchEvent(new PopStateEvent('popstate'));},query);}
