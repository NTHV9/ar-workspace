import {expect,it} from 'vitest';
import {createBatch,loadBatch,saveBatch,assertBatchJob,freezeMail,sendBatch,type BatchMailSnapshot} from '../src/batch/state';
import type {BatchSelection} from '../src/batch/selection';
const a:BatchSelection={key:'a',hotel:'KAT',accountId:'10',accountName:'Synthetic',ids:['1'],purpose:'billing',stage:'Billing',amount:100};
const storage=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
it('keeps staff tab ownership separate from authorized shared document ownership',()=>{
 const s=storage(),staff=crypto.randomUUID(),workspace=crypto.randomUUID();
 const batch=createBatch(staff,'phuket',[a],{content:'both',layout:'combined'},workspace);
 saveBatch(s,batch);
 expect(loadBatch(s,workspace,batch.id,'phuket')).toBeNull();
 expect(loadBatch(s,staff,batch.id,'phuket')?.workspaceOwner).toBe(workspace);
 const job={id:crypto.randomUUID(),owner:workspace,hotel:'KAT',account_id:'10',invoice_ids:['1']};
 expect(()=>assertBatchJob(batch,batch.entries[0],job)).not.toThrow();
 expect(()=>assertBatchJob(batch,batch.entries[0],{...job,owner:staff})).toThrow();
});
it('persists stable creation commands scoped to the owner and region without credentials',()=>{
 const s=storage(),batch=createBatch('actor','phuket',[a,{...a,key:'b',accountId:'20'}],{content:'both',layout:'combined'});
 saveBatch(s,batch);expect(loadBatch(s,'actor',batch.id,'phuket')).toEqual(batch);expect(loadBatch(s,'another',batch.id,'phuket')).toBeNull();
 expect(loadBatch(s,'actor',batch.id,'khao-lak')).toBeNull();expect(batch.entries[0].commandKey).not.toBe(batch.entries[1].commandKey);
});
it('rejects overlapping invoice membership in two stages and cross-region groups',()=>{
 expect(()=>createBatch('actor','phuket',[a,{...a,key:'b',stage:'Follow 1'}],{content:'both',layout:'combined'})).toThrow();
 expect(()=>createBatch('actor','phuket',[{...a,hotel:'TSAN'}],{content:'both',layout:'combined'})).toThrow();
});
it('checks every returned document identity before associating it with a batch entry',()=>{
 const batch=createBatch('actor','phuket',[a],{content:'both',layout:'combined'}),entry=batch.entries[0];
 const job={id:crypto.randomUUID(),owner:'actor',hotel:'KAT',account_id:'10',invoice_ids:['1']};
 expect(()=>assertBatchJob(batch,entry,job)).not.toThrow();
 expect(()=>assertBatchJob(batch,entry,{...job,hotel:'TSK'})).toThrow();
 expect(()=>assertBatchJob(batch,entry,{...job,invoice_ids:['2']})).toThrow();
});
const mail=(id:string):BatchMailSnapshot=>({jobId:id,documentRevision:1,draftId:id,mailRevision:2,hotel:'KAT',accountId:'10',accountName:'Synthetic',sender:'ar@katathani.com',purpose:'billing',stage:null,policyVersion:null,recipients:{to:['billing@example.invalid'],cc:[],bcc:[]},subject:'Synthetic',files:['Statement.pdf'],blocked:null,delivery:null});
it('freezes reviewed recipients and revisions rather than observing later edits',()=>{
 const input=mail('one'),approved=freezeMail([input]);input.mailRevision=99;input.recipients.to[0]='changed@example.invalid';expect(approved[0].mailRevision).toBe(2);expect(approved[0].recipients.to).toEqual(['billing@example.invalid']);
});
it('runs at most two sends and never retries an uncertain failure or already-sent entry',async()=>{
 let active=0,peak=0;const calls:string[]=[],results:string[]=[];const rows=[mail('1'),mail('2'),{...mail('3'),delivery:{id:'old',mode:'send',state:'sent'}},mail('4')];
 await sendBatch(freezeMail(rows),async m=>{calls.push(m.draftId);peak=Math.max(peak,++active);await Promise.resolve();active--;if(m.draftId==='2')throw Error('timeout');return {id:m.draftId,mode:'send',state:'sent'};},(m,r)=>results.push(m.draftId+':'+r.state));
 expect(peak).toBeLessThanOrEqual(2);expect(calls.sort()).toEqual(['1','2','4']);expect(results).toContain('2:checking');expect(calls.filter(x=>x==='2')).toHaveLength(1);
});
