import {useEffect,useRef,useState} from 'react';
import type {SavedEmailReviewData} from '../../worker/accounts/workspace';
import type {ThreadPreview} from '../email/threads';
import './saved-email-review.css';

const messages:Record<string,string>={
 email_forbidden:'This saved email does not belong to the selected Hotel and Account.',email_missing:'This saved email could not be found.',
 email_revision_conflict:'The saved draft changed. Reload the saved message before reading its conversation.',
 email_thread_changed:'Conversation changed in Gmail. Refresh linked conversation to read a consistent version.',
 email_thread_unrelated:'This conversation no longer matches the saved To or Cc recipients.',
 email_thread_invalid:'The saved conversation or its parent message could not be verified.',
 email_thread_not_selected:'This saved email has no linked conversation.',
 email_thread_too_large:'The conversation exceeds the metadata review limit. Its messages were not truncated.',
 gmail_read_permission_required:'Gmail read access is unavailable. Check the Gmail connection from the email workspace.',
 gmail_reconnect_required:'Reconnect Gmail from the email workspace, then retry this review.',
};
async function read<T>(path:string,token:string,signal:AbortSignal):Promise<T>{
 const response=await fetch(path,{headers:{Authorization:`Bearer ${token}`},signal});
 const value=await response.json().catch(()=>null);
 const code=value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:'';
 if(!response.ok)throw Error(messages[code]??(response.status===401?'Sign in again, then reload this saved message.':'Saved email evidence is unavailable. Retry the read.'));
 if(!value||typeof value!=='object')throw Error('Saved email evidence is unavailable. Retry the read.');return value as T;
}
const dateLabel=(value:string)=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(date)+' ICT':'Date unavailable';};
const stateLabel=(value:string|null|undefined)=>value?value.replaceAll('_',' '):'No handoff recorded';

