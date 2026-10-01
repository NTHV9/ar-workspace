import {it,expect} from 'vitest';
import {managementResult,managementAccounts} from '../src/dashboard/management-data';
import {syntheticManagement} from './fixtures/management-dashboard';
import {parseManagementQuery} from '../worker/dashboard/management-api';
it.each(['phuket','khao-lak'] as const)('validates signed report and exact regional ledgers: %s',region=>{
 const v=syntheticManagement(region);expect(managementResult(v,region,'All',v.from,v.to)).toBe(v);
 expect(managementAccounts(v.accountsOver60!,'tour OTA','account',false)).toHaveLength(region==='phuket'?2:4);
});
it.each(['net','cohort','count','foreign','duplicate','age'])('rejects corrupted complete management totals: %s',reason=>{
 const v=syntheticManagement();if(reason==='net')v.hotels[0].amount='999.00';if(reason==='cohort')v.cohort[0].amount='1.00';if(reason==='count')v.hotels[0].over60=3;
 if(reason==='foreign')v.accountsOver60![0].hotel='TLKL';if(reason==='duplicate')v.accountsOver60!.push(v.accountsOver60![0]);if(reason==='age')v.accountsOver60![0].oldest=60;
 expect(()=>managementResult(v,'phuket','All',v.from,v.to)).toThrow('dashboard_management_invalid');
});
it('searches across fields and sorts all exact Account identities without combining hotels',()=>{
 const rows=syntheticManagement().accountsOver60!;
 expect(managementAccounts(rows,'KAT tour','amount',true).map(r=>r.accountId)).toEqual(['tour']);
 expect(managementAccounts(rows,'','amount',false).map(r=>r.amount)).toEqual(['20.00','20.00','200.00','200.00']);
 expect(managementAccounts(rows,'','oldest',true)[0].oldest).toBe(91);
});
it('validates dates and reserved regional scope without allowing paged partial summaries',()=>{
 expect(parseManagementQuery(new URL('https://example.test/api/dashboard/management?from=2026-09-01&to=2026-09-30&region=khao-lak'))).toMatchObject({p_hotel:'KhaoLak',p_from:'2026-09-01'});
 for(const q of ['&limit=1','&hotel=KAT&region=khao-lak','&from=2026-09-02'])expect(()=>parseManagementQuery(new URL('https://example.test/api/dashboard/management?from=2026-09-01&to=2026-09-30'+q))).toThrow();
});
