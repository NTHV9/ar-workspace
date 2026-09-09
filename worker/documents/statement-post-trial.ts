import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {asObject} from '../refresh/read-snapshot';
import {makeReader} from '../opera/probe';
import {OperaError} from '../opera/client';
import {amountCents} from '../opera/normalize';
import {documentJob,uploadPrivate,type DocumentJob} from './jobs';

export function selectedDescriptor(job:DocumentJob,currentRaw:unknown,selectionRaw:unknown){
 const current=asObject(asObject(currentRaw).accountDetails),selection=asObject(selectionRaw);
 const statements=Array.isArray(selection.aRStatements)?selection.aRStatements.map(asObject):[];
 const descriptor=statements[0];
 if(current.hotelId!==job.hotel||asObject(current.accountId).id!==job.account_id||!Array.isArray(current.invoices)||statements.length!==1||descriptor.hotelId!==job.hotel||asObject(descriptor.accountId).id!==job.account_id||!Array.isArray(descriptor.invoices))throw new Error('statement_selection_rejected');
 const rows=descriptor.invoices.map(asObject),ids=job.invoice_ids,currentRows=current.invoices.map(asObject);
 if(rows.length!==ids.length||new Set(rows.map(r=>String(r.transactionNo))).size!==ids.length||rows.some(r=>!ids.includes(String(r.transactionNo))))throw new Error('statement_selection_rejected');
 let total=0;
 for(const id of ids){const matches=currentRows.filter(r=>String(r.transactionNo)===id),manifest=job.manifest.find(r=>r.id===id),row=rows.find(r=>String(r.transactionNo)===id);
  if(matches.length!==1||!manifest||!row||matches[0].parentInvoiceNo!=null||!['standalone','parent'].includes(manifest.collection_role))throw new Error('statement_selection_rejected');
  const cents=amountCents(matches[0].balance,'THB');if(cents<=0||cents!==Math.round(manifest.open*100)||amountCents(row.balance,'THB')!==cents)throw new Error('statement_selection_rejected');total+=cents;
 }
 if(amountCents(descriptor.balance,'THB')!==total)throw new Error('statement_selection_rejected');
 return descriptor;
}
async function financialDigest(raw:unknown){const a=asObject(asObject(raw).accountDetails);if(!Array.isArray(a.invoices))throw new Error('invalid_account');const rows=a.invoices.map(asObject).map(i=>[String(i.transactionNo),i.balance,i.invoiceAmount]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));const bytes=new TextEncoder().encode(JSON.stringify({balance:a.balance,rows}));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}

/** Administrative Workflow trial only. No browser route or normal document generation enables POST. */
export async function runStatementPostTrial(env:RefreshEnv,jobId:string){
 const job=await documentJob(env,jobId);if(!job||job.content!=='statement'||job.files.length!==1||job.files[0].kind!=='statement')throw new Error('invalid_trial_job');
 const file=job.files[0],claim=await backendRpc<{claimed:boolean}>(env,'ar_document_claim_file',{p_job_id:job.id,p_file_id:file.id});
 if(!claim.claimed)return inspectStatementPostTrial(env,job);
 let started=false;
 try{
  const reader=makeReader(env,job.hotel),before=await reader.account(job.account_id),descriptor=selectedDescriptor(job,before,await reader.statementSelection(job.account_id,job.invoice_ids));
  const save=(name:string,value:unknown)=>uploadPrivate(env,`jobs/${job.id}/trial/${name}.json`,new TextEncoder().encode(JSON.stringify(value)),'application/json');
  // Immutable marker and database claim both fail closed on ambiguous retries.
  await save('prepared',{descriptor,invoiceIds:job.invoice_ids,financialDigest:await financialDigest(before)});
  started=true;
  const response=await reader.processStatement(job.account_id,descriptor,job.id);
  await uploadPrivate(env,`jobs/${job.id}/trial/response.bin`,response.bytes,'application/octet-stream');
  await save('response-metadata',{status:response.status,type:response.type,location:response.location});
  let parsed:Record<string,unknown>={};try{parsed=asObject(JSON.parse(new TextDecoder().decode(response.bytes)));}catch{/* Binary response remains private. */}
  let financialUnchanged:boolean|null=null;try{financialUnchanged=await financialDigest(before)===await financialDigest(await reader.account(job.account_id));}catch{/* Unknown is not unchanged. */}
  const pdfSignature=new TextDecoder().decode(response.bytes.slice(0,5))==='%PDF-';
  const links=Array.isArray(parsed.links)?parsed.links.map(asObject):[];
  const summary={httpStatus:response.status,contentType:response.type,bytes:response.bytes.length,pdfSignature,hasLocation:!!response.location,keys:Object.keys(parsed).filter(k=>/^[A-Za-z][A-Za-z0-9:_-]{0,60}$/.test(k)),links:links.length,financialUnchanged,nativeStatementPdfVerified:false};
  await save('summary',summary);
  await backendRpc(env,'ar_document_fail_file',{p_job_id:job.id,p_file_id:file.id,p_code:pdfSignature?'statement_pdf_requires_scope_review':'statement_post_response_requires_review',p_uncertain:true});
  return summary;
 }catch(e){const code=e instanceof OperaError?e.code:e instanceof Error&&e.message==='statement_selection_rejected'?e.message:'statement_trial_failed';await backendRpc(env,'ar_document_fail_file',{p_job_id:job.id,p_file_id:file.id,p_code:code,p_uncertain:started});return {status:started?'uncertain':'unavailable',code,nativeStatementPdfVerified:false};}
}


