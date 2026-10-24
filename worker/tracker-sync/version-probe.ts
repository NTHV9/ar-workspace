import {isRegionId,type RegionId} from '../../src/domain/hotels';
import {backendRpc} from '../refresh/backend';
import {writesHeld} from '../operations/write-hold';
import {readTrackerFileVersion} from './provider';
import {trackerFile} from './service';
import {dispatchTrackerWakes,type TrackerWatchEnv} from './watch';

/** Visible tabs request hints; a DB lease/cooldown shares provider probes across
 * tabs/users. XLSX uses metadata, native uses a bounded tracked-value projection.
 * Unchanged hints never enqueue a new full validated sheet read. */
export async function probeTrackerVersions(env:TrackerWatchEnv,owner:string,regions:readonly RegionId[]):Promise<void>{
 if(env.TRACKER_SYNC_ENABLED!=='true'||env.TRACKER_PUSH_ENABLED!=='true'||writesHeld(env)||regions.some(r=>!isRegionId(r)))return;
 await Promise.allSettled([...new Set(regions)].map(async region=>{
  const lock=crypto.randomUUID();let claimed=false;
  try{
   const claim=await backendRpc<{status:string;fileId?:string}>(env,'ar_tracker_probe_claim',{p_owner:owner,p_region:region,p_lock:lock});
   if(claim.status!=='claimed')return;claimed=true;
   if(!claim.fileId||claim.fileId!==trackerFile(env,region)||!/^[A-Za-z0-9_-]{20,200}$/.test(claim.fileId))throw Error('tracker_target_conflict');
   const version=await readTrackerFileVersion(env,owner,region,claim.fileId);
   if(!/^\d{1,30}$/.test(version))throw Error('tracker_provider_version_invalid');
   const result=await backendRpc<{status:string;id?:string}>(env,'ar_tracker_probe_finish',{p_region:region,p_lock:lock,p_version:version});
   claimed=false;
   if(result.status==='changed'||result.status==='unchanged'&&typeof result.id==='string')await dispatchTrackerWakes(env);
  }catch{
   if(claimed)try{await backendRpc(env,'ar_tracker_probe_finish',{p_region:region,p_lock:lock,p_version:null});}catch{/* Lease expiry and fallback keep failed hints recoverable. */}
  }
 }));
}
