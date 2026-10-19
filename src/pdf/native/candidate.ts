import {sourceStyle,measureLayerText} from '../source-text';
import type {PdfProjectPage} from '../types';
import type {NativeRequest,NativeResult} from './protocol';
let activeWorkers=0;
/** Isolated per transaction: hard timeout terminates WASM, no persistent handles. */
export function nativeTextCandidate(bytes:Uint8Array,page:PdfProjectPage,signal?:AbortSignal):Promise<NativeResult|undefined>{
 if(signal?.aborted)return Promise.resolve(undefined);
 if(activeWorkers>=2||typeof Worker==='undefined'||!page.sourcePage||page.rowEdits?.length||bytes.length>32*1024*1024)return Promise.resolve(undefined);
 const edits:NativeRequest['edits']=[];
 for(const l of page.layers){const s=sourceStyle(l),r=l.original,metrics=measureLayerText(l);
  if(l.sourceText?.sourceId!==page.sourceId||l.sourceText?.sourcePage!==page.sourcePage||!s?.supported||!r||metrics.unsupported||metrics.lines.length!==1||metrics.width>l.width+.5||metrics.height>l.height+.5||l.kind!=='replacement'||l.deleted||l.maskOriginal===false||l.formField||l.text===r.text||!l.text||/[\r\n]/.test(l.text)||Math.abs(l.x-r.x)>.01||Math.abs(l.y-r.y)>.01||l.fontSize!==s.fontSize||l.bold!==!!s.run.bold||l.italic!==!!s.run.italic||l.color.toLowerCase()!==s.color.toLowerCase()||l.fill.toLowerCase()!=='#ffffff')continue;
  if(page.layers.filter(other=>other.original?.text===r.text&&Math.abs(other.original.x-r.x)<.01&&Math.abs(other.original.y-r.y)<.01&&other.maskOriginal!==false).length!==1)continue;
  edits.push({id:l.id,expectedText:r.text,text:l.text,x:r.x,baseline:page.height-r.y-s.baseline,fontSize:s.fontSize,fontLabel:s.run.fontLabel??'',color:s.color,bold:l.bold,italic:l.italic});
 }
 if(!edits.length)return Promise.resolve(undefined);
 return new Promise(resolve=>{
  let worker:Worker;try{worker=new Worker(new URL('./native.worker.ts',import.meta.url),{type:'module'});}catch{resolve(undefined);return;}
  activeWorkers++;let settled=false;const finish=(result?:NativeResult)=>{if(settled)return;settled=true;activeWorkers--;clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();resolve(result);};
  const abort=()=>finish();signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>finish(),10_000);
  worker.onerror=()=>finish();worker.onmessage=(event:MessageEvent<NativeResult>)=>finish(event.data.applied?.length||event.data.unsupportedPage?event.data:undefined);
  const copy=bytes.slice();try{worker.postMessage({bytes:copy,page:page.sourcePage!-1,edits} satisfies NativeRequest,[copy.buffer]);}catch{finish();}
 });
}
