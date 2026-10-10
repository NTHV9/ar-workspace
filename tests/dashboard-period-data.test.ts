import {describe,expect,it} from 'vitest';
import {balancesResult,balanceLabels} from '../src/dashboard/period-data';
it('keeps the established unbilled drill key while labeling its new 31-day boundary',()=>{
 expect(balanceLabels.over60_unbilled).toBe('31+ days · not billed');expect(balanceLabels.over60).toBe('Invoice age 61+ days');
});

const response={asOfDate:'2026-09-12',mode:'current',capturedAt:null,sourceAt:null,complete:true,missingHotels:[],metrics:[{key:'open',count:3,amount:'280.00'}],stages:[],rows:[],total:3,unverified:0};
const breakdown={positive:{count:2,amount:'300.00'},credit:{count:1,amount:'-20.00'},creditCoverageComplete:true};
describe('closing balance credit metadata',()=>{
 it('accepts optional signed metadata and earlier responses without it',()=>{
  expect(balancesResult({...response,openBalanceBreakdown:breakdown})).toMatchObject({openBalanceBreakdown:breakdown});
  expect(balancesResult(response).metrics[0]).toEqual({key:'open',count:3,amount:'280.00'});
 });
 it('preserves a legacy capture credit gap without making positive work unknown',()=>{
  expect(balancesResult({...response,mode:'snapshot',metrics:[{key:'open',count:null,amount:null},{key:'billed',count:1,amount:'200.00'}],openBalanceBreakdown:{...breakdown,credit:{count:null,amount:null},creditCoverageComplete:false}})).toMatchObject({complete:true,openBalanceBreakdown:{positive:{count:2,amount:'300.00'},credit:{count:null,amount:null},creditCoverageComplete:false}});
 });
 it.each([null,{}, {...breakdown,positive:null},{...breakdown,positive:{count:-1,amount:'300.00'}},{...breakdown,positive:{count:2,amount:'-300.00'}},{...breakdown,credit:{count:1,amount:'20.00'}},{...breakdown,credit:{count:'1',amount:'-20.00'}},{...breakdown,credit:{count:1,amount:'NaN'}},{...breakdown,creditCoverageComplete:'false'}])('rejects malformed or reversed-sign metadata %j',openBalanceBreakdown=>{
  expect(()=>balancesResult({...response,openBalanceBreakdown})).toThrow('dashboard_balances_invalid');
 });
});
