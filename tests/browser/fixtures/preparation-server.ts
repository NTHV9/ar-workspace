import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {syntheticWorkspaceAccess} from './auth-session';

/** Real loopback HTTP, including auth/API fixtures: no page routing at departure. */
export async function preparationServer(options:{upstream:string;scenario:string;actor:string;jobId:string;token:string;bytes:Uint8Array|null}){
 const {actor,jobId:id,scenario,token,bytes}=options;
 const upstream=new URL(options.upstream);
 if(upstream.protocol!=='http:'||!['127.0.0.1','localhost'].includes(upstream.hostname)||upstream.username||upstream.password)throw Error('Synthetic preparation server requires loopback HTTP');
 const received:string[]=[],creates:Record<string,unknown>[]=[],commandBodies:Record<string,unknown>[]=[],unexpected:string[]=[];
 const exitHeaders:{marker:string|undefined;origin:string|undefined}[]=[];
 let failedReceipt=false,failNavigation=false,url='';
 const json=(res:http.ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const body=async(req:http.IncomingMessage)=>{let value='';for await(const chunk of req){value+=chunk;if(value.length>65536)throw Error('Synthetic request too large');}return JSON.parse(value);};
 const server=http.createServer(async(req,res)=>{
  try{
   const path=new URL(req.url!,'http://127.0.0.1').pathname,method=req.method;
   if(path==='/other'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>Other page</body></html>');return;}
   if(path==='/api/config'){json(res,{supabaseUrl:url+'/synthetic-auth',publishableKey:'synthetic',googleEnabled:true});return;}
   if(path.startsWith('/synthetic-auth/')){json(res,{id:actor,email:'ar@katathani.com',user:{id:actor,email:'ar@katathani.com'}});return;}
   if(path.startsWith('/api/')){
    if(req.headers.authorization!==`Bearer ${token}`){unexpected.push('unauthorized '+path);json(res,{error:'synthetic_unauthorized'},401);return;}
    if(method==='POST'&&new RegExp(`^/api/documents/(?:${id}|commands/[0-9a-f-]{36})/abandon$`).test(path)){
     exitHeaders.push({marker:req.headers['x-ar-exit-command'] as string|undefined,origin:req.headers['x-ar-exit-origin-session'] as string|undefined});received.push(path);
     if(scenario==='single-cancel-failed'&&!failedReceipt&&path.includes('/commands/')){failedReceipt=true;json(res,{},503);return;}
     if(scenario==='close-lost-response-recovery'&&!failedReceipt){failedReceipt=true;res.writeHead(200,{'Content-Type':'application/json'});res.end('{');return;}
     if(path.includes('/commands/')){const value=await body(req);commandBodies.push(value);json(res,{commandKey:path.split('/')[4],hotel:'KAT',payloadDigest:value.payloadDigest,outcome:'cancelled'});}
     else json(res,{job:{id},outcome:'discarded'});
     return;
    }
    // Truncated JSON models a created command whose usable reply never arrives,
    // without Chromium transparently retrying a reset TCP connection.
    if(path==='/api/documents'&&method==='POST'){creates.push(await body(req));res.writeHead(200,{'Content-Type':'application/json'});res.end('{');return;}
    if(method==='POST'&&['/api/refresh','/api/refresh/activity'].includes(path)){json(res,{error:'synthetic_unavailable'},501);return;}
    if(method!=='GET'){unexpected.push(method+' '+path);json(res,{error:'unexpected_synthetic_write'},501);return;}
    if(path==='/api/access/me'){json(res,syntheticWorkspaceAccess({id:actor,email:'ar@katathani.com'}));return;}
    if(path==='/api/access/signature'){json(res,{revision:1,enabled:false,signature:{staffId:actor,name:'Synthetic Staff',title:'AR Officer',workplace:''}});return;}
    if(path==='/api/collection-queue'){json(res,{rows:[]});return;}
    if(path==='/api/mail-reconciliation'){json(res,{last:null});return;}
    if(path==='/api/portfolio'){json(res,{status:'connected',accounts:[{hotel:'KAT',id:'synthetic',name:'Synthetic',type:'Agent',open:100,over90:0,items:1}],refresh:{running:false,hotels:[]}});return;}
    if(path==='/api/accounts/KAT/synthetic'){json(res,{invoices:[{id:'A',hotel:'KAT',account_id:'synthetic',guest:'Synthetic',invoice_no:'INVOICE-A',folio_no:'FOLIO-A',transaction_date:'2026-09-01',original:100,open:100,aging:'Up to 30',verification_state:'verified',collection_role:'standalone',collection_selectable:true}]});return;}
    if(path===`/api/documents/${id}/files/b0000000-0000-4000-8000-000000000001`&&bytes){res.writeHead(200,{'Content-Type':'application/pdf'});res.end(bytes);return;}
    if(path===`/api/documents/${id}`){json(res,{...scenario==='retired-history-reload-close'?{preparation_retirement:{accepted:true},closed_at:null}:{},id,owner:actor,hotel:'KAT',account_id:'synthetic',account_name:'Synthetic',invoice_ids:['A'],content:'invoices',layout:'combined',purpose:'billing',lifecycle:'transient',state:'ready',revision:0,files:[{id:'b0000000-0000-4000-8000-000000000001',state:'ready',kind:'invoice',invoice_id:'A',byte_count:bytes?.length??null,sha256:null}],manifest:[{id:'A',invoice_no:'A'}],exports:[],acknowledged:false,created_at:'2026-10-27T00:00:00Z'});return;}
    const unavailable=['/api/collection-policy','/api/operations/provider-usage','/api/refresh','/api/refresh/activity','/api/reports/tracker-revisions','/api/invoice-exceptions/KAT/synthetic/A','/api/dashboard/aging-invoices','/api/reports/options'];
    if(!unavailable.includes(path))unexpected.push(method+' '+path);
    json(res,{error:'synthetic_unavailable'},501);return;
   }
   if(failNavigation&&path==='/'){req.destroy();return;}
   if(method!=='GET'||!(path==='/'||path.startsWith('/assets/')||path.startsWith('/pdfjs/')||['/katathani-collection.svg','/email-signature-logo.png','/favicon.ico'].includes(path))){unexpected.push(method+' '+path);res.writeHead(404);res.end();return;}
   const response=await fetch(new URL(path,upstream),{redirect:'error'});
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/octet-stream','Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed)json(res,{error:'synthetic_fixture_error'},500);}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 return {url,received,creates,commandBodies,exitHeaders,unexpected,failNavigations:()=>{failNavigation=true;},close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
