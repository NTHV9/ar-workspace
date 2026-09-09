import {expect,it} from 'vitest';
import {handleApi} from '../worker/index';
it('protects account settings and historical workflow edits before any write',async()=>{
 for(const [path,method] of [['/api/account-settings/KAT/example','GET'],['/api/account-settings/KAT/example','PUT'],['/api/invoice-history/KAT/example/1','PUT']])expect((await handleApi(new Request('https://app.test'+path,{method}),{})).status).toBe(401);
});
