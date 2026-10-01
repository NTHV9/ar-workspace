import {afterEach,expect,it,vi} from 'vitest';
import {loadJobSources} from '../src/pdf/load-job-sources';
import type {DocumentJob} from '../worker/documents/jobs';
const job:DocumentJob={id:'synthetic-job',owner:'synthetic',hotel:'KAT',account_id:'A',account_name:'Synthetic',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:['1','2','3'],manifest:[],state:'ready',revision:0,project_key:null,exports:[],acknowledged:false,created_at:'2026-10-01',files:[1,2,3].map(id=>({id:String(id),kind:'invoice',invoice_id:String(id),ordinal:id,state:'ready',storage_key:null,error_code:null,byte_count:3,sha256:null}))};
afterEach(()=>vi.unstubAllGlobals());
it('bounds concurrent source loading and keeps manifest order despite reversed completion',async()=>{
 let release=()=>{};const gate=new Promise<void>(r=>{release=r;}),started:string[]=[];let active=0,peak=0;
 vi.stubGlobal('fetch',async(url:string)=>{const id=url.split('/').at(-1)!;started.push(id);peak=Math.max(peak,++active);if(id==='1')await gate;active--;return new Response(new Uint8Array([Number(id),0,0]));});
 const loading=loadJobSources(job,'synthetic',100);try{await vi.waitFor(()=>expect(started).toEqual(['1','2']));}finally{release();}
 const docs=await loading;expect(docs.map(d=>d.id)).toEqual(['1','2','3']);expect(peak).toBe(2);
});
it('rejects actual oversized or changed sources and never returns a partial package',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(new Uint8Array([1,2,3,4])));
 await expect(loadJobSources(job,'synthetic',100)).rejects.toThrow('changed');
 await expect(loadJobSources({...job,files:job.files.map(f=>({...f,byte_count:null}))},'synthetic',3)).rejects.toThrow('memory budget');
});
it('verifies the exact private file digest rather than opening substituted bytes',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(new Uint8Array([1,2,3])));
 await expect(loadJobSources({...job,files:[{...job.files[0],sha256:'0'.repeat(64)}]},'synthetic',10)).rejects.toThrow('changed');
});
