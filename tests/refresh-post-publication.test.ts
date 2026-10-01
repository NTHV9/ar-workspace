import {expect,it} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import {postPublicationMaintenance} from '../worker/refresh/post-publication';
const payload={runId:'synthetic',hotel:'KAT'};
it.each(['open','manual'])('%s current refresh releases capacity immediately after publication',async refreshReason=>{
 const calls:string[]=[],step={do:async(name:string)=>{calls.push(name);return {};}} as unknown as WorkflowStep;
 await postPublicationMaintenance({RETENTION_ENABLED:'true'},{...payload,refreshReason},step);expect(calls).toEqual([]);
});
it('daily maintenance remains scheduled and its timeout cannot invalidate a successful publication',async()=>{
 const calls:string[]=[],step={do:async(name:string)=>{calls.push(name);if(name==='completed-file-retention')throw Error('synthetic maintenance timeout');return {};}} as unknown as WorkflowStep;
 await expect(postPublicationMaintenance({RETENTION_ENABLED:'true'},{...payload,refreshReason:'scheduled'},step)).resolves.toBeUndefined();expect(calls).toEqual(['period-summary-precompute','completed-file-retention']);
});
