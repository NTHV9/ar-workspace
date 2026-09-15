import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {mapFinancialReads} from '../worker/opera/bounded-read';
afterEach(()=>vi.useRealTimers());

it('drains all admitted reads after failure and does not start the next batch',async()=>{
 vi.useFakeTimers();const started:number[]=[],finished:number[]=[];let settled=false;
 const result=mapFinancialReads([0,1,2,3,4],async n=>{started.push(n);await new Promise(resolve=>setTimeout(resolve,n===0?10:100));finished.push(n);if(n===0)throw Error('synthetic failure');return n;});
 const checked=result.catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);expect(started).toEqual([0,1,2]);
 await vi.runAllTimersAsync();expect((await checked).message).toBe('synthetic failure');expect(finished).toEqual([0,1,2]);expect(started).toEqual([0,1,2]);
});

it('handles synchronous reader failures without leaving peer promises unobserved',async()=>{
 const finished:number[]=[];
 await expect(mapFinancialReads([0,1,2,3],n=>{if(n===0)throw Error('synthetic failure');return Promise.resolve().then(()=>{finished.push(n);return n;});})).rejects.toThrow('synthetic failure');
 expect(finished).toEqual([1,2]);
});

it('keeps the history queue separate and bounds two hotels to at most six financial read chains',()=>{
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 expect(config.workflows.map((workflow:{binding:string;concurrency:{limit:number}})=>[workflow.binding,workflow.concurrency.limit])).toEqual([['AR_DOCUMENTS',2],['AR_REFRESH',2],['AR_FINANCIAL',2]]);
 expect(config.triggers.crons).toEqual(['0 0,12 * * *','*/15 * * * *']);
});
