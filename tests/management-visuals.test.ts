import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingProgress} from '../src/dashboard/ManagementVisuals';
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
it('setup-only outstanding invoices explain missing billing rules without drawing a completion ring',()=>{
 const data=syntheticManagement('khao-lak');
 for(const metric of data.metrics)if(['billed','unbilled','not_required'].includes(metric.key)){metric.amount='0.00';metric.count=0;}
 Object.assign(data.metrics.find(m=>m.key==='setup')!,{count:909,amount:'22600000.00'});
 const scope={hotel:'All',region:'khao-lak' as const,day:data.to,from:data.from,to:data.to,type:'',account:''};
 const markup=renderToStaticMarkup(createElement(BillingProgress,{data,scope,onDetail:()=>{}}));
 expect(markup).toContain('Billing rules need setup');expect(markup).not.toContain('No outstanding billing-required value');expect(markup).not.toContain('role="img"');expect(markup).toContain('909');expect(markup).toContain('22,600,000.00');expect(markup).toContain('Setup needed');
 data.metrics.find(m=>m.key==='setup')!.count=0;
 expect(renderToStaticMarkup(createElement(BillingProgress,{data,scope,onDetail:()=>{}}))).toContain('No outstanding billing-required value');
 data.complete=false;
 expect(renderToStaticMarkup(createElement(BillingProgress,{data,scope,onDetail:()=>{}}))).toContain('Billing progress unavailable');
});
it('signed hotel plots retain negative credit ranges on a common scale',()=>{
 const data=syntheticManagement();data.hotels[0].bands[5].amount='-120.00';const plot=agingPlot(data)!;expect(plot.rows[0].negative).toBe(120);expect(plot.rows[0].positive).toBe(1000);expect(plot.scale).toBe(1120);expect(plot.negativeShare).toBeCloseTo(120/1120*100);
 data.agesComplete=false;expect(agingPlot(data)).toBeNull();
});
it('ranks aged accounts needing billing first without merging hotel ledgers or mutating source order',()=>{
 const data=syntheticManagement(),before=[...data.accountsOver60!];const ranked=attentionAccounts(data);expect(ranked.slice(0,2).map(a=>a.hotel)).toEqual(['KAT','TSK']);expect(ranked.slice(0,2).every(a=>a.unbilled>0)).toBe(true);expect(data.accountsOver60).toEqual(before);data.agesComplete=false;expect(attentionAccounts(data)).toEqual([]);
});
