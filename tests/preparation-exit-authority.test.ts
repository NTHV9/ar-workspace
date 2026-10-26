import {afterEach,it,expect,vi} from 'vitest';
import {enqueueExactAbandon,readExitOutbox,deliverExitEntry} from '../src/preparation/exit-outbox';
import {documentApi} from '../worker/documents/api';
const actor='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002',job='00000000-0000-4000-8000-000000000003',command='00000000-0000-4000-8000-000000000004';
function memory(){const m=new Map<string,string>();return {get length(){return m.size;},key:(n:number)=>[...m.keys()][n]??null,getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);},clear:()=>m.clear()} as Storage;}
afterEach(()=>vi.unstubAllGlobals());
it('fresh intentional Exit persists one v2 UUID authority and reuses it when enqueue repeats',()=>{
 const storage=memory(),snapshot={actorId:actor,authSessionId:session,jobIds:[job],creates:[]};
 enqueueExactAbandon(storage,snapshot);const first=readExitOutbox(storage)[0] as any;
 enqueueExactAbandon(storage,snapshot);const second=readExitOutbox(storage)[0] as any;
 expect(first.version).toBe(2);expect(first.exitCommandId).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);expect(second.exitCommandId).toBe(first.exitCommandId);
});
it('legacy v1 transport stays bodyless and never manufactures authority',async()=>{
 const storage=memory(),entry={version:1 as const,actorId:actor,authSessionId:session,queuedAt:Date.now(),state:'pending' as const,jobId:job};
 let called=false;expect(await deliverExitEntry(storage,entry,()=>({actorId:actor,authSessionId:session,token:'synthetic'}),async(_url,init)=>{called=true;expect(new Headers(init?.headers).has('X-AR-Exit-Command')).toBe(false);expect(init?.body).toBeUndefined();return Response.json({job:{id:job},outcome:'protected'});})).toBe(true);expect(called).toBe(true);
});
it('marked fresh protected Exit records authority through the existing authenticated route',async()=>{
 const calls:{name:string;args:any}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{const name=url.split('/').at(-1)!;const args=JSON.parse(String(init.body));calls.push({name,args});if(name==='ar_document_get')return Response.json({id:job,owner:actor,lifecycle:'transient'});if(name==='ar_document_abandon'||name==='ar_document_exit')return Response.json({job:{id:job},outcome:'protected'});return Response.json({accepted:true});});
 const response=await documentApi(new Request(`https://app.test/api/documents/${job}/abandon`,{method:'POST',headers:{'X-AR-Exit-Command':command}}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor,REQUEST_SESSION:session},actor,{});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({outcome:'protected'});
 expect(calls.some(c=>Object.values(c.args).includes(command))).toBe(true);
});
it('malformed or duplicate marker is rejected before any abandonment mutation',async()=>{
 const mutations:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/ar_document_get'))return Response.json({id:job,owner:actor,lifecycle:'transient'});mutations.push(url);return Response.json({job:{id:job},outcome:'protected'});});
 const response=await documentApi(new Request(`https://app.test/api/documents/${job}/abandon`,{method:'POST',headers:{'X-AR-Exit-Command':`${command},${command}`}}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor,REQUEST_SESSION:session},actor,{});
 expect(response.status).toBe(400);expect(mutations).toHaveLength(0);
});
it('settled legacy protected command replay returns terminal result without fresh known-job abandon',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{const name=url.split('/').at(-1)!;calls.push(name);if(name==='ar_document_command_abandon'||name==='ar_document_command_exit')return Response.json({commandKey:command,hotel:'KAT',payloadDigest:'a'.repeat(64),job_id:job,job:{id:job},outcome:'protected'});throw Error('Settled receipt must not call fresh abandon');});
 const response=await documentApi(new Request(`https://app.test/api/documents/commands/${command}/abandon`,{method:'POST',headers:{'Content-Type':'application/json','X-AR-Exit-Command':session},body:JSON.stringify({hotel:'KAT',payloadDigest:'a'.repeat(64)})}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor,REQUEST_SESSION:session},actor,{});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({outcome:'protected'});expect(calls).toEqual(['ar_document_command_exit']);
});

it('offline closed-tab v2 metadata survives same-actor reauthentication without minting a marker',async()=>{
 const storage=memory(),[entry]=enqueueExactAbandon(storage,{actorId:actor,authSessionId:session,jobIds:[job],creates:[]});
 const original=JSON.stringify(readExitOutbox(storage));let calls=0;
 expect(await deliverExitEntry(storage,entry,()=>({actorId:actor,authSessionId:command,token:'fresh-current'}),async(_url,init)=>{calls++;const headers=new Headers(init?.headers);expect(headers.get('X-AR-Exit-Origin-Session')).toBe(session);expect(headers.get('X-AR-Exit-Command')).toBe(entry.exitCommandId);expect(headers.get('Authorization')).toBe('Bearer fresh-current');expect(JSON.stringify(readExitOutbox(storage))).toBe(original);return Response.json({job:{id:job},outcome:'protected'});})).toBe(true);
 expect(calls).toBe(1);expect(readExitOutbox(storage)).toEqual([]);
});
