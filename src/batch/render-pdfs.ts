import {assertCachedSources} from './source-snapshot';
import type {DocumentJob} from '../../worker/documents/jobs';
import type {DocumentBatchSession} from '../DocumentRoute';
import {exportProject,loadSources,rebindProjectSources} from '../pdf/engine';
import {loadJobSources} from '../pdf/load-job-sources';
import {restoreProject} from '../pdf/model';

/** Reuse the editor's exporter, validation and exact source bytes outside its UI. */
export async function renderBatchPdfs(job:DocumentJob,session:DocumentBatchSession|undefined,token:string,maxBytes:number){
 const sources=session?.sources??await loadJobSources(job,token,maxBytes);
 if(session?.sources)await assertCachedSources(job.files,sources);
 const allSources=[...sources,...session?.editor?.attachedSources??[]];
 if(allSources.reduce((n,s)=>n+s.bytes.byteLength,0)>maxBytes)throw Error('This account exceeds the PDF memory limit.');
 const loaded=await loadSources(allSources);
 try{
  const project=session?.editor?restoreProject(session.editor.project,loaded.project,allSources):{
   ...loaded.project,delivery:session?.delivery??(job.layout==='statement_bundle'?'split' as const:job.layout==='separate'?'separate' as const:'combined' as const)
  };
  await rebindProjectSources(project,loaded.documents);
  const files=await exportProject(project,allSources,loaded.documents);
  return {files,session:{revision:job.revision,sources,compose:false,editor:session?.editor??{project,persistedProject:project,past:[],future:[],attachedSources:[],activeId:project.pages[0]?.id??'',dirty:false}}};
 }finally{loaded.dispose();}
}
