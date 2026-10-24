import {test,expect,type Page} from '@playwright/test';
import {policyFixture} from './fixtures/collection-policy';
import {HOTEL_IDS,type HotelId} from '../../src/domain/hotels';
import type {EmailDraft} from '../../worker/email/shared';

const id='00000000-0000-4000-8000-000000000002',jobId='00000000-0000-4000-8000-000000000001';
const expectedSelf=(hotel:HotelId)=>hotel==='KAT'||hotel==='TSK'?'ar@katathani.com':'ar@thesandskhaolak.com';
const harness=(hotel:HotelId)=>`/tests/browser/default-self-cc/harness.html?hotel=${hotel}`;
async function setup(page:Page,hotel:HotelId,options:{draft?:Partial<EmailDraft>;conflict?:boolean}={}){
 const writes:{path:string;body:Record<string,unknown>}[]=[],unexpected:string[]=[],errors:string[]=[];
 let draft:EmailDraft={id,owner:'00000000-0000-4000-8000-000000000099',document_job_id:jobId,document_revision:1,hotel,account_id:'synthetic',account_name:'Synthetic Travel',invoice_ids:['SYN-1'],purpose:'billing',revision:0,package_changed:false,recipients:{to:['customer@example.test'],cc:['colleague@example.test'],bcc:['archive@example.test']},subject:'Synthetic reviewed message',body:'Synthetic content. No customer data.',exports:[],attachments:[],...options.draft};
 page.on('pageerror',error=>errors.push(error.message));
 // Block every external destination, including real provider endpoints.
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET')writes.push({path,body:request.postDataJSON()});
  if(path==='/api/collection-policy')return route.fulfill({json:policyFixture});
  if(path==='/api/access/signature')return route.fulfill({json:{revision:0,enabled:false,signature:{staffId:draft.owner,name:'',title:'',workplace:''}}});
  if(path==='/api/gmail/status')return route.fulfill({json:{region:hotel==='KAT'||hotel==='TSK'?'phuket':'khao-lak',expectedEmail:expectedSelf(hotel),email:expectedSelf(hotel),configured:true,connected:true,canRead:true}});
  if(path==='/api/email/open')return route.fulfill({json:draft});
  if(path===`/api/email/${id}`&&request.method()==='PUT'){
   if(options.conflict)return route.fulfill({status:409,json:{error:'email_revision_conflict'}});
   const body=request.postDataJSON();draft={...draft,revision:draft.revision+1,purpose:body.purpose,recipients:body.recipients,subject:body.subject,body:body.body,rich_body:body.richBody??null};return route.fulfill({json:draft});
  }
  if(path===`/api/email/${id}/gmail-draft`)return route.fulfill({json:{id:'synthetic-delivery',mode:'draft',state:'created',created:true,recorded:false}});
  if(path===`/api/email/${id}/send`)return route.fulfill({json:{id:'synthetic-delivery',mode:'send',state:'sent',recorded:true}});
  if(path.startsWith('/api/account-settings/'))return route.fulfill({json:{billing_recipients:{to:['billing@example.test'],cc:['billing-copy@example.test'],bcc:[]},collection_recipients:{to:['collection@example.test'],cc:['collection-copy@example.test'],bcc:[]}}});
  unexpected.push(request.method()+' '+path);return route.fulfill({status:501,json:{error:'blocked_unmocked_api'}});
 });
 return {writes,unexpected,errors,getDraft:()=>draft};
}
const deliveryWrites=(writes:{path:string}[])=>writes.filter(w=>/\/(send|gmail-draft|test-send)$/.test(w.path));

for(const hotel of HOTEL_IDS)test(`new ${hotel} email shows the correct default CC before any handoff`,async({page})=>{
 const c=await setup(page,hotel);await page.goto(harness(hotel));
 await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue(`colleague@example.test, ${expectedSelf(hotel)}`);
 await expect(page.getByLabel('Email TO',{exact:true})).toHaveValue('customer@example.test');
 await expect(page.getByLabel('Email BCC',{exact:true})).toHaveValue('archive@example.test');
 expect(c.writes.filter(w=>w.path!== '/api/email/open')).toEqual([]);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});

