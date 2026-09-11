import {test,expect,type Page} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
const jobId='00000000-0000-4000-8000-000000000002';
async function setup(page:Page,{failed=false,empty=false}={}){
 const requests:string[]=[];
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/refresh')return route.fulfill({json:{running:false,hotels:[],jobs:[]}});
  if(path==='/api/portfolio')return route.fulfill({json:{accounts:[{id:'A',name:'Synthetic Evidence Account',hotel:'TSK',type:'Agent',items:1,open:12500,over90:0}],status:'connected',refresh:{running:false,hotels:[]}}});
  if(path==='/api/accounts/TSK/A')return route.fulfill({json:{invoices:[]}});
  if(path==='/api/external-billing')return route.fulfill({json:{rows:[],total:0,summary:{records:0,invoices:0,firstBillingInvoices:0,amount:'0.00',unknownAmounts:0}}});
  if(path.startsWith('/api/account-workspace/')){
   requests.push(path+url.search);if(failed)return route.fulfill({status:503,json:{error:'account_workspace_unavailable'}});
   if(empty)return route.fulfill({json:{rows:[],total:0}});
   if(path.endsWith('/history'))return route.fulfill({json:{total:21,rows:[{id:'history:A:1',recorded_at:'2026-09-10T12:00:00Z',source:'Manual history correction',purpose:'history',stage:'Follow 1',actual_date:null,invoice_ids:['SYNTHETIC-A'],amount:null,job_id:null,revision:1,first_billing_date:'2026-08-05',reminder_date:'2026-09-01'},{id:'sent:synthetic',recorded_at:'2026-09-09T12:00:00Z',source:'Verified Gmail send',purpose:'billing',stage:null,actual_date:'2026-09-09',invoice_ids:['SYNTHETIC-B'],amount:12500,job_id:jobId,revision:null,first_billing_date:null,reminder_date:null,message:{subject:'Synthetic billing',body:'Recorded message, retained after settlement.',recipients:{to:['billing@example.test'],cc:[],bcc:[]}}}]}});
   return route.fulfill({json:{total:1,rows:[{id:jobId,created_at:'2026-09-09T12:00:00Z',content:'both',layout:'statement_bundle',purpose:'billing',state:'ready',revision:2,acknowledged:true,statement_source:'workspace',invoice_count:2,draft_id:'synthetic-draft',subject:'Synthetic billing',delivery_state:'review_required',delivery_reason:'attachment_changed',sent_at:null,has_thread:true}]}});
  }
  if(path===`/api/documents/${jobId}`)return route.fulfill({json:{id:jobId,hotel:'TSK',account_id:'A',account_name:'Synthetic Evidence Account',content:'both',layout:'statement_bundle',purpose:'billing',state:'ready',revision:2,files:[],invoice_ids:['A'],exports:[],manifest:[],acknowledged:true}});
  return route.fulfill({status:501,json:{error:'unmocked_synthetic_endpoint'}});
 });return requests;
}
for(const [width,height] of [[1440,900],[1280,800],[390,844]])test(`account history and documents ${width}`,async({page})=>{
 await page.setViewportSize({width,height});const requests=await setup(page);await page.goto('/?account=A&property=TSK');
 await page.getByRole('button',{name:'Collection History',exact:true}).click();
 await expect(page.getByRole('region',{name:'Collection history table'})).toContainText('Manual history correction');
 await expect(page.getByRole('region',{name:'Collection history table'})).toContainText('Follow-up 1');
 await page.getByText('Verified message',{exact:true}).click();await expect(page.getByText('Recorded message, retained after settlement.')).toBeVisible();
 await page.screenshot({path:`evidence/account-history-${width}.png`});
 await page.getByRole('button',{name:'Next records',exact:true}).click();await expect.poll(()=>requests.some(r=>r.endsWith('history?page=1'))).toBe(true);
 await page.getByRole('button',{name:'Documents & Gmail',exact:true}).click();
 await expect(page.getByRole('region',{name:'Document history table'})).toContainText('review required');
 await expect(page.getByText('Linked conversation available in email work')).toBeVisible();
 await page.screenshot({path:`evidence/account-documents-${width}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'Open earlier preparation',exact:true}).click();await expect(page).toHaveURL(new RegExp('documentJob='+jobId));
 await page.getByRole('button',{name:'Back to account',exact:true}).click();await expect(page.getByRole('region',{name:'Document history table'})).toBeVisible();
 expect(requests.every(r=>r.includes('/TSK/A/'))).toBe(true);
});
test('service failure remains unavailable instead of empty history',async({page})=>{
 await setup(page,{failed:true});await page.goto('/?account=A&property=TSK&accountSection=Collection+History');await expect(page.getByRole('alert')).toContainText('Account evidence is unavailable');await expect(page.getByText('No recorded collection history',{exact:true})).toHaveCount(0);
});
test('empty account evidence is honest and scoped',async({page})=>{
 await setup(page,{empty:true});await page.goto('/?account=A&property=TSK&accountSection=Documents+%26+Gmail');await expect(page.getByText('No document or email work yet',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Next records',exact:true})).toBeDisabled();
});
