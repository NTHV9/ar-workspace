import {useEffect, useId, useRef, type ReactNode} from 'react';
import {ArrowUpRight, Check, LoaderCircle, TriangleAlert} from 'lucide-react';
import type {EmailSendCounts, EmailSendRecipientGroup, EmailSendResultState} from './send-result';
import './send-result.css';

export interface EmailSendResultProps {
 state: EmailSendResultState;
 counts: EmailSendCounts;
 recipientGroups: readonly EmailSendRecipientGroup[];
 gmailSentUrl: string;
 onBackToCollections: () => void;
 busy?: boolean;
 backDisabled?: boolean;
 detail?: string;
 error?: string;
 recovery?: ReactNode;
 children?: ReactNode;
}

export default function EmailSendResult({state, counts, recipientGroups, gmailSentUrl, onBackToCollections, busy = false, backDisabled = false, detail, error, recovery, children}: EmailSendResultProps): React.JSX.Element {
 const headingId = useId();
 const headingRef = useRef<HTMLHeadingElement>(null);
 // Pending -> recorded retains the same successful headline. Checks/metadata
 // updates must not steal focus back from a recovery control or the return action.
 const focusState = state === 'history-pending' ? 'sent' : state;
 useEffect(() => { headingRef.current?.focus({preventScroll: true}); }, [focusState]);

 const plural = counts.messages !== 1;
 const headline = state === 'sending' ? (plural ? 'Sending emails…' : 'Sending email…')
  : state === 'partial' ? 'Email results'
  : state === 'unconfirmed' ? 'Sending not confirmed'
  : plural ? 'Emails sent' : 'Email sent';
 const explanation = state === 'sent' ? 'Billing / collection history recorded.'
  : state === 'history-pending' ? 'Gmail accepted this email. You can return to Collections while history processing continues. Do not resend.'
  : state === 'unconfirmed' ? 'Check the existing result before taking another action. Do not resend.'
  : state === 'partial' ? 'Review each message result and any remaining emails below.'
  : 'Your reviewed email is being sent. Keep this screen open until the result is available.';
 const completed = state === 'sent' || state === 'history-pending';
 const Icon = state === 'sending' ? LoaderCircle : completed ? Check : TriangleAlert;
 const tone = completed ? 'success' : state === 'sending' ? 'progress' : 'attention';

 return <section className="email-send-result" data-state={state} data-tone={tone} aria-labelledby={headingId}>
  <header className="email-send-result__header">
   <span className="email-send-result__symbol" aria-hidden="true"><Icon size={32}/></span>
   <div>
    <h2 ref={headingRef} id={headingId} tabIndex={-1}>{headline}</h2>
    {state === 'history-pending' && <p className="email-send-result__pending">History update pending</p>}
    <p className="email-send-result__explanation">{explanation}</p>
   </div>
  </header>
  <div className="email-send-result__live" data-busy={state !== 'sending' && busy} role="status" aria-live="polite" aria-atomic="true">{state === 'sending' ? headline : busy ? 'Checking existing result…' : state === 'history-pending' ? 'History update pending' : state === 'sent' ? 'History recorded' : ''}</div>
  <nav className="email-send-result__actions" aria-label="Email result actions">
   <button type="button" className="email-send-result__back" disabled={state === 'sending' || backDisabled} onClick={onBackToCollections}>Back to Collections</button>
   <a href={gmailSentUrl} target="_blank" rel="noopener noreferrer">Open Gmail Sent <ArrowUpRight size={16} aria-hidden="true"/></a>
  </nav>
  {detail && <p className="email-send-result__detail">{detail}</p>}
  {error && <p className="email-send-result__error" role="alert">{error}</p>}
  <section className="email-send-result__scope" aria-label="Reviewed email scope">
   <h3>Reviewed email scope</h3>
   <dl className="email-send-result__counts">
    {([['Messages', counts.messages], ['Accounts', counts.accounts], ['Invoices', counts.invoices], ['Files', counts.files ?? 'Unavailable']] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
   </dl>
  </section>
  <section className="email-send-result__recipients" aria-label="Email recipients">
   <h3>Recipients</h3>
   {recipientGroups.length === 0 && <p>Recipient details unavailable.</p>}
   {recipientGroups.map(group => <article key={group.key} className="email-send-result__recipient-group">
    <h4>{group.label}</h4>
    {group.recipients ? <>
     <dl><div><dt>To</dt><dd>{group.recipients.to.length ? group.recipients.to.join(', ') : 'None'}</dd></div></dl>
     {(group.recipients.cc.length > 0 || group.recipients.bcc.length > 0) && <details><summary>CC / BCC</summary><dl>
      <div><dt>CC</dt><dd>{group.recipients.cc.length ? group.recipients.cc.join(', ') : 'None'}</dd></div>
      <div><dt>BCC</dt><dd>{group.recipients.bcc.length ? group.recipients.bcc.join(', ') : 'None'}</dd></div>
     </dl></details>}
    </> : <p>Recipient details unavailable.</p>}
   </article>)}
  </section>
  {recovery && <div className="email-send-result__recovery">{recovery}</div>}
  {children && <div className="email-send-result__children">{children}</div>}
 </section>;
}
