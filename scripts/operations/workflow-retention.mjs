// One-off operator utility. Uses existing Wrangler login; never reads credentials.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {workflowNames,readWorkflowPages,planWorkflowCleanup,purgeWorkflowBatch} from '../../worker/operations/workflow-retention.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),privateRoot=resolve(root,'.tmp/workflow-retention');
const args=process.argv.slice(2),mode=args.shift();
const option=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
function path(value){if(!value)throw Error('workflow_private_path_required');const p=resolve(root,value);if(!p.startsWith(privateRoot+'/')&&!p.startsWith(privateRoot+'\\'))throw Error('workflow_private_path_required');return p;}
const read=p=>JSON.parse(readFileSync(path(p),'utf8').replace(/^\uFEFF/,''));
function write(p,value){const target=path(p);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(value,null,2));}
function wrangler(command){
 let out;try{out=execFileSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),...command],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});}catch{throw Error('workflow_provider_command_failed');}
 try{return JSON.parse(out);}catch{throw Error('workflow_provider_response_invalid');}
}
async function instances(workflow,start,end){
 return readWorkflowPages(async page=>{
  const rows=wrangler(['workflows','instances','list',workflow,'--json','--per-page','100','--page',String(page),...(start?['--date-start',start]:[]),'--date-end',end]);
  if(!Array.isArray(rows))throw Error('workflow_provider_response_invalid');
  return rows.map(r=>({workflow,id:r.id,workflow_id:r.workflow_id,version_id:r.version_id,status:r.status,created_on:r.created_on,ended_on:r.ended_on??null}));
 });
}
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(mode==='inventory'){
 const observedAt=new Date().toISOString(),rows=[];
 for(const workflow of workflowNames)rows.push(...await instances(workflow,undefined,observedAt));
 write(option('--out'),{observedAt,rows});console.log(JSON.stringify({observedAt,instances:rows.length}));
}else if(mode==='plan'){
 const inventory=read(option('--inventory')),proof=read(option('--proof'));
 const result=planWorkflowCleanup(inventory.rows,proof,Date.now());result.eligible.sort((a,b)=>a.workflow.localeCompare(b.workflow)||a.created_on.localeCompare(b.created_on)||a.id.localeCompare(b.id));
 const manifest={createdAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),...result};
 write(option('--out'),manifest);console.log(JSON.stringify({eligible:result.eligible.length,held:result.held,manifestSha256:digest(manifest)}));
}else if(mode==='apply'){
 const manifest=read(option('--plan')),offset=Number(option('--offset')??'0');
 if(manifest.source!==execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()||!Number.isSafeInteger(offset)||offset<0)throw Error('workflow_unqualified_plan');
 const selected=manifest.eligible.slice(offset,offset+100);if(!selected.length)throw Error('workflow_empty_batch');
 const receipt=path(option('--plan'))+'.receipts.json',lock=receipt+'.lock';let handle;
 try{
  handle=openSync(lock,'wx');let ledger={planSha256:digest(manifest),attempted:[],results:[]};
  try{ledger=JSON.parse(readFileSync(receipt,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(ledger.planSha256!==digest(manifest)||selected.some(r=>ledger.attempted.includes(r.workflow+':'+r.id)))throw Error('workflow_command_already_attempted');
  // Each command is single-workflow and at most 100 exact IDs. Group boundaries are explicit.
  const group=selected.filter(r=>r.workflow===selected[0].workflow);
  const result=await purgeWorkflowBatch(group,{
   now:()=>Date.now(),readSource:async()=>read(option('--proof')),
   readInstances:async(workflow,approved)=>{
    const times=approved.map(r=>Date.parse(r.created_on));if(times.some(t=>!Number.isFinite(t)))throw Error('workflow_invalid_time');
    return instances(workflow,new Date(Math.floor(Math.min(...times)/1000)*1000).toISOString(),new Date(Math.ceil(Math.max(...times)/1000)*1000+1000).toISOString());
   },
   deleteBatch:async(workflow,ids)=>{
    ledger.attempted.push(...ids.map(id=>workflow+':'+id));writeFileSync(receipt+'.next',JSON.stringify(ledger));renameSync(receipt+'.next',receipt);
    return wrangler(['workflows','instances','delete',workflow,...ids,'--json']);
   },
  });
  ledger.results.push({at:new Date().toISOString(),offset,count:group.length,...result});writeFileSync(receipt+'.next',JSON.stringify(ledger));renameSync(receipt+'.next',receipt);
  console.log(JSON.stringify({offset,nextOffset:offset+group.length,deleted:result.deleted.length,uncertain:result.uncertain.length,held:result.held}));
 }finally{if(handle!==undefined){closeSync(handle);unlinkSync(lock);}}
}else throw Error('Usage: workflow-retention.mjs inventory|plan|apply with explicit private .tmp/workflow-retention paths');
