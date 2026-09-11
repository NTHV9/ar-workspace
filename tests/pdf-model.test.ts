import { describe, expect, it } from 'vitest';
import { deliveryGroups, movePage, wrapText, restoreProject } from '../src/pdf/model';
import type { PdfProject, PdfSourceDocument } from '../src/pdf/types';
const sources: PdfSourceDocument[] = [{id:'s',name:'Statement',kind:'statement',bytes:new Uint8Array()},{id:'i1',name:'Invoice 1',kind:'invoice',invoiceId:'one',bytes:new Uint8Array()},{id:'i2',name:'Invoice 2',kind:'invoice',invoiceId:'two',bytes:new Uint8Array()}];
const project: PdfProject={version:1,content:'both',delivery:'combined',pages:['s','i1','i1','i2'].map((sourceId,n)=>({id:String(n),sourceId,sourcePage:sourceId==='i1'&&n===2?2:1,width:595,height:842,layers:[]}))};
describe('PDF delivery preserves selected invoice grouping',()=>{
 it('combined puts Statement before all invoice pages',()=>{expect(deliveryGroups(project,sources).map(g=>g.pages.map(p=>p.id))).toEqual([['0','1','2','3']]);});
 it('split creates Statement and combined invoices',()=>{expect(deliveryGroups({...project,delivery:'split'},sources).map(g=>g.pages.map(p=>p.id))).toEqual([['0'],['1','2','3']]);});
 it('separate keeps two-page invoice intact',()=>{expect(deliveryGroups({...project,delivery:'separate'},sources).map(g=>g.pages.map(p=>p.id))).toEqual([['0'],['1','2'],['3']]);});
 it('statement only is one file in every layout',()=>{for(const delivery of ['combined','split','separate'] as const)expect(deliveryGroups({...project,content:'statement',delivery},sources).map(g=>g.pages.map(p=>p.id))).toEqual([['0']]);});
 it('invoice only omits statement and preserves grouping',()=>{expect(deliveryGroups({...project,content:'invoices',delivery:'separate'},sources).map(g=>g.pages.map(p=>p.id))).toEqual([['1','2'],['3']]);});
 it('page reorder stays inside its original document',()=>{expect(movePage(project,'1',-1)).toBe(project);expect(movePage(project,'1',1).pages.map(p=>p.id)).toEqual(['0','2','1','3']);});
 it('deleted pages are not silently restored during assembly',()=>{expect(deliveryGroups({...project,pages:project.pages.filter(p=>p.id!=='2'),delivery:'separate'},sources)[1].pages.map(p=>p.id)).toEqual(['1']);});
 it('wraps long strings and preserves explicit line breaks',()=>{expect(wrapText('abcdef\nx',3,t=>t.length)).toEqual(['abc','def','x']);});
});
describe('persisted PDF recovery validates source and edit data',()=>{
 it('does not reject an existing source package merely for exceeding1000 pages',()=>{const large={...project,pages:Array.from({length:1001},(_,n)=>({...project.pages[0],id:String(n),sourcePage:n+1}))};expect(restoreProject(large,large).pages).toHaveLength(1001);});
 it('restores deleted/reordered pages and settings from serialized saved project',()=>{const saved={...movePage(project,'1',1),content:'invoices' as const,delivery:'separate' as const};saved.pages=saved.pages.filter(p=>p.id!=='3');expect(restoreProject(JSON.parse(JSON.stringify(saved)),project)).toEqual(saved);});
 it('rejects missing sources, invalid pages and dimensions',()=>{for(const change of [{sourceId:'other'},{sourcePage:999},{width:123},{height:NaN}])expect(()=>restoreProject({...project,pages:[{...project.pages[0],...change}]},project)).toThrow('do not match');});
 it('rejects remote image URLs and nonfinite layer coordinates',()=>{const layer={id:'x',kind:'image',x:1,y:1,width:20,height:20,text:'',color:'#000000',fill:'#ffffff',font:'Arial',fontSize:12,bold:false,italic:false,image:'https://untrusted.example/image.png'};expect(()=>restoreProject({...project,pages:[{...project.pages[0],layers:[layer]}]},project)).toThrow();expect(()=>restoreProject({...project,pages:[{...project.pages[0],layers:[{...layer,kind:'text',image:undefined,x:Infinity}]}]},project)).toThrow();});
});