async function inspectStatementPostTrial(env:RefreshEnv,job:DocumentJob){
 const prefix=`jobs/${job.id}/trial/`;
 const read=async(name:string)=>{const r=await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/ar-working-files/${prefix}${name}.json`,{headers:{apikey:env.SUPABASE_SECRET_KEY!},redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok){await r.body?.cancel();throw new Error('trial_evidence_unavailable');}return asObject(await r.json());};
 const metadata=await read('response-metadata'),prepared=await read('prepared'),reader=makeReader(env,job.hotel);
 const account=asObject(asObject(await reader.account(job.account_id)).accountDetails),before=asObject(prepared.descriptor);
 const previous=Array.isArray(before.invoices)?before.invoices.map(asObject):[],current=Array.isArray(account.invoices)?account.invoices.map(asObject):[];
 const selectedBalancesUnchanged=account.hotelId===job.hotel&&asObject(account.accountId).id===job.account_id&&previous.length===job.invoice_ids.length&&previous.every(i=>{const r=current.filter(c=>String(c.transactionNo)===String(i.transactionNo));return r.length===1&&amountCents(r[0].balance,'THB')===amountCents(i.balance,'THB');});
 const result:Record<string,unknown>={postHttpStatus:metadata.status,postType:metadata.type,selectedBalancesUnchanged,postRepeated:false};
 if(typeof metadata.location!=='string')return {...result,hasLocation:false};
 const url=new URL(metadata.location,env.OPERA_BASE_URL);const origin=new URL(env.OPERA_BASE_URL!).origin;
 result.locationSameOrigin=url.origin===origin;result.locationPathSegments=url.pathname.split('/').filter(Boolean).map(p=>['ars','v1','med','config','hotels','accounts','statements','attachments','reports'].includes(p)?p:'{id}');result.locationQueryKeys=[...url.searchParams.keys()].filter(k=>/^[a-zA-Z_]{1,50}$/.test(k));
 if(url.origin!==origin)return {...result,followed:false};
 // An immutable marker makes a follow-up GET single-shot even if rendering has print side effects.
 try{await uploadPrivate(env,prefix+'follow-claimed.json',new TextEncoder().encode('{}'),'application/json');}catch{return {...result,followed:false,reason:'follow_already_claimed_or_storage_unavailable'};}
 const response=await reader.statementLocation(metadata.location);
 await uploadPrivate(env,prefix+'follow-response.bin',response.bytes,'application/octet-stream');
 let body:Record<string,unknown>={};try{body=asObject(JSON.parse(new TextDecoder().decode(response.bytes)));}catch{}
 const summary={...result,followed:true,followHttpStatus:response.status,followType:response.type,followBytes:response.bytes.length,followPdfSignature:new TextDecoder().decode(response.bytes.slice(0,5))==='%PDF-',followKeys:Object.keys(body).filter(k=>/^[a-zA-Z][a-zA-Z0-9:_-]{0,60}$/.test(k)),nativeStatementPdfVerified:false};
 await uploadPrivate(env,prefix+'follow-summary.json',new TextEncoder().encode(JSON.stringify(summary)),'application/json');
 return summary;
}
