import {it,expect} from 'vitest';
import {restoreEditorSession,sessionBytes,type PdfEditorSession} from '../src/pdf/editor-session';
import type {PdfProject,PdfSourceDocument} from '../src/pdf/types';
const sources:PdfSourceDocument[]=[{id:'invoice',kind:'invoice',invoiceId:'1',name:'Inv. 1.pdf',bytes:new Uint8Array([1,2,3])},{id:'scan',kind:'attachment',name:'Scan.pdf',bytes:new Uint8Array([4,5])}];
const original:PdfProject={version:1,content:'invoices',delivery:'combined',pages:sources.map(s=>({id:s.id+':1',sourceId:s.id,sourcePage:1,width:612,height:792,layers:[]}))};
function session():PdfEditorSession{
 const project={...structuredClone(original),sourceNames:{scan:'Renamed scan.pdf'},invoiceAttachments:[{sourceId:'scan',invoiceId:'1'}]};
 return {project,persistedProject:{...original,pages:[original.pages[0]]},past:[{...structuredClone(original),pages:[structuredClone(original.pages[0])]}],future:[],attachedSources:[sources[1]],activeId:'scan:1',dirty:true};
}
it('retains imported source bytes, filenames, current page and undo without retaining renderers',async()=>{
 const input=session(),bound:PdfProject[]=[];const output=await restoreEditorSession(input,original,sources,async p=>{bound.push(p);});
 expect(output.project.sourceNames?.scan).toBe('Renamed scan.pdf');expect(output.project.invoiceAttachments).toEqual([{sourceId:'scan',invoiceId:'1'}]);
 expect(output.past).toHaveLength(1);expect(output.activeId).toBe('scan:1');expect(bound).toHaveLength(3);expect(input.project).not.toBe(output.project);expect(output.dirty).toBe(true);
 expect(sessionBytes(sources.slice(0,1),output)).toBeGreaterThan(5);
});
it('does not silently drop an imported scan needed by Undo',async()=>{
 const input=session();input.past=[structuredClone(input.project)];input.project={...input.project,pages:[input.project.pages[0]],invoiceAttachments:[]};
 const output=await restoreEditorSession(input,original,sources,async()=>{});expect(output.attachedSources).toHaveLength(1);expect(output.past[0].invoiceAttachments).toHaveLength(1);
});
it('refuses a session with missing sources or a failed source-font rebind',async()=>{
 await expect(restoreEditorSession(session(),{...original,pages:[original.pages[0]]},sources.slice(0,1),async()=>{})).rejects.toThrow();
 await expect(restoreEditorSession(session(),original,sources,async()=>{throw Error('Source identity changed');})).rejects.toThrow('Source identity changed');
});
