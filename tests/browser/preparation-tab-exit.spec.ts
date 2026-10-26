import {syntheticInvoice} from './fixtures/invoice-pdf';
import {choosePdfTool} from './fixtures/pdf-tools';
import {test,expect} from '@playwright/test';
import http from 'node:http';
import {currentWorkspaceSession} from './fixtures/workspace-route';
const actor='00000000-0000-4000-8000-000000000001',id='a0000000-0000-4000-8000-000000000001';
const token='e30.'+Buffer.from(JSON.stringify({sub:actor,session_id:'00000000-0000-4000-8000-000000000099'})).toString('base64url')+'.synthetic';
for(const scenario of ['reload-close','switch-close','cancelled-close','address-navigation','network-error-reload','unsupported-close','pending-create-close','batch-lost-reload-exit','batch-lost-reload-close','single-cancel-menu','single-cancel-failed','single-cancel-signout','single-nav-back'])test(`qualified actual browser departure: ${scenario}`,async({page,context},testInfo)=>{
 const batchCase=scenario.startsWith('batch-lost-'),singleCancel=scenario.startsWith('single-cancel-')||scenario==='single-nav-back';const batchId='b0000000-0000-4000-8000-000000000077',batchCommand='c0000000-0000-4000-8000-000000000077';let failedReceipt=false;
 const bytes=scenario==='cancelled-close'?await syntheticInvoice():null;
 const exitHeaders:{marker:string|undefined;origin:string|undefined}[]=[];const received:string[]=[],creates:Record<string,unknown>[]=[],commandBodies:Record<string,unknown>[]=[];const upstream=new URL(String(testInfo.project.use.baseURL)).origin;
 const observer=http.createServer(async(req,res)=>{if(req.url==='/other'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>Other page</body></html>');return;}if(req.url?.endsWith('/abandon')){exitHeaders.push({marker:req.headers['x-ar-exit-command'] as string|undefined,origin:req.headers['x-ar-exit-origin-session'] as string|undefined});received.push(req.url);if(scenario==='single-cancel-failed'&&!failedReceipt&&req.url.includes('/commands/')){failedReceipt=true;res.writeHead(503);res.end('{}');return;}if(req.url.includes('/commands/')){let body='';for await(const chunk of req)body+=chunk;commandBodies.push(JSON.parse(body));}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.includes('/commands/')?{commandKey:req.url.split('/')[4],hotel:'KAT',payloadDigest:commandBodies.at(-1)?.payloadDigest,outcome:'cancelled'}:{job:{id},outcome:'discarded'}));return;}try{const r=await fetch(upstream+req.url);res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')??'text/html'});res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(503);res.end();}});
 await new Promise<void>(r=>observer.listen(0,'127.0.0.1',r));const address=observer.address() as import('node:net').AddressInfo,url=`http://127.0.0.1:${address.port}`;
 const alive=await context.newPage();await alive.goto(url+'/other');
 try{
  if(scenario==='unsupported-close')await page.addInitScript(()=>{delete (window as unknown as {onpageswap?:unknown}).onpageswap;delete (Window.prototype as unknown as {onpageswap?:unknown}).onpageswap;});
  await page.addInitScript(()=>{
   const record=(name:string,data:Record<string,unknown>={})=>{try{const key='departure-diagnostics';localStorage.setItem(key,JSON.stringify([...JSON.parse(localStorage.getItem(key)??'[]'),{name,...data}].slice(-64)));}catch{/* Diagnostics never alter departure. */}};
   record('installed',{pageSwapSupported:'onpageswap'in window});
   for(const name of ['pageswap','pagehide','pageshow'])addEventListener(name,event=>{const e=event as Event&{persisted?:boolean;activation?:{navigationType?:string}|null};record(name,{persisted:e.persisted??null,activation:e.activation?true:e.activation===null?false:null,navigationType:e.activation?.navigationType??null});});
   const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{try{const u=new URL(input instanceof Request?input.url:String(input),location.href);if(u.origin===location.origin&&/^\/api\/documents\/(?:commands\/)?[0-9a-f-]{36}\/abandon$/.test(u.pathname))record('abandon-fetch',{path:u.pathname,keepalive:init?.keepalive===true,redirect:init?.redirect??null});}catch{/* Diagnostic only. */}return originalFetch(input,init);};
   addEventListener('error',event=>record('page-error',{kind:event.error instanceof Error?event.error.name:'Error',code:/metadata|quota|session changed|cleanup identity|scope is too large/i.exec(event.message)?.[0]??'unclassified'}));
   for(const name of ['pageswap','pagehide','pageshow'])addEventListener(name,()=>{localStorage.setItem('test-events',JSON.stringify([...JSON.parse(localStorage.getItem('test-events')??'[]'),name]));});});
  if(batchCase)await page.addInitScript(({actor,batchId,batchCommand})=>{const key='ar-account-batch:'+actor+':'+batchId;if(!sessionStorage.getItem(key))sessionStorage.setItem(key,JSON.stringify({version:1,id:batchId,owner:actor,workspaceOwner:actor,region:'phuket',options:{content:'statement',layout:'combined'},entries:[{commandKey:batchCommand,selection:{key:'synthetic-group',hotel:'KAT',accountId:'synthetic',accountName:'Synthetic',ids:['A'],purpose:'billing',stage:''}}]}));},{actor,batchId,batchCommand});
  await currentWorkspaceSession(page,{id:actor,email:'ar@katathani.com'},token);
  await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{id:actor,email:'ar@katathani.com',user:{id:actor,email:'ar@katathani.com'}}}));
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;if(p.endsWith('/abandon'))return r.fallback();if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic',googleEnabled:true}});if(p==='/api/access/me')return r.fallback();if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[{hotel:'KAT',id:'synthetic',name:'Synthetic',type:'Agent',open:100,over90:0,items:1}],refresh:{running:false,hotels:[]}}});if(p==='/api/accounts/KAT/synthetic')return r.fulfill({json:{invoices:[{id:'A',hotel:'KAT',account_id:'synthetic',guest:'Synthetic',invoice_no:'INVOICE-A',folio_no:'FOLIO-A',transaction_date:'2026-09-01',original:100,open:100,aging:'Up to 30',verification_state:'verified',collection_role:'standalone',collection_selectable:true}]}});if(p==='/api/documents'&&r.request().method()==='POST'){creates.push(r.request().postDataJSON());return r.abort('failed');}if(p===`/api/documents/${id}/files/b0000000-0000-4000-8000-000000000001`&&bytes)return r.fulfill({contentType:'application/pdf',body:Buffer.from(bytes)});if(p===`/api/documents/${id}`)return r.fulfill({json:{id,owner:actor,hotel:'KAT',account_id:'synthetic',account_name:'Synthetic',invoice_ids:['A'],content:'invoices',layout:'combined',purpose:'billing',lifecycle:'transient',state:'ready',revision:0,files:[{id:'b0000000-0000-4000-8000-000000000001',state:'ready',kind:'invoice',invoice_id:'A',byte_count:bytes?.length??null,sha256:null}],manifest:[{id:'A',invoice_no:'A'}],exports:[],acknowledged:false,created_at:'2026-10-27T00:00:00Z'}});return r.fulfill({status:501,json:{error:'synthetic_unavailable'}});});
  await page.goto(url);await expect(page.getByRole('button',{name:'Aging',exact:true})).toBeVisible();await page.evaluate(({id,create,batch})=>{history.pushState(null,'',batch?'/?collectionBatch='+batch:create?'/?account=synthetic&property=KAT':'/?documentJob='+id);dispatchEvent(new PopStateEvent('popstate'));},{id,create:scenario==='pending-create-close'||singleCancel,batch:batchCase?batchId:''});
  if(scenario!=='pending-create-close'&&!singleCancel&&!batchCase)await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();
  if(scenario==='pending-create-close'||singleCancel){
   await page.getByLabel('Select INVOICE-A',{exact:true}).check();await page.getByRole('button',{name:'Prepare documents',exact:true}).click();await page.getByRole('button',{name:'Create document job',exact:true}).click();await expect.poll(()=>creates.length).toBe(1);await expect(page.getByRole('button',{name:'Create document job',exact:true})).toBeEnabled();received.splice(0);
  }
  if(batchCase){
   await expect.poll(()=>creates.length).toBe(1);await expect(page.getByRole('button',{name:'Retry existing preparation requests',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Retry existing preparation requests',exact:true})).toBeVisible();expect(creates).toHaveLength(1);expect(received).toEqual([]);
   if(scenario.endsWith('-exit')){await page.locator('.batch-heading').getByRole('button',{name:'Collections',exact:true}).click();await expect.poll(()=>received).toEqual([`/api/documents/commands/${batchCommand}/abandon`]);await expect.poll(()=>page.evaluate(({actor,batchId})=>sessionStorage.getItem('ar-account-batch:'+actor+':'+batchId),{actor,batchId})).toBeNull();}
  }
  if(singleCancel){
   if(scenario==='single-nav-back'){await page.evaluate(()=>history.back());await expect.poll(()=>received.length).toBe(1);expect(new URL(page.url()).searchParams.has('account')).toBe(false);}
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   if(scenario==='single-cancel-failed'){await expect(page.locator('.document-dialog')).toBeVisible();await expect(page.getByRole('alert')).toBeVisible();expect(creates).toHaveLength(1);await page.getByRole('button',{name:'Cancel',exact:true}).click();}
   await expect(page.locator('.document-dialog')).toHaveCount(0);await page.getByRole('button',{name:scenario==='single-cancel-signout'?'Sign out':'Collections',exact:true}).click();await expect.poll(()=>received.length).toBe(scenario==='single-cancel-failed'?2:1);expect(creates).toHaveLength(1);
  }
  if(scenario==='reload-close'){
   await page.reload();await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();expect(received).toEqual([]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-events')??'[]'))).toContain('pageswap');
  }else if(scenario==='switch-close'){await alive.bringToFront();await page.bringToFront();expect(received).toEqual([]);}
  else if(scenario==='cancelled-close'){
   await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
   const changes=page.locator('.pdf-differences');await expect(changes).not.toContainText('Note');await choosePdfTool(page,'Note');const text=page.getByRole('textbox',{name:'Layer text',exact:true});await expect(text).toHaveValue('Note');await expect(changes.getByRole('button')).toHaveCount(1);await expect(changes).toContainText('Note');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();const acceptedChanges=await changes.innerText();
   let dialog=false;page.once('dialog',async d=>{dialog=true;await d.dismiss();});await page.close({runBeforeUnload:true});await expect.poll(()=>dialog).toBe(true);expect(page.isClosed()).toBe(false);expect(received).toEqual([]);await expect(text).toHaveValue('Note');await expect.poll(()=>changes.innerText()).toBe(acceptedChanges);await expect(changes.getByRole('button')).toHaveCount(1);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
   page.once('dialog',d=>d.accept());
  }else if(scenario==='address-navigation'){await page.goto(url+'/other');expect(received).toEqual([]);}
  else if(scenario==='network-error-reload'){
   await page.route('**/*',r=>r.request().isNavigationRequest()?r.abort('internetdisconnected'):r.fallback());await page.reload().catch(()=>{});expect(received).toEqual([]);
  }else if(scenario==='unsupported-close')expect(await page.evaluate(()=> 'onpageswap'in window)).toBe(false);
  await page.close({runBeforeUnload:true});
  const closes=['reload-close','switch-close','cancelled-close'].includes(scenario);
  if(closes)await expect.poll(()=>received).toEqual([`/api/documents/${id}/abandon`]);else if(scenario==='pending-create-close'){await expect.poll(()=>received).toEqual([`/api/documents/commands/${creates[0].commandKey}/abandon`]);expect(commandBodies).toHaveLength(1);expect(Object.keys(commandBodies[0]).sort()).toEqual(['hotel','payloadDigest']);expect(commandBodies[0].hotel).toBe('KAT');expect(commandBodies[0].payloadDigest).toMatch(/^[0-9a-f]{64}$/);}else if(batchCase)await expect.poll(()=>received).toEqual([`/api/documents/commands/${batchCommand}/abandon`]);else if(singleCancel)expect(received.length).toBe(scenario==='single-cancel-failed'?2:1);else expect(received).toEqual([]);
  for(const headers of exitHeaders){expect(headers.marker).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);expect(headers.origin).toBe('00000000-0000-4000-8000-000000000099');}
  if(scenario==='single-cancel-failed')expect(exitHeaders[0].marker).toBe(exitHeaders[1].marker);
  expect(alive.isClosed()).toBe(false);
  const navigation=await alive.evaluate(()=>JSON.parse(localStorage.getItem('test-events')??'[]'));
  await testInfo.attach('departure-evidence',{body:JSON.stringify({scenario,navigation,received,observerAlive:!alive.isClosed()}),contentType:'application/json'});

 }finally{try{const diagnostics=await alive.evaluate(()=>({events:JSON.parse(localStorage.getItem('departure-diagnostics')??'[]'),legacyEvents:JSON.parse(localStorage.getItem('test-events')??'[]'),outbox:Object.keys(localStorage).filter(k=>k.startsWith('ar-preparation-exit-v1:')).map(k=>{const e=JSON.parse(localStorage.getItem(k)!);return {version:e.version,actorId:e.actorId,authSessionId:e.authSessionId,jobId:e.jobId,commandKey:e.commandKey,hotel:e.hotel,payloadDigest:e.payloadDigest,state:e.state,queuedAt:e.queuedAt};})}));await testInfo.attach('departure-diagnostics-always',{body:JSON.stringify({scenario,received:[...received],observerAlive:!alive.isClosed(),...diagnostics}),contentType:'application/json'});}finally{await alive.close();await new Promise<void>((r,e)=>observer.close(err=>err?e(err):r()));}}

});





