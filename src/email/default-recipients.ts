import {hotelMailbox,mailboxSender} from '../domain/mailboxes';
import type {Recipients} from '../../worker/settings/validation';

/** Keep one visible copy to this hotel's AR mailbox, without changing account settings. */
export function defaultSelfCc(hotel:string,recipients:Recipients):Recipients {
 const sender=mailboxSender(hotelMailbox(hotel));
 const other=(address:string)=>address.trim().toLowerCase()!==sender;
 const result={to:recipients.to.filter(other),cc:[...recipients.cc.filter(other),sender],bcc:recipients.bcc.filter(other)};
 return (['to','cc','bcc'] as const).every(key=>result[key].length===recipients[key].length&&result[key].every((address,index)=>address===recipients[key][index]))?recipients:result;
}

/** Existing provider snapshots and blocked document packages must stay unchanged. */
export function initialEmailRecipients(draft:{hotel:string;recipients:Recipients;package_changed:boolean;gmail_handoff?:string|null;delivery?:unknown;document_closed_at?:string|null}):Recipients {
 if(draft.gmail_handoff||draft.delivery||draft.package_changed||draft.document_closed_at)return draft.recipients;
 return defaultSelfCc(draft.hotel,draft.recipients);
}
