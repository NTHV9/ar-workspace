import type {AcceptanceEnv} from './routing';
export async function assertAcceptanceRecipient(env:AcceptanceEnv,recipients:{to:string[];cc:string[];bcc:string[]}){
 if(!env.ACCEPTANCE)return;
 if(!Array.isArray(recipients.to)||recipients.to.length!==1||recipients.cc.length||recipients.bcc.length)throw Error('acceptance_recipient_not_authorized');
 const data=new TextEncoder().encode(JSON.stringify({to:[recipients.to[0].trim().toLowerCase()],cc:[],bcc:[]}));
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==env.ACCEPTANCE.recipientHash)throw Error('acceptance_recipient_not_authorized');
}
