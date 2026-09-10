import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
export type ExternalBillingInput={commandId:string;action:'record'|'correct'|'void'|'restore';hotel:'KAT'|'TSK';accountId:string;recordId?:string;revision?:number;actualDate?:string;channel?:'system'|'external_email';reference?:string;note?:string;amount?:string|null;lines?:{invoiceId:string;revision:number}[];reason?:string};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const invalid=():never=>{throw Error('billing_invalid');};
export function parseExternalBilling(value:unknown):ExternalBillingInput{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as Record<string,unknown>;
 const allowed=['commandId','action','hotel','accountId','recordId','revision','actualDate','channel','reference','note','amount','lines','reason'];if(Object.keys(v).some(k=>!allowed.includes(k)))return invalid();
 const text=(x:unknown,max:number,min=1)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x);
 if(typeof v.commandId!=='string'||!uuid.test(v.commandId)||!['record','correct','void','restore'].includes(String(v.action))||!['KAT','TSK'].includes(String(v.hotel))||!text(v.accountId,200))return invalid();
 if(v.action==='record'){
  if(v.recordId!==undefined||v.revision!==undefined||!Array.isArray(v.lines)||!v.lines.length||v.lines.length>200)return invalid();
  const seen=new Set<string>();for(const raw of v.lines){if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid();const line=raw as Record<string,unknown>;if(Object.keys(line).some(k=>!['invoiceId','revision'].includes(k))||!text(line.invoiceId,200)||!Number.isSafeInteger(line.revision)||Number(line.revision)<0||seen.has(String(line.invoiceId)))return invalid();seen.add(String(line.invoiceId));}
 }else if(typeof v.recordId!=='string'||!uuid.test(v.recordId)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||v.lines!==undefined||!text(v.reason,2000))return invalid();
 if(v.action==='record'||v.action==='correct'){
  if(typeof v.actualDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.actualDate)||v.actualDate.startsWith('0000')||!Number.isFinite(Date.parse(v.actualDate))||new Date(v.actualDate+'T00:00:00Z').toISOString().slice(0,10)!==v.actualDate||!['system','external_email'].includes(String(v.channel))||!text(v.reference,1000)||!text(v.note,2000,0)||!(v.amount===null||typeof v.amount==='string'&&/^(0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(v.amount)))return invalid();
 }
 return v as ExternalBillingInput;
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function externalBillingApi(request:Request,env:RefreshEnv,actor:string){
 try{
  if(!uuid.test(actor))return json({error:'billing_forbidden'},403);const url=new URL(request.url);let result:Record<string,unknown>;
  const historyPath=/^\/api\/external-billing\/([0-9a-f-]{36})\/history$/.exec(url.pathname);
  if(request.method==='GET'&&historyPath){const page=Number(url.searchParams.get('page')??0);if(!uuid.test(historyPath[1])||!Number.isSafeInteger(page)||page<0||page>1000000)return invalid();result=await backendRpc(env,'ar_external_billing_history',{p_actor:actor,p_id:historyPath[1],p_offset:page*20,p_limit:20});
  }else if(request.method==='GET'&&url.pathname==='/api/external-billing'){
   const q=url.searchParams;for(const key of q.keys())if(!['hotel','account','type','from','to','page'].includes(key)||q.getAll(key).length!==1)return invalid();
   const type=q.get('type');if(type&&(type.length>200||/[\x00-\x1f\x7f]/.test(type)))return invalid();
   const hotel=q.get('hotel'),account=q.get('account'),from=q.get('from'),to=q.get('to'),page=Number(q.get('page')??0);
   const date=(v:string|null)=>v===null||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
   if(hotel&&!['KAT','TSK'].includes(hotel)||account&&(!hotel||account.length>200)||!date(from)||!date(to)||from&&to&&from>to||!Number.isSafeInteger(page)||page<0||page>1000000)return invalid();
   result=await backendRpc(env,'ar_external_billing_read',{p_actor:actor,p_hotel:hotel,p_account:account,p_from:from,p_to:to,p_offset:page*50,p_limit:50,p_type:type});
  }else if(request.method==='POST'&&['/api/external-billing/preview','/api/external-billing/confirm'].includes(url.pathname)){
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'billing_forbidden'},403);
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return invalid();let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,65536)));}catch{return invalid();}
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid();const body=raw as Record<string,unknown>;if(Object.keys(body).some(k=>!['input','digest'].includes(k)))return invalid();const input=parseExternalBilling(body.input);
   if(url.pathname.endsWith('/confirm')){if(typeof body.digest!=='string'||!/^[0-9a-f]{64}$/.test(body.digest))return invalid();result=await backendRpc(env,'ar_external_billing_save',{p_actor:actor,p_input:input,p_digest:body.digest});}
   else result=await backendRpc(env,'ar_external_billing_preview',{p_actor:actor,p_input:input});
  }else return json({error:'method_not_allowed'},405);
  if(!result||typeof result!=='object')throw Error('billing_unavailable');if(typeof result.error==='string')throw Error(/^billing_[a-z_]+$/.test(result.error)?result.error:'billing_unavailable');return json(result);
 }catch(e){const code=e instanceof Error&&/^billing_[a-z_]+$/.test(e.message)?e.message:'billing_unavailable';return json({error:code},code==='billing_unavailable'?503:/conflict|pending|changed/.test(code)?409:/forbidden/.test(code)?403:/missing/.test(code)?404:400);}
}
