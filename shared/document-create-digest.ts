export interface CreateDigestInput {hotel:string;accountId:string;ids:readonly string[];content:string;layout:string;purpose:string;statementSource?:string}
/** Versioned, UTF-8 length-prefixed fields; order and all user whitespace are binding. */
export async function documentCreateDigest(input:CreateDigestInput):Promise<string>{
 const fields=['ar-document-create-v1',input.hotel,input.accountId,String(input.ids.length),...input.ids,input.content,input.layout,input.purpose,input.statementSource??(input.content==='invoices'?'native':'workspace')];
 const encoder=new TextEncoder(),canonical=fields.map(value=>`${encoder.encode(value).length}:${value}`).join('');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
