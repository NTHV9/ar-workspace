import {expect,it} from 'vitest';
import {deliveryGroups,restoreProject} from '../src/pdf/model';
import {invoiceTargets,moveInvoiceAttachment,removeInvoiceAttachment,validateInvoiceAttachments} from '../src/pdf/invoice-attachments';
import type {PdfProject,PdfSourceDocument} from '../src/pdf/types';
const sources:PdfSourceDocument[]=[{id:'s',name:'Statement.pdf',kind:'statement'},{id:'a',name:'Invoice A.pdf',kind:'invoice',invoiceId:'A'},{id:'a2',name:'Invoice A continuation.pdf',kind:'invoice',invoiceId:'A'},{id:'b',name:'Invoice B.pdf',kind:'invoice',invoiceId:'B'},{id:'x',name:'Support X.pdf',kind:'attachment'},{id:'y',name:'Support Y.pdf',kind:'attachment'},{id:'z',name:'Support Z.pdf',kind:'attachment'}].map(s=>({...s,bytes:new Uint8Array()} as PdfSourceDocument));
const project:PdfProject={version:1,content:'both',delivery:'combined',pages:['s','a','a2','b','x','x','y','z'].map((sourceId,i)=>({id:String(i),sourceId,sourcePage:sourceId==='x'&&i===5?2:1,width:595,height:842,layers:[]})),invoiceAttachments:[{sourceId:'x',invoiceId:'B'},{sourceId:'y',invoiceId:'A'},{sourceId:'z',invoiceId:'A'}]};
const groups=(p:PdfProject)=>deliveryGroups(p,sources).map(g=>g.pages.map(p=>p.sourceId));
it('places each PDF after all original pages of its invoice in every delivery layout',()=>{
 expect(invoiceTargets(sources)).toHaveLength(2);
 expect(groups(project)).toEqual([['s','a','a2','y','z','b','x','x']]);
 expect(groups({...project,delivery:'split'})).toEqual([['s'],['a','a2','y','z','b','x','x']]);
 expect(groups({...project,delivery:'separate'})).toEqual([['s'],['a','a2','y','z'],['b','x','x']]);
 expect(groups({...project,content:'invoices',delivery:'separate'})).toEqual([['a','a2','y','z'],['b','x','x']]);
 expect(groups({...project,content:'statement'})).toEqual([['s']]);
});
it('moves files only within the assigned invoice and preserves PDF-internal page order',()=>{
 const changed=moveInvoiceAttachment(project,'z',-1);expect(groups(changed)).toEqual([['s','a','a2','z','y','b','x','x']]);
 expect(groups(project)).toEqual([['s','a','a2','y','z','b','x','x']]);
 expect(moveInvoiceAttachment(project,'x',-1)).toBe(project);
});
it('reassigns/removes attached pages without changing the invoice or another attachment',()=>{
 const changed={...project,invoiceAttachments:project.invoiceAttachments!.map(a=>a.sourceId==='x'?{...a,invoiceId:'A'}:a)};
 expect(groups(changed)).toEqual([['s','a','a2','x','x','y','z','b']]);
 expect(groups(removeInvoiceAttachment(project,'x'))).toEqual([['s','a','a2','y','z','b']]);
 expect(restoreProject(project,project,sources)).toEqual(project);
});
it('rejects unknown/cross-selection targets, duplicate assignments and unmapped imported pages',()=>{
 for(const invoiceAttachments of [[{sourceId:'x',invoiceId:'OTHER'}],[...project.invoiceAttachments!,project.invoiceAttachments![0]],[{sourceId:'a',invoiceId:'B'}],[]])expect(()=>validateInvoiceAttachments({...project,invoiceAttachments},sources)).toThrow();
 expect(()=>restoreProject(project,project)).toThrow();
 expect(()=>restoreProject({...project,invoiceAttachments:[{sourceId:'x',invoiceId:'OTHER'}]},project,sources)).toThrow();
});
it('does not export orphaned support files after all parent invoice pages are deleted',()=>{
 const missing={...project,pages:project.pages.filter(p=>!['a','a2'].includes(p.sourceId))};
 expect(()=>validateInvoiceAttachments(missing,sources,true)).toThrow('no pages');
 expect(()=>validateInvoiceAttachments({...missing,content:'statement'},sources,true)).not.toThrow();
});
