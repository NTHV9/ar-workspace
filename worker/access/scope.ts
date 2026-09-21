import {hotelRegion,isHotelId,type HotelId} from '../../src/domain/hotels';
import {regionalHotelScope} from '../hotels';
import {boundedBody} from '../email/shared';
export type AccessKind='hotel'|'region'|'document'|'email'|'delivery'|'remittance'|'remittance_save'|'remittance_command'|'exception_command'|'billing'|'global';
export interface AccessIntent {kind:AccessKind;hotel?:HotelId;region?:string;ref?:string;mail?:boolean}
const denied=():never=>{throw Error('access_forbidden');};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resource=(kind:AccessKind,ref:string,mail=false):AccessIntent=>{if(!uuid.test(ref))return denied();return {kind,ref,mail};};
const hotel=(value:unknown):AccessIntent=>{if(!isHotelId(value))return denied();return {kind:'hotel',hotel:value,region:hotelRegion(value)};};
async function body(request:Request){
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return denied();
 try{const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request.clone() as Request,1024*1024)));if(!v||typeof v!=='object'||Array.isArray(v))return denied();return v as Record<string,unknown>;}catch{return denied();}
}
/** Explicit admission list. Adding an endpoint never grants regional users access by default. */
export async function requestAccessIntent(request:Request):Promise<AccessIntent>{
 const u=new URL(request.url),p=u.pathname,m=request.method,q=u.searchParams;
 if(!['GET','POST','PUT','DELETE'].includes(m))return denied();
 for(const key of ['region','hotel'])if(q.getAll(key).length>1)return denied();
 const regional=():AccessIntent=>{try{const s=regionalHotelScope(q);return s.hotel?hotel(s.hotel):{kind:'region',region:s.region};}catch{return denied();}};
 if(p==='/api/invoice-register'&&m==='GET'||p==='/api/invoice-register/visibility'&&m==='POST')return regional();
 const register=/^\/api\/invoice-register\/([^/]+)\/[^/]+\/[^/]+(\/history)?$/.exec(p);if(register&&(m==='GET'||m==='PUT'&&!register[2]))return hotel(decodeURIComponent(register[1]));
 if(m==='GET'&&/^\/api\/(reports\/(activity|current|options)|observations\/(daily_ar|balance_observations|timing|options))$/.test(p))return regional();
 if(m==='GET'&&['/api/portfolio','/api/collection-queue','/api/refresh','/api/external-billing','/api/financial/status','/api/financial/invoice_entries','/api/financial/payments','/api/financial/applications','/api/financial/coverage','/api/financial/options','/api/dashboard/balances','/api/dashboard/payment-invoices','/api/dashboard/invoice-entries','/api/dashboard/aging-invoices','/api/dashboard/hotel-overview','/api/remittances','/api/remittances/options'].includes(p))return regional();
 let match=/^\/api\/(accounts|account-settings)\/([^/]+)\/([^/]+)$/.exec(p);
 if(match&&isHotelId(match[2])&&(m==='GET'||match[1]==='account-settings'&&m==='PUT'))return hotel(match[2]);
 match=/^\/api\/invoice-history\/([^/]+)\/[^/]+\/[^/]+$/.exec(p);if(match&&m==='PUT')return hotel(match[1]);
 match=/^\/api\/account-workspace\/([^/]+)\/[^/]+\/(?:history|documents|email\/[0-9a-f-]{36}(?:\/thread)?)$/.exec(p);if(match&&m==='GET')return {...hotel(match[1]),...(p.endsWith('/thread')?{mail:true}:{})};
 match=/^\/api\/invoice-exceptions\/([^/]+)\/[^/]+\/[^/]+(\/history)?$/.exec(p);if(match&&(m==='GET'||m==='POST'&&!match[2]))return hotel(match[1]);
 if(p==='/api/remittances/invoices'&&m==='GET')return hotel(q.get('hotel'));
 if(m==='GET'&&(p==='/api/collection-policy'||p==='/api/email/templates'||/^\/api\/email\/templates\/[0-9a-f-]{36}(?:\/versions\/\d+)?$/.test(p)))return {kind:'global'};
 if(p==='/api/gmail/status'&&m==='GET')return {kind:'region',region:'phuket',mail:true};
 if(p==='/api/refresh'&&m==='POST'){const v=await body(request);const params=new URLSearchParams();if(typeof v.region==='string')params.set('region',v.region);if(typeof v.hotel==='string')params.set('hotel',v.hotel);try{const s=regionalHotelScope(params,v.accountId,true);return s.hotel?hotel(s.hotel):{kind:'region',region:s.region};}catch{return denied();}}
 if(m==='POST'&&['/api/documents','/api/remittances','/api/financial/refresh','/api/collection/validate-selection'].includes(p))return hotel((await body(request)).hotel);
 if(m==='POST'&&['/api/external-billing/preview','/api/external-billing/confirm'].includes(p)){const v=(await body(request)).input;if(!v||typeof v!=='object')return denied();const input=v as Record<string,unknown>;const scope=hotel(input.hotel);return input.recordId===undefined?scope:{...resource('billing',String(input.recordId)),hotel:scope.hotel};}
 if(p==='/api/email/open'&&m==='POST')return resource('document',String((await body(request)).jobId),true);
 match=/^\/api\/documents\/([0-9a-f-]{36})(?:\/(?:project|save|upload|files|exports|dispatch|review|discard)(?:\/[^/]+)?)?$/.exec(p);if(match)return resource('document',match[1]);
 match=/^\/api\/email\/deliveries\/([0-9a-f-]{36})\/(check|candidates|reviewed-match)$/.exec(p);if(match)return resource('delivery',match[1],true);
 match=/^\/api\/email\/([0-9a-f-]{36})(?:\/(send|gmail-draft|thread|threads|exports|attachments)(?:\/[^/]+)?)?$/.exec(p);if(match)return resource('email',match[1],true);
 match=/^\/api\/remittances\/commands\/([0-9a-f-]{36})$/.exec(p);if(match&&m==='GET'&&!q.size)return resource('remittance_command',match[1]);
 match=/^\/api\/remittances\/([0-9a-f-]{36})(?:\/(history|status|files)(?:\/[^/]+)?(?:\/restore)?)?$/.exec(p);if(match){if(m==='PUT'&&!match[2])return {...resource('remittance_save',match[1]),hotel:hotel((await body(request)).hotel).hotel};return resource('remittance',match[1]);}
 match=/^\/api\/invoice-exceptions\/commands\/([0-9a-f-]{36})$/.exec(p);if(match&&m==='GET'&&!q.size)return resource('exception_command',match[1]);
 match=/^\/api\/external-billing\/([0-9a-f-]{36})\/history$/.exec(p);if(match&&m==='GET')return {...resource('billing',match[1]),region:regional().region??hotelRegion(regional().hotel!)};
 return denied();
}
/** Response containment is defense in depth; binary files rely on their checked parent identity. */
export function containsOutsideHotel(value:unknown,hotels:readonly string[]):boolean {
 if(Array.isArray(value))return value.some(v=>containsOutsideHotel(v,hotels));
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 if(v.hotel!==undefined&&v.hotel!==null&&(!isHotelId(v.hotel)||!hotels.includes(v.hotel)))return true;
 for(const key of ['hotels','missingHotels','refreshingHotels','failedHotels'])if(Array.isArray(v[key])&&(v[key] as unknown[]).some(x=>typeof x==='string'&&!hotels.includes(x)))return true;
 return Object.values(v).some(x=>containsOutsideHotel(x,hotels));
}
