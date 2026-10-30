/** Provider execution history only. Never deletes business records or file bytes. */
export const workflowNames=['ar-workspace-refresh','ar-workspace-documents','ar-workspace-tracker','ar-workspace-financial'] as const;
export type WorkflowName=(typeof workflowNames)[number];
const day=86400000,uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const idPattern=new RegExp(`^${uuid}(?:-scheduled)?$`),uuidPattern=new RegExp(`^${uuid}$`);
export interface WorkflowInstance {workflow:WorkflowName;id:string;workflow_id:string;version_id:string;status:string;created_on:string;ended_on:string|null}
export type SourceReason='terminal_refresh'|'terminal_reconcile'|'closed_document'|'obsolete_tracker'|'terminal_financial';
export interface SourceProof {observedAt:string;eligible:{workflow:WorkflowName;id:string;reason:SourceReason}[]}
const reasons:Record<WorkflowName,readonly SourceReason[]>={
 'ar-workspace-refresh':['terminal_refresh','terminal_reconcile','closed_document','terminal_financial'],
 'ar-workspace-documents':['closed_document'],'ar-workspace-tracker':['obsolete_tracker'],'ar-workspace-financial':['terminal_financial'],
};
const key=(r:{workflow:string;id:string})=>`${r.workflow}:${r.id}`;
function validId(workflow:WorkflowName,id:string){return typeof id==='string'&&idPattern.test(id)&&(!id.endsWith('-scheduled')||workflow==='ar-workspace-refresh');}
function validateRow(r:WorkflowInstance,inventory=false){
 const idValid=r&&typeof r.id==='string'&&(inventory?/^[A-Za-z0-9_-]{1,100}$/.test(r.id):validId(r.workflow,r.id));
 if(!r||!workflowNames.includes(r.workflow)||!idValid||!uuidPattern.test(r.workflow_id)||!uuidPattern.test(r.version_id))throw Error('workflow_invalid_identity');
}
function validateProof(proof:SourceProof,now:number){
 const at=Date.parse(proof.observedAt);
 if(!Number.isFinite(now)||!Number.isFinite(at)||at>now||now-at>300000||!Array.isArray(proof.eligible))throw Error('workflow_source_proof_stale');
 const seen=new Set<string>();
 for(const r of proof.eligible){if(!r||!workflowNames.includes(r.workflow)||!validId(r.workflow,r.id)||!reasons[r.workflow].includes(r.reason)||seen.has(key(r)))throw Error('workflow_source_proof_invalid');seen.add(key(r));}
 return seen;
}
function aged(r:WorkflowInstance,now:number){
 const created=Date.parse(r.created_on),ended=r.ended_on===null?NaN:Date.parse(r.ended_on);
 return Number.isFinite(created)&&Number.isFinite(ended)&&created<=ended&&ended<=now&&
  (r.status==='complete'?now-ended>day:r.status==='errored'&&now-ended>7*day);
}
export function planWorkflowCleanup(rows:readonly WorkflowInstance[],proof:SourceProof,now:number){
 const allowed=validateProof(proof,now),seen=new Set<string>(),eligible:WorkflowInstance[]=[],held:Record<string,number>={};
 for(const r of rows){validateRow(r,true);if(seen.has(key(r)))throw Error('workflow_duplicate_instance');seen.add(key(r));
  const reason=!validId(r.workflow,r.id)?'unrecognized_identity':!aged(r,now)?'active_recent_or_unknown':!allowed.has(key(r))?'source_not_finalized':null;
  if(reason)held[reason]=(held[reason]??0)+1;else eligible.push(r);
 }
 return {eligible,held};
}
export async function readWorkflowPages(read:(page:number)=>Promise<WorkflowInstance[]>,size=100){
 const rows:WorkflowInstance[]=[],seen=new Set<string>();
 for(let page=1;page<=1000;page++){
  const part=await read(page);if(!Array.isArray(part)||part.length>size)throw Error('workflow_pagination_invalid');
  for(const r of part){validateRow(r,true);if(seen.has(key(r)))throw Error('workflow_duplicate_instance');seen.add(key(r));rows.push(r);}
  if(part.length<size)return rows;
 }
 throw Error('workflow_pagination_incomplete');
}
interface CleanupPorts {
 now():number;readInstances(workflow:WorkflowName,approved:readonly WorkflowInstance[]):Promise<WorkflowInstance[]>;
 readSource():Promise<SourceProof>;deleteBatch(workflow:WorkflowName,ids:string[]):Promise<{deleted:{id:string}[];errors:unknown[]}>;
}
const same=(a:WorkflowInstance,b:WorkflowInstance)=>a.workflow===b.workflow&&a.id===b.id&&a.workflow_id===b.workflow_id&&a.version_id===b.version_id&&a.status===b.status&&a.created_on===b.created_on&&a.ended_on===b.ended_on;
export async function purgeWorkflowBatch(approved:readonly WorkflowInstance[],ports:CleanupPorts){
 if(!approved.length||approved.length>100)throw Error('workflow_batch_invalid');
 for(const r of approved)validateRow(r);
 const workflow=approved[0].workflow;
 if(approved.some(r=>r.workflow!==workflow)||new Set(approved.map(key)).size!==approved.length)throw Error('workflow_batch_invalid');
 // Read current provider state, then current source evidence. Never infer source finality from provider success.
 const current=await ports.readInstances(workflow,approved),proof=await ports.readSource();
 if(current.some(r=>r.workflow!==workflow))throw Error('workflow_scope_changed');
 const fresh=planWorkflowCleanup(current,proof,ports.now()).eligible;
 const ids=approved.filter(a=>fresh.some(b=>same(a,b))).map(r=>r.id);
 if(!ids.length)return {deleted:[],uncertain:[],held:approved.length};
 try{
  const result=await ports.deleteBatch(workflow,ids);
  if(!result||!Array.isArray(result.deleted)||!Array.isArray(result.errors)||result.deleted.some(r=>!r||!ids.includes(r.id))||new Set(result.deleted.map(r=>r.id)).size!==result.deleted.length)throw Error('workflow_delete_receipt_invalid');
  const deleted=result.deleted.map(r=>r.id);return {deleted,uncertain:ids.filter(id=>!deleted.includes(id)),held:approved.length-ids.length};
 }catch{
  // A lost response can mean deletion succeeded. Re-observe; never restart or automatically repeat a command.
  return {deleted:[],uncertain:ids,held:approved.length-ids.length};
 }
}
export function canCreateDocumentWorkflow(createdAt:string,now=Date.now()){
 const created=Date.parse(createdAt);
 // DB and Worker clocks are independent; a small lead must not strand a fresh job.
 // Five minutes of skew stays inside the one-hour margin before the 24-hour expiry floor.
 return Number.isFinite(created)&&Number.isFinite(now)&&created-now<=5*60000&&now-created<23*3600000;
}
