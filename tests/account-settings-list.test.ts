import {describe,it,expect} from 'vitest';
import {filterSettingsAccounts,sortSettingsAccounts} from '../src/settings/account-list';
import type {SettingsAccount} from '../src/settings/bulk-model';
const row=(accountId:string,extra:Partial<SettingsAccount>={}):SettingsAccount=>({hotel:'KAT',accountId,name:'Travel '+accountId,accountNo:'AR-'+accountId,type:'OTA',revision:1,source:'account',billingRequired:true,creditTerm:30,invoices:12,billingMethod:'email',...extra});
const rows=[row('10',{creditTerm:100,invoices:2}),row('2',{billingRequired:false,creditTerm:3,invoices:100}),row('missing',{source:'type',creditTerm:null,billingRequired:null,invoices:0})];
const filters={query:'',billing:'all',status:'all',term:'all',invoices:'all'};
describe('Account settings list',()=>{
 it('sorts numbers naturally, with unset terms last in both directions',()=>{
  expect(sortSettingsAccounts(rows,'creditTerm',false).map(r=>r.accountId)).toEqual(['2','10','missing']);
  expect(sortSettingsAccounts(rows,'creditTerm',true).map(r=>r.accountId)).toEqual(['10','2','missing']);
  expect(sortSettingsAccounts(rows,'invoices',true)[0].accountId).toBe('2');
  expect(sortSettingsAccounts(rows,'name',false)[0].accountId).toBe('2');
 });
 it('searches combined words, account number and setup status',()=>{
  expect(filterSettingsAccounts(rows,{...filters,query:'KAT travel 10'}).map(r=>r.accountId)).toEqual(['10']);
  expect(filterSettingsAccounts(rows,{...filters,query:'AR-2'}).map(r=>r.accountId)).toEqual(['2']);
  expect(filterSettingsAccounts(rows,{...filters,query:'setup needed'}).map(r=>r.accountId)).toEqual(['missing']);
 });
 it('combines filters without treating type-inherited values as Account confirmation',()=>{
  expect(filterSettingsAccounts(rows,{...filters,billing:'not_required',term:'short',invoices:'with'}).map(r=>r.accountId)).toEqual(['2']);
  expect(filterSettingsAccounts(rows,{...filters,status:'setup'}).map(r=>r.accountId)).toEqual(['missing']);
  expect(filterSettingsAccounts([row('inherited',{source:'type'})],{...filters,status:'setup'})).toHaveLength(1);
 });
 it('sorts selected identities independently across hotels without changing input or selection',()=>{
  const data=[row('2'),row('2',{hotel:'TSK'})],selected=new Set([JSON.stringify(['TSK','2'])]);
  expect(sortSettingsAccounts(data,'selected',true,selected)[0].hotel).toBe('TSK');expect(data[0].hotel).toBe('KAT');expect(selected.size).toBe(1);
 });
});
