import {test,expect} from 'vitest';
import {restoreProject} from '../src/pdf/model';
import {createReplacementLayer} from '../src/pdf/source-text';
import type {PdfProject} from '../src/pdf/types';
const original:PdfProject={version:1,content:'invoices',delivery:'combined',pages:[{id:'s:1',sourceId:'s',sourcePage:1,width:400,height:300,layers:[]}]};
const layer=createReplacementLayer({text:'123',x:40,y:40,width:50,height:20,fontSize:18,rotated:false,sourceText:{sourceId:'s',sourcePage:1,runIndex:0}},'l');
const saved=(l:unknown)=>({...original,pages:[{...original.pages[0],layers:[l]}]});
test('source reference survives reload without persisting CSS and rejects foreign or invalid references',()=>{
 expect(restoreProject(saved(layer),original).pages[0].layers[0].sourceText).toEqual(layer.sourceText);
 for(const ref of [{sourceId:'foreign',sourcePage:1,runIndex:0},{sourceId:'s',sourcePage:2,runIndex:0},{sourceId:'s',sourcePage:1,runIndex:-1}])expect(()=>restoreProject(saved({...layer,sourceText:ref}),original)).toThrow();
 const restored=restoreProject(saved({...layer,sourceText:{...layer.sourceText,font:'url(https://example.com)'}}),original);expect(restored.pages[0].layers[0].sourceText).toEqual(layer.sourceText);
});
test('native region transforms are bounded and persisted, legacy projects remain unchanged',()=>{
 const edits=[{id:'row',kind:'insert',y:20,height:10},{id:'area',kind:'move',x:20,y:20,width:100,height:30,dx:10,dy:20}];
 const input={...original,pages:[{...original.pages[0],rowEdits:edits}]};expect(restoreProject(input,original).pages[0].rowEdits).toEqual(edits);
 for(const edit of [{...edits[0],height:14400},{...edits[1],dx:1000},{...edits[1],dy:-1000}])expect(()=>restoreProject({...original,pages:[{...original.pages[0],rowEdits:[edit]}]},original)).toThrow();
 expect(restoreProject(original,original)).toEqual(original);
 expect(()=>restoreProject(saved({...layer,maskOriginal:false,sourceText:undefined}),original)).toThrow();
 expect(restoreProject(saved({...layer,maskOriginal:false}),original).pages[0].layers[0].maskOriginal).toBe(false);
});
