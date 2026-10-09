import {test,expect,type Page} from '@playwright/test';
import {setupDepth,depthJobId} from './fixtures/ui-depth';
import {mailboxSender,type MailboxId} from '../../src/domain/mailboxes';
async function seedTabSession(page:Page){
 await page.addInitScript(()=>{const synthetic=localStorage.getItem('sb-example-auth-token'),set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){set.call(this,key,value);if(this===sessionStorage&&key==='ar-google-tab-v1'&&synthetic)set.call(this,value,synthetic);};});
}
async function mailboxStatuses(page:Page,khaoConnected=true){
 const queries:URLSearchParams[]=[];
 await page.route('**/api/gmail/status*',route=>{const q=new URL(route.request().url()).searchParams;queries.push(q);const region=(q.get('region')??'phuket') as MailboxId,email=mailboxSender(region);return route.fulfill({json:{region,expectedEmail:email,configured:true,connected:region==='phuket'||khaoConnected,canRead:true,email:region==='phuket'||khaoConnected?email:null}});});
 return queries;
}
for(const width of [1440,390])test(`mailbox settings display independent connections and jobless authorization at ${width}`,async({page})=>{
 const c=await setupDepth(page);await seedTabSession(page);await page.setViewportSize({width,height:900});const queries=await mailboxStatuses(page,false),connects:Record<string,unknown>[]=[];
 await page.route('**/api/gmail/connect',route=>{connects.push(route.request().postDataJSON());return route.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?synthetic=1'}});});
 await page.route('https://accounts.google.com/**',route=>route.abort());
 await page.goto('/?settings=1&region=khao-lak&gmail=connected');
 const panel=page.getByRole('region',{name:'Gmail connections',exact:true});await expect(panel.getByRole('heading',{name:'Gmail connections',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Phuket Gmail connection'})).toContainText('Connected · sending and Sent verification authorized');
 const khao=page.getByRole('region',{name:'Khao Lak Gmail connection'});await expect(khao).toContainText('Not connected');await expect(khao).toContainText('ar@thesandskhaolak.com');
 expect(queries.map(q=>q.get('region')).sort()).toEqual(['khao-lak','phuket']);expect(c.methods.some(v=>v.endsWith('/api/email/open'))).toBe(false);
 await page.screenshot({path:`.tmp/khao-mail-settings-${width}.png`,fullPage:true});
 await khao.getByRole('button',{name:'Connect Gmail',exact:true}).click();await expect.poll(()=>connects.length).toBe(1);expect(connects[0]).toEqual({region:'khao-lak'});
});
test('failed Gmail callback returns to connection recovery without assuming success',async({page})=>{
 await setupDepth(page);await seedTabSession(page);await mailboxStatuses(page,false);await page.goto('/?settings=1&region=khao-lak&gmail=failed');
 await expect(page.getByRole('heading',{name:'Gmail connections',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Gmail authorization failed');await expect(page.getByRole('region',{name:'Khao Lak Gmail connection'})).toContainText('Not connected');
});
async function regionalComposer(page:Page){
 const c=await setupDepth(page,{compose:true});await seedTabSession(page);const queries=await mailboxStatuses(page),exports=[{name:'Synthetic.pdf',storage_key:`jobs/${depthJobId}/exports/synthetic.pdf`,byte_count:100,sha256:'a'.repeat(64)}];
 const job={id:depthJobId,hotel:'TLKL',account_id:'SYNTHETIC',account_name:'Synthetic Khao Lak',invoice_ids:['SYNTHETIC'],state:'ready',revision:1,acknowledged:true,files:[],exports,manifest:[]};
 let draft={id:'00000000-0000-4000-8000-000000000003',document_job_id:depthJobId,document_revision:1,hotel:job.hotel,account_id:job.account_id,account_name:job.account_name,invoice_ids:job.invoice_ids,purpose:'billing',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic regional review',body:'Synthetic reviewed message',exports,attachments:[],revision:0,package_changed:false};
 await page.route('**/api/documents/'+depthJobId,route=>route.fulfill({json:job}));
 await page.route('**/api/access/signature',route=>route.fulfill({json:{revision:0,enabled:false,signature:{staffId:'00000000-0000-4000-8000-000000000099',name:'',title:'',workplace:''}}}));
 await page.route('**/api/email/open',route=>route.fulfill({json:draft}));
 await page.route('**/api/email/'+draft.id,route=>{draft={...draft,...route.request().postDataJSON(),revision:draft.revision+1};return route.fulfill({json:draft});});
 return {...c,queries};
}
test('Khao Lak review shows exact sender and scopes diagnostics without sending',async({page})=>{
 const c=await regionalComposer(page),lists:URLSearchParams[]=[];
 await page.route('**/api/email/test-conversations?*',route=>{lists.push(new URL(route.request().url()).searchParams);return route.fulfill({json:{deliveries:[],nextOffset:null}});});
 await page.goto('/?documentJob='+depthJobId+'&compose=1');await expect(page.getByLabel('Email message',{exact:true})).toBeVisible();await expect(page.getByText('ar@thesandskhaolak.com',{exact:true})).toBeVisible();
 expect(c.queries[0].get('region')).toBe('khao-lak');expect(c.queries[0].get('jobId')).toBe(depthJobId);
 await page.getByRole('button',{name:'Connection test',exact:true}).click();await expect.poll(()=>lists.length).toBe(1);expect(lists[0].get('region')).toBe('khao-lak');
 await page.getByRole('button',{name:'Review & send now',exact:true}).click();const review=page.getByRole('region',{name:'Confirm email send'});await expect(review).toContainText('From: ar@thesandskhaolak.com');
 expect(c.methods.some(v=>/\/(send|gmail-draft|test-send)$/.test(v))).toBe(false);await page.screenshot({path:'.tmp/khao-mail-review.png',fullPage:true});
});
test('a disconnected Khao Lak mailbox cannot use the connected Phuket mailbox',async({page})=>{
 const c=await regionalComposer(page);await mailboxStatuses(page,false);
 await page.goto('/?documentJob='+depthJobId+'&compose=1');await expect(page.getByLabel('Email message',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create Gmail draft',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Review & send now',exact:true})).toBeDisabled();await expect(page.getByText('Connect Gmail to continue.',{exact:true})).toBeVisible();
 await expect(page.getByText('ar@thesandskhaolak.com',{exact:true})).toBeVisible();expect(c.methods.some(v=>/\/(send|gmail-draft|test-send)$/.test(v))).toBe(false);
});
test('recovery audit reads and links the chosen mailbox',async({page})=>{
 await setupDepth(page);await seedTabSession(page);const reads:URLSearchParams[]=[];await page.route('**/api/operations/recovery-sent?*',route=>{const q=new URL(route.request().url()).searchParams;reads.push(q);return route.fulfill({json:{from:q.get('from'),to:q.get('to'),scanned:1,rows:[{gmailId:'syntheticGoogleId',deliveryId:null,sentAt:'2026-09-12T02:59:00Z',state:'missing_receipt'}],nextPageToken:null,complete:true}});});
 await page.goto('/?operations=1&region=khao-lak');await expect(page.getByLabel('Recovery sending mailbox')).toHaveValue('khao-lak');await page.getByRole('button',{name:'Read SENT metadata',exact:true}).click();await expect(page.getByRole('link',{name:'Review in Gmail',exact:true})).toHaveAttribute('href',/authuser=ar%40thesandskhaolak.com/);expect(reads[0].get('region')).toBe('khao-lak');
 await page.getByLabel('Recovery sending mailbox').selectOption('phuket');await expect(page.getByRole('link',{name:'Review in Gmail',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Read SENT metadata',exact:true}).click();await expect(page.getByRole('link',{name:'Review in Gmail',exact:true})).toHaveAttribute('href',/authuser=ar%40katathani.com/);expect(reads[1].get('region')).toBe('phuket');
});
