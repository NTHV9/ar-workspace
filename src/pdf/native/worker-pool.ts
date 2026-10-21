import type {NativeRequest,NativeResult} from './protocol';
type Pending={start:()=>void;cancel:()=>void};
let running=0;
const queued=new Map<string,Pending>();
const drain=()=>{while(running<2&&queued.size){const [key,job]=queued.entries().next().value!;queued.delete(key);job.start();}};
/** Two running workers, at most eight waiting pages, latest queued state per page.
 * Keep original bytes by reference until admission; only the worker gets a copy. */
export function runNativeWorker(key:string,request:NativeRequest,signal?:AbortSignal):Promise<NativeResult|undefined>{
 if(signal?.aborted)return Promise.resolve(undefined);
 return new Promise(resolve=>{
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
  const finish=(result?:NativeResult)=>{
   if(settled)return;settled=true;if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(queued.get(key)===job)queued.delete(key);
   if(worker){running--;worker.terminate();}resolve(result);drain();
  };
  const abort=()=>finish();
  const job:Pending={cancel:abort,start:()=>{
   if(settled)return;if(signal?.aborted){finish();return;}
   try{worker=new Worker(new URL('./native.worker.ts',import.meta.url),{type:'module'});}catch{finish();return;}
   running++;timer=setTimeout(()=>finish(),10_000);
   worker.onerror=()=>finish();worker.onmessage=(event:MessageEvent<NativeResult>)=>finish(event.data.applied?.length||event.data.unsupportedPage?event.data:undefined);
   const copy=request.bytes.slice();try{worker.postMessage({...request,bytes:copy},[copy.buffer]);}catch{finish();}
  }};
  signal?.addEventListener('abort',abort,{once:true});
  if(running<2)job.start();else{
   queued.get(key)?.cancel();queued.set(key,job);
   if(queued.size>8)queued.values().next().value!.cancel();
  }
 });
}
