import {describe,it,expect} from 'vitest';
import {insertedRowBands,deleteInsertedRow} from '../src/pdf/inserted-rows';
import {applyFlowEdit,pageCanvasHeight,sourceFragments} from '../src/pdf/flow';
import {restoreProject} from '../src/pdf/model';
import type {PdfLayer,PdfProjectPage,PdfProject} from '../src/pdf/types';

const original:PdfProjectPage={id:'s:1',sourceId:'s',sourcePage:1,width:400,height:500,layers:[]};
const layer=(id:string,y:number,tableRow?:string):PdfLayer=>({id,kind:'text',x:40,y,width:100,height:12,text:'',font:'Arial',fontSize:8,color:'#000000',fill:'#ffffff',bold:false,italic:false,...(tableRow?{tableRow}:{})});
function add(page:PdfProjectPage,id:string,y:number,height=20){const next=applyFlowEdit(page,{id,kind:'insert',y,height});return {...next,layers:[...next.layers,layer(id+'-cell',y+2,id)]};}
function restoredSource(page:PdfProjectPage){
 expect(pageCanvasHeight(page)).toBeCloseTo(original.height,7);
 for(const f of sourceFragments(page)){expect(f.x).toBeCloseTo(f.sx,7);expect(f.y).toBeCloseTo(f.sy,7);}
 expect(sourceFragments(page).reduce((area,f)=>area+f.width*f.height,0)).toBeCloseTo(original.width*original.height,5);
}

describe('inserted row allocation lifecycle',()=>{
 it('reclaims the exact inserted space regardless of an empty cell box',()=>{
  const page=add(original,'row-a',100,19.7),result=deleteInsertedRow(page,'row-a');
  expect(result.keptSpace).toBe(false);expect(result.page.layers).toHaveLength(0);restoredSource(result.page);
 });

 it('preserves a second row inserted within the first allocation, then restores all source positions',()=>{
  let page=add(original,'row-a',100,40);page=add(page,'row-b',120);
  const a=deleteInsertedRow(page,'row-a');expect(a.keptSpace).toBe(false);
  expect(a.page.layers).toEqual([layer('row-b-cell',102,'row-b')]);
  expect(insertedRowBands(a.page,'row-b')).toEqual([{y:100,height:20}]);
  restoredSource(deleteInsertedRow(a.page,'row-b').page);
 });

 it('reclaims owned multiline growth and accepts serialized ownership',()=>{
  let page=add(original,'row-a',100);page=applyFlowEdit(page,{id:'grow',kind:'insert',y:114,height:30,rowId:'row-a'},['row-a-cell']);
  page={...page,layers:page.layers.map(l=>({...l,height:42,text:'Long\nrow\ncontent'}))};
  const base:PdfProject={version:1,content:'invoices',delivery:'combined',pages:[original]};
  const saved=restoreProject(JSON.parse(JSON.stringify({...base,pages:[page]})),base).pages[0];
  expect(insertedRowBands(saved,'row-a')).toEqual([{y:100,height:50}]);
  restoredSource(deleteInsertedRow(saved,'row-a').page);
 });

 it('removes the row but keeps a separate object and its occupied space',()=>{
  const page=add(original,'row-a',100),note={...layer('note',104),text:'KEEP'};
  const result=deleteInsertedRow({...page,layers:[...page.layers,note]},'row-a');
  expect(result.keptSpace).toBe(true);expect(result.page.layers).toEqual([note]);expect(result.page.rowEdits).toEqual(page.rowEdits);
 });

 it('keeps native artwork moved into the former empty row',()=>{
  const page=applyFlowEdit(add(original,'row-a',100),{id:'move-art',kind:'move',x:250,y:20,width:20,height:8,dx:0,dy:84});
  const result=deleteInsertedRow(page,'row-a');
  expect(result.keptSpace).toBe(true);expect(result.page.layers).toHaveLength(0);expect(sourceFragments(result.page)).toEqual(sourceFragments(page));
 });

 it('supports legacy typing spacers and refuses malformed allocation ownership',()=>{
  let page=add(original,'row-a',100);page=applyFlowEdit(page,{id:'old-growth',kind:'insert',y:114,height:20},['row-a-cell']);
  page={...page,layers:page.layers.map(l=>({...l,height:32,textFlow:{at:114,height:20}}))};
  restoredSource(deleteInsertedRow(page,'row-a').page);
  const base:PdfProject={version:1,content:'invoices',delivery:'combined',pages:[original]};
  for(const edits of [
   [{id:'i',kind:'insert',y:100,height:20,rowId:'missing'}],
   [{id:'i',kind:'insert',y:100,height:20},{id:'d',kind:'delete',y:100,height:20,rowId:'i'}],
   [{id:'i',kind:'insert',y:100,height:20,rowId:'future'},{id:'future',kind:'insert',y:120,height:20}],
  ])expect(()=>restoreProject({...base,pages:[{...original,rowEdits:edits}]},base)).toThrow();
 });

 it('100 deterministic mixed add/grow/delete histories preserve the original page',()=>{
  for(let seed=1;seed<=100;seed++){
   let state=seed,page=original,id=0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
   for(let step=0;step<20;step++){
    const rows=[...new Set(page.layers.flatMap(l=>l.tableRow?[l.tableRow]:[]))];
    if(!rows.length||next()%3===0){const y=rows.length?Math.max(...insertedRowBands(page,rows[next()%rows.length]).map(b=>b.y+b.height)):100;page=add(page,'r'+id++,y,18+next()%20);}
    else{
     const row=rows[next()%rows.length];
     if(next()%2===0){const bands=insertedRowBands(page,row),end=Math.max(...bands.map(b=>b.y+b.height));page=applyFlowEdit(page,{id:'g'+id++,kind:'insert',y:end-1,height:1+next()%15,rowId:row},page.layers.filter(l=>l.tableRow===row).map(l=>l.id));}
     else{const result=deleteInsertedRow(page,row);expect(result.keptSpace,`seed ${seed}, step ${step}`).toBe(false);page=result.page;}
    }
   }
   for(const row of new Set(page.layers.map(l=>l.tableRow!)))page=deleteInsertedRow(page,row).page;
   expect(page.layers).toHaveLength(0);restoredSource(page);
  }
 });
});
