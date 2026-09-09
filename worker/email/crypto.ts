export function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
export const unbase64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const url64=(bytes:Uint8Array)=>base64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function hash(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export interface Cipher {iv:string;data:string}
async function key(hex:string){if(!/^[0-9a-f]{64}$/i.test(hex))throw Error('gmail_not_configured');return crypto.subtle.importKey('raw',Uint8Array.from(hex.match(/../g)!,s=>parseInt(s,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(secret:string,context:string,value:unknown):Promise<Cipher>{const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},await key(secret),new TextEncoder().encode(JSON.stringify(value)));return {iv:base64(iv),data:base64(new Uint8Array(data))};}
export async function unseal<T>(secret:string,context:string,value:Cipher):Promise<T>{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(value.iv),additionalData:new TextEncoder().encode(context)},await key(secret),unbase64(value.data));return JSON.parse(new TextDecoder().decode(bytes)) as T;}
