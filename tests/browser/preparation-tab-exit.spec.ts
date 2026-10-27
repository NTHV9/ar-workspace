import {syntheticInvoice} from './fixtures/invoice-pdf';
import {choosePdfTool} from './fixtures/pdf-tools';
import {test,expect} from '@playwright/test';
import {preparationServer} from './fixtures/preparation-server';
import {seedTabSession} from './fixtures/auth-session';
import {currentWorkspaceSession} from './fixtures/workspace-route';
const actor='00000000-0000-4000-8000-000000000001',id='a0000000-0000-4000-8000-000000000001';
const token='e30.'+Buffer.from(JSON.stringify({sub:actor,session_id:'00000000-0000-4000-8000-000000000099'})).toString('base64url')+'.synthetic';
for(const scenario of ['retired-history-reload-close','reload-close','workspace-reload-close','switch-close','workspace-switch-close','cancelled-close','close-lost-response-recovery','address-navigation','network-error-reload','unsupported-close','pending-create-close','batch-lost-reload-exit','batch-lost-reload-close','single-cancel-menu','single-cancel-failed','single-cancel-signout','single-nav-back'])test(`qualified actual browser departure: ${scenario}`,async({page,context},testInfo)=>{
 const batchCase=scenario.startsWith('batch-lost-'),singleCancel=scenario.startsWith('single-cancel-')||scenario==='single-nav-back';const batchId='b0000000-0000-4000-8000-000000000077',batchCommand='c0000000-0000-4000-8000-000000000077';
 const bytes=scenario==='cancelled-close'||scenario.startsWith('workspace-')?await syntheticInvoice():null;
 const observer=await preparationServer({upstream:String(testInfo.project.use.baseURL),scenario,actor,jobId:id,token,bytes});
 const {url,received,creates,commandBodies,exitHeaders}=observer;
 const external:string[]=[];context.on('request',request=>{if(new URL(request.url()).origin!==url)external.push(request.method()+' '+new URL(request.url()).origin);});
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
  await seedTabSession(page,{id:actor,email:'ar@katathani.com'},token);
  await page.goto(url);await expect(page.getByRole('button',{name:'Aging',exact:true})).toBeVisible();await page.evaluate(({id,create,batch})=>{history.pushState(null,'',batch?'/?collectionBatch='+batch:create?'/?account=synthetic&property=KAT':'/?documentJob='+id);dispatchEvent(new PopStateEvent('popstate'));},{id,create:scenario==='pending-create-close'||singleCancel,batch:batchCase?batchId:''});
  if(scenario==='retired-history-reload-close'){await expect(page.getByRole('heading',{name:'Preparation closed',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Preparation closed',exact:true})).toBeVisible();expect(received).toEqual([]);}
  if(scenario!=='retired-history-reload-close'&&scenario!=='pending-create-close'&&!singleCancel&&!batchCase)await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();
  if(scenario==='pending-create-close'||singleCancel){
   await page.getByLabel('Select INVOICE-A',{exact:true}).check();await page.getByRole('button',{name:'Prepare documents',exact:true}).click();await page.getByRole('button',{name:'Create document job',exact:true}).click();await expect.poll(()=>creates.length).toBe(1);await expect(page.getByRole('button',{name:'Create document job',exact:true})).toBeEnabled();received.splice(0);
  }
  if(batchCase){
   await expect.poll(()=>creates.length).toBe(1);await expect(page.getByRole('button',{name:'Retry existing preparation requests',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Retry existing preparation requests',exact:true})).toBeVisible();expect(creates).toHaveLength(1);expect(received).toEqual([]);
   if(scenario.endsWith('-exit')){await page.locator('.batch-heading').getByRole('button',{name:'Collections',exact:true}).click();await expect.poll(()=>received).toEqual([`/api/documents/commands/${batchCommand}/abandon`]);await expect.poll(()=>page.evaluate(({actor,batchId})=>sessionStorage.getItem('ar-account-batch:'+actor+':'+batchId),{actor,batchId})).toBeNull();}
  }
  if(singleCancel){
   if(scenario==='single-nav-back'){await page.evaluate(()=>history.back());await expect.poll(()=>received.length).toBe(1);await expect.poll(()=>new URL(page.url()).searchParams.has('account')).toBe(false);}
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   if(scenario==='single-cancel-failed'){await expect(page.locator('.document-dialog')).toBeVisible();await expect(page.getByRole('alert')).toBeVisible();expect(creates).toHaveLength(1);await page.getByRole('button',{name:'Cancel',exact:true}).click();}
   await expect(page.locator('.document-dialog')).toHaveCount(0);await page.getByRole('button',{name:scenario==='single-cancel-signout'?'Sign out':'Collections',exact:true}).click();await expect.poll(()=>received.length).toBe(scenario==='single-cancel-failed'?2:1);expect(creates).toHaveLength(1);
  }
  if(scenario==='workspace-reload-close'){
   await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
   await page.reload();await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();expect(received).toEqual([]);
   await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');expect(received).toEqual([]);
  }else if(scenario==='workspace-switch-close'){
   await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
   await choosePdfTool(page,'Note');await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('Note');const changes=await page.locator('.pdf-differences').innerText();
   for(let n=0;n<3;n++){await alive.bringToFront();await page.bringToFront();}
   expect(received).toEqual([]);await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('Note');await expect.poll(()=>page.locator('.pdf-differences').innerText()).toBe(changes);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();page.once('dialog',d=>d.accept());
  }else if(scenario==='reload-close'){
   await page.reload();await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();expect(received).toEqual([]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-events')??'[]'))).toContain('pageswap');
  }else if(scenario==='switch-close'){await alive.bringToFront();await page.bringToFront();expect(received).toEqual([]);}
  else if(scenario==='cancelled-close'){
   await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
   const changes=page.locator('.pdf-differences');await expect(changes).not.toContainText('Note');await choosePdfTool(page,'Note');const text=page.getByRole('textbox',{name:'Layer text',exact:true});await expect(text).toHaveValue('Note');await expect(changes.getByRole('button')).toHaveCount(1);await expect(changes).toContainText('Note');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();const acceptedChanges=await changes.innerText();
   let dialog=false;page.once('dialog',async d=>{dialog=true;await d.dismiss();});await page.close({runBeforeUnload:true});await expect.poll(()=>dialog).toBe(true);expect(page.isClosed()).toBe(false);expect(received).toEqual([]);await expect(text).toHaveValue('Note');await expect.poll(()=>changes.innerText()).toBe(acceptedChanges);await expect(changes.getByRole('button')).toHaveCount(1);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
   page.once('dialog',d=>d.accept());
  }else if(scenario==='address-navigation'){await page.goto(url+'/other');expect(received).toEqual([]);}
  else if(scenario==='network-error-reload'){
   observer.failNavigations();await expect(page.reload()).rejects.toThrow(/net::ERR_(EMPTY_RESPONSE|CONNECTION_RESET)/);expect(received).toEqual([]);
  }else if(scenario==='unsupported-close')expect(await page.evaluate(()=> 'onpageswap'in window)).toBe(false);
  await page.close({runBeforeUnload:true});
  const closes=['reload-close','workspace-reload-close','switch-close','workspace-switch-close','cancelled-close','close-lost-response-recovery'].includes(scenario);
  if(closes)await expect.poll(()=>received).toEqual([`/api/documents/${id}/abandon`]);else if(scenario==='pending-create-close'){await expect.poll(()=>received).toEqual([`/api/documents/commands/${creates[0].commandKey}/abandon`]);expect(commandBodies).toHaveLength(1);expect(Object.keys(commandBodies[0]).sort()).toEqual(['hotel','payloadDigest']);expect(commandBodies[0].hotel).toBe('KAT');expect(commandBodies[0].payloadDigest).toMatch(/^[0-9a-f]{64}$/);}else if(batchCase)await expect.poll(()=>received).toEqual([`/api/documents/commands/${batchCommand}/abandon`]);else if(singleCancel)expect(received.length).toBe(scenario==='single-cancel-failed'?2:1);else expect(received).toEqual([]);
  for(const headers of exitHeaders){expect(headers.marker).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);expect(headers.origin).toBe('00000000-0000-4000-8000-000000000099');}
  if(scenario==='single-cancel-failed')expect(exitHeaders[0].marker).toBe(exitHeaders[1].marker);
  if(scenario==='close-lost-response-recovery'){
   await expect.poll(()=>alive.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ar-preparation-exit-v1:')).length)).toBe(1);
   await seedTabSession(alive,{id:actor,email:'ar@katathani.com'},token);await alive.goto(url);await expect(alive.getByRole('button',{name:'Aging',exact:true})).toBeVisible();
   await expect.poll(()=>received).toEqual([`/api/documents/${id}/abandon`,`/api/documents/${id}/abandon`]);expect(exitHeaders[0]).toEqual(exitHeaders[1]);
   await expect.poll(()=>alive.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ar-preparation-exit-v1:')).length)).toBe(0);expect(creates).toEqual([]);
  }
  expect(observer.unexpected).toEqual([]);expect(external).toEqual([]);expect(alive.isClosed()).toBe(false);
  const navigation=await alive.evaluate(()=>JSON.parse(localStorage.getItem('test-events')??'[]'));
  await testInfo.attach('departure-evidence',{body:JSON.stringify({scenario,navigation,received,observerAlive:!alive.isClosed()}),contentType:'application/json'});

 }finally{try{const diagnostics=await alive.evaluate(()=>({events:JSON.parse(localStorage.getItem('departure-diagnostics')??'[]'),legacyEvents:JSON.parse(localStorage.getItem('test-events')??'[]'),outbox:Object.keys(localStorage).filter(k=>k.startsWith('ar-preparation-exit-v1:')).map(k=>{const e=JSON.parse(localStorage.getItem(k)!);return {version:e.version,actorId:e.actorId,authSessionId:e.authSessionId,jobId:e.jobId,commandKey:e.commandKey,hotel:e.hotel,payloadDigest:e.payloadDigest,state:e.state,queuedAt:e.queuedAt};})}));await testInfo.attach('departure-diagnostics-always',{body:JSON.stringify({scenario,received:[...received],observerAlive:!alive.isClosed(),...diagnostics}),contentType:'application/json'});}finally{await alive.close();await observer.close();}}

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
test('ordinary same-state retirement retry is monotonic through a late view and native close',async({page,context})=>{
 const jobId='a0000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000001';let checks=0;
 await page.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>{const p=new URL(input instanceof Request?input.url:String(input),location.href).pathname;if(p.endsWith('/abandon'))localStorage.setItem('round1-exits',JSON.stringify([...JSON.parse(localStorage.getItem('round1-exits')??'[]'),p]));return original(input,init);};});
 const delivery={id:'ordinary-retirement',mode:'send',state:'awaiting_evidence',recorded:false,gmailAccepted:true};
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;
 if(p==='/api/access/signature')return r.fulfill({json:{revision:1,enabled:false,signature:{staffId:actor,name:'',title:'',workplace:''}}});
 if(p==='/api/email/open')return r.fulfill({json:{id:'ordinary-draft',owner:actor,document_job_id:jobId,document_revision:1,hotel:'KAT',account_id:'A',invoice_ids:['I1'],purpose:'billing',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',exports:[],attachments:[],revision:0,package_changed:false,delivery}});
 if(p.endsWith('/check'))return r.fulfill({json:{...delivery,...++checks===1?{preparationRetirement:{accepted:true}}:{}}});
 return r.fulfill({status:501,json:{error:'synthetic_unavailable'}});
 });
 await page.goto('/tests/browser/audit-email/harness.html?exit-proof=1');await expect(page.getByRole('heading',{name:'Email sent',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).auditExit.isSettled((window as any).auditJob.id))).toBe(false);
 await page.getByRole('button',{name:'Check sent status',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).auditExit.isSettled((window as any).auditJob.id))).toBe(true);
 await page.getByRole('button',{name:'Check sent status',exact:true}).click();await expect.poll(()=>checks).toBe(2);await page.evaluate(()=>(window as any).auditExit.retainJob((window as any).auditJob));
 const alive=await context.newPage();await alive.goto('/tests/browser/audit-email/harness.html');try{await page.close({runBeforeUnload:true});expect(await alive.evaluate(()=>JSON.parse(localStorage.getItem('round1-exits')??'[]'))).toEqual([]);expect(await alive.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ar-preparation-exit-v1:')))).toEqual([]);}finally{await alive.close();}
});
