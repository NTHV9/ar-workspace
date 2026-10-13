import {describe,it,expect} from 'vitest';
import {remittanceAccountLabels} from '../src/remittance/account-labels';
import type {RemittanceAccount} from '../src/remittance/model';
const account=(accountId:string,accountNo:string|null,hotel:RemittanceAccount['hotel']='TLKL',name='Same Travel'):RemittanceAccount=>({hotel,accountId,accountNo,name,type:'Agent',verified:true});
const key=(a:RemittanceAccount)=>JSON.stringify([a.hotel,a.accountId]);
describe('remittance catalog choice labels',()=>{
 it('shows distinct numbers for identical names in the same hotel',()=>{const rows=[account('a','100'),account('b','200')],labels=remittanceAccountLabels(rows);expect(rows.map(a=>labels.get(key(a)))).toEqual(['TLKL · Same Travel · 100','TLKL · Same Travel · 200']);});
 it('adds exact IDs when displayed numbers collide, retaining every choice',()=>{const rows=[account('a',' 300 '),account('b','300'),account('c','300','WAKL')],labels=remittanceAccountLabels(rows);expect(rows.map(a=>labels.get(key(a)))).toEqual(['TLKL · Same Travel · 300 · ID a','TLKL · Same Travel · 300 · ID b','WAKL · Same Travel · 300']);expect(labels.size).toBe(3);});
 it('uses exact IDs for null, empty or whitespace numbers',()=>{const rows=[account('a',null),account('b',''),account('c','  ')],labels=remittanceAccountLabels(rows);expect(rows.map(a=>labels.get(key(a)))).toEqual(['TLKL · Same Travel · ID a','TLKL · Same Travel · ID b','TLKL · Same Travel · ID c']);});
 it('detects whitespace/case variants and leaves source identities and numbers untouched',()=>{const rows=[account('a',' n1 '),account('b','N1','TLKL',' same  travel ')],before=structuredClone(rows),labels=remittanceAccountLabels(rows);expect(labels.get(key(rows[0]))).toContain('ID a');expect(labels.get(key(rows[1]))).toContain('ID b');expect(rows).toEqual(before);});
});
