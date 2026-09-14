import {expect,it} from 'vitest';
import {billingStatusIndicators} from '../src/dashboard/BillingStatusOverview';
const metrics=[{key:'billed',count:2},{key:'unbilled',count:6},{key:'not_required',count:1},{key:'setup',count:1},{key:'past_due',count:7},{key:'over60',count:8}];
it('shows independent billing counts against positive invoice count',()=>{
 const result=billingStatusIndicators(metrics,10,true);expect(result.total).toBe(10);expect(result.segments.map(s=>s.share)).toEqual([20,60,10,10]);expect(result.segments.map(s=>s.key)).not.toContain('past_due');
});
it('does not infer missing counts or ignore a population mismatch',()=>{
 for(const data of [metrics.slice(1),metrics.map(m=>m.key==='setup'?{...m,count:null}:m)])expect(billingStatusIndicators(data,10,true).complete).toBe(false);
 expect(billingStatusIndicators(metrics,undefined,true).segments.every(s=>s.count===null&&s.share===null)).toBe(true);
 expect(billingStatusIndicators(metrics,10,false).total).toBeNull();
});
it('keeps a verified zero population without inventing percentages',()=>{
 const result=billingStatusIndicators(metrics.map(m=>({...m,count:0})),0,true);expect(result.complete).toBe(true);expect(result.total).toBe(0);expect(result.segments.every(s=>s.share===null)).toBe(true);
});
it('rejects negative, fractional and unsafe source counts',()=>{
 for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1])expect(billingStatusIndicators(metrics.map(m=>m.key==='setup'?{...m,count:value}:m),9+value,true).complete).toBe(false);
});

it('allows setup overlap without presenting a part-to-whole sum',()=>{const result=billingStatusIndicators(metrics.map(m=>m.key==='setup'?{...m,count:8}:m),10,true);expect(result.complete).toBe(true);expect(result.segments.map(s=>s.share)).toEqual([20,60,10,80]);expect(result.total).toBe(10);});
