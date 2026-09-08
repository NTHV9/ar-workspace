import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountDetail } from '../src/AccountDetail';
import { sourceAging, validSourceBucket, type Account } from '../src/domain/portfolio';
import { refreshLabel } from '../src/ui';
const bucket={label:'1 to 45 days',start:1,end:45,sequence:1,amount:100,debit:120,credit:20};
const account:Account={hotel:'KAT',id:'fictional',name:'Fictional test',type:'Agent',open:100,over90:0,items:1,creditLimit:null,agingBuckets:[bucket]};
it('aggregates compatible source ranges only within the same hotel',()=>{
  expect(sourceAging([account,{...account,id:'second'},{...account,hotel:'TSK',agingBuckets:[{...bucket,end:60}]}],'KAT')[0].amount).toBe(200);
  expect(sourceAging([account,{...account,id:'second',agingBuckets:[{...bucket,end:60}]}],'KAT')).toEqual([]);
  expect(sourceAging([account,{...account,id:'second',agingBuckets:undefined}],'KAT')).toEqual([]);
});
it('renders actual bucket count and credit values without fixed six-bucket assumptions',()=>{
  const html=renderToStaticMarkup(<AccountDetail account={account} invoices={[]} review={false} back={()=>{}}/>);
  expect(html).toContain('1 to 45 days');
  expect(html).toContain('Credit THB 20');
  expect(html.match(/class="aging-value /g)).toHaveLength(1);
  expect(html).toContain('Not available');
});
it('preserves an unbounded source bucket label and distinguishes it from a bounded range',()=>{
  const unbounded={...bucket,label:'151+',start:151,end:null};
  const current={...account,agingBuckets:[unbounded]};
  expect(sourceAging([current],'KAT')).toEqual([unbounded]);
  expect(sourceAging([current,{...account,id:'bounded',agingBuckets:[{...unbounded,end:999}]}],'KAT')).toEqual([]);
  const html=renderToStaticMarkup(<AccountDetail account={current} invoices={[]} review={false} back={()=>{}}/>);
  expect(html).toContain('151+');
  expect(html).not.toContain('999');
  expect(validSourceBucket(unbounded)).toBe(true);
  for(const invalid of [{...unbounded,end:undefined},{...unbounded,start:undefined},{...unbounded,label:''},{...unbounded,sequence:undefined},{...unbounded,amount:NaN}])expect(validSourceBucket(invalid)).toBe(false);
});
it('shows never-refreshed, stale and failed states with actual Bangkok success time',()=>{
  const refresh={running:false,hotels:[{hotel:'KAT',status:'succeeded',last_success_at:'2026-09-08T00:00:00Z'}]};
  expect(refreshLabel(refresh,'All',Date.parse('2026-09-08T01:00:00Z'))).toContain('KAT · Stale · 08 Sept, 07:00 ICT');
  expect(refreshLabel(refresh,'All')).toContain('TSK · Never refreshed');
  expect(refreshLabel({running:false,hotels:[{...refresh.hotels[0],status:'failed',error_code:'unavailable'}]},'KAT')).toContain('Refresh failed');
});
