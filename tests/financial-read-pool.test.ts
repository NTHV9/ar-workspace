import {afterEach,expect,it,vi} from 'vitest';
import {mapFinancialReads} from '../worker/opera/bounded-read';
afterEach(()=>vi.useRealTimers());
it('fills a free slot while an earlier proof is still slow, without exceeding three',async()=>{
 vi.useFakeTimers();let active=0,peak=0;const started:number[]=[],start=Date.now();
 const pending=mapFinancialReads([0,1,2,3,4,5],async n=>{started.push(n);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,n===0?100:10));active--;return n;});
 await vi.advanceTimersByTimeAsync(25);expect(started).toContain(3);
 await vi.runAllTimersAsync();expect(await pending).toEqual([0,1,2,3,4,5]);expect(peak).toBe(3);expect(active).toBe(0);expect(Date.now()-start).toBe(100);
});
