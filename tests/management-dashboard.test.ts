import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ManagementDashboard} from '../src/dashboard/ManagementDashboard';
import {dashboardHotelGroups} from '../src/dashboard/detail-data';
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
it('renders a full exact monetary value once and explicit Hotel sections for identically named accounts',()=>{
 const data=syntheticManagement();data.metrics.find(m=>m.key==='open')!.amount='200000000.00';
 const scope={hotel:'All',day:data.to,from:data.from,to:data.to,type:'',account:''};
 const markup=renderToStaticMarkup(createElement(ManagementDashboard,{source:{state:'ready',data},scope,onDetail:()=>{},onReload:()=>{}}));
 expect(markup.match(/200,000,000\.00/g)).toHaveLength(1);expect(markup).not.toContain('management-exact-total');expect(markup).not.toMatch(/200M|200m|200K|200k/);
 expect(markup).toContain('aria-label="KAT aged accounts"');expect(markup).toContain('aria-label="TSK aged accounts"');expect(markup).toContain('Katathani Phuket Beach Resort');expect(markup).toContain('The Shore at Katathani');
 expect(markup.match(/data-dashboard-account="true"/g)).toHaveLength(4);
});
it('Account sorting stays inside canonical Hotel groups and Hotel sorting reverses whole groups',()=>{
 const rows=syntheticManagement().accountsOver60!;
 const sorted=managementAccounts(rows,'','amount',false),grouped=dashboardHotelGroups(sorted,'phuket',row=>row.hotel);
 expect(grouped.map(group=>group.hotel)).toEqual(['KAT','TSK']);expect(grouped.map(group=>group.rows.map(row=>row.amount))).toEqual([['20.00','200.00'],['20.00','200.00']]);
 expect(grouped.flatMap(group=>group.rows.map(row=>row.hotel))).toEqual(['KAT','KAT','TSK','TSK']);
 expect(dashboardHotelGroups(sorted,'phuket',row=>row.hotel,true).map(group=>group.hotel)).toEqual(['TSK','KAT']);
 const khao=syntheticManagement('khao-lak').accountsOver60!;expect(dashboardHotelGroups([...khao].reverse(),'khao-lak',row=>row.hotel).map(group=>group.hotel)).toEqual(['TLKL','WAKL','TLFO','TSAN']);
});
it('validates dates and reserved regional scope without allowing paged partial summaries',()=>{
 expect(parseManagementQuery(new URL('https://example.test/api/dashboard/management?from=2026-09-01&to=2026-09-30&region=khao-lak'))).toMatchObject({p_hotel:'KhaoLak',p_from:'2026-09-01'});
 for(const q of ['&limit=1','&hotel=KAT&region=khao-lak','&from=2026-09-02'])expect(()=>parseManagementQuery(new URL('https://example.test/api/dashboard/management?from=2026-09-01&to=2026-09-30'+q))).toThrow();
});
