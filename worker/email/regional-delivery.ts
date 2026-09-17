import {phuketEmailEnabled} from '../../src/access/model';
import {backendRpc} from '../refresh/backend';
import type {EmailEnv,EmailDraft} from './shared';
/** Mailbox routing is intentionally closed for Khao Lak until its separate mailbox is approved. */
export async function requireRegionalDelivery(env:EmailEnv,draft:Pick<EmailDraft,'id'|'hotel'>){
 if(!phuketEmailEnabled(draft.hotel))throw Error('email_region_disabled');
 if(env.REQUEST_ACCESS)await backendRpc(env,'ar_access_authorize',{p_actor:env.REQUEST_ACCESS.actorId,p_kind:'email',p_ref:draft.id,p_mail:true});
}
