import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import AgingOverview from '../src/dashboard/AgingOverview';
import {agingBucketKey,type AgingCell,type agingOverview} from '../src/dashboard/aging-model';
import type {AgingBucket} from '../src/domain/portfolio';

const cell=(amount:number|null,state:AgingCell['state']='verified'):AgingCell=>({state,amount,debit:null,credit:null});
const group=(amount:number|null,state:AgingCell['state']='verified')=>({Total:cell(amount,state),KAT:cell(amount,state),TSK:cell(null,'absent')});
const columns:AgingBucket[]=['0–30','31–60','61–90','91–120','121–150','151+'].map((label,index)=>({label,start:index*30,end:index===5?null:index*30+29,sequence:index,amount:0,debit:0,credit:0}));
function render(values:(number|null)[],net:number|null,states:AgingCell['state'][]=[]){
 const data:ReturnType<typeof agingOverview>={members:[],net:group(net,net===null?'unavailable':'verified'),cells:values.map((value,index)=>group(value,states[index]??'verified'))};
 return renderToStaticMarkup(<AgingOverview data={data} columns={columns} label="All accounts" selectedKey={agingBucketKey(columns[2])} onSelect={()=>{}}/>);
}

describe('aging distribution evidence',()=>{
 it('shows a share graphic only for fully verified nonnegative ranges reconciling to net, with exact THB and selected range',()=>{
  const html=render([12345678.91,400,300,200,100,0],12346678.91);
  expect(html).toContain('data-chart-mode="distribution"');
  expect(html).toContain('12,345,678.91');
  expect(html).toContain('Compare 61–90 days');
  expect(html).toMatch(/aria-label="Compare 61–90 days" aria-pressed="true"/);
  expect(html).toContain('No matching account');
 });
 it('preserves a signed credit and negative percent, without turning absolute values into shares',()=>{
  const html=render([120,-20,0,0,0,0],100);
  expect(html).toContain('data-chart-mode="signed"');
  expect(html).toContain('-20.00');
  expect(html).toContain('-20.0%');
  expect(html).toContain('Credits extend left of zero');
 });
 it('does not present non-reconciling ranges as parts of net',()=>{
  const html=render([120,20,0,0,0,0],100);
  expect(html).toContain('data-chart-mode="signed"');
  expect(html).toContain('Range total differs from net open');
 });
 it('keeps unknown and verified zero different, without an invented chart share',()=>{
  const html=render([null,0,0,0,0,0],null,['unavailable']);
  expect(html).toContain('data-chart-mode="unavailable"');
  expect(html).toContain('Source unverified');
  expect(html).toContain('0.00');
  expect(html).not.toContain('0.0%');
 });
 it('shows a verified all-zero source as zero without drawing a full ring',()=>{
  const html=render([0,0,0,0,0,0],0);
  expect(html).toContain('data-chart-mode="zero"');
  expect(html).toContain('No open balance');
  expect(html).not.toContain('100.0%');
 });
});
