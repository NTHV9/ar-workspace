import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,RefreshCw,X} from 'lucide-react';
import type {EmailDraft} from '../../worker/email/shared';
import type {ThreadList,ThreadPreview} from './threads';
import './thread-chooser.css';

export const threadErrorMessages:Record<string,string>={
 email_revision_conflict:'This draft changed in another session. Close this review and reopen the workspace to load the latest draft. Your message has not been replaced.',
 email_thread_unrelated:'This conversation does not match the saved To or CC recipients. Review the account recipients or choose another conversation.',
 email_thread_invalid:'Gmail could not validate this conversation or parent message. Refresh the conversation and choose a readable parent, or start a new email.',
 email_thread_changed:'The selected message changed in Gmail. Refresh the conversation and confirm it again.',
 email_thread_unavailable:'Gmail could not load this conversation. Retry the read, or close this review and choose another conversation.',
 email_thread_too_large:'This conversation exceeds the metadata review limit. It has not been loaded completely. Choose another conversation or start a new email.',
 email_thread_recipients_required:'Save at least one external To or CC recipient before searching. BCC addresses are not used for search.',
 email_thread_subject_locked:'The subject must match the selected Gmail conversation. Start a new email before changing it.',
 email_handoff_pending:'This message already has a pending Gmail handoff. Check its sent status before making changes.',
 email_package_changed:'The reviewed PDF package changed. Return to PDF review before choosing a conversation.',
 gmail_reconnect_required:'Gmail access expired. Close this review and reconnect Gmail, then retry.',
 gmail_read_permission_required:'Close this review and authorize Gmail read access before reviewing conversations.',
 gmail_not_configured:'Gmail is not configured. Close this review and check the Gmail connection.',
};
const errors=threadErrorMessages;
export async function threadRequest<T>(path:string,token:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
 if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:string};throw Error(errors[data.error??'']??(response.status===401||response.status===403?'Your session cannot read this conversation. Sign in again, then reopen the draft.':'The conversation service is unavailable. Close this review and reopen the draft before retrying a selection. Your message is retained.'));}
 return response.json() as Promise<T>;
}
const dateLabel=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(date)+' ICT';};

function ReviewFrame({host,title,writing,onClose,children}:{host:HTMLElement|null;title:string;writing:boolean;onClose:()=>void;children:ReactNode}){
 const frame=useRef<HTMLElement>(null),closeRef=useRef<HTMLButtonElement>(null);
 const controls=useRef({writing,onClose});controls.current={writing,onClose};
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;closeRef.current?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!controls.current.writing)controls.current.onClose();}
   if(event.key==='Tab'&&!frame.current?.contains(document.activeElement)){event.preventDefault();closeRef.current?.focus();}
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus();});};
 },[]);
 if(!host)return null;
 return createPortal(<section ref={frame} className="thread-review" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!writing)onClose();}
  if(event.key==='Tab'){const items=Array.from(frame.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]).filter(item=>item.getClientRects().length>0);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}><header><div><h2>{title}</h2><p>Gmail metadata · plain-text snippets only</p></div><button ref={closeRef} aria-label="Close conversation review" disabled={writing} onClick={onClose}><X size={18}/>Close</button></header>{children}</section>,host);
}

function Messages({preview,parentId,onParentChange,referenceChecked=true}:{preview:ThreadPreview;parentId?:string;referenceChecked?:boolean;onParentChange?:(id:string)=>void}){
 return <div className="thread-messages">{preview.messages.length===0?<p className="thread-empty">No message metadata is available on this page.</p>:preview.messages.map(message=><article key={message.id}>
  <header><strong>{message.from||'Sender unavailable'}</strong><span className={`thread-direction ${message.direction}`}>{message.direction}</span></header>
  <p className="thread-date">{dateLabel(message.date)}</p><p className="thread-participants">To: {message.to.join(', ')||'Not available'}</p>
  <p className="thread-message-subject">{message.subject||'No subject'}</p><p className="thread-snippet">{message.snippet||'Message text not loaded. Only header metadata is available.'}</p>
  <p className="thread-reference">{!referenceChecked?'Reply reference not checked against a saved parent.':message.matchesReply?'Explicit reply reference':'No explicit reference to the saved parent'}</p>
  {onParentChange&&<label className="thread-parent"><input type="radio" name="thread-parent" checked={parentId===message.id} onChange={()=>onParentChange(message.id)}/>Reply to this message</label>}
 </article>)}</div>;
}
const evidenceNote=<p className="thread-evidence-note">Replies do not change balances, billing dates or collection stages.</p>;

