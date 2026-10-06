import {backendRpc} from '../refresh/backend';
import type {TrackerEnv} from './service';
import type {RegionId} from '../../src/domain/hotels';
import {parseTrackerConflictQuery} from './conflict-query';
import {trackerConflictCategories as conflictCategories,trackerConflictCategory,type TrackerConflictCategory as Category} from '../../src/domain/tracker-conflicts';
interface Cursor {v:1;actor:string;region:RegionId;category:Category;createdAt:string;id:string}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const invalid=():never=>{throw Error('tracker_invalid');};
function exactTimestamp(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value))return false;
 const [year,month,day,hour,minute,second]=[value.slice(0,4),value.slice(5,7),value.slice(8,10),value.slice(11,13),value.slice(14,16),value.slice(17,19)].map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60;
}
const b64=(s:string)=>btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function mac(env:TrackerEnv,text:string){if(!env.SUPABASE_SECRET_KEY)throw Error('tracker_unavailable');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SUPABASE_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('ar-tracker-conflict-page-v1:'+text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function encode(env:TrackerEnv,cursor:Cursor){const payload=b64(JSON.stringify(cursor));return payload+'.'+await mac(env,payload);}
async function decode(env:TrackerEnv,raw:string,actor:string,region:RegionId,category:Category){
 if(raw.length>800||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(raw))invalid();const [payload,signature]=raw.split('.'),expected=await mac(env,payload);let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^expected.charCodeAt(i);if(diff)invalid();
 let c:Cursor;try{c=JSON.parse(atob(payload.replaceAll('-','+').replaceAll('_','/'))) as Cursor;}catch{return invalid();}
 if(!c||Object.keys(c).sort().join(',')!=='actor,category,createdAt,id,region,v'||c.v!==1||c.actor!==actor||c.region!==region||c.category!==category||!exactTimestamp(c.createdAt)||typeof c.id!=='string'||!uuid.test(c.id))invalid();return c;
}
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
/** Called after normal session/region verification. SQL independently authorizes
 * current actor; the signed cursor carries position, never access authority. */
export async function trackerConflictsApi(request:Request,env:TrackerEnv,owner:string){
 const actor=env.REQUEST_ACTOR??owner;if(!actor)return json({error:'unauthorized'},401);if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const {region,category,cursor:rawCursor}=parseTrackerConflictQuery(new URL(request.url));
  if(env.REQUEST_ACCESS&&!env.REQUEST_ACCESS.regions.includes(region as RegionId))return json({error:'tracker_forbidden'},403);
  const cursor=rawCursor!==null?await decode(env,rawCursor,actor,region,category):null;
  const result=await backendRpc<Record<string,unknown>>(env,'ar_tracker_conflicts_page',{p_actor:actor,p_region:region,p_category:category,p_after_created_at:cursor?.createdAt??null,p_after_id:cursor?.id??null});
  if(result?.error==='tracker_forbidden')return json({error:'tracker_forbidden'},403);if(result?.error==='tracker_invalid')invalid();
  const rows=result?.rows as Record<string,unknown>[]|undefined,counts=result?.counts as Record<string,unknown>|undefined,next=result?.next as {createdAt?:unknown;id?:unknown}|null;
  if(result?.region!==region||result.category!==category||!Array.isArray(rows)||rows.length>50||new Set(rows.map(r=>r.id)).size!==rows.length||!counts||conflictCategories.some(c=>!Number.isSafeInteger(counts[c])||Number(counts[c])<0)||next!==null&&(!next||!exactTimestamp(next.createdAt)||typeof next.id!=='string'||!uuid.test(next.id)||rows.length!==50))throw Error('tracker_unavailable');
  if(rows.some(r=>typeof r.id!=='string'||!uuid.test(r.id)||typeof r.rowKey!=='string'||typeof r.field!=='string'||typeof r.reason!=='string'||!Number.isSafeInteger(r.revision)||Number(r.revision)<1||!exactTimestamp(r.createdAt)))throw Error('tracker_unavailable');
  if(counts.all!==Number(counts.dates)+Number(counts.references)+Number(counts.identity)+Number(counts.other))throw Error('tracker_unavailable');
  if(rows.length>Number(counts[category])||rows.some(r=>category!=='all'&&trackerConflictCategory(String(r.field))!==category))throw Error('tracker_unavailable');
  for(let i=0;i<rows.length;i++){const prior=i?rows[i-1]:cursor;if(prior&&(String(rows[i].createdAt)<String(prior.createdAt)||rows[i].createdAt===prior.createdAt&&String(rows[i].id)<=String(prior.id)))throw Error('tracker_unavailable');}
  if(next&&(next.createdAt!==rows.at(-1)?.createdAt||next.id!==rows.at(-1)?.id))throw Error('tracker_unavailable');
  return json({region,category,counts,rows,nextCursor:next?await encode(env,{v:1,actor,region:region as RegionId,category:category as Category,createdAt:next.createdAt as string,id:next.id as string}):null});
 }catch(error){const code=error instanceof Error&&error.message==='tracker_invalid'?'tracker_invalid':'tracker_unavailable';return json({error:code},code==='tracker_invalid'?400:503);}
}
