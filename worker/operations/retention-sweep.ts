import {writesHeld} from './write-hold';
import {backendRpc} from '../refresh/backend';
import {enrollRetention,retentionStatus,runRetentionItem} from './retention';
import {retentionProviders,type RetentionProviderEnv} from './retention-providers';
export async function sweepRetention(env:RetentionProviderEnv){
 if(writesHeld(env))return {enabled:false,paused:true};
 if(env.RETENTION_ENABLED!=='true')return {enabled:false};
 const actor=await backendRpc<string|null>(env,'ar_financial_service_actor',{});if(!actor)throw Error('retention_forbidden');
 const counts={checked:0,deleted:0,blocked:0,uncertain:0,errors:0};
 // Include tombstones so newly deleted rows never shift offset pagination.
 for(let offset=0;;offset+=50){
  const page=await backendRpc<{total:number;rows:{store:'supabase'|'drive';objectId:string;itemId:string|null;state:string}[]}>(env,'ar_retention_candidates',{p_actor:actor,p_offset:offset,p_limit:50,p_include_deleted:true});
  if(!Array.isArray(page.rows)||!Number.isSafeInteger(page.total))throw Error('retention_unavailable');
  for(const row of page.rows){
   if(row.state==='deleted')continue;
   try{
    let item=row.itemId?await retentionStatus(env,actor,row.itemId):await enrollRetention(env,actor,row.store,row.objectId);
    counts.checked++;
    if(item.state==='claimed'||item.state==='uncertain'||item.dueAt&&Date.parse(item.dueAt)<=Date.now()+(env.ACCEPTANCE?.clockOffsetDays??0)*86400000){
     const claim=crypto.randomUUID();item=await runRetentionItem(env,actor,item.id,claim,retentionProviders(env,actor,item.id,claim));
    }
    if(item.state==='deleted')counts.deleted++;if(item.state==='blocked')counts.blocked++;if(item.state==='uncertain'||item.state==='claimed')counts.uncertain++;
   }catch{counts.errors++;}
  }
  if(offset+page.rows.length>=page.total)break;if(!page.rows.length)throw Error('retention_pagination_changed');
 }
 return {enabled:true,...counts};
}
