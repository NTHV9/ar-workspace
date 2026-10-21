import {describe,it,expect,vi,afterEach} from 'vitest';
import {nativeTextCandidate} from '../src/pdf/native/candidate';
import {registerSourceStyle,createReplacementLayer} from '../src/pdf/source-text';
import type {DetectedText,PdfProjectPage} from '../src/pdf/types';
import {applyFlowEdit} from '../src/pdf/flow';
function page():PdfProjectPage{
 const run:DetectedText={text:'INVOICE',x:20,y:30,width:90,height:26,fontSize:20,rotated:false,fontLabel:'Helvetica-Bold',color:'#ffffff',bold:true,italic:false,sourceText:{sourceId:'s',sourcePage:1,runIndex:0,scope:'worker-test'}};
 const layer=createReplacementLayer(run,'l');layer.text='BILL';registerSourceStyle(run.sourceText!,{font:'font',fontSize:20,bold:true,italic:false,color:'#ffffff',baseline:18,hScale:1,charSpacing:0,wordSpacing:0,glyphs:new Map(Array.from('INVOICEBILL').map(c=>[c,{unicode:c,fontChar:c,width:600,isInFont:true}])),sequence:[],supported:true,run});return {id:'p',sourceId:'s',sourcePage:1,width:400,height:300,layers:[layer]};
}
class FakeWorker{
 static instances:FakeWorker[]=[];onerror?:()=>void;onmessage?:(e:{data:unknown})=>void;terminate=vi.fn();postMessage=vi.fn();constructor(){FakeWorker.instances.push(this);}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();FakeWorker.instances=[];});
