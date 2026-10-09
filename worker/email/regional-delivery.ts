import {hotelMailbox} from '../../src/domain/mailboxes';
import {backendRpc} from '../refresh/backend';
import type {EmailEnv,EmailDraft} from './shared';
/** Business routing follows the server-loaded hotel. */
export async function requireRegionalDelivery(env:EmailEnv,draft:Pick<EmailDraft,'id'|'hotel'|'owner'>){
 hotelMailbox(draft.hotel);
 if(env.REQUEST_ACCESS)await backendRpc(env,'ar_access_authorize',{p_actor:env.REQUEST_ACCESS.actorId,p_kind:'email',p_ref:draft.id,p_mail:true});
 const result=await backendRpc<{allowed?:boolean;error?:string}>(env,'ar_email_business_preflight',{p_actor:draft.owner,p_draft:draft.id});
 if(result?.error==='account_balance_only'||result?.error==='email_forbidden'||result?.error==='email_missing')throw Error(result.error);
 if(result?.allowed!==true)throw Error('email_unavailable');
}
