import {usePreparationExit,afterConfirmedSent} from '../preparation/tab-exit';
import SentMatchReview from '../email/SentMatchReview';
import EmailSendResult from '../email/EmailSendResult';
import {emailSendOutcome,type EmailSendResultState} from '../email/send-result';
import {gmailUrl} from '../email/mailbox-ui';
import CombinedEmailComposer,{type CombinedControl} from './CombinedEmailComposer';
import {createBatchPdfPreparation} from './prepare-pdfs';
import {renderBatchPdfs} from './render-pdfs';
import {retainPdfSession,type BatchPhase} from './phase';
import {batchHasEdits,abandonVerifiedEntry} from './lifecycle';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,FileText,RefreshCw,Send} from 'lucide-react';
import DocumentRoute,{type DocumentBatchControl,type DocumentBatchSession} from '../DocumentRoute';
import type {DocumentJob} from '../../worker/documents/jobs';
import type {EmailDraft,EmailDeliveryView} from '../../worker/email/shared';
import {hotelMailbox,mailboxSender} from '../domain/mailboxes';
import type {RegionId} from '../domain/hotels';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {stageLabel} from '../domain/collection';
import {sessionBytes} from '../pdf/editor-session';
import {batchRequest} from './api';
import {initialCombined,combinedDelivery,combinedLocked,assertBatchJob,freezeMail,loadBatch,removeBatch,saveBatch,sendBatch,type BatchEntry,type BatchMailSnapshot,type BatchRecord} from './state';
import './batch.css';
const MAX_PAUSED_BYTES=192*1024*1024;
const attempted=(entry:BatchEntry)=>!!entry.attempted||!!entry.delivery&&!(entry.delivery.mode==='draft'&&entry.delivery.state==='created');
const confirmed=(delivery:EmailDeliveryView|null|undefined)=>delivery?.state==='sent'&&delivery.recorded===true;
const deliveryFloor=(previous:EmailDeliveryView|undefined,next:EmailDeliveryView|undefined)=>previous&&(confirmed(previous)&&!confirmed(next)||previous.gmailAccepted&&!next?.gmailAccepted&&!confirmed(next))?previous:next;
const canSend=(mail:BatchMailSnapshot|undefined)=>!!mail&&!mail.blocked&&(!mail.delivery||mail.delivery.mode==='draft'&&mail.delivery.state==='created');
export default function BatchRoute({owner,workspaceOwner,region,batchId,token,maxBytes,onClose,onRegisterLeave,onDirtyChange,onGuardDirtyChange}:{owner:string;workspaceOwner:string;region:RegionId;batchId:string;token:string;maxBytes:number;onClose:()=>void;onRegisterLeave:(leave:(()=>Promise<boolean>)|null)=>void;onGuardDirtyChange?:(dirty:boolean)=>void;onDirtyChange:(dirty:boolean,kind?:'pdf'|'email')=>void}){
 const exit=usePreparationExit();
 const [batch,setBatch]=useState<BatchRecord|null>(()=>{const saved=loadBatch(sessionStorage,owner,batchId,region);return saved?{...saved,workspaceOwner}:null;}),record=useRef(batch);
 const combinedControl=useRef<CombinedControl|null>(null);const [combinedBusy,setCombinedBusy]=useState(false);
 const [preparingPdf,setPreparingPdf]=useState(''),[combinedSending,setCombinedSending]=useState(false),[exitBusy,setExitBusy]=useState(false),[checking,setChecking]=useState<Set<string>>(new Set());
 const [sentReview,setSentReview]=useState<BatchEntry|null>(null),[sentReviewDirty,setSentReviewDirty]=useState(false);
 const sentReviewOpen=useRef(false);
 const canAct=()=>alive.current&&!exiting.current&&!sentReviewOpen.current&&!!record.current;
 const exiting=useRef(false),generation=useRef(0),checkLocks=useRef(new Set<string>());
 const [active,setActive]=useState(0),[view,setView]=useState<'work'|'review'|'result'>('work'),[error,setError]=useState(''),[switching,setSwitching]=useState(false),[creating,setCreating]=useState(()=>!!batch?.entries.some(e=>e.requested&&!e.jobId)),[sending,setSending]=useState(false),[,refresh]=useState(0),[sendIds,setSendIds]=useState<Set<string>>(new Set());
 const alive=useRef(true),tokenRef=useRef(token);tokenRef.current=token;
 const jobs=useRef(new Map<string,DocumentJob>()),sessions=useRef(new Map<string,DocumentBatchSession>()),mails=useRef(new Map<string,BatchMailSnapshot>()),controls=useRef(new Map<string,DocumentBatchControl>());
 const sentCleanup=useRef(new Set<string>());
 useEffect(()=>{for(const entry of batch?.entries??[])if(entry.jobId&&confirmed(entry.delivery)&&!sentCleanup.current.has(entry.delivery!.id)){sentCleanup.current.add(entry.delivery!.id);void afterConfirmedSent([entry.jobId],entry.delivery,()=>tokenRef.current,()=>alive.current&&(!exit||exit.current()));}},[batch?.entries.map(e=>[e.jobId,e.delivery?.id,e.delivery?.state,e.delivery?.recorded].join(':')).join(',')]);
 const sendingScope=useRef(new Set<string>());
 const childGuard=useRef(false);const reportGuardDirty=(dirty:boolean)=>{childGuard.current=dirty;onGuardDirtyChange?.(dirty||sentReviewDirty||sending||combinedSending);};
 useEffect(()=>{onGuardDirtyChange?.(childGuard.current||sentReviewDirty||creating||sending||switching||combinedSending);return()=>onGuardDirtyChange?.(false);},[sentReviewDirty,creating,sending,switching,combinedSending,onGuardDirtyChange]);
 const childDirty=useRef(false),busy=useRef(false),creationStarted=useRef(false),polling=useRef(false);
 const pdfPreparation=useRef<ReturnType<typeof createBatchPdfPreparation>|null>(null);
 if(!pdfPreparation.current)pdfPreparation.current=createBatchPdfPreparation({
  canContinue:()=>alive.current,
  render:async(job,session)=>{
   const result=await renderBatchPdfs(job,session,tokenRef.current,maxBytes);
   const other=[...sessions.current].filter(([id])=>id!==job.id).reduce((n,[,s])=>n+sessionBytes(s.sources??[],s.editor??null),0);
   if(other+sessionBytes(result.session.sources??[],result.session.editor??null)>MAX_PAUSED_BYTES)throw Error('These accounts exceed the editing memory limit. Use a smaller batch.');
   return result;
  },
  upload:(job,file)=>batchRequest(`/api/documents/${job.id}/upload?kind=export`,tokenRef.current,{method:'POST',headers:{'Content-Type':'application/pdf'},body:new Uint8Array(file.bytes).buffer}),
  review:async(job,revision,exports)=>{
   const result=await batchRequest<DocumentJob>(`/api/documents/${job.id}/review`,tokenRef.current,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,exports,acknowledged:true})});
   const current=record.current,entry=current?.entries.find(e=>e.jobId===job.id);if(!current||!entry)throw Error('The batch changed.');assertBatchJob(current,entry,result);return result;
  }
 });
 const {policy}=useCollectionPolicy();
 const phase:BatchPhase=batch?.phase??'pdf';
 const pdfDirty=useRef(new Map<string,boolean>());
 const reportPdfDirty=useCallback((jobId:string,dirty:boolean)=>{if(pdfDirty.current.get(jobId)!==dirty){pdfDirty.current.set(jobId,dirty);refresh(n=>n+1);}},[]);
 const changed=()=>{if(alive.current)refresh(n=>n+1);};
 function updateBatch(next:BatchRecord){if(!alive.current||exiting.current||!record.current)return;saveBatch(sessionStorage,next);record.current=next;setBatch(next);}
 async function changeEmailMode(mode:'separate'|'combined'){if(!canAct()||busy.current||switching||combinedBusy||!record.current||combinedLocked(record.current))return;setSwitching(true);try{await captureActive();const b=record.current!;updateBatch({...b,emailMode:mode,...mode==='combined'&&!b.combined?{combined:initialCombined(b)}:{}});setView('work');}catch(e){setError(e instanceof Error?e.message:'Finish the current email first.');}finally{setSwitching(false);}}
 function updateEntry(command:string,change:Partial<BatchEntry>){
  const current=record.current;if(!current||!alive.current||exiting.current)return;
  const next={...current,entries:current.entries.map(e=>e.commandKey===command?{...e,...change,...'delivery' in change?{delivery:deliveryFloor(e.delivery,change.delivery)}:{}}:e)};
  saveBatch(sessionStorage,next);record.current=next;setBatch(next);
 }
 const receiveJob=useCallback((job:DocumentJob)=>{
  const current=record.current,entry=current?.entries.find(e=>e.jobId===job.id);if(!current||!entry||!alive.current||exiting.current)return;
  try{assertBatchJob(current,entry,job);exit?.retainJob(job);if(JSON.stringify(jobs.current.get(job.id))!==JSON.stringify(job)){if(jobs.current.get(job.id)?.revision!==job.revision){mails.current.delete(job.id);setSendIds(old=>{const next=new Set(old);next.delete(job.id);return next;});}jobs.current.set(job.id,job);if(job.closed_at)sessions.current.delete(job.id);refresh(n=>n+1);}}catch(e){setError(e instanceof Error?e.message:'Document scope could not be verified.');}
 },[]);
 async function createEntries(retry=false){
  if(!canAct()||busy.current||!record.current)return;busy.current=true;setCreating(true);setError('');
  try{
   for(const entry of record.current.entries){
    if(!alive.current)break;if(entry.jobId)continue;
    try{
     const current=record.current!,s=entry.selection;
     const payload={hotel:s.hotel,accountId:s.accountId,ids:s.ids,purpose:s.purpose??'collection',content:current.options.content,layout:current.options.layout,statementSource:current.options.content==='invoices'?'native':'workspace',commandKey:entry.commandKey};
     await exit?.retainCreate(payload,entry.requested===true&&!retry);if(!alive.current||exit&&!exit.current())break;if(entry.requested&&!retry)continue;updateEntry(entry.commandKey,{requested:true,error:undefined});
     const job=await batchRequest<DocumentJob>('/api/documents',tokenRef.current,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     if(!alive.current||exit&&!exit.current())break;assertBatchJob(current,entry,job);exit?.created(entry.commandKey,job);updateEntry(entry.commandKey,{jobId:job.id,error:undefined});receiveJob(job);
    }catch(e){if(alive.current)updateEntry(entry.commandKey,{error:e instanceof Error?e.message:'Preparation could not be confirmed.'});}
   }
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The batch could not be retained in this tab.');}
  finally{busy.current=false;if(alive.current)setCreating(false);}
 }
 useEffect(()=>{
  alive.current=true;if(!creationStarted.current){creationStarted.current=true;void createEntries();}
  return()=>{alive.current=false;};
 },[]);
 useEffect(()=>{
  let cancelled=false;const read=async()=>{
   const current=record.current;if(!current||polling.current)return;polling.current=true;
   try{
    const entries=current.entries.filter(e=>e.jobId).filter(e=>{const job=jobs.current.get(e.jobId!);return !job||job.files.some(f=>['pending','generating'].includes(f.state));});
    for(const entry of entries){if(cancelled)break;try{await exit?.beforeResume(entry.jobId!);const job=await batchRequest<DocumentJob>(`/api/documents/${entry.jobId}`,tokenRef.current);if(!cancelled)receiveJob(job);}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Batch status unavailable.');}}
   }finally{polling.current=false;}
  };void read();const timer=setInterval(()=>void read(),4000);return()=>{cancelled=true;clearInterval(timer);};
 },[batch?.entries.map(e=>e.jobId??'').join(','),receiveJob]);
 async function captureActive(){
  const current=record.current,entry=current?.entries[active];if(!current||!entry?.jobId||phase==='email'&&attempted(entry)||view!=='work'||phase==='email'&&current.emailMode==='combined')return;
  const control=controls.current.get(entry.jobId);if(!control){if(jobs.current.get(entry.jobId)?.closed_at)return;throw Error('Wait for the current account to load before switching.');}
  const captured=await control.suspend();if(!alive.current)return;
  const other=[...sessions.current].filter(([id])=>id!==entry.jobId).reduce((n,[,s])=>n+sessionBytes(s.sources??[],s.editor??null),0);
  if(other+sessionBytes(captured.session.sources??[],captured.session.editor??null)>MAX_PAUSED_BYTES)throw Error('The batch editing memory limit is reached. Review the current PDFs and continue to email before opening more accounts.');
  sessions.current.set(entry.jobId,retainPdfSession(sessions.current.get(entry.jobId),{...captured.session,delivery:entry.pdfDelivery??captured.session.editor?.project.delivery}));
  if(captured.mail){if(captured.mail.jobId!==entry.jobId||captured.mail.hotel!==entry.selection.hotel||captured.mail.accountId!==entry.selection.accountId)throw Error('Email identity does not match this account.');mails.current.set(entry.jobId,captured.mail);updateEntry(entry.commandKey,{stage:captured.mail.stage??entry.selection.stage,policyVersion:captured.mail.policyVersion,mailDraftId:captured.mail.draftId,mailRevision:captured.mail.mailRevision,delivery:captured.mail.delivery??undefined});}
 }
 async function switchAccount(index:number){
  if(!canAct()||busy.current||combinedBusy||combinedSending||switching||sending||index===active&&view==='work')return;setSwitching(true);setError('');
  try{await captureActive();if(alive.current){setActive(index);setView('work');childDirty.current=false;}}
  catch(e){setError(e instanceof Error?e.message:'This account could not be saved.');}
  finally{if(alive.current)setSwitching(false);}
 }
 async function reviewBatch(){
  if(!canAct())return;
  if(record.current?.emailMode==='combined'){await combinedControl.current?.send();return;}
  if(phase!=='email'||busy.current||switching||sending)return;setSwitching(true);setError('');
  try{await captureActive();if(alive.current){setSendIds(new Set([...mails.current.values()].filter(canSend).map(m=>m.jobId)));setView('review');}}
  catch(e){setError(e instanceof Error?e.message:'Finish the current account first.');}
  finally{if(alive.current)setSwitching(false);}
 }
 async function changePhase(next:BatchPhase){
  if(!canAct()||busy.current||switching||sending||combinedBusy||record.current&&combinedLocked(record.current))return;busy.current=true;setSwitching(true);setError('');
  try{
   const activeId=record.current?.entries[active]?.jobId,control=activeId?controls.current.get(activeId):undefined;
   const recovering=next==='email'&&activeId&&pdfPreparation.current?.pending(activeId)&&(!control||control.sourceConflict()||control.unavailable());
   if(!recovering)await captureActive();const current=record.current;if(!current||!alive.current||exiting.current)return;
   if(next==='email'){
    for(const [index,item] of current.entries.entries()){
     if(!alive.current)return;
     setPreparingPdf(`${index+1} of ${current.entries.length} · ${item.selection.accountName} (${item.selection.hotel})`);
     try{
      if(!item.jobId)throw Error('The source PDF request has not finished.');
      const latest=await batchRequest<DocumentJob>(`/api/documents/${item.jobId}`,tokenRef.current);assertBatchJob(current,item,latest);
      const prepared=await pdfPreparation.current!(latest,sessions.current.get(item.jobId)??(item.pdfDelivery?{revision:latest.revision,sources:null,compose:false,delivery:item.pdfDelivery}:undefined));
      if(!alive.current)return;
      if(prepared.session)sessions.current.set(item.jobId,prepared.session);
      pdfDirty.current.set(item.jobId,false);receiveJob(prepared.job);
     }catch(e){if(alive.current)setActive(index);throw Error(`${item.selection.accountName} (${item.selection.hotel}): ${e instanceof Error?e.message:'PDF preparation failed. Retry Go to email.'}`);}
    }
   }
   const updated={...current,phase:next};saveBatch(sessionStorage,updated);record.current=updated;setBatch(updated);setView('work');childDirty.current=false;
  }catch(e){setError(e instanceof Error?e.message:'Finish the current account before changing mode.');}
  finally{busy.current=false;if(alive.current){setPreparingPdf('');setSwitching(false);}}
 }
 async function leave(){
  const current=record.current;if(!current)return true;
  const shared=combinedDelivery(current.combined),acceptedShared=confirmed(shared)||shared?.gmailAccepted===true;
  if(sentReviewOpen.current||exiting.current||busy.current||switching||sending||combinedSending||combinedBusy&&!acceptedShared||[...controls.current.values()].some(c=>c.busy())){setError('Wait for the current operation before leaving this batch.');return false;}
  if(current.entries.some(e=>e.requested&&!e.jobId)&&(!exit||!await exit.abandonCreates(current.entries.filter(e=>e.requested&&!e.jobId).map(e=>e.commandKey)))){setError('Temporary cleanup could not be confirmed. Retry leaving this batch.');return false;}
  // Invalidate pending metadata reads before cleanup. A late check must never restore
  // a removed resume record, including the interval before React unmounts children.
  exiting.current=true;generation.current++;setExitBusy(true);setError('');
  try{
   for(const entry of current.entries){if(!entry.jobId)continue;const result=await abandonVerifiedEntry(current,entry,()=>batchRequest<DocumentJob>(`/api/documents/${entry.jobId}`,tokenRef.current),()=>batchRequest<{job:DocumentJob;outcome:string}>(`/api/documents/${entry.jobId}/abandon`,tokenRef.current,{method:'POST'}),()=>alive.current&&exiting.current);if(!['discarded','pending','protected'].includes(result.outcome))throw Error('Temporary file cleanup could not be verified.');exit?.settled(entry.jobId);}
   if(!alive.current)return false;
   sessions.current.clear();mails.current.clear();removeBatch(sessionStorage,owner,batchId);record.current=null;onDirtyChange(false);return true;
  }catch(e){if(alive.current){exiting.current=false;setError(e instanceof Error?e.message:'The batch could not be closed.');}return false;}
  finally{if(alive.current)setExitBusy(false);}
 }
 function backToCollections(){if(exiting.current)return;void leave().then(ok=>{if(ok)onClose();});}
 useEffect(()=>{onRegisterLeave(leave);return()=>onRegisterLeave(null);});
 useEffect(()=>{
  onDirtyChange(sentReviewDirty||creating||sending||switching||batchHasEdits(childDirty.current,sessions.current.values()));
  const warn=(event:BeforeUnloadEvent)=>{if(sentReviewDirty||creating||sending||batchHasEdits(childDirty.current,sessions.current.values())){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[creating,sending,switching,sentReviewDirty,onDirtyChange,batch]);
 const reportDirty=useCallback((dirty:boolean,kind?:'pdf'|'email')=>{childDirty.current=dirty;onDirtyChange(batchHasEdits(dirty,sessions.current.values())||busy.current,batchHasEdits(false,sessions.current.values())?'pdf':kind);},[onDirtyChange]);
 function mailReady(mail:BatchMailSnapshot|undefined){return canSend(mail)&&!!mail&&jobs.current.get(mail.jobId)?.revision===mail.documentRevision&&!(mail?.purpose==='collection'&&mail.policyVersion!==policy?.version);}
 async function sendSelected(){
  if(!canAct()||busy.current||sending||switching)return;
  try{
   const selected=[...mails.current.values()].filter(m=>sendIds.has(m.jobId));
   if(selected.some(m=>!mailReady(m)))throw Error('An email or collection policy needs review before sending.');
   const approved=freezeMail(selected);sendingScope.current=new Set(approved.map(m=>m.jobId));busy.current=true;setSending(true);setView('result');setError('');
   await sendBatch(approved,mail=>batchRequest<EmailDeliveryView>(`/api/email/${mail.draftId}/send`,tokenRef.current,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:mail.mailRevision,stage:mail.stage,confirmed:true,...mail.purpose==='collection'?{policyVersion:mail.policyVersion}:{}})}),(mail,result)=>{
    if(!alive.current||exiting.current)return;const entry=record.current?.entries.find(e=>e.jobId===mail.jobId);if(!entry)return;
    updateEntry(entry.commandKey,{attempted:true,error:result.error,delivery:result.delivery??entry.delivery});
    const current=mails.current.get(mail.jobId);if(current)mails.current.set(mail.jobId,{...current,delivery:result.delivery??current.delivery,blocked:result.state==='checking'?'Check this send outcome before another action.':result.state==='sending'?'Sending…':current.blocked});
    if(result.state!=='sending')setSendIds(old=>{const next=new Set(old);next.delete(mail.jobId);return next;});
    changed();
   },canAct);
  }catch(e){setError(e instanceof Error?e.message:'The batch send could not be confirmed.');}
  finally{busy.current=false;if(alive.current)setSending(false);}
 }
 async function openSentReview(entry:BatchEntry){
  if(!canAct()||busy.current||switching||sending||checkLocks.current.has(entry.commandKey)||!entry.mailDraftId)return;
  busy.current=true;setSwitching(true);setError('');
  try{
   let delivery=entry.delivery;
   if(!delivery){
    const draft=await batchRequest<EmailDraft>(`/api/email/${entry.mailDraftId}`,tokenRef.current);
    if(!canAct())return;
    if(draft.id!==entry.mailDraftId||draft.owner!==workspaceOwner||draft.document_job_id!==entry.jobId||draft.hotel!==entry.selection.hotel||draft.account_id!==entry.selection.accountId)throw Error('Email identity could not be verified.');
    delivery=draft.delivery??undefined;
    if(delivery)updateEntry(entry.commandKey,{delivery});
   }
   if(!delivery||!['send','draft'].includes(delivery.mode)||delivery.mode==='draft'&&delivery.state==='created')throw Error('No existing send delivery is available for manual review. Check the original outcome before another action.');
   if(!canAct())return;sentReviewOpen.current=true;setSentReview({...entry,delivery});
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:'The existing delivery could not be verified.');}
  finally{busy.current=false;if(alive.current)setSwitching(false);}
 }
 async function checkEntry(entry:BatchEntry){
  if(!canAct()||!entry.mailDraftId||busy.current||exiting.current||checkLocks.current.has(entry.commandKey))return;
  const epoch=generation.current,valid=()=>alive.current&&!exiting.current&&generation.current===epoch&&!!record.current;
  checkLocks.current.add(entry.commandKey);setChecking(new Set(checkLocks.current));setError('');
  try{
   const draft=await batchRequest<EmailDraft>(`/api/email/${entry.mailDraftId}`,tokenRef.current);if(!valid())return;
   if(draft.owner!==workspaceOwner||draft.document_job_id!==entry.jobId||draft.hotel!==entry.selection.hotel||draft.account_id!==entry.selection.accountId)throw Error('Email identity could not be verified.');
   // Retain acceptance before reconciliation; a failed/lost check cannot erase it.
   const observed=deliveryFloor(record.current?.entries.find(e=>e.commandKey===entry.commandKey)?.delivery,draft.delivery??undefined);
   if(observed)updateEntry(entry.commandKey,{delivery:observed});
   const checked=draft.delivery?await batchRequest<EmailDeliveryView>(`/api/email/deliveries/${draft.delivery.id}/check`,tokenRef.current,{method:'POST'}):undefined;if(!valid())return;
   const delivery=deliveryFloor(observed,checked);
   updateEntry(entry.commandKey,{delivery,error:delivery?undefined:'No confirmed delivery yet. Check the existing request before another action.'});
   const previous=mails.current.get(entry.jobId!);
   mails.current.set(entry.jobId!,{jobId:entry.jobId!,documentRevision:draft.document_revision,draftId:draft.id,mailRevision:draft.revision,hotel:draft.hotel,accountId:draft.account_id,accountName:draft.account_name,sender:mailboxSender(hotelMailbox(draft.hotel)),purpose:draft.purpose,stage:draft.purpose==='collection'?entry.stage??null:null,policyVersion:entry.policyVersion??null,recipients:draft.recipients,subject:draft.subject,files:[...draft.exports.map(f=>f.name),...draft.attachments.map(f=>f.name)],blocked:delivery?'This delivery already has an outcome.':previous?.blocked??'Check the existing email request.',delivery:delivery??null});changed();
  }catch(e){if(valid())setError(e instanceof Error?e.message:'Delivery verification unavailable.');}
  finally{checkLocks.current.delete(entry.commandKey);if(alive.current&&record.current?.id===batchId)setChecking(new Set(checkLocks.current));}
 }
 if(!batch)return <main className="page"><h1>Batch unavailable in this tab</h1><button onClick={onClose}>Back to Collections</button></main>;
 const sharedDelivery=combinedDelivery(batch.combined),sentCount=confirmed(sharedDelivery)?batch.entries.length:batch.entries.filter(e=>confirmed(e.delivery)).length,complete=sentCount===batch.entries.length;
 const unsafeCombinedBusy=combinedBusy&&!(confirmed(sharedDelivery)||sharedDelivery?.gmailAccepted),backDisabled=!!sentReview||creating||sending||combinedSending||switching||exitBusy||unsafeCombinedBusy;
 const entry=batch.entries[active],selectedMails=[...mails.current.values()].filter(m=>sendIds.has(m.jobId));
 const resultEntries=sending?batch.entries.filter(e=>!!e.jobId&&sendingScope.current.has(e.jobId)):view==='result'?batch.entries.filter(attempted):view==='work'&&entry&&attempted(entry)?[entry]:null;
 const showSeparateResult=phase==='email'&&batch.emailMode!=='combined'&&!!resultEntries;
 const remaining=batch.entries.filter(e=>!attempted(e));
 const resultOutcomes=resultEntries?.map(e=>emailSendOutcome(e.delivery))??[];
 const resultState:EmailSendResultState=sending?'sending':resultOutcomes.length&&resultOutcomes.every(s=>s==='sent')&&!(view==='result'&&remaining.length)?'sent':resultOutcomes.length&&resultOutcomes.every(s=>s!=='unconfirmed')&&!(view==='result'&&remaining.length)?'history-pending':resultOutcomes.every(s=>s==='unconfirmed')&&!(view==='result'&&remaining.length)?'unconfirmed':'partial';
 function remainingEmails(){if(!canAct())return;const index=batch!.entries.findIndex(e=>!attempted(e));if(index>=0){setActive(index);setView('work');}}
 return <section className="batch-workspace" aria-label="Selected account preparations">
  <header className="batch-heading"><button disabled={backDisabled} onClick={backToCollections}><ArrowLeft size={17}/>Collections</button><div><h1>{showSeparateResult||combinedLocked(batch)?'Batch results':view==='review'?'Email overview':phase==='pdf'?'PDF Workspace':'Email preparation'}</h1><span>{`${new Set(batch.entries.map(e=>JSON.stringify([e.selection.hotel,e.selection.accountId]))).size} accounts · ${batch.entries.reduce((n,e)=>n+e.selection.ids.length,0)} invoices`}</span></div>{phase==='email'&&view==='work'&&!combinedLocked(batch)&&!showSeparateResult&&<button disabled={!!sentReview||exitBusy||creating||sending||switching||combinedBusy} onClick={()=>void changePhase('pdf')}>Back to PDFs</button>}{!combinedLocked(batch)&&!showSeparateResult&&!(phase==='email'&&batch.emailMode==='combined')&&<button className="primary-button" disabled={creating||sending||switching||combinedBusy||exitBusy} onClick={()=>void (view==='review'?switchAccount(active):phase==='pdf'?changePhase('email'):reviewBatch())}>{preparingPdf?'Preparing PDFs…':view==='review'?'Back to emails':phase==='pdf'?'Go to email':'Review emails'}</button>}{showSeparateResult&&!sending&&<button disabled={exitBusy} onClick={()=>{if(canAct())setView('review');}}>Email overview</button>}</header>
  {phase==='email'&&<fieldset className="batch-email-mode" disabled={!!sentReview||exitBusy||creating||sending||switching||combinedBusy||combinedLocked(batch)||batch.entries.some(e=>e.attempted||e.delivery)}><legend>Email delivery</legend>{(['separate','combined'] as const).map(mode=><label key={mode}><input type="radio" name="batch-email-mode" checked={(batch.emailMode??'separate')===mode} onChange={()=>void changeEmailMode(mode)}/>{mode==='separate'?'Separate emails':'One combined email'}</label>)}</fieldset>}
  {error&&<p className="error-message batch-error" role="alert">{error}</p>}
  <div className="batch-layout"><nav className="batch-account-tabs" aria-label="Accounts in this batch">{batch.entries.map((item,index)=>{
   const itemJob=item.jobId?jobs.current.get(item.jobId):undefined,mail=item.jobId?mails.current.get(item.jobId):undefined;
   const status=phase==='email'&&batch.emailMode==='combined'?(confirmed(sharedDelivery)?'Sent':sharedDelivery?.gmailAccepted?'Sent \u00b7 history pending':combinedLocked(batch)?'Sending not confirmed':'Included package'):confirmed(item.delivery)?'Sent':item.delivery?.gmailAccepted?'Sent · history pending':attempted(item)?'Sending not confirmed':item.error?'Needs attention':phase==='email'?(mailReady(mail)?'Ready to send':mail?.blocked?'Email needed':'Check email'):itemJob?.state==='ready'?(item.jobId&&pdfDirty.current.get(item.jobId)?'Editing PDF':'PDF ready'):itemJob?.state??(item.requested?'Preparing…':'Waiting');
   return <button key={item.commandKey} disabled={creating||switching||sending||combinedSending||combinedBusy||exitBusy} aria-pressed={index===active} onClick={()=>void switchAccount(index)}><strong>{item.selection.accountName}</strong><span><b>{item.selection.hotel}</b><small>{stageLabel(item.stage??item.selection.stage,policy)} · {status}</small></span></button>;
  })}</nav><div className="batch-content">
   {preparingPdf?<section className="batch-wait" role="status"><FileText size={30}/><h2>Preparing PDFs for email</h2><p>{preparingPdf}</p></section>:phase==='email'&&batch.emailMode==='combined'&&batch.combined?<CombinedEmailComposer batch={batch} token={token} jobs={jobs.current} onBusy={setCombinedBusy} onSending={value=>{busy.current=value;setCombinedSending(value);}} onBackToCollections={backToCollections} backDisabled={backDisabled} canSend={canAct} onRegister={control=>{combinedControl.current=control;}} onEntry={(command,draft)=>updateEntry(command,{mailDraftId:draft.id,mailRevision:draft.revision,policyVersion:policy?.version??null})} onChange={combined=>{if(record.current)updateBatch({...record.current,combined});}}/> :showSeparateResult?<EmailSendResult state={resultState} counts={{messages:resultEntries!.length,accounts:new Set(resultEntries!.map(e=>JSON.stringify([e.selection.hotel,e.selection.accountId]))).size,invoices:resultEntries!.reduce((n,e)=>n+e.selection.ids.length,0),files:resultEntries!.every(e=>e.jobId&&mails.current.has(e.jobId))?resultEntries!.reduce((n,e)=>n+mails.current.get(e.jobId!)!.files.length,0):null}} recipientGroups={resultEntries!.map(e=>({key:e.commandKey,label:`${e.selection.hotel} · ${e.selection.accountName} · ${stageLabel(e.stage??e.selection.stage,policy)}`,recipients:e.jobId?mails.current.get(e.jobId)?.recipients??null:null}))} gmailSentUrl={gmailUrl(region,'sent')} onBackToCollections={backToCollections} busy={checking.size>0} backDisabled={backDisabled} detail={view==='result'?`${resultEntries!.filter(e=>confirmed(e.delivery)).length} history recorded · ${resultEntries!.filter(e=>emailSendOutcome(e.delivery)==='history-pending').length} history pending · ${resultEntries!.filter(e=>emailSendOutcome(e.delivery)==='unconfirmed').length} unconfirmed · ${remaining.length} remaining emails`:undefined}>
    <ul className="batch-result-entries">{resultEntries!.map(item=><li key={item.commandKey}><strong>{item.selection.hotel} · {item.selection.accountName} · {stageLabel(item.stage??item.selection.stage,policy)}</strong><span>{emailSendOutcome(item.delivery)==='sent'?'Sent · history recorded':emailSendOutcome(item.delivery)==='history-pending'?'Sent · history update pending':'Sending not confirmed'}</span>{item.error&&<p>{item.error}</p>}{item.mailDraftId&&<button disabled={sending||exitBusy||checking.has(item.commandKey)||confirmed(item.delivery)} onClick={()=>void checkEntry(item)}>Check status</button>}{attempted(item)&&!confirmed(item.delivery)&&<button disabled={sending||exitBusy||checking.has(item.commandKey)} onClick={()=>void openSentReview(item)}>Review existing sent message</button>}</li>)}</ul>{remaining.length>0&&<button disabled={sending||exitBusy} onClick={remainingEmails}>Review remaining emails</button>}
   </EmailSendResult>:view==='work'?(entry?.jobId?<DocumentRoute key={`${entry.jobId}:${phase}`} token={token} jobId={entry.jobId} maxBytes={maxBytes} onGuardDirtyChange={reportGuardDirty} backLabel="Back to accounts" onClose={()=>void (phase==='email'?reviewBatch():changePhase('email'))} onDirtyChange={reportDirty} batch={{scope:{batch,entry},phase,onDeliveryChange:delivery=>{const latest=record.current?.entries.find(e=>e.commandKey===entry.commandKey);if(latest?.pdfDelivery!==delivery)try{updateEntry(entry.commandKey,{pdfDelivery:delivery});}catch(error){setError(error instanceof Error?error.message:'Tab resume storage is unavailable. Keep this tab open.');}},onPdfDirtyChange:dirty=>reportPdfDirty(entry.jobId!,dirty),initialSession:sessions.current.get(entry.jobId),stage:entry.stage??entry.selection.stage,onJob:receiveJob,onRegisterControl:control=>{if(control)controls.current.set(entry.jobId!,control);else controls.current.delete(entry.jobId!);},onPhaseChange:next=>void changePhase(next),onReview:()=>void reviewBatch()}}/>:<section className="batch-wait"><FileText size={30}/><h2>{entry?.selection.accountName}</h2><p>{creating?'Preparing account requests…':entry?.error??'The request has not been confirmed.'}</p>{!creating&&<button onClick={()=>void createEntries(true)}>Retry existing preparation requests</button>}</section>):<section className="batch-review"><h2>{complete?'All selected emails sent':'Separate emails for each account'}</h2><div className="batch-review-table"><table><thead><tr><th>Select</th><th>Account / Hotel</th><th>Recipients / Files</th><th>Status</th><th></th></tr></thead><tbody>{batch.entries.map((item,index)=>{
    const mail=item.jobId?mails.current.get(item.jobId):undefined,delivery=item.delivery??mail?.delivery,status=confirmed(delivery)?'Sent and verified':delivery?.gmailAccepted?'Sent · history update pending':delivery?'Sending not confirmed':item.error?'Check outcome':mailReady(mail)?'Ready to send':mail?.blocked??'Review PDFs and email';
    return <tr key={item.commandKey}><td><input type="checkbox" aria-label={`Send ${item.selection.accountName} ${item.selection.hotel} ${item.selection.stage}`} checked={!!item.jobId&&sendIds.has(item.jobId)} disabled={!!sentReview||exitBusy||sending||switching||!mailReady(mail)} onChange={e=>setSendIds(old=>{const next=new Set(old);if(item.jobId)e.target.checked?next.add(item.jobId):next.delete(item.jobId);return next;})}/></td><td><strong>{item.selection.accountName}</strong><small>{item.selection.hotel} · {stageLabel(mail?.stage??item.selection.stage,policy)}</small></td><td>{mail?<details><summary>{mail.recipients.to.join(', ')||'Email needed'} · {mail.files.length} files</summary><p>From: {mail.sender}</p><p>CC: {mail.recipients.cc.join(', ')||'None'}<br/>BCC: {mail.recipients.bcc.join(', ')||'None'}</p><p>{mail.subject}</p><ul>{mail.files.map((f,n)=><li key={n}>{f}</li>)}</ul></details>:<span>Not reviewed yet</span>}</td><td><span className={confirmed(delivery)?'batch-sent':''}>{confirmed(delivery)&&<Check size={14}/>} {status}</span>{item.error&&<small>{item.error}</small>}</td><td><button disabled={!!sentReview||exitBusy||sending||switching} onClick={()=>void switchAccount(index)}>Review</button>{item.mailDraftId&&(item.attempted||delivery)&&<button disabled={!!sentReview||exitBusy||sending||switching||confirmed(delivery)||checking.has(item.commandKey)} onClick={()=>void checkEntry(item)}><RefreshCw size={14}/>Check status</button>}</td></tr>;
   })}</tbody></table></div><footer><span>{complete?`${sentCount} emails sent`:`${sentCount?`${sentCount} sent · `:''}${selectedMails.filter(mailReady).length} emails ready`}</span><button className="primary-button" disabled={!!sentReview||exitBusy||sending||switching||!complete&&(!selectedMails.length||selectedMails.some(m=>!mailReady(m)))} onClick={()=>{if(complete)void leave().then(ok=>{if(ok)onClose();});else void sendSelected();}}>{complete?<ArrowLeft size={16}/>:<Send size={16}/>}{complete?'Back to Collections':sending?'Sending and verifying…':`Send ${selectedMails.length} emails`}</button></footer></section>}
  </div></div>
  {sentReview?.delivery&&<SentMatchReview token={token} region={region} deliveryId={sentReview.delivery.id} onDirtyChange={setSentReviewDirty} onClose={()=>{sentReviewOpen.current=false;setSentReview(null);}} onMatched={()=>{const entry=record.current?.entries.find(e=>e.commandKey===sentReview.commandKey);sentReviewOpen.current=false;setSentReview(null);if(entry)void checkEntry(entry);}}/>}
 </section>;
}
