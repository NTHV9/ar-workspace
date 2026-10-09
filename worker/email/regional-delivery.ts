import {hotelMailbox} from '../../src/domain/mailboxes';
import {backendRpc} from '../refresh/backend';
import type {EmailEnv,EmailDraft} from './shared';
/** Business routing follows the server-loaded hotel. */
export async function requireRegionalDelivery(env:EmailEnv,draft:Pick<EmailDraft,'id'|'hotel'>){
 hotelMailbox(draft.hotel);
 if(env.REQUEST_ACCESS)await backendRpc(env,'ar_access_authorize',{p_actor:env.REQUEST_ACCESS.actorId,p_kind:'email',p_ref:draft.id,p_mail:true});
}
