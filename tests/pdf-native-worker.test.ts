import {describe,it,expect,vi,afterEach} from 'vitest';
import {nativeTextCandidate} from '../src/pdf/native/candidate';
import {registerSourceStyle,createReplacementLayer} from '../src/pdf/source-text';
import type {DetectedText,PdfProjectPage} from '../src/pdf/types';
function page():PdfProjectPage{
 const run:DetectedText={text:'INVOICE',x:20,y:30,width:90,height:26,fontSize:20,rotated:false,fontLabel:'Helvetica-Bold',color:'#ffffff',bold:true,italic:false,sourceText:{sourceId:'s',sourcePage:1,runIndex:0,scope:'worker-test'}};
 const layer=createReplacementLayer(run,'l');layer.text='BILL';registerSourceStyle(run.sourceText!,{font:'font',fontSize:20,bold:true,italic:false,color:'#ffffff',baseline:18,hScale:1,charSpacing:0,wordSpacing:0,glyphs:new Map(Array.from('INVOICEBILL').map(c=>[c,{unicode:c,fontChar:c,width:600,isInFont:true}])),sequence:[],supported:true,run});return {id:'p',sourceId:'s',sourcePage:1,width:400,height:300,layers:[layer]};
}
class FakeWorker{
 static instances:FakeWorker[]=[];onerror?:()=>void;onmessage?:(e:{data:unknown})=>void;terminate=vi.fn();postMessage=vi.fn();constructor(){FakeWorker.instances.push(this);}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();FakeWorker.instances=[];});
describe('bounded native worker lifecycle',()=>{
 it('does not bypass a resized box or source font warning through native editing',async()=>{vi.stubGlobal('Worker',FakeWorker);const resized=page();resized.layers[0].width=10;resized.layers[0].height=2;expect(await nativeTextCandidate(new Uint8Array([1]),resized)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(0);
 const duplicate=page();duplicate.layers.push({...duplicate.layers[0],id:'duplicate'});expect(await nativeTextCandidate(new Uint8Array([1]),duplicate)).toBeUndefined();
 const unsupported=page();unsupported.layers[0].text='X';expect(await nativeTextCandidate(new Uint8Array([1]),unsupported)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(0);});
 it('terminates on timeout and ignores late results',async()=>{vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);const pending=nativeTextCandidate(new Uint8Array([1,2]),page());const worker=FakeWorker.instances[0];await vi.advanceTimersByTimeAsync(10_001);expect(await pending).toBeUndefined();worker.onmessage?.({data:{bytes:new Uint8Array([7]),applied:['l']}});expect(worker.terminate).toHaveBeenCalledOnce();});
 it('cancels a disposed document and transfers a copy of original bytes',async()=>{vi.stubGlobal('Worker',FakeWorker);const bytes=new Uint8Array([1,2]),abort=new AbortController(),pending=nativeTextCandidate(bytes,page(),abort.signal),worker=FakeWorker.instances[0];expect(worker.postMessage.mock.calls[0][0].bytes).not.toBe(bytes);abort.abort();expect(await pending).toBeUndefined();expect(bytes).toEqual(new Uint8Array([1,2]));expect(worker.terminate).toHaveBeenCalledOnce();});
 it('bounds concurrency at two workers and releases slots after failure',async()=>{vi.stubGlobal('Worker',FakeWorker);const a=nativeTextCandidate(new Uint8Array([1]),page()),b=nativeTextCandidate(new Uint8Array([1]),page());expect(await nativeTextCandidate(new Uint8Array([1]),page())).toBeUndefined();expect(FakeWorker.instances).toHaveLength(2);FakeWorker.instances[0].onerror?.();FakeWorker.instances[1].onerror?.();await Promise.all([a,b]);const c=nativeTextCandidate(new Uint8Array([1]),page());expect(FakeWorker.instances).toHaveLength(3);FakeWorker.instances[2].onerror?.();await c;});
});
