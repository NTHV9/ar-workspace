import './verify-thread-deployment.mjs';
import assert from 'node:assert/strict';
const origin='https://ar-workspace.ar-c82.workers.dev';
const id='00000000-0000-4000-8000-000000000001';
const routes=[['','GET'],['/options','GET'],['/invoices?hotel=KAT&accountId=synthetic','GET'],[`/${id}`,'PUT'],[`/${id}`,'GET'],[`/${id}/history`,'GET'],[`/${id}/status`,'POST'],[`/commands/${id}`,'GET'],[`/${id}/files/${id}`,'GET'],[`/${id}/files/${id}`,'POST'],[`/${id}/files/${id}`,'DELETE'],[`/${id}/files/${id}/restore`,'POST'],['/diagnostic','POST']];
for(const [path,method] of routes){
 const response=await fetch(origin+'/api/remittances'+path,{method,redirect:'manual',...(method==='GET'?{}:{headers:{'Content-Type':'application/json',Origin:origin},body:'{}'})});
 await response.body?.cancel();assert.equal(response.status,401,method+' '+path);
}
console.log(JSON.stringify({remittanceAnonymousRoutesRejected:routes.length}));
