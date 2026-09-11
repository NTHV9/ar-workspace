import {afterEach,expect,it,vi} from 'vitest';
import {activityResult,currentResult,financialResult,readDashboardOptions} from '../src/dashboard/data';
afterEach(()=>vi.unstubAllGlobals());
it('reads every account-options page without silently truncating',async()=>{
 const rows=Array.from({length:201},(_,i)=>({hotel:i%2?'TSK':'KAT',account_id:'SYN-'+i,account_name:'Synthetic '+i,account_type:'Agent'}));const calls:string[]=[];
 vi.stubGlobal('fetch',async(path:string)=>{calls.push(path);return Response.json({rows:path.endsWith('page=0')?rows.slice(0,200):rows.slice(200),total:201});});
 expect(await readDashboardOptions('synthetic',new AbortController().signal)).toHaveLength(201);expect(calls).toHaveLength(2);
});
it('rejects partial or duplicated account options instead of presenting them as complete',async()=>{
 const row={hotel:'KAT',account_id:'SYN-A',account_name:'Synthetic',account_type:'Agent'};vi.stubGlobal('fetch',async()=>Response.json({rows:[row,row],total:2}));
 await expect(readDashboardOptions('synthetic',new AbortController().signal)).rejects.toThrow('incomplete');
});
it('rejects malformed summary fields instead of turning them into zeros',()=>{
 expect(()=>activityResult({rows:[],total:1,summary:{kinds:[null]}})).toThrow();
 expect(()=>currentResult({rows:[],total:1,summary:{invoices:1,hotels:[{hotel:'KAT',accounts:1,open:20,over90:0,unverified_accounts:0,oldest_sync:'not-a-date'}]}})).toThrow();
 expect(()=>financialResult({rows:[],total:1,summary:{},coverage:{complete:true,lastSuccessAt:'bad-date',lastAttemptStatus:'succeeded'}})).toThrow();
});
