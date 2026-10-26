import {afterEach,describe,expect,it,vi} from 'vitest';
import {attachTabExit,createPreparationExit,afterConfirmedSent} from '../src/preparation/tab-exit';
import {enqueueExactAbandon,deliverExitEntry,readExitOutbox,reconcileExitOutbox} from '../src/preparation/exit-outbox';
import {documentCreateDigest} from '../shared/document-create-digest';
import type {DocumentJob} from '../worker/documents/jobs';
const actor='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002',job='00000000-0000-4000-8000-000000000003',command='00000000-0000-4000-8000-000000000004';
function storage():Storage{const map=new Map<string,string>();return {get length(){return map.size;},clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);}};}
const hide=(target:EventTarget,persisted=false)=>target.dispatchEvent(Object.assign(new Event('pagehide'),{persisted}));
afterEach(()=>vi.unstubAllGlobals());
it('reload PageSwap (including null activation), bfcache, focus and disposal never discard; subsequent real close fires once',()=>{
 const target=Object.assign(new EventTarget(),{onpageswap:null}) as unknown as Window,exit=vi.fn(),dispose=attachTabExit(target,exit);
 for(const name of ['blur','visibilitychange','focus'])target.dispatchEvent(new Event(name));expect(exit).not.toHaveBeenCalled();
 target.dispatchEvent(Object.assign(new Event('pageswap'),{activation:null}));hide(target);expect(exit).not.toHaveBeenCalled();
 target.dispatchEvent(new Event('pageshow'));hide(target,true);expect(exit).not.toHaveBeenCalled();
 target.dispatchEvent(new Event('pageshow'));hide(target);hide(target);expect(exit).toHaveBeenCalledTimes(1);dispose();expect(exit).toHaveBeenCalledTimes(1);
});
it('unsupported event surface preserves work',()=>{const target=new EventTarget() as unknown as Window,exit=vi.fn();attachTabExit(target,exit);hide(target);expect(exit).not.toHaveBeenCalled();});
it('durably stores deduped exact metadata before transport and uses current token with no unload signal',async()=>{
 const s=storage(),snapshot={actorId:actor,authSessionId:session,jobIds:[job,job],creates:[{commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64)}]};
 enqueueExactAbandon(s,snapshot);enqueueExactAbandon(s,snapshot);expect(readExitOutbox(s)).toHaveLength(2);
 const text=JSON.stringify(readExitOutbox(s));expect(text).not.toMatch(/Bearer|token|account|pdf|storage_key/i);
 let token='expired';let init:RequestInit|undefined;const transport=vi.fn(async(_path:string|URL|Request,request?:RequestInit)=>{init=request;expect(readExitOutbox(s).length).toBe(2);return Response.json({job:{id:job},outcome:'pending'});});token='current';
 const entry=readExitOutbox(s)[0];expect(await deliverExitEntry(s,entry,()=>({actorId:actor,authSessionId:session,token}),transport)).toBe(true);
 expect(init).toMatchObject({method:'POST',keepalive:true,redirect:'error',headers:{Authorization:'Bearer current'}});expect(init?.body).toBeUndefined();expect(init?.signal).toBeUndefined();expect(readExitOutbox(s)).toHaveLength(1);
});
for(const outcome of ['discarded','pending','protected'])it(`settles only exact ${outcome} receipt; mismatched job/actor/session retain metadata`,async()=>{
 const s=storage();const [entry]=enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[job],creates:[]});let auth={actorId:actor,authSessionId:session,token:'current'};
 expect(await deliverExitEntry(s,entry,()=>auth,async()=>Response.json({job:{id:command},outcome}))).toBe(false);
 expect(await deliverExitEntry(s,entry,()=>({...auth,actorId:command}),async()=>{throw Error('must not transport');})).toBe(false);
 expect(await deliverExitEntry(s,entry,()=>auth,async()=>{auth={...auth,authSessionId:command};return Response.json({job:{id:job},outcome});})).toBe(false);expect(readExitOutbox(s)).toHaveLength(1);
 expect(await deliverExitEntry(s,entry,()=>auth,async()=>Response.json({job:{id:job},outcome}))).toBe(true);expect(readExitOutbox(s)).toHaveLength(0);
});
it('failed auth/transport/invalid receipt never evicts unresolved metadata',async()=>{
 const s=storage();const [entry]=enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[job],creates:[]});
 for(const transport of [async()=>new Response('',{status:401}),async()=>{throw Error('network');},async()=>Response.json({job:{id:job},outcome:'created'})])expect(await deliverExitEntry(s,entry,()=>({actorId:actor,authSessionId:session,token:'current'}),transport)).toBe(false);
 expect(readExitOutbox(s)).toHaveLength(1);
});
it('captures all verified children/replacement and dispatched create; departed late response cannot restore work',async()=>{
 const s=storage(),auth={actorId:actor,authSessionId:session,token:'current'},exit=createPreparationExit(actor,session,actor,s,()=>auth);vi.stubGlobal('fetch',async()=>new Response('',{status:503}));
 for(const id of [job,command])exit.retainJob({id,owner:actor,lifecycle:'transient'} as DocumentJob);
 await exit.retainCreate({commandKey:session,hotel:'KAT',accountId:'Synthetic',ids:['A'],content:'statement',layout:'combined',purpose:'billing',statementSource:'workspace'});exit.exit();expect(readExitOutbox(s)).toHaveLength(3);
 expect(()=>exit.created(session,{id:job,owner:actor} as DocumentJob)).toThrow('session changed');expect(()=>exit.retainJob({id:job,owner:command} as DocumentJob)).toThrow();
});
it('resume reconciles only exact pending job and blocks silent resume; unrelated work continues',async()=>{
 const s=storage(),auth={actorId:actor,authSessionId:session,token:'current'},exit=createPreparationExit(actor,session,actor,s,()=>auth);enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[job],creates:[]});const calls:string[]=[];vi.stubGlobal('fetch',async(path:string)=>{calls.push(path);return Response.json(path.endsWith('/abandon')?{job:{id:job},outcome:'protected'}:{id:job,owner:actor,lifecycle:'transient'});});
 await exit.beforeResume(command);expect(calls).toEqual([]);await expect(exit.beforeResume(job)).rejects.toThrow('cleanup was requested');expect(calls).toEqual([`/api/documents/${job}`,`/api/documents/${job}/abandon`]);expect(readExitOutbox(s)).toEqual([]);
});
for(const delivery of [{state:'awaiting_evidence',recorded:false},{state:'created',recorded:false,mode:'draft'},{state:'sent',recorded:false},{state:'sent',recorded:true,mode:'test'}])it(`preserves ${JSON.stringify(delivery)} without any cleanup request`,async()=>{const fetcher=vi.fn();await afterConfirmedSent([job],delivery,()=>'',()=>true,fetcher);expect(fetcher).not.toHaveBeenCalled();});
it('verified single/combined Sent initiates only exact closed Sent jobs; failure cannot become resend',async()=>{
 const calls:string[]=[];await afterConfirmedSent([job,job,command],{state:'sent',recorded:true},()=> 'current',()=>true,async(path,init)=>{calls.push(String(path));if(init?.method==='POST')throw Error('cleanup failed');return Response.json({id:String(path).split('/').at(-1),lifecycle:'transient',closed_at:'2026-10-27',closed_reason:String(path).endsWith(job)?'sent':'discarded'});});
 expect(calls).toEqual([`/api/documents/${job}`,`/api/documents/${job}/abandon`,`/api/documents/${command}`]);
});
it('digest binds ordered Unicode/whitespace fields without storing customer data',async()=>{
 const input={hotel:'KAT',accountId:'a:ไทย',ids:['C','A'],content:'both',layout:'combined',purpose:'billing',statementSource:'workspace'};const digest=await documentCreateDigest(input);expect(digest).toMatch(/^[0-9a-f]{64}$/);expect(await documentCreateDigest({...input,ids:['A','C']})).not.toBe(digest);expect(await documentCreateDigest({...input,accountId:'a:ไทย '})).not.toBe(digest);
});