interface ChooserProps {draft:EmailDraft;token:string;host:HTMLElement|null;canRead:boolean;disabled:boolean;handoff:boolean;dirty:boolean;onChange:(draft:EmailDraft)=>void;onBusyChange:(busy:boolean)=>void}
export default function ThreadChooser({draft,token,host,canRead,disabled,handoff,dirty,onChange,onBusyChange}:ChooserProps){
 const [open,setOpen]=useState(false),[clearing,setClearing]=useState(false),[list,setList]=useState<ThreadList|null>(null),[preview,setPreview]=useState<ThreadPreview|null>(null),[previewId,setPreviewId]=useState('');
 const [loading,setLoading]=useState(false),[writing,setWriting]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(false),[parentId,setParentId]=useState(''),[parentLabel,setParentLabel]=useState(''),[parentSubject,setParentSubject]=useState('');
 const [tokens,setTokens]=useState<(string|null)[]>([null]),[pageIndex,setPageIndex]=useState(0),[offset,setOffset]=useState(0);
 const request=useRef<AbortController|null>(null),generation=useRef(0),active=useRef(false),mounted=useRef(true),writingRef=useRef(false),latest=useRef({revision:draft.revision,id:draft.id,token});latest.current={revision:draft.revision,id:draft.id,token};
 const callbacks=useRef({onChange,onBusyChange});callbacks.current={onChange,onBusyChange};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current=false;generation.current++;request.current?.abort();callbacks.current.onBusyChange(false);};},[]);
 function close(){if(writingRef.current)return;active.current=false;generation.current++;request.current?.abort();setOpen(false);setLoading(false);callbacks.current.onBusyChange(false);}
 function show(clear=false){if(disabled||!clear&&!canRead)return;active.current=true;setOpen(true);setClearing(clear);setPreview(null);setPreviewId('');setList(null);setAck(false);setError('');setOffset(0);setTokens([null]);setPageIndex(0);callbacks.current.onBusyChange(true);}
 async function read<T>(path:string,accept:(value:T)=>void){
  request.current?.abort();const controller=new AbortController();request.current=controller;const epoch=++generation.current;const revision=draft.revision;setLoading(true);setError('');
  try{const data=await threadRequest<T>(path,token,{signal:controller.signal});if(mounted.current&&active.current&&epoch===generation.current&&latest.current.revision===revision&&latest.current.id===draft.id&&latest.current.token===token)accept(data);}
  catch(e){if(mounted.current&&active.current&&epoch===generation.current&&!controller.signal.aborted){if(e instanceof Error&&e.message===errors.email_thread_changed){clearPreview();}setError(e instanceof Error?e.message:'Conversation unavailable. Retry this read.');}}
  finally{if(mounted.current&&active.current&&epoch===generation.current)setLoading(false);}
 }
 const base=`/api/email/${encodeURIComponent(draft.id)}`;
 function readList(pageToken:string|null,index:number){const query=new URLSearchParams({revision:String(draft.revision)});if(pageToken)query.set('pageToken',pageToken);void read<ThreadList>(`${base}/threads?${query}`,value=>{setList(value);setPageIndex(index);setPreview(null);setPreviewId('');setAck(false);});}
 function clearPreview(){setPreview(null);setParentId('');setParentLabel('');setParentSubject('');setAck(false);setOffset(0);}
 function readPreview(id:string,nextOffset=0,reset=true){
  const resetParent=reset||preview?.thread.threadId!==id,pageOffset=resetParent?0:nextOffset;
  if(resetParent)clearPreview();setPreviewId(id);setAck(false);
  void read<ThreadPreview>(`${base}/threads/${encodeURIComponent(id)}?revision=${draft.revision}&offset=${pageOffset}${!resetParent&&preview?`&historyId=${encodeURIComponent(preview.historyId)}`:''}`,value=>{
   setPreview(value);setOffset(pageOffset);
   if(resetParent){const wanted=draft.thread?.threadId===id?draft.thread.parentMessageId:value.thread.parentMessageId;const parent=value.messages.find(message=>message.id===wanted);setParentId(parent?.id??'');setParentLabel(parent?`${parent.from} · ${dateLabel(parent.date)}`:'Choose a message above');setParentSubject(parent?.subject??'');}
  });
 }
 async function select(clear=false){
  if(writingRef.current||disabled||handoff||!clear&&!canRead||!active.current||!clear&&(!ack||loading||!!error||!preview||preview.thread.threadId!==previewId||!parentId))return;
  writingRef.current=true;setWriting(true);setError('');const original={...latest.current};
  try{const saved=await threadRequest<EmailDraft>(`${base}/thread`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:draft.revision,threadId:clear?null:preview?.thread.threadId,...(!clear?{parentMessageId:parentId}:{}),confirmed:true}),signal:AbortSignal.timeout(30000)});
   if(mounted.current&&active.current&&latest.current.id===original.id&&latest.current.revision===original.revision&&latest.current.token===original.token){callbacks.current.onChange(saved);writingRef.current=false;close();}
  }catch(e){if(mounted.current&&active.current)setError(e instanceof Error?e.message:'Selection could not be confirmed. Close this review and reopen the draft before retrying.');}
  finally{writingRef.current=false;if(mounted.current)setWriting(false);}
 }
 const reason=!canRead?'Connect Gmail with read access to review conversations.':dirty?'Save message edits before reviewing or changing conversations.':handoff?'Gmail handoff started. Conversation review remains available.':null;
 return <section className="thread-chooser" aria-label="Thread choice"><h3>Thread choice</h3>
  <div className="thread-choice-buttons"><button className={!draft.thread?'chosen':''} aria-pressed={!draft.thread} aria-label="Start a new email" disabled={disabled||handoff||!draft.thread} onClick={()=>show(true)}>Start a new email<small>Create a separate conversation</small></button>
  <button className={draft.thread?'chosen':''} aria-pressed={!!draft.thread} aria-label="Continue existing thread" disabled={disabled||handoff||!canRead} onClick={()=>{show();readList(null,0);}}>Continue existing thread<small>Search saved To and CC recipients</small></button></div>
  {draft.thread&&<div className="thread-selected"><strong>{draft.thread.subject}</strong><p>Subject locked to the selected conversation.</p><button disabled={disabled||!canRead} onClick={()=>{show();readPreview(draft.thread!.threadId);}}>View conversation</button></div>}{reason&&<p className="thread-help">{reason}</p>}
  {open&&<ReviewFrame host={host} title="Conversation review" writing={writing} onClose={close}>
   <div className="thread-review-body"><div className="thread-scope"><strong>{draft.hotel} · {draft.account_name}</strong><p>{draft.invoice_ids.length} selected invoices · To / CC: {[...draft.recipients.to,...draft.recipients.cc].join(', ')||'None saved'}</p></div>
    {clearing?<><h3>Start a separate Gmail conversation</h3><p className="thread-description">This clears the saved thread selection. Your current subject, message, recipients and attachments stay in this workspace.</p><button className="primary-button" disabled={writing} onClick={()=>select(true)}>Confirm new email</button></>:<>
    {previewId?<><div className="thread-review-actions">{!handoff&&<button disabled={loading||writing} onClick={()=>{setPreviewId('');setPreview(null);setAck(false);if(!list)readList(null,0);}}><ArrowLeft size={15}/>Back to conversations</button>}<button disabled={loading||writing} onClick={()=>readPreview(previewId)}><RefreshCw size={14}/>Refresh conversation</button></div>
     {preview&&<><div className="thread-summary"><h3>{preview.thread.subject||'No subject'}</h3><p>Participants: {preview.thread.participants.join(', ')}</p><p>{preview.thread.messageCount} messages · Checked {dateLabel(preview.checkedAt)}</p></div>
      <p className="thread-description">Thread membership does not prove a reply covers every selected invoice. An explicit reply reference is header evidence only; review its meaning before acting.</p>{evidenceNote}
      <Messages preview={preview} referenceChecked={draft.thread?.threadId===preview.thread.threadId} parentId={parentId} onParentChange={handoff||loading||writing?undefined:id=>{const parent=preview.messages.find(message=>message.id===id);setParentId(id);setParentLabel(parent?`${parent.from} · ${dateLabel(parent.date)}`:'Choose a message above');setParentSubject(parent?.subject??'');setAck(false);}}/>
      <nav className="thread-pagination" aria-label="Conversation message pages"><button disabled={loading||writing||offset===0} onClick={()=>readPreview(previewId,Math.max(0,offset-50),false)}><ArrowLeft size={14}/>Previous messages</button><span>Messages {offset+1}–{offset+preview.messages.length} of {preview.thread.messageCount}</span><button disabled={loading||writing||preview.nextMessageOffset===null} onClick={()=>readPreview(previewId,preview.nextMessageOffset!,false)}>Next messages<ArrowRight size={14}/></button></nav>
      {!handoff&&<div className="thread-confirmation"><p>Replying to: {parentLabel} · Subject to use: {parentSubject||'Choose a message above'}. Your recipients and message stay unchanged.</p><label><input type="checkbox" checked={ack} disabled={loading||writing||!!error} onChange={event=>setAck(event.target.checked)}/>I confirm this conversation and its participants belong to {draft.hotel} · {draft.account_name}.</label><button className="primary-button" disabled={!ack||loading||writing||!!error||!parentId||preview.thread.threadId!==previewId} onClick={()=>select()}>{writing?'Saving conversation…':'Use this conversation'}</button></div>}
     </>}
    </>:<><p className="thread-description">Search uses this saved draft’s explicit To and CC recipients. Shared addresses can span accounts; preview and confirm the exact conversation.</p><button disabled={loading||writing} onClick={()=>{setTokens([null]);readList(null,0);}}><RefreshCw size={14}/>Refresh search</button>
     {list&&<><div className="thread-results">{list.threads.length===0?<p className="thread-empty">No matching conversations found. Review your saved To and CC recipients, or start a new email.</p>:list.threads.map(thread=><button key={thread.threadId} aria-label={`Preview ${thread.subject}`} disabled={loading||writing} onClick={()=>readPreview(thread.threadId)}><strong>{thread.subject||'No subject'}</strong><span>{thread.participants.join(', ')}</span><small>{dateLabel(thread.latestAt)} · {thread.messageCount} messages</small><span className="thread-preview-label">Preview conversation <ArrowRight size={14}/></span></button>)}</div>
      <nav className="thread-pagination" aria-label="Conversation search pages"><button disabled={loading||writing||pageIndex===0} onClick={()=>readList(tokens[pageIndex-1],pageIndex-1)}><ArrowLeft size={14}/>Previous conversations</button><span>Page {pageIndex+1}</span><button disabled={loading||writing||!list.nextPageToken} onClick={()=>{const next=list.nextPageToken;setTokens([...tokens.slice(0,pageIndex+1),next]);readList(next,pageIndex+1);}}>Next conversations<ArrowRight size={14}/></button></nav></>}
    </>}
    </>}
    {loading&&<p role="status" className="thread-feedback">Loading Gmail conversation metadata…</p>}{error&&<p role="alert" className="thread-error">{error}</p>}
   </div>
  </ReviewFrame>}
 </section>;
}

