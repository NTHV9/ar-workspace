import {useEffect,useRef,useState} from 'react';
import type {CombinedEmail} from '../email/combined';
import {parseRichMessage,richHtml} from '../email/rich-message';
import {emailDeliveryStatus} from '../email/delivery-status';
import {gmailUrl} from '../email/mailbox-ui';
import {hotelMailbox} from '../domain/mailboxes';
import './saved-email-review.css';

export function CombinedSavedEmailReview({hotel,accountId,preparationId,token,readOnly=false,onClose}:{hotel:string;accountId:string;preparationId:string;token:string;readOnly?:boolean;onClose:()=>void}){
 const [saved,setSaved]=useState<CombinedEmail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const alive=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[preparationId]);
 useEffect(()=>{
  const controller=new AbortController();alive.current=true;setSaved(null);setError('');setBusy(true);
  void (async()=>{try{
   const response=await fetch(`/api/email/combined/${encodeURIComponent(preparationId)}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
   if(!response.ok)throw Error(response.status===403?'Access to all Accounts in this combined email is required.':'The saved combined email is unavailable. Retry the read.');
   const value=await response.json() as CombinedEmail;
   if(value.id!==preparationId||value.mailbox!==hotelMailbox(hotel)||!Array.isArray(value.members)||!value.members.some(m=>m.hotel===hotel&&m.accountId===accountId))throw Error('This shared message does not belong to the selected Hotel and Account.');
   if(value.content.richBody)value.content.richBody=parseRichMessage(value.content.richBody);
   if(!controller.signal.aborted)setSaved(value);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Combined email evidence is unavailable.');}finally{if(!controller.signal.aborted)setBusy(false);}})();
  return()=>{alive.current=false;controller.abort();};
 },[hotel,accountId,preparationId,token,reload]);
 async function check(){
  if(!saved?.delivery||busy||readOnly)return;setBusy(true);setError('');
  try{const response=await fetch(`/api/email/deliveries/${saved.delivery.id}/check`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw Error('Sent status could not be read. This action does not resend the message.');const delivery=await response.json() as NonNullable<CombinedEmail['delivery']>;if(!delivery||delivery.id!==saved.delivery.id||delivery.mode!=='send'||!['pending','created','awaiting_evidence','sent','review_required'].includes(delivery.state)||delivery.recorded!==undefined&&typeof delivery.recorded!=='boolean')throw Error('Sent status could not be verified.');if(alive.current)setSaved(current=>current?{...current,delivery}:current);}
  catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
 }
 const status=saved?.delivery?emailDeliveryStatus(saved.delivery):null;
 return <section className="saved-email-review" aria-label="Combined email review">
  <header><div><h2 ref={heading} tabIndex={-1}>Combined email review</h2><p>{hotel} · {accountId} · One shared message</p></div><button onClick={onClose}>Back to email history</button></header>
  {busy&&!saved&&<p role="status">Loading the shared message…</p>}{error&&<p role="alert" className="error-message">{error}</p>}
  {saved&&<>
   <div className="saved-email-heading"><h3>{saved.content.subject}</h3><button disabled={busy} onClick={()=>setReload(n=>n+1)}>Reload saved message</button></div>
   <div className="saved-email-meta"><span>{saved.totals.accounts} accounts</span><span>{saved.totals.invoices} invoices</span><span>{saved.totals.files} reviewed files</span></div>
   <dl className="saved-email-recipients">{(['to','cc','bcc'] as const).map(field=><div key={field}><dt>{field.toUpperCase()}</dt><dd>{saved.content.recipients[field].join(', ')||'None recorded'}</dd></div>)}</dl>
   <div className="saved-email-delivery" role="status"><strong>{status?.title??'No delivery recorded'}</strong><span>{status?.detail}</span>{status?.reason&&<small>{status.reason}</small>}{!readOnly&&saved.delivery&&!saved.delivery.recorded&&<button disabled={busy} onClick={()=>void check()}>Check sent status</button>}</div>
   {saved.content.richBody?<div className="rich-message-preview" dangerouslySetInnerHTML={{__html:richHtml(saved.content.richBody)}}/>:<div className="saved-email-body">{saved.content.body}</div>}
   <h3>Accounts and reviewed attachments</h3>{saved.members.map(member=><section key={member.memberId}><h4>{member.hotel} · {member.accountName}</h4><p>{member.invoiceIds.length} invoices · {member.purpose}{member.stage?' · '+(member.stageLabel??member.stage):''}</p><ul>{member.files.map(file=><li key={file.fileId}>{file.name} · {Math.ceil(file.byteCount/1024)} KiB</li>)}</ul></section>)}
   <a href={gmailUrl(saved.mailbox,'sent')} target="_blank" rel="noopener noreferrer">Open Gmail Sent</a>
  </>}
  {error&&!saved&&<button onClick={()=>setReload(n=>n+1)}>Retry saved email</button>}
 </section>;
}
