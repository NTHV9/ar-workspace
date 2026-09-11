import {test,expect} from 'vitest';
import {applyFlowEdit,pageCanvasHeight,paginateFlow,sourceFragments} from '../src/pdf/flow';
import type {PdfProjectPage} from '../src/pdf/types';
const page:PdfProjectPage={id:'s:1',sourceId:'s',sourcePage:1,width:400,height:300,layers:[]};
test('insertion preserves native footer pixels on continuation sheets at native size',()=>{
 const next=applyFlowEdit(page,{id:'i',kind:'insert',y:100,height:30});
 expect(next.height).toBe(300);expect(pageCanvasHeight(next)).toBe(330);
 expect(sourceFragments(next)).toEqual([{x:0,y:0,width:400,height:100,sx:0,sy:0},{x:0,y:130,width:400,height:200,sx:0,sy:100}]);
 expect(paginateFlow(next,[{y:295,height:15}])).toEqual([{top:0,height:295},{top:295,height:35}]);
 const restored=applyFlowEdit(next,{id:'d',kind:'delete',y:100,height:30});expect(pageCanvasHeight(restored)).toBe(300);
 expect(sourceFragments(restored).reduce((n,f)=>n+f.width*f.height,0)).toBe(120000);
});
test('ordered moves retain native source coordinates, delete affects exact bands',()=>{
 const moved=applyFlowEdit(page,{id:'m',kind:'move',x:10,y:10,width:20,height:20,dx:40,dy:40});
 const fragments=sourceFragments(moved);expect(fragments).toContainEqual({x:50,y:50,width:20,height:20,sx:10,sy:10});
 expect(fragments.reduce((n,f)=>n+f.width*f.height,0)).toBe(120000-400);
});
test('flow rejects oversized or nonfinite extent and can break oversized objects without clipping',()=>{
 expect(()=>pageCanvasHeight({...page,flowHeight:Infinity})).toThrow();
 expect(pageCanvasHeight(applyFlowEdit(page,{id:'x',kind:'insert',y:100,height:400}))).toBe(700);expect(()=>applyFlowEdit(page,{id:'bad',kind:'insert',y:100,height:14400})).toThrow();
 expect(paginateFlow({...page,flowHeight:650},[{y:0,height:650}])).toEqual([{top:0,height:300},{top:300,height:300},{top:600,height:50}]);
});
import {mapSourceTextRect} from '../src/pdf/row-layout';
test('tight text row padding does not remove adjacent source targets',()=>{
 const text={x:40,y:80,width:50,height:12.5};
 expect(mapSourceTextRect(text,[{id:'i',kind:'insert',y:92,height:12}])).toEqual(text);
 expect(mapSourceTextRect({...text,y:92},[{id:'i',kind:'insert',y:92,height:12}])?.y).toBe(104);
});
import {transformLayers} from '../src/pdf/row-layout';
import {createReplacementLayer} from '../src/pdf/source-text';
test('owned typing spacer shifts with earlier edits and clears on overlap or movement',()=>{
 const layer={...createReplacementLayer({text:'One',x:40,y:40,width:50,height:12,fontSize:9,rotated:false},'x'),textFlow:{at:60,height:20}};
 expect(transformLayers([layer],{id:'i',kind:'insert',y:20,height:10})[0].textFlow).toEqual({at:70,height:20});
 expect(transformLayers([layer],{id:'i',kind:'insert',y:65,height:10})[0].textFlow).toBeUndefined();
 expect(transformLayers([layer],{id:'m',kind:'move',x:30,y:30,width:80,height:30,dx:10,dy:10})[0].textFlow).toBeUndefined();
 expect(layer.textFlow).toEqual({at:60,height:20});
});

import {sourceBandIsEmpty} from '../src/pdf/flow';
test('source artwork moved into typing space prevents unsafe shrink',()=>{const spaced=applyFlowEdit(page,{id:'s',kind:'insert',y:100,height:40});expect(sourceBandIsEmpty(spaced,100,40)).toBe(true);const moved=applyFlowEdit(spaced,{id:'m',kind:'move',x:10,y:20,width:20,height:20,dx:0,dy:85});expect(sourceBandIsEmpty(moved,100,40)).toBe(false);const layer={...createReplacementLayer({text:'One',x:40,y:40,width:50,height:12,fontSize:9,rotated:false},'x'),textFlow:{at:100,height:40}};expect(transformLayers([layer],{id:'m',kind:'move',x:10,y:20,width:20,height:20,dx:0,dy:85})[0].textFlow).toBeUndefined();});