it('captures all twenty batch children plus exact replacement and rejects a wider scope',()=>{
 const s=storage(),auth={actorId:actor,authSessionId:session,token:'current'},exit=createPreparationExit(actor,session,actor,s,()=>auth);vi.stubGlobal('fetch',async()=>new Response('',{status:503}));
 const ids=Array.from({length:21},(_,i)=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`);for(const id of ids)exit.retainJob({id,owner:actor,lifecycle:'transient'} as DocumentJob);
 expect(()=>exit.retainJob({id:job,owner:actor,lifecycle:'transient'} as DocumentJob)).toThrow('scope is full');exit.exit();expect(readExitOutbox(s).map(e=>'jobId'in e?e.jobId:'')).toEqual(ids);
});
it('startup reconciliation cannot erase the exact exited resume fence',async()=>{
 const s=storage(),auth={actorId:actor,authSessionId:session,token:'current'};enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[job],creates:[]});const exit=createPreparationExit(actor,session,actor,s,()=>auth);
 vi.stubGlobal('fetch',async(path:string)=>Response.json(path.endsWith('/abandon')?{job:{id:job},outcome:'protected'}:{id:job,owner:actor,lifecycle:'transient'}));await exit.reconcile();expect(readExitOutbox(s)).toEqual([]);await expect(exit.beforeResume(job)).rejects.toThrow('cleanup was requested');await exit.beforeResume(command);
});
it('command replay requires its exact hotel/digest receipt and never replays create',async()=>{
 const s=storage(),auth={actorId:actor,authSessionId:session,token:'current'};const [entry]=enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[],creates:[{commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64)}]});let body:unknown,path='';
 const transport=async(input:Request|string|URL,init?:RequestInit)=>{path=String(input);body=JSON.parse(String(init?.body));return Response.json({commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64),outcome:'cancelled'});};
 expect(await deliverExitEntry(s,entry,()=>auth,transport)).toBe(true);expect(path).toBe(`/api/documents/commands/${command}/abandon`);expect(body).toEqual({hotel:'KAT',payloadDigest:'a'.repeat(64)});expect(readExitOutbox(s)).toEqual([]);
});
it('unresolved aggregate metadata is never evicted to admit a larger snapshot',()=>{
 const s=storage();let rejected=false;for(let n=0;n<200;n++){const id=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;try{enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[id],creates:[]});}catch{rejected=true;break;}}
 expect(rejected).toBe(true);const before=JSON.stringify(readExitOutbox(s));expect(()=>enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:Array.from({length:42},(_,n)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`),creates:[]})).toThrow();expect(JSON.stringify(readExitOutbox(s))).toBe(before);
});
it('accepted command exit retires only its exact old create pointer so a new round gets a fresh command',async()=>{
 const s=storage(),resume=storage();resume.setItem('ar-document-command:old',command);resume.setItem('ar-document-command:other',job);vi.stubGlobal('sessionStorage',resume);
 const [entry]=enqueueExactAbandon(s,{actorId:actor,authSessionId:session,jobIds:[],creates:[{commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64)}]});
 await deliverExitEntry(s,entry,()=>({actorId:actor,authSessionId:session,token:'current'}),async()=>Response.json({commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64),outcome:'cancelled'}));
 expect(resume.getItem('ar-document-command:old')).toBeNull();expect(resume.getItem('ar-document-command:other')).toBe(job);
});