export function SavedEmailReview({hotel,accountId,draftId,token,onClose}:{hotel:string;accountId:string;draftId:string;token:string;onClose:()=>void}){
 const [saved,setSaved]=useState<SavedEmailReviewData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [conversation,setConversation]=useState<ThreadPreview|null>(null),[offset,setOffset]=useState(0),[threadLoading,setThreadLoading]=useState(false),[threadError,setThreadError]=useState(''),[threadRequested,setThreadRequested]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null),threadRequest=useRef<AbortController|null>(null);
 const base=`/api/account-workspace/${encodeURIComponent(hotel)}/${encodeURIComponent(accountId)}/email/${encodeURIComponent(draftId)}`;
 useEffect(()=>{heading.current?.focus();},[draftId]);
 useEffect(()=>{
  const controller=new AbortController();threadRequest.current?.abort();setLoading(true);setError('');setSaved(null);setConversation(null);setOffset(0);setThreadError('');setThreadRequested(false);setThreadLoading(false);
  void read<SavedEmailReviewData>(base,token,controller.signal).then(value=>{if(!controller.signal.aborted)setSaved(value);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Saved email is unavailable.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>{controller.abort();threadRequest.current?.abort();};
 },[base,token,reload]);
 async function loadConversation(nextOffset=0,refresh=false){
  if(!saved)return;threadRequest.current?.abort();const controller=new AbortController();threadRequest.current=controller;setThreadRequested(true);setThreadLoading(true);setThreadError('');
  const query=new URLSearchParams({revision:String(saved.draftRevision),offset:String(nextOffset)});
  if(!refresh&&conversation?.historyId)query.set('historyId',conversation.historyId);
  try{const value=await read<ThreadPreview>(base+'/thread?'+query,token,controller.signal);if(!controller.signal.aborted){setConversation(value);setOffset(nextOffset);}}
  catch(e){if(!controller.signal.aborted)setThreadError(e instanceof Error?e.message:'Conversation is unavailable.');}
  finally{if(!controller.signal.aborted)setThreadLoading(false);}
 }
 return <section className="saved-email-review" aria-label="Saved email review">
  <header><div><h2 ref={heading} tabIndex={-1}>Saved email review</h2><p>{hotel} · Read-only account evidence</p></div><button onClick={onClose}>Back to documents &amp; Gmail</button></header>
  {loading&&<p role="status">Loading the saved message…</p>}{error&&<p role="alert" className="error-message">{error}</p>}
  {saved&&<>
   <div className="saved-email-heading"><h3>{saved.subject||'(No subject)'}</h3><button disabled={loading} onClick={()=>setReload(n=>n+1)}>Reload saved message</button></div>
   <div className="saved-email-meta"><span>Document revision {saved.documentRevision}</span><span>Draft revision {saved.draftRevision}</span><span>{saved.purpose==='billing'?'Billing':'Collection'}</span></div>
   {saved.packageChanged&&<p className="saved-email-warning">Document package has changed since this email was saved. This review keeps the original document revision.</p>}
   <dl className="saved-email-recipients">{(['to','cc','bcc'] as const).map(field=><div key={field}><dt>{field==='to'?'To':field==='cc'?'Cc':'Bcc'}</dt><dd>{saved.recipients[field].join(', ')||'None recorded'}</dd></div>)}</dl>
   <div className="saved-email-delivery"><strong>Delivery for this draft revision</strong><span>{stateLabel(saved.delivery?.state??saved.gmailHandoff)}{saved.delivery?.sentAt?' · '+dateLabel(saved.delivery.sentAt):''}</span><small>{saved.delivery?.recorded?'Verified send recorded.':'This status does not prove a verified send.'}</small></div>
   <div className="saved-email-body">{saved.body||'(No message body saved)'}</div>
   <section className="saved-email-conversation" aria-label="Saved linked conversation"><div className="saved-email-heading"><div><h3>Linked conversation</h3><p>Gmail metadata and snippets, checked against the saved recipients and parent.</p></div>{saved.hasThread&&<button disabled={threadLoading} onClick={()=>loadConversation(0,true)}>{threadRequested?'Refresh linked conversation':'Load linked conversation'}</button>}</div>
    {!saved.hasThread&&<p>This saved email has no selected conversation.</p>}{threadLoading&&<p role="status">Reading linked conversation…</p>}{threadError&&<p role="alert" className="error-message">{threadError}</p>}
    {conversation&&<><ol className="saved-conversation-messages">{conversation.messages.map(message=><li key={message.id}><div className="saved-conversation-meta"><strong>{message.direction==='incoming'?'Incoming':message.direction==='outgoing'?'Outgoing':'Direction unknown'}</strong><span>{dateLabel(message.date)}</span></div><p className="saved-conversation-address">{message.from} → {message.to.join(', ')||'Recipient not shown'}</p>{message.matchesReply&&<small className="saved-parent-reference">Reply to the saved parent message</small>}<p className="saved-conversation-snippet">{message.snippet||'No snippet is available for this message.'}</p></li>)}</ol><div className="saved-conversation-pagination"><span>{conversation.messages.length?`Messages ${offset+1}–${offset+conversation.messages.length} of ${conversation.thread.messageCount}`:'No messages on this page'}</span><div><button disabled={threadLoading||offset===0} onClick={()=>loadConversation(Math.max(0,offset-50))}>Previous conversation messages</button><button disabled={threadLoading||conversation.nextMessageOffset===null} onClick={()=>loadConversation(conversation.nextMessageOffset!)}>Next conversation messages</button></div></div><p className="saved-conversation-check">Checked {dateLabel(conversation.checkedAt)}</p></>}
   </section>
   <p className="account-evidence-note">Read-only message and conversation evidence. Delivery status belongs to the displayed draft revision.</p>
  </>}
  {error&&!saved&&<button onClick={()=>setReload(n=>n+1)}>Retry saved email</button>}
 </section>;
}
