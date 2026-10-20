import type {DocumentBatchSession} from '../DocumentRoute';
export type BatchPhase='pdf'|'email';
export function pdfReadyForEmail(job:{state:string;acknowledged:boolean;exports:unknown[];revision:number;closed_at?:string|null}|undefined,session?:{revision:number;editor?:{dirty:boolean}}){
 return !!job&&!job.closed_at&&job.state==='ready'&&job.acknowledged&&job.exports.length>0&&(!session||session.revision===job.revision&&!session.editor?.dirty);
}
/** Email navigation must not replace a retained PDF editing session with null sources. */
export function retainPdfSession(previous:DocumentBatchSession|undefined,next:DocumentBatchSession):DocumentBatchSession{
 return next.compose&&previous?.revision===next.revision?{...previous,compose:true}:next;
}
