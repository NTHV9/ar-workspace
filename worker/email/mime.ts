import {base64} from './crypto';
import {parseEmailDraft,type EmailInput} from './validation';
import {richHtml} from '../../src/email/rich-message';
export interface MailFile {name:string;mime:string;bytes:Uint8Array}
const lines=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')??'';
export function encodedHeader(text:string){
 if(/[\r\n]/.test(text))throw Error('email_invalid');
 const words:string[]=[];let part='';
 for(const char of text){if(new TextEncoder().encode(part+char).length>42){words.push('=?UTF-8?B?'+base64(new TextEncoder().encode(part))+'?=');part='';}part+=char;}
 if(part)words.push('=?UTF-8?B?'+base64(new TextEncoder().encode(part))+'?=');return words.join('\r\n ');
}
export function buildMime(input:EmailInput,files:MailFile[],messageId:string):Uint8Array{
 const v=parseEmailDraft(input);if(!/^<[0-9a-f-]{36}@ar-workspace\.ar-c82\.workers\.dev>$/.test(messageId))throw Error('email_invalid');
 const boundary='ar_'+crypto.randomUUID();
 const headers=['From: ar@katathani.com',...(['to','cc','bcc'] as const).filter(f=>v.recipients[f].length).map(f=>`${f}: ${v.recipients[f].join(',\r\n ')}`),'Subject: '+encodedHeader(v.subject),'Message-ID: '+messageId,'X-AR-Delivery-ID: '+messageId.slice(1).split('@')[0],'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`];
 const parts=[headers.join('\r\n'),'','--'+boundary];
 const alternative='alt_'+crypto.randomUUID();
 if(v.richBody)parts.push(`Content-Type: multipart/alternative; boundary="${alternative}"`,'','--'+alternative);
 parts.push('Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',lines(base64(new TextEncoder().encode(v.body))));
 if(v.richBody)parts.push('--'+alternative,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',lines(base64(new TextEncoder().encode(richHtml(v.richBody)))),'--'+alternative+'--');
 for(const f of files){if(!f.name||f.name.length>200||/[\r\n\x00-\x1f/\\]/.test(f.name)||!['application/pdf','image/png','image/jpeg'].includes(f.mime))throw Error('email_attachment_invalid');
  parts.push('--'+boundary,`Content-Type: ${f.mime}`,`Content-Disposition: attachment; filename="${f.name.replace(/[^A-Za-z0-9._ -]/g,'_')}";`," filename*=UTF-8''"+encodeURIComponent(f.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),'Content-Transfer-Encoding: base64','',lines(base64(f.bytes)));
 }
 parts.push('--'+boundary+'--','');return new TextEncoder().encode(parts.join('\r\n'));
}
