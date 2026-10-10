import {regionHotels,type RegionId} from '../../src/domain/hotels';
import type {ManagementDashboardData} from '../../worker/dashboard/management-model';
export function syntheticManagement(region:RegionId='phuket',from='2026-09-01',to='2026-09-30'):ManagementDashboardData{
 const hotels=regionHotels(region),n=hotels.length,measure=(count:number,amount:number)=>({count,amount:amount.toFixed(2)});
 return {from,to,asOfDate:to,mode:'snapshot',capturedAt:to+'T12:00:00Z',sourceAt:to+'T12:00:00Z',complete:true,agesComplete:true,cohortComplete:true,missingHotels:[],
  metrics:[['open',7,1000],['billed',2,120],['unbilled',2,500],['not_required',1,300],['setup',1,100],['past_due',1,20],['over60',2,220],['over60_unbilled',2,300]].map(([key,count,amount])=>({key:key as never,...measure(Number(count)*n,Number(amount)*n)})),
  openBalanceBreakdown:{positive:measure(6*n,1020*n),credit:measure(n,-20*n),creditCoverageComplete:true},
  hotels:hotels.map(hotel=>({hotel,...measure(7,1000),credits:1,creditAmount:'-20.00',over60:2,over90:1,unbilled61:1,unbilled31:2,bands:[['Up to 30',3,700],['31 – 60',1,100],['61 – 90',2,180],['91 – 120',1,20],['121 – 150',0,0],['151+',0,0]].map(([label,count,amount],key)=>({key,label:String(label),...measure(Number(count),Number(amount))}))})),
  types:[{type:'OTA',...measure(7*n,1000*n),over60:2*n}],
  cohort:[['issued','New invoices',5,1200],['billed','Billed',2,800],['unbilled','Not billed',1,200],['not_required','Billing not required',1,100],['setup','Setup needed',1,100],['credit','Credits',0,0]].map(([key,label,count,amount])=>({key:key as never,label:String(label),...measure(Number(count)*n,Number(amount)*n),hotels:hotels.map(hotel=>({hotel,...measure(Number(count),Number(amount))}))})),
  accountsOver60:hotels.flatMap(hotel=>[{hotel,accountId:'tour',accountNo:'SYN-TOUR',accountName:'Synthetic Tour Company',accountType:'OTA',...measure(1,200),oldest:61,unbilled:1,unbilledAmount:'200.00'},{hotel,accountId:'lake',accountNo:'SYN-LAKE',accountName:'Synthetic Lake Travel',accountType:'OTA',...measure(1,20),oldest:91,unbilled:0,unbilledAmount:'0.00'}]),
 };
}
