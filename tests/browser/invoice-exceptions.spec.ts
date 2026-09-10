import {test,expect,type Page} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-10T00:00:00Z'};
async function setup(page:Page,failOnce=false){
 const calls:Record<string,unknown>[]=[];let failed=false;
 let state={hotel:'KAT',accountId:'A',invoiceId:'I',revision:1,note:'',dispute:'',held:false,holdReason:null as string|null,holdReviewDate:null as string|null,needsReview:true,reviewReason:'Verified OPERA balance reopened' as string|null,reopenedAt:'2026-09-10T12:00:00Z',updatedAt:'2026-09-10T12:00:00Z',source:{open:'12500.00',verification:'verified',collectionRole:'standalone',verifiedAt:'2026-09-10T12:00:00Z'}};
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',route=>{
  const q=route.request(),path=new URL(q.url()).pathname;
  if(path==='/api/config')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(path==='/api/refresh')return route.fulfill({json:{running:false,hotels:[],jobs:[]}});
  if(path==='/api/portfolio')return route.fulfill({json:{accounts:[{id:'A',name:'Synthetic Review Account',hotel:'KAT',type:'Agent',items:1,open:12500,over90:0}],status:'connected',refresh:{running:false,hotels:[]}}});
  if(path==='/api/accounts/KAT/A')return route.fulfill({json:{invoices:[{hotel:'KAT',account_id:'A',id:'I',guest:'Synthetic Guest',invoice_no:'INV-I',folio_no:'FOL-I',transaction_date:'2026-08-01',open:12500,original:12500,collection_role:'standalone',collection_selectable:true,verification_state:'verified',exceptions:state,workflow:{revision:0,credit_term:30,billing_required:true,first_billing_date:'2026-08-01',due_date:'2026-08-31',last_reminder_stage:'Final',last_reminder_date:'2026-09-01'}}]}});
  if(path==='/api/invoice-exceptions/KAT/A/I'){
   if(q.method()==='GET')return route.fulfill({json:state});
   const body=q.postDataJSON();calls.push(body);if(failOnce&&!failed){failed=true;return route.abort('failed');}
   state={...state,revision:state.revision+1,...(body.action==='hold'?{held:true,holdReason:body.reason,holdReviewDate:body.reviewDate}:body.action==='release'?{held:false,holdReason:null,holdReviewDate:null}:body.action==='acknowledge_reopen'?{needsReview:false,reviewReason:null}:{note:body.note,dispute:body.dispute})};return route.fulfill({json:state});
  }
  if(path.endsWith('/history'))return route.fulfill({json:{rows:[{revision:1,action:'source_reopened',reason:'Synthetic verified zero became nonzero',recordedAt:'2026-09-10T12:00:00Z',snapshot:state,transition:{fromOpen:'0.00',toOpen:'12500.00'}}],total:1}});
  return route.fulfill({status:501,json:{error:'unmocked_synthetic_endpoint'}});
 });return calls;
}
async function openPanel(page:Page,width=1440){await page.goto('/?account=A&property=KAT');if(width<1200)await page.getByRole('button',{name:'Synthetic Guest',exact:true}).click();await page.getByText('Notes, holds & review',{exact:true}).click();await expect(page.getByLabel('Invoice note',{exact:true})).toBeVisible();}
for(const [width,height] of [[1440,900],[1280,800],[390,844]])test(`explicit hold and reopen review ${width}`,async({page})=>{
 await page.setViewportSize({width,height});const calls=await setup(page);await openPanel(page,width);
 await expect(page.getByText('Needs review · reopened',{exact:true})).toBeVisible();
 await page.getByLabel('Reason for status change',{exact:true}).fill('Check the returned balance against supporting evidence');
 await page.getByRole('button',{name:'Review hold',exact:true}).click();expect(calls).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Confirm status change',exact:true})).toBeDisabled();
 await page.getByLabel('I reviewed this invoice and the change',{exact:true}).check();
 await page.screenshot({path:`evidence/invoice-hold-review-${width}.png`});
 await page.getByRole('button',{name:'Confirm status change',exact:true}).click();await expect(page.getByRole('button',{name:'Review release',exact:true})).toBeVisible();
 expect(calls[0]).toMatchObject({action:'hold',revision:1,confirmed:true});await expect(page.getByText('Needs review · reopened',{exact:true})).toBeVisible();
 await page.getByLabel('Reason for status change',{exact:true}).fill('Reviewed the reopening; keep the existing history');await page.getByRole('button',{name:'Review reopened invoice',exact:true}).click();await page.getByLabel('I reviewed this invoice and the change',{exact:true}).check();await page.getByRole('button',{name:'Confirm status change',exact:true}).click();
 await expect(page.getByRole('button',{name:'Review reopened invoice',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review release',exact:true})).toBeVisible();expect(calls[1].action).toBe('acknowledge_reopen');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('uncertain status command retry keeps the same command and revision',async({page})=>{
 const calls=await setup(page,true);await openPanel(page);await page.getByLabel('Reason for status change',{exact:true}).fill('Synthetic retry reason');await page.getByRole('button',{name:'Review hold',exact:true}).click();await page.getByLabel('I reviewed this invoice and the change',{exact:true}).check();await page.getByRole('button',{name:'Confirm status change',exact:true}).click();await page.getByRole('button',{name:'Retry same status command',exact:true}).click();await expect(page.getByRole('button',{name:'Review release',exact:true})).toBeVisible();expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