test('confirmed recorded Sent starts exact closed-job cleanup without another send',async({page})=>{
 const calls:string[]=[];const job='job-audit';
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;calls.push(r.request().method()+' '+p);
 if(p==='/api/access/signature')return r.fulfill({json:{revision:1,enabled:false,signature:{staffId:actor,name:'',title:'',workplace:''}}});
 if(p==='/api/email/open')return r.fulfill({json:{id:'synthetic-draft',document_job_id:job,document_revision:1,hotel:'KAT',account_id:'A',invoice_ids:['I1'],purpose:'billing',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',exports:[],attachments:[],revision:0,package_changed:false,delivery:{id:'synthetic-send',state:'sent',mode:'send',recorded:true}}});
 if(p===`/api/documents/${job}`)return r.fulfill({json:{id:job,lifecycle:'transient',closed_at:'2026-10-27T00:00:00Z',closed_reason:'sent'}});
 if(p.endsWith('/abandon'))return r.fulfill({json:{job:{id:job},outcome:'discarded'}});
 return r.fulfill({status:501,json:{error:'synthetic_unavailable'}});
 });
 await page.goto('/tests/browser/audit-email/harness.html');await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();
 await expect.poll(()=>calls.filter(p=>p.endsWith('/abandon'))).toEqual([`POST /api/documents/${job}/abandon`]);expect(calls.some(p=>p.endsWith('/send'))).toBe(false);
});
test('accepted server retirement with history pending starts no second abandon or send',async({page})=>{
 const calls:string[]=[];
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;calls.push(p);
 if(p==='/api/access/signature')return r.fulfill({json:{revision:1,enabled:false,signature:{staffId:actor,name:'',title:'',workplace:''}}});
 if(p==='/api/email/open')return r.fulfill({json:{id:'synthetic-draft',document_job_id:'job-audit',document_revision:1,hotel:'KAT',account_id:'A',invoice_ids:['I1'],purpose:'billing',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',exports:[],attachments:[],revision:0,package_changed:false,delivery:{id:'synthetic-send',state:'awaiting_evidence',mode:'send',recorded:false,gmailAccepted:true,preparationRetirement:{accepted:true}}}});
 return r.fulfill({status:501,json:{error:'synthetic_unavailable'}});
 });
 await page.goto('/tests/browser/audit-email/harness.html');await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();expect(calls.some(p=>p.endsWith('/abandon')||p.endsWith('/send'))).toBe(false);
});
