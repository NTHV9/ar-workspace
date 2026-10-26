export interface CreateExitReference {commandKey:string;hotel:string;payloadDigest:string}
export interface VerifiedExitSnapshot {actorId:string;authSessionId:string;jobIds:string[];creates:CreateExitReference[]}
export type ExitEntry={version:1|2;exitCommandId?:string;actorId:string;authSessionId:string;queuedAt:number;state:'pending'}&({jobId:string}|CreateExitReference);
const KEY='ar-preparation-exit-v1:',MAX_ENTRIES=128,MAX_BYTES=48000,uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const valid=(e:ExitEntry)=>e&&Object.keys(e).sort().join(',')===(((e.version===2?'exitCommandId,':'')+('jobId'in e?'actorId,authSessionId,jobId,queuedAt,state,version':'actorId,authSessionId,commandKey,hotel,payloadDigest,queuedAt,state,version')).split(',').sort().join(','))&&[1,2].includes(e.version)&&(e.version===1||uuid.test(e.exitCommandId??''))&&uuid.test(e.actorId)&&uuid.test(e.authSessionId)&&Number.isSafeInteger(e.queuedAt)&&e.state==='pending'&&('jobId'in e?uuid.test(e.jobId):uuid.test(e.commandKey)&&['KAT','TSK','TLKL','WAKL','TLFO','TSAN'].includes(e.hotel)&&/^[0-9a-f]{64}$/.test(e.payloadDigest));
const identity=(e:ExitEntry)=>JSON.stringify([e.actorId,e.authSessionId,'jobId'in e?e.jobId:[e.commandKey,e.hotel,e.payloadDigest]]);
const entryKey=(e:ExitEntry)=>KEY+identity(e);
export function readExitOutbox(storage:Storage):ExitEntry[]{
 const entries:ExitEntry[]=[];let bytes=0;
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(KEY))continue;const raw=storage.getItem(key);if(raw===null)continue;bytes+=key.length+raw.length;if(bytes>MAX_BYTES||entries.length>=MAX_ENTRIES)throw Error('Temporary file cleanup metadata needs recovery.');const entry:ExitEntry=JSON.parse(raw);if(!valid(entry)||entryKey(entry)!==key)throw Error('Temporary file cleanup metadata needs recovery.');entries.push(entry);}
 return entries;
}
export function enqueueExactAbandon(storage:Storage,snapshot:VerifiedExitSnapshot):ExitEntry[]{
 if(snapshot.jobIds.length+snapshot.creates.length>42)throw Error('Preparation cleanup scope is too large.');
 const base={version:2 as const,actorId:snapshot.actorId,authSessionId:snapshot.authSessionId,queuedAt:Date.now(),state:'pending' as const};
 const additions:ExitEntry[]=[...new Set(snapshot.jobIds)].map(jobId=>({...base,exitCommandId:crypto.randomUUID(),jobId}));for(const create of snapshot.creates)additions.push({...base,exitCommandId:crypto.randomUUID(),commandKey:create.commandKey,hotel:create.hotel,payloadDigest:create.payloadDigest});
 if(additions.some(e=>!valid(e)))throw Error('Preparation cleanup identity could not be verified.');
 const entries=readExitOutbox(storage);const fresh=additions.filter(e=>!entries.some(saved=>identity(e)===identity(saved)));if(entries.length+fresh.length>MAX_ENTRIES||[...entries,...fresh].reduce((n,e)=>n+entryKey(e).length+JSON.stringify(e).length,0)>MAX_BYTES)throw Error('Temporary cleanup is pending. Retry leaving before starting more preparations.');
 // Exact-entry keys avoid another tab overwriting unresolved work or receipts.
 for(const entry of fresh)storage.setItem(entryKey(entry),JSON.stringify(entry));return additions.map(e=>entries.find(saved=>identity(e)===identity(saved))??e);
}
export function acknowledgeExitEntry(storage:Storage,entry:ExitEntry,receipt:{job?:{id:string};outcome?:string;commandKey?:string;hotel?:string;payloadDigest?:string},auth:{actorId:string;authSessionId:string},getAuth:()=>{actorId:string;authSessionId:string}|null):boolean{
 try{if(auth.actorId!==entry.actorId)return false;
  if('jobId'in entry){if(receipt.job?.id!==entry.jobId||!['discarded','pending','protected'].includes(receipt.outcome??''))return false;}
  else if(receipt.commandKey!==entry.commandKey||receipt.hotel!==entry.hotel||receipt.payloadDigest!==entry.payloadDigest||!['discarded','pending','protected','cancelled'].includes(receipt.outcome??'')||receipt.outcome!=='cancelled'&&!uuid.test(receipt.job?.id??''))return false;
  const now=getAuth();if(!now||now.actorId!==auth.actorId||now.authSessionId!==auth.authSessionId)return false;
  const saved=storage.getItem(entryKey(entry));if(saved!==null&&saved!==JSON.stringify(entry))return false;
  if('commandKey'in entry&&typeof sessionStorage!=='undefined'){
   const exactKeys:string[]=[];for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(key?.startsWith('ar-document-command:')&&sessionStorage.getItem(key)===entry.commandKey)exactKeys.push(key);}for(const key of exactKeys)sessionStorage.removeItem(key);
  }
  storage.removeItem(entryKey(entry));return true;
 }catch{return false;}
}
/** Only current authorization transports fixed-path idempotent abandon. No unload signal. */
export async function deliverExitEntry(storage:Storage,entry:ExitEntry,getAuth:()=>{actorId:string;authSessionId:string;token:string}|null,transport:typeof fetch=fetch):Promise<boolean>{
 const auth=getAuth();if(!auth||auth.actorId!==entry.actorId||!auth.token)return false;
 const path='jobId'in entry?`/api/documents/${entry.jobId}/abandon`:`/api/documents/commands/${entry.commandKey}/abandon`;
 try{
  const response=await transport(path,{method:'POST',headers:{...(entry.version===2?{'X-AR-Exit-Command':entry.exitCommandId!,'X-AR-Exit-Origin-Session':entry.authSessionId}:{}),Authorization:`Bearer ${auth.token}`,...'jobId'in entry?{}:{'Content-Type':'application/json'}},...'jobId'in entry?{}:{body:JSON.stringify({hotel:entry.hotel,payloadDigest:entry.payloadDigest})},keepalive:true,redirect:'error'});
  if(!response.ok)return false;const receipt=await response.json() as {job?:{id:string};outcome?:string;commandKey?:string;hotel?:string;payloadDigest?:string};
  return acknowledgeExitEntry(storage,entry,receipt,auth,getAuth);
 }catch{return false;}
}
export async function reconcileExitOutbox(storage:Storage,actorId:string,getAuth:()=>{actorId:string;authSessionId:string;token:string}|null,expectedOwner?:string){
 for(const entry of readExitOutbox(storage).filter(e=>e.actorId===actorId)){
  if('jobId'in entry)try{const auth=getAuth();if(!auth||auth.actorId!==actorId)continue;const response=await fetch(`/api/documents/${entry.jobId}`,{headers:{Authorization:`Bearer ${auth.token}`},redirect:'error'});if(!response.ok)continue;const job=await response.json() as {id:string;owner:string;lifecycle:string};const now=getAuth();if(!now||now.actorId!==auth.actorId||now.authSessionId!==auth.authSessionId||job.id!==entry.jobId||job.lifecycle!=='transient'||expectedOwner&&job.owner!==expectedOwner)continue;}catch{continue;}
  await deliverExitEntry(storage,entry,getAuth);
 }
}
