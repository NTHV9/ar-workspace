import {gmailToken} from '../email/oauth';
import {googleJson,type EmailEnv} from '../email/shared';
import {backendRpc} from '../refresh/backend';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export function recoveryWindow(u:URL,now=Date.now()){
 const from=u.searchParams.get('from')??'',to=u.searchParams.get('to')??'',page=u.searchParams.get('pageToken')??'';
 if(!/^\d{4}-\d{2}-\d{2}T/.test(from)||!/^\d{4}-\d{2}-\d{2}T/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(from)>=Date.parse(to)||Date.parse(to)-Date.parse(from)>31*86400000||Date.parse(to)>now+300000||page.length>2000||/[\r\n\x00-\x1f]/.test(page))throw Error('operations_invalid');
 return {from,to,page};
}
export function recoveryMarker(raw:unknown):{deliveryId:string|null;gmailId:string;sentAt:string;conflict:boolean}|null{
 if(!raw||typeof raw!=='object')throw Error('recovery_unavailable');const m=raw as {id?:unknown;internalDate?:unknown;labelIds?:unknown;payload?:{headers?:{name?:unknown;value?:unknown}[]}};
 if(typeof m.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(m.id)||typeof m.internalDate!=='string'||!/^\d{1,15}$/.test(m.internalDate)||!Array.isArray(m.labelIds)||!m.labelIds.includes('SENT')||!Array.isArray(m.payload?.headers))throw Error('recovery_unavailable');
 const field=(name:string)=>m.payload!.headers!.filter(h=>typeof h.name==='string'&&h.name.toLowerCase()===name).map(h=>h.value);
 const custom=field('x-ar-delivery-id'),standard=field('message-id'),rawId=standard.length===1&&typeof standard[0]==='string'?/^<([0-9a-f-]{36})@ar-workspace\.ar-c82\.workers\.dev>$/.exec(standard[0])?.[1]:undefined;
 if(!custom.length&&!rawId)return null;
 const customId=custom.length===1&&typeof custom[0]==='string'&&uuid.test(custom[0])?custom[0]:null;
 const conflict=custom.length>1||custom.length===1&&!customId||!!(customId&&rawId&&customId!==rawId);
 const date=Number(m.internalDate);if(!Number.isSafeInteger(date)||!Number.isFinite(new Date(date).getTime()))throw Error('recovery_unavailable');
 return {deliveryId:conflict?null:customId??rawId??null,gmailId:m.id,sentAt:new Date(date).toISOString(),conflict};
}
/** Metadata-only SENT audit. It never sends, recreates drafts or marks invoices paid. */
export async function recoverySentPage(env:EmailEnv,actor:string,u:URL){
 const window=recoveryWindow(u),token=await gmailToken(env,actor),headers={Authorization:'Bearer '+token};
 const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers});if(typeof profile.emailAddress!=='string'||profile.emailAddress.toLowerCase()!=='ar@katathani.com')throw Error('recovery_identity_mismatch');
 const query=new URLSearchParams({q:`in:sent after:${Math.floor(Date.parse(window.from)/1000)-1} before:${Math.ceil(Date.parse(window.to)/1000)}`,maxResults:'25',...(window.page?{pageToken:window.page}:{})});
 const list=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+query,{headers});
 if(list.messages!==undefined&&!Array.isArray(list.messages)||list.nextPageToken!==undefined&&typeof list.nextPageToken!=='string')throw Error('recovery_unavailable');
 if(list.nextPageToken===window.page&&window.page||typeof list.nextPageToken==='string'&&list.nextPageToken.length>2000)throw Error('recovery_unavailable');
 const ids=(list.messages??[]) as {id?:unknown}[];if(ids.length>25||new Set(ids.map(m=>m.id)).size!==ids.length||ids.some(m=>typeof m.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(m.id)))throw Error('recovery_unavailable');
 const matches:NonNullable<ReturnType<typeof recoveryMarker>>[]=[];
 for(let i=0;i<ids.length;i+=4){
  const batch=await Promise.all(ids.slice(i,i+4).map(async m=>{
   const q=new URLSearchParams({format:'metadata',fields:'id,internalDate,labelIds,payload(headers)'});q.append('metadataHeaders','X-AR-Delivery-ID');q.append('metadataHeaders','Message-ID');
   return recoveryMarker(await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?${q}`,{headers}));
  }));for(const value of batch)if(value&&Date.parse(value.sentAt)>=Date.parse(window.from)&&Date.parse(value.sentAt)<Date.parse(window.to))matches.push(value);
 }
 const correlated=matches.filter(m=>m.deliveryId!==null),known=await backendRpc<unknown>(env,'ar_recovery_sent_match',{p_actor:actor,p_rows:correlated});if(!Array.isArray(known))throw Error('recovery_unavailable');
 return {from:window.from,to:window.to,scanned:ids.length,rows:[...known,...matches.filter(m=>m.conflict).map(m=>({...m,state:'marker_conflict'}))],nextPageToken:list.nextPageToken??null,complete:!list.nextPageToken,scope:'sent_messages_with_ar_marker',writesPerformed:0};
}
