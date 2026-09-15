import {describe,expect,it} from 'vitest';
import {buildPortfolioOverview} from '../src/domain/portfolio-overview';
import type {Account,AgingBucket,RefreshState} from '../src/domain/portfolio';

const account=(hotel:string,id:string,open:number,extra:Partial<Account>={}):Account=>({
 hotel,id,name:`Synthetic ${id}`,type:'Agent',open,over90:0,items:1,...extra,
});
const bucket=(label:string,start:number,end:number|null,sequence:number,amount:number,debit=Math.max(0,amount),credit=Math.min(0,amount)):AgingBucket=>({label,start,end,sequence,amount,debit,credit});
const published=(...hotels:string[]):RefreshState=>({running:false,hotels:hotels.map(hotel=>({hotel,status:'succeeded',last_success_at:'2026-09-15T00:00:00Z'}))});

describe('buildPortfolioOverview',()=>{
 it('keeps Phuket totals and every operational account isolated from Khao Lak and unknown hotels',()=>{
  const accounts=[account('KAT','same',450,{items:4,account_no:'SHARED'}),account('TSK','same',150,{items:2,account_no:'SHARED'}),account('TLKL','other',900),account('other','foreign',800)];
  const result=buildPortfolioOverview(accounts,'phuket','All');
  expect(result).toMatchObject({hotels:['KAT','TSK'],selectedHotels:['KAT','TSK'],partial:false,hasPublishedScope:true,missingHotels:[],total:600,accountCount:2,itemCount:6,regionalTotal:600});
  expect(result.cards.map(({hotel,amount,accountCount,itemCount,share})=>({hotel,amount,accountCount,itemCount,share}))).toEqual([
   {hotel:'KAT',amount:450,accountCount:1,itemCount:4,share:75},
   {hotel:'TSK',amount:150,accountCount:1,itemCount:2,share:25},
  ]);
  expect(result.rows.flatMap(row=>row.members)).toEqual(accounts.slice(0,2));
 });

 it('keeps all four regional comparison cards when one Khao Lak hotel is selected',()=>{
  const accounts=[account('TLKL','a',120),account('WAKL','b',60,{items:3}),account('TLFO','c',30),account('TSAN','d',30),account('KAT','e',1000)];
  const result=buildPortfolioOverview(accounts,'khao-lak','WAKL');
  expect(result).toMatchObject({hotels:['TLKL','WAKL','TLFO','TSAN'],selectedHotels:['WAKL'],total:60,accountCount:1,itemCount:3,regionalTotal:240});
  expect(result.cards.map(row=>[row.hotel,row.amount,row.share])).toEqual([['TLKL',120,50],['WAKL',60,25],['TLFO',30,12.5],['TSAN',30,12.5]]);
  expect(result.rows.map(row=>row.hotel)).toEqual(['WAKL']);
 });

 it('reports missing hotels as unknown instead of converting them to zero',()=>{
  const result=buildPortfolioOverview([account('TLKL','saved',85)],'khao-lak','All');
  expect(result).toMatchObject({partial:true,hasPublishedScope:true,missingHotels:['WAKL','TLFO','TSAN'],total:85,accountCount:1,itemCount:1});
  expect(result.cards[1]).toEqual({hotel:'WAKL',available:false,members:[],amount:null,accountCount:null,itemCount:null,share:null,buckets:null});
  const selected=buildPortfolioOverview([account('TLKL','saved',85)],'khao-lak','TLKL');
  expect(selected).toMatchObject({partial:false,hasPublishedScope:true,missingHotels:[]});
  expect(selected.cards[1].amount).toBeNull();
 });

 it('distinguishes an unpublished empty portfolio from a published zero without inventing Aging amounts',()=>{
  const unavailable=buildPortfolioOverview([],'phuket','All');
  expect(unavailable).toMatchObject({partial:true,hasPublishedScope:false,missingHotels:['KAT','TSK'],total:0,accountCount:0,itemCount:0});
  expect(unavailable.rows.every(row=>row.amount===null&&row.buckets===null)).toBe(true);
  const zero=buildPortfolioOverview([],'phuket','All',published('KAT','TSK'));
  expect(zero).toMatchObject({partial:false,hasPublishedScope:true,missingHotels:[],total:0,regionalTotal:0});
  expect(zero.cards[0]).toEqual({hotel:'KAT',available:true,members:[],amount:0,accountCount:0,itemCount:0,share:null,buckets:null});
  expect(zero.columns.map(({label,start,end})=>[label,start,end])).toEqual([
   ['0–30',0,30],['31–60',31,60],['61–90',61,90],['91–120',91,120],['121–150',121,150],['151+',151,null],
  ]);
 });

 it('accepts a valid saved publication during failure or refresh and rejects a status without a valid publication date',()=>{
  const refresh:RefreshState={running:true,hotels:[
   {hotel:'TLKL',status:'failed',last_success_at:'2026-09-14T00:00:00Z'},
   {hotel:'WAKL',status:'succeeded',last_success_at:'invalid'},
   {hotel:'TLFO',status:'running',last_success_at:null},
   {hotel:'TSAN',status:'running',last_success_at:'2026-09-13T00:00:00Z'},
  ]};
  const result=buildPortfolioOverview([],'khao-lak','All',refresh);
  expect(result.missingHotels).toEqual(['WAKL','TLFO']);
  expect(result.cards.map(row=>row.amount)).toEqual([0,null,null,0]);
 });

 it('preserves credits and source item counts without dropping unknown or offsetting accounts',()=>{
  const accounts=[account('KAT','debit',180,{items:3}),account('KAT','unknown',20,{items:2,verification_state:'missing'}),account('TSK','credit',-100,{items:4})];
  const result=buildPortfolioOverview(accounts,'phuket','All');
  expect(result).toMatchObject({total:100,accountCount:3,itemCount:9,regionalTotal:100});
  expect(result.cards.map(row=>[row.amount,row.share])).toEqual([[200,200],[-100,-100]]);
 });

 it.each([0,-20])('does not assign shares when the regional signed total is %s',total=>{
  const result=buildPortfolioOverview([account('KAT','debit',40),account('TSK','credit',total-40)],'phuket','All');
  expect(result.total).toBe(total);
  expect(result.cards.map(row=>row.share)).toEqual([null,null]);
  expect(result.cards.map(row=>row.accountCount)).toEqual([1,1]);
 });

 it('sums valid source Aging within a hotel while preserving signed debit and credit evidence',()=>{
  const first=bucket('Custom current',0,45,3,70,100,-30),second=bucket('Custom current',0,45,3,-20,10,-30);
  const result=buildPortfolioOverview([account('KAT','a',70,{agingBuckets:[first]}),account('KAT','b',-20,{agingBuckets:[second]})],'phuket','KAT');
  expect(result.rows[0].buckets).toEqual([{label:'Custom current',start:0,end:45,sequence:3,amount:50,debit:110,credit:-60}]);
  expect(first.amount).toBe(70);
  expect(second.amount).toBe(-20);
 });

 it('does not substitute legacy illustrative aging arrays for absent or malformed source buckets',()=>{
  const result=buildPortfolioOverview([
   account('KAT','missing',90,{aging:[90,0,0,0,0,0]}),
   account('TSK','invalid',10,{agingBuckets:[{...bucket('Invalid',0,30,0,10),start:null}]}),
  ],'phuket','All');
  expect(result.cards.map(row=>row.buckets)).toEqual([null,null]);
  expect(result.columns).toHaveLength(6);
 });

 it.each([
  {label:'Different label'},
  {start:1},
  {end:44},
  {sequence:4},
 ])('keeps hotel Aging unavailable when account source definitions disagree: %j',difference=>{
  const first=bucket('Current',0,45,3,20);
  const result=buildPortfolioOverview([account('KAT','a',20,{agingBuckets:[first]}),account('KAT','b',20,{agingBuckets:[{...first,...difference}]})],'phuket','KAT');
  expect(result.rows[0].buckets).toBeNull();
  expect(result.total).toBe(40);
 });

 it('unions selected source columns by exact label, bounds and sequence instead of merging matching captions',()=>{
  const result=buildPortfolioOverview([
   account('TLKL','a',40,{agingBuckets:[bucket('Older',91,null,2,10),bucket('Current',0,30,0,30)]}),
   account('WAKL','b',40,{agingBuckets:[bucket('Current',0,45,0,20),bucket('Alternate caption',0,30,0,10),bucket('Current',0,30,1,10)]}),
   account('TSAN','c',15,{agingBuckets:[bucket('Current',0,30,0,15)]}),
   account('KAT','foreign',900,{agingBuckets:[bucket('Foreign',0,null,0,900)]}),
  ],'khao-lak','All');
  expect(result.columns.map(({label,start,end,sequence})=>[label,start,end,sequence])).toEqual([
   ['Alternate caption',0,30,0],['Current',0,30,0],['Current',0,45,0],['Current',0,30,1],['Older',91,null,2],
  ]);
  expect(result.columns.every(column=>column.amount===0&&column.debit===0&&column.credit===0)).toBe(true);
  expect(result.rows[1].buckets?.map(b=>b.amount)).toEqual([20,10,10]);
  expect(buildPortfolioOverview(result.cards.flatMap(row=>row.members),'khao-lak','TLKL').columns.map(({label,start,end,sequence})=>[label,start,end,sequence])).toEqual([
   ['Current',0,30,0],['Older',91,null,2],
  ]);
 });

 it('only creates illustrative Aging for explicit review with members and keeps valid source definitions',()=>{
  const accounts=[account('KAT','demo',100),account('TSK','source',25,{agingBuckets:[bucket('Source range',0,17,8,25)]})];
  const live=buildPortfolioOverview(accounts,'phuket','All');
  expect(live.cards[0].buckets).toBeNull();
  const review=buildPortfolioOverview(accounts,'phuket','All',undefined,true);
  [43,14,8,10,12,13].forEach((amount,index)=>expect(review.cards[0].buckets?.[index].amount).toBeCloseTo(amount));
  expect(review.cards[1].buckets).toEqual([bucket('Source range',0,17,8,25)]);
  expect(buildPortfolioOverview([],'phuket','All',undefined,true).cards.map(row=>row.buckets)).toEqual([null,null]);
 });

 it('does not pull an out-of-region selected hotel into the hero or Aging rows',()=>{
  const result=buildPortfolioOverview([account('KAT','a',90),account('TLKL','b',800)],'phuket','TLKL');
  expect(result).toMatchObject({selectedHotels:[],rows:[],total:0,accountCount:0,itemCount:0,hasPublishedScope:false,regionalTotal:90});
  expect(result.cards.map(row=>row.hotel)).toEqual(['KAT','TSK']);
 });
});
