import {restoreProject} from './model';
import type {PdfProject,PdfSourceDocument} from './types';
/** Tab-only state. Never serialize source bytes or editor projects into browser storage. */
export interface PdfEditorSession {project:PdfProject;persistedProject:PdfProject|null;past:PdfProject[];future:PdfProject[];attachedSources:PdfSourceDocument[];activeId:string;dirty:boolean}
export interface PdfEditorControl {busy:()=>boolean;capture:()=>PdfEditorSession}
export async function restoreEditorSession(session:PdfEditorSession,original:PdfProject,sources:PdfSourceDocument[],bind:(project:PdfProject)=>Promise<void>):Promise<PdfEditorSession>{
 if(session.past.length>50||session.future.length>50||session.attachedSources.some(s=>!sources.some(v=>v.id===s.id&&v.bytes===s.bytes)))throw Error('The saved editing session does not match its PDFs.');
 const project=restoreProject(session.project,original,sources),persisted=session.dirty&&session.persistedProject?restoreProject(session.persistedProject,original,sources):session.dirty?null:project;
 const past=session.past.map(p=>restoreProject(p,original,sources)),future=session.future.map(p=>restoreProject(p,original,sources));
 for(const p of new Set([project,persisted,...past,...future]))if(p)await bind(p);
 return {...session,project,persistedProject:persisted,past,future,activeId:project.pages.some(p=>p.id===session.activeId)?session.activeId:project.pages[0]?.id??''};
}
export function sessionBytes(originals:PdfSourceDocument[],session:PdfEditorSession|null){
 const buffers=new Set<Uint8Array>([...originals,...session?.attachedSources??[]].map(s=>s.bytes));
 return [...buffers].reduce((n,b)=>n+b.byteLength,0)+(session?2*JSON.stringify({project:session.project,persisted:session.persistedProject,past:session.past,future:session.future}).length:0);
}
