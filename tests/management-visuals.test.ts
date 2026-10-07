import {expect,it} from 'vitest';
import {syntheticManagement} from './fixtures/management-dashboard';
import {agingPlot,attentionAccounts,billingCompletion} from '../src/dashboard/management-visuals';
it('billing progress uses all outstanding values independent of period activity',()=>{
 const data=syntheticManagement();expect(billingCompletion(data)?.percent).toBeCloseTo(120/620*100);
 for(const c of data.cohort)c.amount='0.00';data.cohortComplete=false;expect(billingCompletion(data)?.percent).toBeCloseTo(120/620*100);
 data.metrics.find(m=>m.key==='billed')!.amount='12420000.00';data.metrics.find(m=>m.key==='unbilled')!.amount='3350000.00';expect(billingCompletion(data)?.percent).toBeCloseTo(1242/1577*100);
 data.complete=false;expect(billingCompletion(data)).toBeNull();
});
it('zero or invalid outstanding billing-required values never become 100 percent billed',()=>{
 const data=syntheticManagement();for(const c of data.metrics)if(['billed','unbilled'].includes(c.key))c.amount='0.00';expect(billingCompletion(data)?.percent).toBeNull();data.metrics.find(c=>c.key==='billed')!.amount='-10.00';expect(billingCompletion(data)).toBeNull();
});
it('signed hotel plots retain negative credit ranges on a common scale',()=>{
 const data=syntheticManagement();data.hotels[0].bands[5].amount='-120.00';const plot=agingPlot(data)!;expect(plot.rows[0].negative).toBe(120);expect(plot.rows[0].positive).toBe(1000);expect(plot.scale).toBe(1120);expect(plot.negativeShare).toBeCloseTo(120/1120*100);
 data.agesComplete=false;expect(agingPlot(data)).toBeNull();
});
it('ranks aged accounts needing billing first without merging hotel ledgers or mutating source order',()=>{
 const data=syntheticManagement(),before=[...data.accountsOver60!];const ranked=attentionAccounts(data);expect(ranked.slice(0,2).map(a=>a.hotel)).toEqual(['KAT','TSK']);expect(ranked.slice(0,2).every(a=>a.unbilled>0)).toBe(true);expect(data.accountsOver60).toEqual(before);data.agesComplete=false;expect(attentionAccounts(data)).toEqual([]);
});
