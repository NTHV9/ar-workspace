import type {EmailDeliveryView} from '../../worker/email/shared';

const reasons:Record<string,string>={
 message_recipients:'The Gmail recipients differ from the reviewed recipients. Review the existing sent message before recording history.',
 attachment_metadata:'Attachment names or sizes could not be matched to the reviewed files.',
 attachment_content:'Attachment contents could not be matched to the reviewed files.',
 message_body:'The message text differs from the reviewed message.',
 message_html:'The message formatting differs from the reviewed message.',
 gmail_receipt_missing:'Gmail no longer returns the recorded message. This does not confirm sending. Use Review existing sent message to verify a matching Sent email. Do not send again.',
 workflow_changed:'Invoice or account details changed before history could be recorded. Review the current account and check sent status again.',
 stage_policy_unverified:'Collection rules could not be confirmed for this message. Review the current rules and check sent status again.',
 history_recording_unavailable:'History could not be saved. Check sent status again to retry recording it.',
 no_sent_evidence:'No matching message has been found in Gmail Sent yet.',
 ambiguous_sent_match:'More than one possible sent message was found. Review the existing sent message to select the correct one.',
};
export function emailDeliveryStatus(delivery:EmailDeliveryView):{title:string;detail:string;tone:'success'|'draft'|'attention';reason?:string}{
 if(delivery.state==='sent'&&delivery.recorded)return {title:'Sent — history recorded',detail:'Gmail confirmed sending. Billing / collection history is recorded.',tone:'success'};
 if(delivery.gmailAccepted)return {title:'Sent — history needs attention',detail:'Gmail accepted this message for sending, but billing / collection history is not recorded. Do not resend.',tone:'attention',reason:reasons[delivery.reason??'']??'Check sent status again to retry history recording, or review the existing sent message.'};
 if(delivery.mode==='draft'&&delivery.state==='created')return {title:'Gmail draft — not sent',detail:'Saved in Gmail. No billing / collection history is recorded. Review & send now when ready.',tone:'draft'};
 return {title:'Send result unknown — do not resend',detail:'Sending has not been confirmed. Check sent status or review the existing sent message before taking another action.',tone:'attention',reason:reasons[delivery.reason??'']??'Your message and files are retained while the result is checked.'};
}

/** Retirement is durable for this exact delivery even when a late view omits it. */
export function retainRetirementProjection<T extends {id:string;preparationRetirement?:{accepted:boolean}}>(selected:T,...observed:(T|null|undefined)[]):T{
 return observed.some(value=>value?.id===selected.id&&value.preparationRetirement?.accepted)?{...selected,preparationRetirement:{accepted:true}}:selected;
}
