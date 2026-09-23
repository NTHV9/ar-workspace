import {hotelName,isHotelId} from '../domain/hotels';
export interface EmailSignature {staffId:string;name:string;title:string;workplace:string}
export interface SignatureProfile {revision:number;enabled:boolean;signature:EmailSignature}
export const signatureLogoId='katathani-signature-logo';
export const signatureLogoPath='/email-signature-logo.png';
export function signatureWorkplace(hotel:string){if(!isHotelId(hotel))throw Error('signature_hotel_unavailable');return hotelName(hotel);}
const links=[['PHUKET','www.theshorephuket.com','www.katathani.com'],['KHAO LAK','www.thelittleshorekhaolak.com','www.thesandskhaolak.com','www.thewaterskhaolak.com','www.theleafresort.com'],['CHIANG RAI','www.theriverie.com']];
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function parseSignature(value:unknown):EmailSignature{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('signature_invalid');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['staffId','name','title','workplace'].includes(k))||typeof v.staffId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.staffId))throw Error('signature_invalid');
 const text=(key:string,max:number)=>{const s=v[key];if(typeof s!=='string'||s.length>max||new TextDecoder().decode(new TextEncoder().encode(s))!==s||/[\u0000-\u001f\u007f]/.test(s))throw Error('signature_invalid');return s.trim();};
 return {staffId:v.staffId,name:text('name',100),title:text('title',100),workplace:text('workplace',200)};
}
export function signatureText(value:EmailSignature){const s=parseSignature(value);return [[s.name,s.title,s.workplace].filter(Boolean).join(' | '),'KATATHANI Collection of Resorts',...links.map(([region,...urls])=>region+': '+urls.join(', '))].filter(Boolean).join('\n');}
export function signatureHtml(value:EmailSignature,preview=false){
 const s=parseSignature(value),heading=[s.name,s.title,s.workplace].filter(Boolean).map(escape).join(' | ');
 return `<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#8a4908"><img src="${preview?signatureLogoPath:'cid:'+signatureLogoId}" alt="Katathani Collection" width="88" height="88" style="display:block;width:88px;height:88px;margin:0 0 16px;border:0">${heading?`<div><strong>${heading}</strong></div>`:''}<div><strong>KATATHANI Collection of Resorts</strong></div><div style="margin-top:12px">${links.map(([region,...urls])=>`<div>${region}: ${urls.map(url=>`<a href="https://${url}" style="color:#31579e">${url}</a>`).join(', ')}</div>`).join('')}</div></div>`;
}

export function parseSignatureProfile(value:unknown):SignatureProfile{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('signature_invalid');const v=value as Record<string,unknown>;
 if(!Number.isSafeInteger(v.revision)||Number(v.revision)<0||typeof v.enabled!=='boolean')throw Error('signature_invalid');
 return {revision:Number(v.revision),enabled:v.enabled,signature:parseSignature(v.signature)};
}
