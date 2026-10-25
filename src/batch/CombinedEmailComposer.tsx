import {useCollectionPolicy} from '../collection/PolicyContext';
import {useEffect,useRef,useState} from 'react';
import type {CombinedEmail,CombinedMemberInput,CombinedContent} from '../email/combined';
import type {EmailDraft,EmailDeliveryView} from '../../worker/email/shared';
import type {DocumentJob} from '../../worker/documents/jobs';
import {BatchRequestError,batchRequest} from './api';
import {combinedDelivery,assertCombinedBatch,assertBatchJob,combinedLocked,type BatchRecord,type CombinedBatchState,type CombinedPendingSave} from './state';
import {defaultSelfCc} from '../email/default-recipients';
import {readSignature} from '../email/SignatureSettings';
import {signatureLogoPath,signatureHtml,signatureWorkplace,type SignatureProfile} from '../email/signature';
import {plainMessage,richText} from '../email/rich-message';
import RichMessageEditor from '../email/RichMessageEditor';
import {emailDeliveryStatus} from '../email/delivery-status';
import {mailboxSender} from '../domain/mailboxes';
import type {HotelId} from '../domain/hotels';
import type {GmailState} from '../email/mailbox-ui';
import {connectedMailbox} from '../email/mailbox-ui';
export interface CombinedControl {review:()=>Promise<void>;busy:()=>boolean}
export default function CombinedEmailComposer({batch,token,jobs,onChange,onEntry,onRegister,onBusy}:{batch:BatchRecord;token:string;jobs:Map<string,DocumentJob>;onChange:(state:CombinedBatchState)=>void;onEntry:(command:string,draft:EmailDraft)=>void;onRegister:(control:CombinedControl|null)=>void;onBusy:(busy:boolean)=>void}){
 const {policy}=useCollectionPolicy();
 const current=batch.combined!,stateRef=useRef(current);stateRef.current=current;const batchRef=useRef(batch);batchRef.current=batch;
 const [recipientText,setRecipientText]=useState(()=>({to:current.content.recipients.to.join(', '),cc:current.content.recipients.cc.join(', '),bcc:current.content.recipients.bcc.join(', ')}));
 const [retryAdmission,setRetryAdmission]=useState(false),[richRecovery,setRichRecovery]=useState(0);
 const [inlineBytes,setInlineBytes]=useState(0),[drafts,setDrafts]=useState<EmailDraft[]>([]);
 const [members,setMembers]=useState<CombinedMemberInput[]>([]),[profile,setProfile]=useState<SignatureProfile|null>(null),[gmail,setGmail]=useState<GmailState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(false),[ack,setAck]=useState(false),[retry,setRetry]=useState(0);
 const lock=useRef(false),live=useRef(true);const locked=combinedLocked(batch),content=current.content;
 const update=(next:CombinedBatchState)=>{onChange(next);stateRef.current=next;};
 const edit=(change:Partial<CombinedContent>)=>{if(locked||lock.current)return;const content={...stateRef.current.content,...change};if(JSON.stringify(content)===JSON.stringify(stateRef.current.content))return;try{update({...stateRef.current,commandId:crypto.randomUUID(),content});setReview(false);}catch(error){setRichRecovery(value=>value+1);const recipients=stateRef.current.content.recipients;setRecipientText({to:recipients.to.join(', '),cc:recipients.cc.join(', '),bcc:recipients.bcc.join(', ')});setError(error instanceof Error?error.message:'Tab resume storage is unavailable. Keep this tab open and retry.');}};
 const operation=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError('');try{await work();}catch(e){if(live.current)setError(e instanceof Error?e.message:'The shared email could not be confirmed.');}finally{lock.current=false;if(live.current){setBusy(false);onBusy(false);}}};
 const packagesReady=batch.entries.every(e=>e.jobId&&jobs.has(e.jobId));
 useEffect(()=>{live.current=true;if(!packagesReady)return;let active=true;void operation(async()=>{
  const b=batchRef.current;
  const [signature,status]=await Promise.all([readSignature(token),batchRequest<GmailState>(`/api/gmail/status?region=${b.region}&jobId=${b.entries[0].jobId}`,token)]);if(!active)return;setProfile(signature);setGmail(status);if(signature.enabled){const logo=await fetch(signatureLogoPath);if(!logo.ok)throw Error('Signature logo could not be loaded.');const bytes=(await logo.arrayBuffer()).byteLength;if(active)setInlineBytes(bytes);}
  if(!stateRef.current.pendingSave&&(stateRef.current.revision||stateRef.current.attempted)){const saved=await batchRequest<CombinedEmail>(`/api/email/combined/${stateRef.current.id}`,token);if(!active)return;assertCombinedBatch(batchRef.current,saved);if(stateRef.current.attempted&&saved.revision!==stateRef.current.revision||combinedDelivery(stateRef.current)&&!saved.delivery)throw Error('The original delivery status could not be verified. The reviewed message remains locked.');update({...stateRef.current,revision:saved.revision,saved,attempted:stateRef.current.attempted||!!saved.delivery});if(saved.delivery)return;}
  const opened:CombinedMemberInput[]=[],packages:EmailDraft[]=[];
  for(const entry of b.entries){const job=entry.jobId?jobs.get(entry.jobId):undefined;if(!job)throw Error('Wait for all reviewed account packages to load.');assertBatchJob(b,entry,job);
   const draft=await batchRequest<EmailDraft>('/api/email/open',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:job.id,documentRevision:job.revision,...entry.mailDraftId&&entry.mailRevision!==undefined?{previousDraft:{id:entry.mailDraftId,revision:entry.mailRevision}}:{}})});
   if(draft.owner!==(b.workspaceOwner??b.owner)||draft.document_job_id!==job.id||draft.document_revision!==job.revision||draft.hotel!==entry.selection.hotel||draft.account_id!==entry.selection.accountId||draft.package_changed||draft.delivery||draft.gmail_handoff)throw Error('An account package changed or already has an email attempt. Review its existing outcome.');
   if(!active)return;onEntry(entry.commandKey,draft);packages.push(draft);opened.push({memberId:entry.commandKey,documentJobId:job.id,documentRevision:job.revision,draftId:draft.id,draftRevision:draft.revision,stage:draft.purpose==='collection'?entry.stage??entry.selection.stage:null,policyVersion:draft.purpose==='collection'?policy?.version??entry.policyVersion??null:null});
  }if(active){setMembers(opened);setDrafts(packages);}
 });return()=>{active=false;live.current=false;onBusy(false);};},[retry,packagesReady]);
 function sameValue(a:unknown,b:unknown):boolean{
  if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(k=>Object.hasOwn(right,k)&&sameValue(left[k],right[k]));
 }
 async function settleSave(pending:CombinedPendingSave,fresh=false){
  let saved:CombinedEmail;
  try{saved=await batchRequest<CombinedEmail>('/api/email/combined',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.payload)});}
  catch(error){
   // Only a definite validation rejection of this first request proves no save occurred.
   // An ambiguous prior request must retain its exact replay even if a later read fails.
   if(fresh&&error instanceof BatchRequestError&&error.status>=400&&error.status<500)update({...stateRef.current,pendingSave:undefined});
   throw error;
  }
  if(!live.current)return null;assertCombinedBatch(batchRef.current,saved);
  update({...stateRef.current,revision:saved.revision,saved,pendingSave:undefined,commandId:stateRef.current.commandId===pending.payload.commandId?crypto.randomUUID():stateRef.current.commandId,attempted:stateRef.current.attempted||!!saved.delivery});
  if(saved.delivery)throw Error('This reviewed message already has a delivery. Check its shared status.');return saved;
 }
 async function prepare(){
  if(locked)throw Error('Check the existing delivery. Do not resend.');if(!profile||members.length!==batch.entries.length)throw Error('Wait for all account packages and your staff signature.');
  if(!connectedMailbox(gmail,batch.region)||!gmail?.canRead)throw Error('Connect Gmail with sent verification before sending.');
  // Resolve an earlier exact command before applying any later message or membership edits.
  const recovered=stateRef.current.pendingSave?await settleSave(stateRef.current.pendingSave):null;
  if(!live.current)return;const c=stateRef.current.content;if(!c.recipients.to.length||!c.subject.trim()||!c.body.trim())throw Error('Add common recipients, subject and message before sending.');
  const signature=profile.enabled?{...profile.signature,workplace:signatureWorkplace(c.signatureHotel)}:null;
  const richBody={...(c.richBody??plainMessage(c.body)),...(signature?{signature}:{})};
  const content={...c,recipients:defaultSelfCc(c.signatureHotel,c.recipients),body:richText(richBody),richBody};
  const inputs=(p:CombinedEmail)=>p.members.map(({memberId,documentJobId,documentRevision,draftId,draftRevision,stage,policyVersion})=>({memberId,documentJobId,documentRevision,draftId,draftRevision,stage,policyVersion}));
  if(recovered&&sameValue(recovered.content,content)&&sameValue(inputs(recovered),members)){setAck(false);setReview(true);return;}
  const pending:CombinedPendingSave=structuredClone({payload:{id:stateRef.current.id,revision:stateRef.current.revision,commandId:stateRef.current.commandId,members,content}});
  // Persist before transport; F5 retains this command independently of subsequent edits.
  update({...stateRef.current,pendingSave:pending});
  if(await settleSave(pending,true)){setAck(false);setReview(true);}
 }
 useEffect(()=>{onRegister({busy:()=>lock.current,review:()=>operation(prepare)});return()=>onRegister(null);});
 async function requestOriginalDelivery(c:CombinedBatchState){
  if(!c.saved||c.saved.revision!==c.revision)throw Error('The original reviewed email revision could not be verified. Check shared status.');
  setRetryAdmission(false);
  try{const delivery=await batchRequest<EmailDeliveryView>(`/api/email/combined/${c.id}/send`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:c.revision,commandId:c.sendCommandId,confirmed:true})});if(live.current)update({...stateRef.current,saved:{...c.saved,delivery}});}catch(e){throw Error(`${e instanceof Error?e.message:'Send response unavailable.'} Check shared status before any further action.`);}
 }
 async function send(){await operation(async()=>{const c=stateRef.current;if(!ack||!c.saved||c.attempted)return;update({...c,attempted:true});setReview(false);await requestOriginalDelivery(c);});}
 async function retryOriginal(){await operation(async()=>{const c=stateRef.current;if(!retryAdmission||!c.attempted||combinedDelivery(c))return;await requestOriginalDelivery(c);});}
 async function check(){await operation(async()=>{
  setRetryAdmission(false);const c=stateRef.current,saved=await batchRequest<CombinedEmail>(`/api/email/combined/${c.id}`,token);assertCombinedBatch(batchRef.current,saved);
  if(c.attempted&&saved.revision!==c.revision||combinedDelivery(c)&&!saved.delivery)throw Error('The original delivery status could not be verified. The reviewed message remains locked.');
  if(!live.current)return;
  // Retain any observed delivery before reconciliation, including a lost check response.
  update({...stateRef.current,revision:saved.revision,saved,attempted:c.attempted||!!saved.delivery});
  if(!saved.delivery){setRetryAdmission(!!c.attempted);return;}
  const delivery=await batchRequest<EmailDeliveryView>(`/api/email/deliveries/${saved.delivery.id}/check`,token,{method:'POST'});if(live.current)update({...stateRef.current,saved:{...saved,delivery},attempted:true});
 });}
 const savedPackage=current.saved?.members.every(m=>jobs.get(m.documentJobId)?.revision===m.documentRevision)?current.saved:undefined;
 const packageFiles=(entry:BatchRecord['entries'][number])=>{const saved=savedPackage?.members.find(m=>m.memberId===entry.commandKey);if(saved)return saved.files;const draft=drafts.find(d=>d.document_job_id===entry.jobId);return [...(draft?.exports??jobs.get(entry.jobId??'')?.exports??[]),...(draft?.attachments??[])].map(f=>({name:f.name,byteCount:f.byte_count}));};
 const totals=savedPackage?.totals??{accounts:batch.entries.length,invoices:batch.entries.reduce((n,e)=>n+e.selection.ids.length,0),files:batch.entries.reduce((n,e)=>n+packageFiles(e).length,0),bytes:batch.entries.reduce((n,e)=>n+packageFiles(e).reduce((a,f)=>a+f.byteCount,0),0)};
 const over=totals.files+(profile?.enabled?1:0)>50||totals.bytes+inlineBytes>(gmail?.maxAttachmentBytes??10*1048576),delivery=combinedDelivery(current),status=delivery?emailDeliveryStatus(delivery):null;
 return <section className="combined-email" aria-label="One combined email"><header><h2>One combined email</h2><p>{totals.accounts} accounts · {totals.invoices} invoices · {totals.files} files · {((totals.bytes+inlineBytes)/1048576).toFixed(2)} MiB{profile?.enabled?' including one signature asset':''}</p><p>From: {mailboxSender(batch.region)} · One new conversation</p></header>
 {error&&<p className="error-message" role="alert">{error}{!locked&&<button disabled={busy} onClick={()=>setRetry(n=>n+1)}>Reload packages</button>}</p>}
 {(status||current.attempted)&&<section role="status" className="email-delivery-status"><strong>{status?.title??'Send result unknown — do not resend'}</strong><p>{status?.detail??'Your message and files are retained. Check the existing shared outcome.'}</p>{status?.reason&&<p>{status.reason}</p>}<button disabled={busy||delivery?.recorded} onClick={()=>void check()}>Check shared status</button>{retryAdmission&&!delivery&&<><p>No delivery has been recorded for this reviewed revision. You can retry its original request; the message and account selection stay locked.</p><button disabled={busy} onClick={()=>void retryOriginal()}>Retry original send request</button></>}</section>}
 <div className="combined-columns"><div><fieldset disabled={busy||locked||review}><legend>Common message</legend><p>Enter recipients manually. Account recipient settings are unchanged.</p>{(['to','cc','bcc'] as const).map(field=><label key={field}>{field.toUpperCase()}<input aria-label={'Common '+(field==='to'?'To':field.toUpperCase())} value={recipientText[field]} onChange={e=>{setRecipientText({...recipientText,[field]:e.target.value});edit({recipients:{...content.recipients,[field]:e.target.value.split(/[,;\n]/).map(v=>v.trim()).filter(Boolean)}});}} onBlur={()=>{const recipients=defaultSelfCc(content.signatureHotel,stateRef.current.content.recipients);edit({recipients});setRecipientText({to:recipients.to.join(', '),cc:recipients.cc.join(', '),bcc:recipients.bcc.join(', ')});}}/></label>)}
 <label>Subject<input aria-label="Common subject" value={content.subject} onChange={e=>edit({subject:e.target.value})}/></label><div className="email-purpose"><button aria-pressed={!content.richBody} onClick={()=>{if(content.richBody)edit({richBody:null});}}>Plain text</button><button aria-pressed={!!content.richBody} onClick={()=>{if(!content.richBody)edit({richBody:plainMessage(content.body)});}}>Rich text</button></div>
 {content.richBody?<RichMessageEditor key={richRecovery} label="Common message" value={content.richBody} disabled={busy||locked||review} onChange={richBody=>edit({richBody,body:richText(richBody)})}/>:<label>Message<textarea aria-label="Common message" rows={10} value={content.body} onChange={e=>edit({body:e.target.value})}/></label>}
 <label>Signature Hotel<select aria-label="Signature Hotel" value={content.signatureHotel} onChange={e=>edit({signatureHotel:e.target.value as HotelId})}>{[...new Set(batch.entries.map(e=>e.selection.hotel))].map(h=><option key={h}>{h}</option>)}</select></label>{profile?.enabled&&<div className="signature-preview" dangerouslySetInnerHTML={{__html:signatureHtml({...profile.signature,workplace:signatureWorkplace(content.signatureHotel)},true)}}/>}</fieldset></div>
 <aside aria-label="All combined attachments"><h3>Reviewed account packages</h3>{batch.entries.map(e=>{const files=packageFiles(e);return <section key={e.commandKey}><h4>{e.selection.hotel} · {e.selection.accountName}</h4><p>{e.selection.ids.length} invoices · {e.stage??e.selection.stage}</p><ul>{files?.map((f,i)=><li key={i}>{f.name} · {(f.byteCount/1024).toFixed(0)} KiB</li>)}</ul></section>;})}<p>Budget: {((gmail?.maxAttachmentBytes??10*1048576)/1048576).toFixed(0)} MiB · 50 files including signature assets.</p>{over&&<p role="alert" className="error-message">The whole package exceeds the email budget. Select fewer documents or change an account’s PDF layout.</p>}</aside></div>
 {review&&<section className="combined-review" aria-label="Confirm one email"><h3>Send 1 email</h3><p>To: {current.saved?.content.recipients.to.join(', ')}</p><p>CC: {current.saved?.content.recipients.cc.join(', ')||'None'} · BCC: {current.saved?.content.recipients.bcc.join(', ')||'None'}</p><p>{totals.accounts} accounts · {totals.files} attachments · {content.subject}</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed the recipients, message and all account packages</label><button disabled={busy} onClick={()=>setReview(false)}>Back to common message</button><button className="primary-button" disabled={!ack||busy||over} onClick={()=>void send()}>Send 1 email</button></section>}
 {!review&&!locked&&<button className="primary-button" disabled={busy||over||members.length!==batch.entries.length} onClick={()=>void operation(prepare)}>{busy?'Checking packages…':'Review & send now'}</button>}
 </section>;
}
