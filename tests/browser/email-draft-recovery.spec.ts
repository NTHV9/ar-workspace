import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';
const jobId='00000000-0000-4000-8000-000000000001',draftId='00000000-0000-4000-8000-000000000002',deliveryId='00000000-0000-4000-8000-000000000003';
async function setup(page:Page,stage='Friendly',stageLabel='Friendly',missingReceipt=false){
 const user={id:'synthetic-draft-recovery-user',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'},calls:string[]=[];
 const exports=[{name:'Synthetic-reviewed.pdf',storage_key:`jobs/${jobId}/exports/synthetic.pdf`,byte_count:1000,sha256:'a'.repeat(64)}];
 const job={id:jobId,lifecycle:'transient',hotel:'KAT',account_id:'example',account_name:'Synthetic draft recovery',invoice_ids:['1'],state:'ready',revision:4,acknowledged:true,files:[],exports};
 let delivery={id:deliveryId,state:missingReceipt?'review_required':'created',reason:missingReceipt?'gmail_receipt_missing':null,mode:'draft',stage,stageLabel,recorded:false};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',r=>{const request=r.request(),path=new URL(request.url()).pathname;calls.push(request.method()+' '+path);
  if(path==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/collection-policy')return r.fulfill({json:policyFixture});
  if(path==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(path==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(path===`/api/documents/${jobId}`)return r.fulfill({json:job});
  if(path==='/api/gmail/status')return r.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com'}});
  if(path==='/api/email/open')return r.fulfill({json:{id:draftId,document_job_id:jobId,document_revision:4,hotel:'KAT',account_id:'example',account_name:job.account_name,invoice_ids:['1'],purpose:'collection',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic collection subject',body:'Synthetic saved collection body',exports,attachments:[],revision:1,package_changed:false,gmail_handoff:delivery.state,delivery}});
  if(path===`/api/email/deliveries/${deliveryId}/check`){delivery={...delivery,state:'review_required',reason:'gmail_receipt_missing'};return r.fulfill({json:delivery});}
  return r.fulfill({status:501,json:{error:'blocked_unmocked_test_api'}});
 });await page.goto(`/?documentJob=${jobId}&compose=1`);await expect(page.getByLabel('Email message')).toBeVisible();return calls;
}
for(const [stage,label] of [['Friendly','Friendly'],['round_retired','Original retired reminder']])test(`a reopened collection Gmail Draft displays its locked ${stage} stage`,async({page})=>{
 const calls=await setup(page,stage,label);const selection=page.getByLabel('Collection stage');await expect(selection).toBeDisabled();await expect(selection).toHaveValue(stage);await expect(selection.locator('option:checked')).toHaveText(label);
 await page.reload();await expect(selection).toHaveValue(stage);await expect(selection.locator('option:checked')).toHaveText(label);await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();expect(calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});
test('a missing draft receipt directs the user to existing Sent review and retains the guidance on reload',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:'Check sent status',exact:true}).click();await expect(page.getByText('Gmail no longer returns the recorded message.',{exact:false})).toBeVisible();await expect(page.getByText('Use Review existing sent message to verify a matching Sent email. Do not send again.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Review existing sent message',exact:true}).click();await expect(page.getByRole('dialog',{name:'Review an existing sent message',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close sent review',exact:true}).click();
 await page.reload();await expect(page.getByText('Gmail no longer returns the recorded message.',{exact:false})).toBeVisible();expect(calls.filter(call=>call.endsWith('/check'))).toHaveLength(1);expect(calls.some(call=>/\/(send|gmail-draft)$/.test(call))).toBe(false);
});
