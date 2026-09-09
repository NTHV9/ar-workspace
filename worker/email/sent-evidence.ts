import {hash,unbase64} from './crypto';
import type {Recipients} from '../settings/validation';
export interface ExpectedMail {messageId:string;gmailId?:string;recipients:Recipients;subject:string;body:string;files:{name:string;sha256:string;byte_count:number}[]}
interface Part {mimeType?:string;filename?:string;headers?:{name:string;value:string}[];parts?:Part[];body?:{data?:string;size?:number;attachmentId?:string}}
interface Message {id?:string;labelIds?:string[];internalDate?:string;payload?:Part}
export const decodeUrl64=(s:string)=>unbase64(s.replaceAll('-','+').replaceAll('_','/'));
const normalizedText=(s:string)=>s.replace(/\r\n?/g,'\n').replace(/\n+$/,'');
function addresses(value:string):string[]{
 if(!value.trim())return [];
 return (value.match(/(?:[^,"]|"[^"]*")+/g)??[]).map(s=>{const angle=/<([^<>]+)>/.exec(s);const address=(angle?angle[1]:s).trim().toLowerCase();if(!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address))throw Error();return address;}).sort();
}
function decodedHeader(value:string){return value.replace(/\?=\s+=\?/g,'?==?').replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi,(_,encoding:string,data:string)=>new TextDecoder().decode(encoding.toLowerCase()==='b'?unbase64(data):Uint8Array.from(data.replaceAll('_',' ').replace(/=([0-9a-f]{2})/gi,(_x,n:string)=>String.fromCharCode(parseInt(n,16))),c=>c.charCodeAt(0))));}
export async function verifySentEvidence(message:Message,expected:ExpectedMail,attachment:(id:string)=>Promise<Uint8Array>):Promise<{status:'verified'|'not_sent'|'review_required';sentAt?:string;reason?:string}>{
 if(!message.labelIds?.includes('SENT')||message.labelIds.includes('DRAFT'))return {status:'not_sent'};
 let check='message_labels';
 try{
  if(message.labelIds.includes('TRASH'))throw Error();
  check='message_time';const date=Number(message.internalDate);if(!Number.isSafeInteger(date)||date<1||date>Date.now()+300000||!message.id||!message.payload)throw Error();
  const header=(name:string)=>{const values=message.payload!.headers?.filter(h=>h.name.toLowerCase()===name.toLowerCase()).map(h=>h.value)??[];if(values.length>1)throw Error();return values[0]??'';};
  check='message_identity';const correlation=expected.messageId.slice(1).split('@')[0];
  const identity=expected.gmailId!==undefined?message.id===expected.gmailId:header('Message-ID').trim()===expected.messageId||(/^[0-9a-f-]{36}$/.test(correlation)&&header('X-AR-Delivery-ID').trim()===correlation);
  if(!identity||JSON.stringify(addresses(header('From')))!==JSON.stringify(['ar@katathani.com']))throw Error();
  check='message_recipients';for(const field of ['to','cc','bcc'] as const)if(JSON.stringify(addresses(header(field)))!==JSON.stringify(expected.recipients[field].map(s=>s.toLowerCase()).sort()))throw Error();
  check='message_subject';if(decodedHeader(header('Subject'))!==expected.subject)throw Error();
  check='message_parts';const leaves:Part[]=[];function visit(p:Part,depth=0){if(depth>12||leaves.length>100)throw Error();if(p.parts?.length){for(const child of p.parts)visit(child,depth+1);}else leaves.push(p);}visit(message.payload);
  const files=leaves.filter(p=>!!p.filename);if(files.length!==expected.files.length)throw Error();
  const matched=new Set<number>();for(const file of files){const index=expected.files.findIndex((f,i)=>!matched.has(i)&&f.name===file.filename&&f.byte_count===file.body?.size);if(index<0)throw Error();check='attachment_content';const data=file.body?.data?decodeUrl64(file.body.data):file.body?.attachmentId?await attachment(file.body.attachmentId):null;if(!data||data.length!==expected.files[index].byte_count||await hash(data)!==expected.files[index].sha256)throw Error();matched.add(index);}
  if(leaves.some(p=>!p.filename&&p.mimeType!=='text/plain'))throw Error();
  const plain=leaves.filter(p=>!p.filename&&p.mimeType==='text/plain');if(plain.length!==1||!plain[0].body?.data)throw Error();
  check='message_body';if(normalizedText(new TextDecoder().decode(decodeUrl64(plain[0].body.data)))!==normalizedText(expected.body))throw Error();
  return {status:'verified',sentAt:new Date(date).toISOString()};
 }catch{return {status:'review_required',reason:check};}
}
