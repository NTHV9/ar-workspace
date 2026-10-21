import {it,expect} from 'vitest';
import {insertRowUsingWhitespace,type WhitespaceProof} from '../src/pdf/row-whitespace';
import {pageCanvasHeight,paginateFlow,sourceFragments} from '../src/pdf/flow';
import {deleteInsertedRow} from '../src/pdf/inserted-rows';
import type {PdfProjectPage,PdfLayer} from '../src/pdf/types';
const original:PdfProjectPage={id:'s:1',sourceId:'s',sourcePage:1,width:200,height:300,layers:[]};
const cell=(id:string,y:number):PdfLayer=>({id:id+'-cell',kind:'text',tableRow:id,x:20,y,width:40,height:12,text:'TEST',font:'Arial',fontSize:8,color:'#000000',fill:'#ffffff',bold:false,italic:false});
function proof(page=original):WhitespaceProof{
 const scale=2,width=page.width*scale,height=pageCanvasHeight(page)*scale,data=new Uint8ClampedArray(width*height*4).fill(255);
 const areas=[{x:20,y:20,width:160,height:100},{x:20,y:121,width:160,height:109},{x:20,y:235,width:160,height:13},{x:10,y:285,width:180,height:13}];
 for(const r of areas)for(let y=r.y*scale;y<(r.y+r.height)*scale;y++)for(let x=r.x*scale;x<(r.x+r.width)*scale;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 return {raster:{data,width,height},scale,runs:[],barriers:areas};
}
function footer(page:PdfProjectPage){return sourceFragments(page,[{x:10,y:285,width:180,height:13,sx:10,sy:285}]);}
function add(page=original,id='r1',y=120,p=proof(page)){
 const next=insertRowUsingWhitespace(page,{id,kind:'insert',y,height:20},[],p);return {...next,layers:[...next.layers,cell(id,y+2)]};
}
it('absorbs a row into independently proven downstream white source space, keeping the footer on the original page',()=>{
 const page=add();expect(footer(page)).toEqual([{x:10,y:285,width:180,height:13,sx:10,sy:285}]);expect(pageCanvasHeight(page)).toBe(300);expect(paginateFlow(page)).toHaveLength(1);expect(original.rowEdits).toBeUndefined();
});
it.each(['image','text','watermark','nonwhite','missing-proof'] as const)('preserves overflow when the downstream gap is not proven empty (%s)',kind=>{
 const p=proof();if(kind==='image')p.barriers.push({x:1,y:249,width:198,height:35});
 if(kind==='text')p.runs.push({text:'invisible source',x:1,y:260,width:20,height:12,fontSize:8,rotated:false});
 if(kind==='watermark'||kind==='nonwhite'){const i=(267*p.scale*p.raster.width+100)*4;p.raster.data[i]=kind==='nonwhite'?254:230;}
 const page=kind==='missing-proof'?insertRowUsingWhitespace(original,{id:'r',kind:'insert',y:120,height:20},[]):add(original,'r',120,p);
 expect(footer(page)[0].y).toBe(305);expect(pageCanvasHeight(page)).toBe(320);expect(paginateFlow(page)).toHaveLength(2);
});
it('restores consumed source whitespace when the inserted row is explicitly deleted',()=>{
 const result=deleteInsertedRow(add(),'r1');expect(result.keptSpace).toBe(false);expect(result.page.layers).toHaveLength(0);expect(footer(result.page)[0].y).toBe(285);expect(pageCanvasHeight(result.page)).toBe(300);
});
import {restoreProject} from '../src/pdf/model';
it('retains and validates paired source-space ownership through project serialization',()=>{
 const page=add(),base={version:1 as const,content:'invoices' as const,delivery:'combined' as const,pages:[original]},saved={...base,pages:[page]};
 const restored=restoreProject(JSON.parse(JSON.stringify(saved)),base).pages[0];
 expect(restored.rowEdits).toEqual(page.rowEdits);expect(footer(deleteInsertedRow(restored,'r1').page)[0].y).toBe(285);
 const paired=page.rowEdits!.find(e=>e.kind==='delete')!;
 for(const bad of [{...paired,spaceFor:'unknown'},{...paired,height:21},{...paired,kind:'insert'},{...paired,y:0}]){
  expect(()=>restoreProject({...base,pages:[{...page,rowEdits:[page.rowEdits![0],bad]}]},base)).toThrow();
 }
});
import {applyFlowEdit} from '../src/pdf/flow';
function renderedProof(page:PdfProjectPage,source:WhitespaceProof):WhitespaceProof{
 const scale=source.scale,width=source.raster.width,height=Math.ceil(pageCanvasHeight(page)*scale),data=new Uint8ClampedArray(width*height*4).fill(255);
 for(const f of sourceFragments(page))for(let y=Math.ceil(f.y*scale);y<Math.floor((f.y+f.height)*scale);y++)for(let x=Math.ceil(f.x*scale);x<Math.floor((f.x+f.width)*scale);x++){
  const sy=Math.floor((f.sy+y/scale-f.y)*scale),sx=Math.floor((f.sx+x/scale-f.x)*scale),from=(sy*source.raster.width+sx)*4,to=(y*width+x)*4;
  data.set(source.raster.data.subarray(from,from+4),to);
 }
 return {...source,raster:{data,width,height}};
}
function roomyProof(){
 const p=proof();p.barriers=p.barriers.filter(r=>r.y<120||r.y>280);
 // A synthetic signature, then enough whitespace for two inserted rows.
 p.barriers.push({x:20,y:121,width:160,height:69},{x:20,y:195,width:160,height:13});
 p.raster.data.fill(255);
 for(const r of p.barriers)for(let y=r.y*2;y<(r.y+r.height)*2;y++)for(let x=r.x*2;x<(r.x+r.width)*2;x++){const i=(y*p.raster.width+x)*4;p.raster.data[i]=p.raster.data[i+1]=p.raster.data[i+2]=0;}
 return p;
}
it('multiple row insertion and deleting an earlier row preserve the later row and footer',()=>{
 const p=roomyProof(),first=add(original,'r1',120,p),second=add(first,'r2',140,renderedProof(first,p));
 expect(second.rowEdits).toHaveLength(4);expect(pageCanvasHeight(second)).toBe(300);expect(footer(second)[0].y).toBe(285);
 const withoutFirst=deleteInsertedRow(second,'r1');expect(withoutFirst.keptSpace).toBe(false);expect(withoutFirst.page.layers).toHaveLength(1);expect(withoutFirst.page.layers[0]).toMatchObject({tableRow:'r2',y:122});expect(footer(withoutFirst.page)[0].y).toBe(285);
 const restored=deleteInsertedRow(withoutFirst.page,'r2');expect(restored.keptSpace).toBe(false);expect(footer(restored.page)[0].y).toBe(285);expect(pageCanvasHeight(restored.page)).toBe(300);
});
it('Undo and Redo page snapshots retain the exact compensated source mapping',()=>{
 const before=structuredClone(original),after=add(),snapshot=structuredClone(after);let current=after;current=before;
 expect(current).toEqual(original);current=snapshot;expect(sourceFragments(current)).toEqual(sourceFragments(after));expect(pageCanvasHeight(current)).toBe(300);expect(footer(current)[0].y).toBe(285);
});
it.each(['new-content','gap-content','later-move'] as const)('keeps occupied row space when compensation cannot safely be restored (%s)',kind=>{
 let page=add();
 if(kind==='new-content')page={...page,layers:[...page.layers,{...cell('unrelated',125),tableRow:undefined}]};
 else if(kind==='gap-content')page={...page,layers:[...page.layers,{...cell('unrelated',page.rowEdits!.at(-1)!.y-3),tableRow:undefined}]};
 else page=applyFlowEdit(page,{id:'move',kind:'move',x:1,y:1,width:5,height:5,dx:0,dy:270});
 const before=sourceFragments(page),result=deleteInsertedRow(page,'r1');expect(result.keptSpace).toBe(true);expect(sourceFragments(result.page)).toEqual(before);expect(result.page.layers.every(l=>l.tableRow!=='r1')).toBe(true);
});
it('uses a real continuation after all safe downstream space is consumed',()=>{
 const p=proof(),first=add(original,'r1',120,p),second=add(first,'r2',140,renderedProof(first,p));
 expect(second.rowEdits).toHaveLength(3);expect(pageCanvasHeight(second)).toBe(320);expect(footer(second)[0].y).toBe(305);
});
it('rejects insufficient raster resolution and never consumes inserted space or mismatched raster dimensions',()=>{
 for(const p of [{...proof(),scale:1},{...proof(),raster:{...proof().raster,width:399}}])expect(add(original,'r',120,p).rowEdits).toHaveLength(1);
 const source=proof(),spaced=applyFlowEdit(original,{id:'space',kind:'insert',y:250,height:80});
 expect(add(spaced,'r',120,renderedProof(spaced,source)).rowEdits).toHaveLength(2);
});
it('uses the largest verified gap instead of compressing a tighter nearby separation',()=>{
 const p=proof();p.barriers=p.barriers.flatMap(r=>r.y===121?[{...r,height:29},{...r,y:180,height:50}]:[r]);
 for(let y=150*2;y<180*2;y++)p.raster.data.fill(255,y*p.raster.width*4,(y+1)*p.raster.width*4);
 const page=add(original,'r',120,p),cut=page.rowEdits!.find(e=>e.kind==='delete')!;expect(cut.y).toBeGreaterThan(250);
});