for(const hotel of ['KAT','TSAN'] as const){
 test(`${hotel} Gmail draft saves the visible default CC first using synthetic APIs only`,async({page})=>{
  const c=await setup(page,hotel);await page.goto(harness(hotel));await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue(`colleague@example.test, ${expectedSelf(hotel)}`);
  await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();
  await expect(page.getByRole('status',{name:'Email delivery status'})).toContainText('Gmail draft — not sent');
  expect(c.getDraft().recipients.cc).toEqual(['colleague@example.test',expectedSelf(hotel)]);
  expect(c.writes.map(w=>w.path)).toEqual(['/api/email/open',`/api/email/${id}`,`/api/email/${id}/gmail-draft`]);
  expect(c.writes.at(-1)?.body.revision).toBe(1);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
 });
 test(`${hotel} Send Now reviews and saves the same visible CC and sends only after explicit confirmation (mocked)`,async({page})=>{
  const c=await setup(page,hotel);await page.goto(harness(hotel));
  await page.getByRole('button',{name:'Review & send now',exact:true}).click();
  const review=page.getByRole('region',{name:'Confirm email send'});await expect(review).toContainText(`CC: colleague@example.test, ${expectedSelf(hotel)}`);
  expect(deliveryWrites(c.writes)).toEqual([]);expect(c.getDraft().recipients.cc).toContain(expectedSelf(hotel));
  await page.getByRole('checkbox',{name:'I reviewed the recipients, message and final PDF files.'}).check();
  await page.getByRole('button',{name:'Confirm send now',exact:true}).click();
  await expect(page.getByRole('status',{name:'Email delivery status'})).toContainText('Sent — history recorded');
  expect(deliveryWrites(c.writes).map(w=>w.path)).toEqual([`/api/email/${id}/send`]);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
 });
 test(`${hotel} required self CC remains when other CC recipients are removed, saved and reopened`,async({page})=>{
  const c=await setup(page,hotel);await page.goto(harness(hotel));
  const cc=page.getByLabel('Email CC',{exact:true});await expect(cc).toHaveValue(`colleague@example.test, ${expectedSelf(hotel)}`);
  await cc.fill('');await cc.blur();await expect(cc).toHaveValue(expectedSelf(hotel));await page.getByRole('button',{name:'Save message',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save message',exact:true})).toBeDisabled();await page.reload();await expect(cc).toHaveValue(expectedSelf(hotel));
  await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();await expect(page.getByRole('status',{name:'Email delivery status'})).toContainText('Gmail draft — not sent');
  expect(c.getDraft().recipients.cc).toEqual([expectedSelf(hotel)]);expect(c.writes.filter(w=>w.path===`/api/email/${id}`)).toHaveLength(1);expect(c.errors).toEqual([]);
 });
}

test('saved collection recipients appear automatically with required regional CC and no load button',async({page})=>{
 const c=await setup(page,'TLKL',{draft:{revision:2,purpose:'collection',recipients:{to:['collection@example.test'],cc:['collection-copy@example.test'],bcc:[]}}});await page.goto(harness('TLKL'));
 await expect(page.getByRole('button',{name:'Load account recipients',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Email TO',{exact:true})).toHaveValue('collection@example.test');await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('collection-copy@example.test, ar@thesandskhaolak.com');
 await page.getByRole('button',{name:'Save message',exact:true}).click();await expect(page.getByRole('button',{name:'Save message',exact:true})).toBeDisabled();
 expect(c.getDraft().purpose).toBe('collection');expect(c.writes.some(w=>w.path.startsWith('/api/account-settings/'))).toBe(false);expect(deliveryWrites(c.writes)).toEqual([]);
});

test('revision conflict retains edited CC and prevents a Gmail handoff',async({page})=>{
 const c=await setup(page,'KAT',{conflict:true});await page.goto(harness('KAT'));await page.getByLabel('Email CC',{exact:true}).fill('reviewed@example.test');
 await page.getByRole('button',{name:'Create Gmail draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('another session');
 await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('reviewed@example.test, ar@katathani.com');expect(deliveryWrites(c.writes)).toEqual([]);
});

test('an uncertain handoff retains its original recipient snapshot',async({page})=>{
 const c=await setup(page,'KAT',{draft:{gmail_handoff:'awaiting_evidence',delivery:{id:'synthetic-delivery',state:'awaiting_evidence',mode:'send',recorded:false},recipients:{to:['customer@example.test'],cc:[],bcc:[]}}});
 await page.goto(harness('KAT'));await expect(page.getByLabel('Email CC',{exact:true})).toHaveValue('');await expect(page.getByLabel('Email CC',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Review & send now',exact:true})).toBeDisabled();expect(deliveryWrites(c.writes)).toEqual([]);
});

for(const hotel of ['KAT','TSAN'] as const)for(const width of [1440,390])test(`${hotel} default CC layout remains readable at ${width}`,async({page})=>{
 const c=await setup(page,hotel);await page.setViewportSize({width,height:width===390?844:900});await page.goto(harness(hotel));
 const cc=page.getByLabel('Email CC',{exact:true});await expect(cc).toHaveValue(`colleague@example.test, ${expectedSelf(hotel)}`);await cc.scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.tmp/self-cc-evidence/${hotel}-${width}-compose.png`});
 await page.getByRole('button',{name:'Review & send now',exact:true}).click();await expect(page.getByRole('region',{name:'Confirm email send'})).toContainText(expectedSelf(hotel));
 await page.screenshot({path:`.tmp/self-cc-evidence/${hotel}-${width}-review.png`});expect(deliveryWrites(c.writes)).toEqual([]);expect(c.errors).toEqual([]);
});