describe('bounded native worker lifecycle',()=>{
 it('keeps the latest queued typing state and cancels superseded work',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const a=nativeTextCandidate(new Uint8Array([1]),page()),b=nativeTextCandidate(new Uint8Array([1]),page()),old=nativeTextCandidate(new Uint8Array([1]),page()),latestPage=page();latestPage.layers[0].text='BI';const latest=nativeTextCandidate(new Uint8Array([1]),latestPage);
  expect(await old).toBeUndefined();expect(FakeWorker.instances).toHaveLength(2);FakeWorker.instances[0].onerror?.();expect(FakeWorker.instances[2].postMessage.mock.calls[0][0].edits[0].text).toBe('BI');FakeWorker.instances[1].onerror?.();FakeWorker.instances[2].onerror?.();await Promise.all([a,b,latest]);
 });
 it('aborts a queued page without ever constructing its worker',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const a=nativeTextCandidate(new Uint8Array([1]),page()),b=nativeTextCandidate(new Uint8Array([1]),page()),abort=new AbortController(),waiting=nativeTextCandidate(new Uint8Array([1]),page(),abort.signal);abort.abort();expect(await waiting).toBeUndefined();for(const w of FakeWorker.instances)w.onerror?.();await Promise.all([a,b]);expect(FakeWorker.instances).toHaveLength(2);
 });
 it('bounds waiting pages at eight and settles the evicted request',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const a=nativeTextCandidate(new Uint8Array([1]),page()),b=nativeTextCandidate(new Uint8Array([1]),page()),waiting=Array.from({length:9},(_,i)=>nativeTextCandidate(new Uint8Array([1]),{...page(),id:'waiting-'+i}));
  expect(await waiting[0]).toBeUndefined();for(const w of FakeWorker.instances)w.onerror?.();await Promise.all([a,b,...waiting]);expect(FakeWorker.instances).toHaveLength(10);
 });
 it.each([false,true])('sends exact empty native text for clear or delete (%s)',async(deleted)=>{
  vi.stubGlobal('Worker',FakeWorker);const p=page();p.layers[0].text='';p.layers[0].deleted=deleted||undefined;
  const pending=nativeTextCandidate(new Uint8Array([1]),p),worker=FakeWorker.instances[0];
  expect(worker).toBeDefined();expect(worker.postMessage.mock.calls[0][0].edits[0].text).toBe('');
  worker.onmessage?.({data:{bytes:new Uint8Array([2]),applied:['l']}});expect((await pending)?.applied).toEqual(['l']);
 });
 it('does not reinterpret a malformed nonempty deleted layer',async()=>{vi.stubGlobal('Worker',FakeWorker);const p=page();p.layers[0].deleted=true;expect(await nativeTextCandidate(new Uint8Array([1]),p)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(0);});
 it('edits immutable source coordinates after a verified row shift, refusing stale positions',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const shifted=page();shifted.rowEdits=[{id:'space',kind:'insert',y:10,height:20}];shifted.layers[0].y+=20;
  const pending=nativeTextCandidate(new Uint8Array([1]),shifted),worker=FakeWorker.instances[0];expect(worker).toBeDefined();
  expect(worker.postMessage.mock.calls[0][0].edits[0]).toMatchObject({x:20,baseline:252});worker.onmessage?.({data:{bytes:new Uint8Array([2]),applied:['l']}});await pending;
  shifted.layers[0].y+=1;expect(await nativeTextCandidate(new Uint8Array([1]),shifted)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(1);
 });
 it('does not move replacement text beneath an earlier overlapping overlay',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const p=page(),overlay={...p.layers[0],id:'cover',kind:'whiteout' as const,sourceText:undefined,original:undefined,text:''};p.layers.unshift(overlay);
  const pending=nativeTextCandidate(new Uint8Array([1]),p),created=FakeWorker.instances.length;for(const w of FakeWorker.instances)w.onerror?.();expect(await pending).toBeUndefined();expect(created).toBe(0);
 });
 it('refuses native text split by an inserted row boundary',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const split=applyFlowEdit(page(),{id:'split',kind:'insert',y:40,height:20});
  const pending=nativeTextCandidate(new Uint8Array([1]),split),created=FakeWorker.instances.length;for(const w of FakeWorker.instances)w.onerror?.();await pending;expect(created).toBe(0);
 });
 it('does not bypass a resized box or source font warning through native editing',async()=>{vi.stubGlobal('Worker',FakeWorker);const resized=page();resized.layers[0].width=10;resized.layers[0].height=2;expect(await nativeTextCandidate(new Uint8Array([1]),resized)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(0);
 const duplicate=page();duplicate.layers.push({...duplicate.layers[0],id:'duplicate'});expect(await nativeTextCandidate(new Uint8Array([1]),duplicate)).toBeUndefined();
 const unsupported=page();unsupported.layers[0].text='X';expect(await nativeTextCandidate(new Uint8Array([1]),unsupported)).toBeUndefined();expect(FakeWorker.instances).toHaveLength(0);});
 it('terminates on timeout and ignores late results',async()=>{vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);const pending=nativeTextCandidate(new Uint8Array([1,2]),page());const worker=FakeWorker.instances[0];await vi.advanceTimersByTimeAsync(10_001);expect(await pending).toBeUndefined();worker.onmessage?.({data:{bytes:new Uint8Array([7]),applied:['l']}});expect(worker.terminate).toHaveBeenCalledOnce();});
 it('cancels a disposed document and transfers a copy of original bytes',async()=>{vi.stubGlobal('Worker',FakeWorker);const bytes=new Uint8Array([1,2]),abort=new AbortController(),pending=nativeTextCandidate(bytes,page(),abort.signal),worker=FakeWorker.instances[0];expect(worker.postMessage.mock.calls[0][0].bytes).not.toBe(bytes);abort.abort();expect(await pending).toBeUndefined();expect(bytes).toEqual(new Uint8Array([1,2]));expect(worker.terminate).toHaveBeenCalledOnce();});
 it('bounds running workers at two and waits for capacity instead of abandoning the current edit',async()=>{vi.stubGlobal('Worker',FakeWorker);const a=nativeTextCandidate(new Uint8Array([1]),page()),b=nativeTextCandidate(new Uint8Array([1]),page()),c=nativeTextCandidate(new Uint8Array([1]),page());expect(FakeWorker.instances).toHaveLength(2);FakeWorker.instances[0].onerror?.();expect(FakeWorker.instances).toHaveLength(3);FakeWorker.instances[1].onerror?.();FakeWorker.instances[2].onerror?.();await Promise.all([a,b,c]);});
});
