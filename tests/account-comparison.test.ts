import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {comparisonRows,type ComparisonAccount,type ComparisonSort} from '../src/dashboard/account-comparison';
import {AccountComparison} from '../src/dashboard/AccountComparison';
const sort:ComparisonSort={key:'account',hotel:'KAT',descending:false};
const entry=(hotel:'KAT'|'TSK',accountId:string,accountName='Same travel',amount:string|null='100.00'):ComparisonAccount=>({hotel,accountId,accountName,accountNo:'NO-'+accountId,accountType:'OTA',count:1,amount,oldest:61});
it('aligns normalized names visually and preserves identical IDs in separate Hotel ledgers',()=>{
 const kat=entry('KAT','same','  Café   Travel '),tsk=entry('TSK','same','CAFÉ TRAVEL','200.00'),rows=comparisonRows([tsk,kat],['KAT','TSK'],'',sort);
 expect(rows).toHaveLength(1);expect(rows[0].cells.KAT?.members).toEqual([kat]);expect(rows[0].cells.TSK?.members).toEqual([tsk]);expect(rows[0].independent).toBe(false);expect(rows[0]).not.toHaveProperty('amount');
});
it('an ambiguous name in one Hotel keeps the entire name group in independent ledger rows',()=>{
 const rows=comparisonRows([entry('KAT','a'),entry('TSK','same'),entry('KAT','b')],['KAT','TSK'],'',sort);
 expect(rows).toHaveLength(3);expect(rows.every(row=>row.independent&&Object.keys(row.cells).length===1)).toBe(true);
 expect(new Set(rows.map(row=>row.key)).size).toBe(3);
});
it('blank names never align across Hotels or invent shared identities from Account numbers',()=>{
 const rows=comparisonRows([entry('KAT','same',' '),entry('TSK','same','')],['KAT','TSK'],'',sort);
 expect(rows).toHaveLength(2);expect(rows.every(row=>row.independent)).toBe(true);
});
it('searching one ledger number retains its aligned counterpart and cannot remove ambiguity',()=>{
 const accounts=[entry('KAT','a'),entry('TSK','b')];expect(comparisonRows(accounts,['KAT','TSK'],'NO-a',sort)[0].cells.TSK?.members[0]).toBe(accounts[1]);
 accounts.push(entry('KAT','c'));const rows=comparisonRows(accounts,['KAT','TSK'],'NO-a',sort);expect(rows).toHaveLength(1);expect(rows[0].independent).toBe(true);expect(rows[0].cells.TSK).toBeUndefined();
});
it.each([false,true])('selected-Hotel sorting retains signed and zero values with absent/unknown last: %s',descending=>{
 const accounts=[entry('KAT','negative','Negative','-20.00'),entry('KAT','zero','Zero','0.00'),entry('KAT','positive','Positive','10.00'),entry('KAT','unknown','Unknown',null),entry('TSK','absent','Absent','99.00')];
 const rows=comparisonRows(accounts,['KAT','TSK'],'',{...sort,key:'amount',descending});expect(rows.slice(0,3).map(row=>row.name)).toEqual(descending?['Positive','Zero','Negative']:['Negative','Zero','Positive']);expect(new Set(rows.slice(3).map(row=>row.name))).toEqual(new Set(['Unknown','Absent']));
});
it('unknown and absent cells have different copy while zeros and negative amounts remain exact',()=>{
 const rows=comparisonRows([entry('KAT','null','Unknown',null),entry('KAT','zero','Zero','0.00'),entry('TSK','credit','Credit','-20.00')],['KAT','TSK'],'',sort);
 const markup=renderToStaticMarkup(createElement(AccountComparison,{rows,hotels:['KAT','TSK'],sort,onSort:()=>{},onOpen:()=>{},label:'Synthetic comparison'}));
 expect(markup).toContain('Unavailable');expect(markup).toContain('No matching Account in TSK within this scope');expect(markup).toContain('0.00');expect(markup).toContain('-฿20.00');expect(markup).toContain('Katathani Phuket Beach Resort');expect(markup).toContain('3 comparison rows');expect(markup).toContain('3 accounts');
});
it('the row window renders complete rows and reports source Accounts separately',()=>{
 const accounts=Array.from({length:250},(_,i)=>[entry('KAT',String(i),'Account '+i),entry('TSK',String(i),'Account '+i)]).flat(),rows=comparisonRows(accounts,['KAT','TSK'],'',sort);
 const markup=renderToStaticMarkup(createElement(AccountComparison,{rows,hotels:['KAT','TSK'],sort,onSort:()=>{},onOpen:()=>{},label:'Synthetic comparison',visible:200}));
 expect(rows).toHaveLength(250);expect(markup.match(/data-dashboard-comparison-row="true"/g)).toHaveLength(200);expect(markup.match(/data-dashboard-account="true"/g)).toHaveLength(400);expect(markup).toContain('250 comparison rows');expect(markup).toContain('500 accounts');
});
it('rejects duplicate exact identities or Accounts outside the selected Hotel scope',()=>{
 expect(()=>comparisonRows([entry('KAT','same'),entry('KAT','same')],['KAT'],'',sort)).toThrow('dashboard_comparison_identity');expect(()=>comparisonRows([entry('TSK','a')],['KAT'],'',sort)).toThrow('dashboard_comparison_identity');
});
const khao=(hotel:'TSAN'|'TLKL',id:string,values:Partial<ComparisonAccount>={}):ComparisonAccount=>({...entry('KAT',id),hotel,...values});
it('groups all Khao ledgers with normalized nonempty name and type, independent of number',()=>{
 const a=khao('TSAN','a',{amount:'0.10',unbilled:1,unbilledAmount:'0.10'}),b=khao('TSAN','b',{amount:'-0.20',oldest:90,unbilled:2,unbilledAmount:'0.20'}),c=khao('TLKL','c');
 const rows=comparisonRows([a,b,c],['TLKL','TSAN'],'NO-a',{...sort,hotel:'TSAN'});
 expect(rows).toHaveLength(1);expect(rows[0].cells.TSAN?.members).toEqual([a,b]);expect(rows[0].cells.TLKL?.members).toEqual([c]);
 expect(rows[0].cells.TSAN).toMatchObject({amount:'-0.10',count:2,oldest:90,unbilled:3,unbilledAmount:'0.30'});expect(rows[0].cells.TSAN).not.toHaveProperty('accountId');
});
it('does not combine Khao cross-type, empty-type, blank-name or cross-region ledgers',()=>{
 expect(comparisonRows([khao('TSAN','a'),khao('TLKL','b',{accountType:'CORP'})],['TLKL','TSAN'],'',sort)).toHaveLength(2);
 const rows=comparisonRows([khao('TSAN','a'),khao('TLKL','b',{accountType:'CORP'}),khao('TSAN','c',{accountType:''}),khao('TLKL','d',{accountType:''}),khao('TSAN','e',{accountName:''}),entry('KAT','f')],['KAT','TLKL','TSAN'],'',sort);
 expect(rows).toHaveLength(6);
});
it('normalizes Khao name and type but never applies fuzzy matching',()=>{
 const rows=comparisonRows([khao('TSAN','a',{accountName:' Café   Travel ',accountType:' ota '}),khao('TLKL','b',{accountName:'CAFÉ TRAVEL',accountType:'OTA'}),khao('TSAN','c',{accountName:'Cafe Travel'})],['TLKL','TSAN'],'',sort);
 expect(rows).toHaveLength(2);expect(rows.find(row=>row.cells.TLKL)?.cells.TSAN?.members[0].accountId).toBe('a');
});
it('propagates unknown measures through Khao aggregate cells while retaining all source ledgers',()=>{
 const rows=comparisonRows([khao('TSAN','a'),khao('TSAN','b',{amount:null,count:null,oldest:null})],['TSAN'],'',sort);
 expect(rows).toHaveLength(1);expect(rows[0].cells.TSAN).toMatchObject({amount:null,count:null,oldest:null});
});
