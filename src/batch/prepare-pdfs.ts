import type {DocumentJob,DocumentExport} from '../../worker/documents/jobs';
import type {DocumentBatchSession} from '../DocumentRoute';
import type {PdfExportFile} from '../pdf/types';
import {createReviewHandoff} from '../pdf/review-handoff';
import {pdfReadyForEmail} from './phase';
type Prepared={files:PdfExportFile[];session:DocumentBatchSession};
type Result={job:DocumentJob;session?:DocumentBatchSession};
type Dependencies={
 render:(job:DocumentJob,session?:DocumentBatchSession)=>Promise<Prepared>;
 upload:(job:DocumentJob,file:PdfExportFile)=>Promise<Omit<DocumentExport,'name'>>;
 review:(job:DocumentJob,revision:number,files:DocumentExport[])=>Promise<DocumentJob>;
 canContinue?:()=>boolean;
};
/** A human's Go to email command prepares bytes; it never creates or sends Gmail. */
export function createBatchPdfPreparation(deps:Dependencies){
 const pending=new Map<string,{job:DocumentJob;input?:DocumentBatchSession;prepared:Prepared;handoff:ReturnType<typeof createReviewHandoff>}>();
 const check=()=>{if(deps.canContinue?.()===false)throw Error('The current workspace changed.');};
 function completed(job:DocumentJob,session:DocumentBatchSession):Result{
  return {job,session:{...session,revision:job.revision,compose:false,...session.editor?{editor:{...session.editor,persistedProject:session.editor.project,dirty:false}}:{}}};
 }
 async function settle(attempt:NonNullable<ReturnType<typeof pending.get>>){
  check();
  const result=await attempt.handoff(attempt.prepared.files,attempt.job.revision,
   file=>{check();return deps.upload(attempt.job,file);},
   (revision,files)=>{check();return deps.review(attempt.job,revision,files);});
  check();pending.delete(attempt.job.id);return completed(result,attempt.prepared.session);
 }
 const prepare=async(job:DocumentJob,session?:DocumentBatchSession):Promise<Result>=>{
  check();if(job.closed_at)return {job};
  if(job.state!=='ready')throw Error('Source PDFs are not ready. Wait for preparation or resolve the source error.');
  const previous=pending.get(job.id);
  if(previous){
   // Resolve the previous exact-byte attempt before accepting any later editor changes.
   const result=await settle(previous);
   if(previous.input?.editor?.project===session?.editor?.project)return result;
   job=result.job;session=session?{...session,revision:job.revision}:session;
  }
  if(session&&session.revision!==job.revision)throw Error('This PDF preparation changed. Your edits remain in this tab.');
  if(pdfReadyForEmail(job,session))return {job,session};
  const prepared=await deps.render(job,session);check();
  const attempt={job,input:session,prepared,handoff:createReviewHandoff()};pending.set(job.id,attempt);
  return settle(attempt);
 };
 return Object.assign(prepare,{pending:(id:string)=>pending.has(id)});
}
