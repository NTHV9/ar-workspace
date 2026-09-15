import {describe,it,expect} from 'vitest';
import {aggregateAccounts,type Account} from '../src/domain/portfolio';
import {agingComparison} from '../src/dashboard/aging-model';
import {dashboardScope,scopeQuery} from '../src/dashboard/model';
const account=(hotel:string,open:number):Account=>({hotel,id:'same',account_no:'MATCH',name:'Synthetic regional account',type:'Agent',open,over90:0,items:1,verification_state:'verified'});
describe('regional browser comparisons',()=>{
 it('keeps the same account number in different regions separate',()=>{const rows=aggregateAccounts([account('KAT',10),account('TSK',20),account('TLKL',30),account('WAKL',40)]);expect(rows).toHaveLength(2);expect(rows.map(r=>r.total)).toEqual([30,70]);});
 it('compares all four Khao Lak amounts with signed total',()=>{const rows=agingComparison([account('TLKL',100),account('WAKL',200),account('TLFO',-30),account('TSAN',40)],'All');expect(rows[0].net.Total.amount).toBe(310);expect(rows[0].net.TLFO.amount).toBe(-30);});
 it('keeps a failed hotel amount and regional total unknown',()=>{const rows=agingComparison([account('TLKL',100),{...account('TLFO',20),verification_state:'unverified'}],'All');expect(rows[0].net.TLFO.amount).toBeNull();expect(rows[0].net.Total.amount).toBeNull();});
 it('preserves regional scope in dashboard reads and rejects foreign account context',()=>{const params=new URLSearchParams({region:'khao-lak',dashboardAccount:JSON.stringify(['KAT','same'])});const scope=dashboardScope(params,'All');expect(scope.account).toBe('');expect(scopeQuery(scope).get('region')).toBe('khao-lak');});
});
