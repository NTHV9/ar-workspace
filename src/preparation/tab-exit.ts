import {createContext,useContext} from 'react';
import type {DocumentJob} from '../../worker/documents/jobs';
import {documentCreateDigest,type CreateDigestInput} from '../../shared/document-create-digest';
import {enqueueExactAbandon,deliverExitEntry,acknowledgeExitEntry,reconcileExitOutbox,readExitOutbox,type VerifiedExitSnapshot,type CreateExitReference,type ExitEntry} from './exit-outbox';
export function attachTabExit(target:Window,onExit:()=>void){
 // Unsupported/ambiguous departures preserve work. Any PageSwap suppresses close.
 if(!('onpageswap'in target))return ()=>{};
 let swapped=false,departed=false;
 const swap=()=>{swapped=true;};const show=()=>{swapped=false;departed=false;};
 const hide=(event:PageTransitionEvent)=>{if(event.persisted||swapped||departed)return;departed=true;onExit();};
 target.addEventListener('pageswap',swap);target.addEventListener('pageshow',show);target.addEventListener('pagehide',hide);
 return ()=>{target.removeEventListener('pageswap',swap);target.removeEventListener('pageshow',show);target.removeEventListener('pagehide',hide);};
}
export function authSessionId(token:string):string|null{try{const value=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).session_id;return typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)?value:null;}catch{return null;}}
export function createPreparationExit(actorId:string,sessionId:string,workspaceOwner:string,storage:Storage,getAuth:()=>{actorId:string;authSessionId:string;token:string}|null){
 let initial:ReturnType<typeof readExitOutbox>=[];try{initial=readExitOutbox(storage).filter(e=>e.actorId===actorId);}catch{/* Isolate recovery errors to preparation routes; unrelated work continues. */}
 const blockedJobs=new Set(initial.flatMap(e=>'jobId'in e?[e.jobId]:[])),blockedCommands=new Set(initial.flatMap(e=>'commandKey'in e?[e.commandKey]:[]));
 const directEntries=new Map<string,{entry:ExitEntry;auth:{actorId:string;authSessionId:string}}>();
 const jobs=new Set<string>(),settledJobs=new Set<string>(),creates=new Map<string,CreateExitReference>();const acceptedCreates=new Set<string>();let departed=false;
 const current=()=>{const auth=getAuth();return !departed&&auth?.actorId===actorId&&auth.authSessionId===sessionId;};
 const snapshot=():VerifiedExitSnapshot=>({actorId,authSessionId:sessionId,jobIds:[...jobs],creates:[...creates.values()]});
 return {
  current,hasCreates:()=>creates.size>0,
  retainJob(job:DocumentJob){if(!current())throw Error('The current preparation session changed.');if(job.owner!==workspaceOwner)throw Error('Document identity could not be verified.');if(job.preparation_retirement?.accepted){settledJobs.add(job.id);jobs.delete(job.id);return;}if(settledJobs.has(job.id))return;if(job.lifecycle==='transient'&&!job.closed_at){if(jobs.size>=21&&!jobs.has(job.id))throw Error('Preparation cleanup scope is full.');jobs.add(job.id);}},
  async retainCreate(input:CreateDigestInput&{commandKey:string},alreadyDispatched=false){if(!current())throw Error('The current preparation session changed.');const payloadDigest=await documentCreateDigest(input);if(!current())throw Error('The current preparation session changed.');if(acceptedCreates.has(input.commandKey)||!alreadyDispatched&&(blockedCommands.has(input.commandKey)||readExitOutbox(storage).some(e=>e.actorId===actorId&&'commandKey'in e&&e.commandKey===input.commandKey))){await reconcileExitOutbox(storage,actorId,getAuth,workspaceOwner);throw Error('This preparation was exited. Start a new preparation.');}if(creates.size>=21&&!creates.has(input.commandKey))throw Error('Preparation cleanup scope is full.');creates.set(input.commandKey,{commandKey:input.commandKey,hotel:input.hotel,payloadDigest});},
  created(commandKey:string,job:DocumentJob){if(settledJobs.has(job.id)||!current()||acceptedCreates.has(commandKey))throw Error('The current preparation session changed.');if(job.owner!==workspaceOwner)throw Error('Document identity could not be verified.');if(job.preparation_retirement?.accepted){settledJobs.add(job.id);jobs.delete(job.id);}else if(job.lifecycle==='transient'&&!job.closed_at){if(jobs.size>=21&&!jobs.has(job.id))throw Error('Preparation cleanup scope is full.');jobs.add(job.id);}creates.delete(commandKey);},
  async abandonCreates(commandKeys:readonly string[]=[...creates.keys()]){if(!current())return false;const wanted=[...new Set(commandKeys)];if(wanted.some(key=>!creates.has(key)&&!acceptedCreates.has(key)))return false;const entries=enqueueExactAbandon(storage,{actorId,authSessionId:sessionId,jobIds:[],creates:wanted.flatMap(key=>creates.has(key)?[creates.get(key)!]:[])});for(const entry of entries){if(!await deliverExitEntry(storage,entry,getAuth))return false;if('commandKey'in entry){acceptedCreates.add(entry.commandKey);creates.delete(entry.commandKey);}}return current();},
  exitHeaders(jobId:string):Record<string,string>{if(!current())throw Error('The current preparation session changed.');const [entry]=enqueueExactAbandon(storage,{actorId,authSessionId:sessionId,jobIds:[jobId],creates:[]});directEntries.set(jobId,{entry,auth:{actorId,authSessionId:sessionId}});return entry.version===2?{'X-AR-Exit-Command':entry.exitCommandId!,'X-AR-Exit-Origin-Session':entry.authSessionId}:{};},
  settled(jobId:string,receipt?:{job?:{id:string};outcome?:string}){if(receipt){const direct=directEntries.get(jobId);if(!direct||!acknowledgeExitEntry(storage,direct.entry,receipt,direct.auth,getAuth))return false;directEntries.delete(jobId);}settledJobs.add(jobId);jobs.delete(jobId);return true;},
  isSettled:(jobId:string)=>settledJobs.has(jobId),
  clear(){jobs.clear();},
  async beforeResume(jobId:string){if(!current())throw Error('The current preparation session changed.');if(settledJobs.has(jobId)||blockedJobs.has(jobId)||readExitOutbox(storage).some(e=>e.actorId===actorId&&'jobId'in e&&e.jobId===jobId)){await reconcileExitOutbox(storage,actorId,getAuth,workspaceOwner);throw Error('Temporary cleanup was requested for this preparation. Return to the account to start a new preparation.');}},
  exit(){if(!current())return;const entries=enqueueExactAbandon(storage,snapshot());departed=true;for(const entry of entries)void deliverExitEntry(storage,entry,getAuth);},
  reconcile:()=>reconcileExitOutbox(storage,actorId,getAuth,workspaceOwner),
 };
}
export type PreparationExit=ReturnType<typeof createPreparationExit>;
export const PreparationExitContext=createContext<PreparationExit|null>(null);
export const usePreparationExit=()=>useContext(PreparationExitContext);
/** Confirmed history is never changed by cleanup failure. Read exact closed Sent first. */
export async function afterConfirmedSent(jobIds:readonly string[],delivery:{state:string;recorded?:boolean;mode?:string;preparationRetirement?:{accepted:boolean}}|null|undefined,getToken:()=>string,canContinue:()=>boolean,transport:typeof fetch=fetch){
 if(delivery?.preparationRetirement?.accepted)return;
 if(delivery?.state!=='sent'||delivery.recorded!==true||delivery.mode==='test')return;
 for(const id of new Set(jobIds))try{if(!canContinue())return;const token=getToken();const response=await transport(`/api/documents/${id}`,{headers:{Authorization:`Bearer ${token}`},redirect:'error'});if(!response.ok)continue;const job=await response.json() as DocumentJob;if(!canContinue()||getToken()!==token||job.id!==id||job.lifecycle!=='transient'||!job.closed_at||job.closed_reason!=='sent')continue;await transport(`/api/documents/${id}/abandon`,{method:'POST',headers:{Authorization:`Bearer ${getToken()}`},keepalive:true,redirect:'error'});}catch{/* Durable maintenance owns bounded remaining bytes. */}
}