/** Diagnostic metadata is isolated from any account's draft selection. */
export function TestConversationReview({deliveryId,token,host,onClose}:{deliveryId:string;token:string;host:HTMLElement|null;onClose:()=>void}){
 const history=useRef<string>('');
 useEffect(()=>{history.current='';},[deliveryId]);
 const [preview,setPreview]=useState<ThreadPreview|null>(null),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');void threadRequest<ThreadPreview>(`/api/email/test-conversations/${encodeURIComponent(deliveryId)}?offset=${offset}${history.current?`&historyId=${encodeURIComponent(history.current)}`:''}`,token,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){history.current=value.historyId;setPreview(value);}}).catch(e=>{if(!controller.signal.aborted){if(e instanceof Error&&e.message===errors.email_thread_changed)setPreview(null);setError(e instanceof Error?e.message:'Test conversation unavailable. Refresh to retry.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[deliveryId,token,offset,retry]);
 return <ReviewFrame host={host} title="Test conversation review" writing={false} onClose={onClose}><div className="thread-review-body"><p className="thread-description">Synthetic connection test only. This conversation is not linked to an Account or its invoices.</p><button disabled={loading} onClick={()=>{history.current='';setOffset(0);setRetry(n=>n+1);}}><RefreshCw size={14}/>Refresh test conversation</button>{preview&&<><div className="thread-summary"><h3>{preview.thread.subject}</h3><p>Participants: {preview.thread.participants.join(', ')}</p><p>Checked {dateLabel(preview.checkedAt)}</p></div><Messages preview={preview}/><nav className="thread-pagination" aria-label="Test conversation pages"><button disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous messages</button><span>{preview.thread.messageCount} messages</span><button disabled={loading||preview.nextMessageOffset===null} onClick={()=>setOffset(preview.nextMessageOffset!)}>Next messages</button></nav>{evidenceNote}</>}{loading&&<p role="status">Loading test conversation metadata…</p>}{error&&<p role="alert" className="thread-error">{error}</p>}</div></ReviewFrame>;
}
