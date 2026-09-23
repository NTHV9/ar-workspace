import type {Page} from '@playwright/test';
import {setupDashboard} from './dashboard-period';
import {HOTEL_IDS,hotelInRegion,regionHotels,resolveRegion} from '../../../src/domain/hotels';
import type {Account} from '../../../src/domain/portfolio';
const at='2026-09-12T02:59:00Z';
const ranges=[[0,30],[31,60],[61,90],[91,120],[121,150],[151,null]] as const;
export const regionalAccounts:Account[]=HOTEL_IDS.map((hotel,index)=>({hotel,id:'same-id',account_no:'SYN-SAME',name:'Regional Travel · Synthetic',type:'Agent',open:(index+1)*600,over90:(index+1)*300,items:6,synced_at:at,verification_state:'verified',agingBuckets:ranges.map(([start,end],sequence)=>({label:end===null?'151+':`${start}–${end}`,start,end,sequence,amount:(index+1)*100,debit:(index+1)*100,credit:0}))}));
const refresh={running:false,hotels:HOTEL_IDS.map(hotel=>({hotel,status:'succeeded',last_success_at:at}))};
const settings={revision:0,billing_required:null,credit_term:null,billing_recipients:{to:[],cc:[],bcc:[]},collection_recipients:{to:[],cc:[],bcc:[]},billing_method:null,billing_portal:null,billing_instructions:'',collection_instructions:''};
export async function setupRegional(page:Page){
 const base=await setupDashboard(page),regionalCalls:{path:string;query:URLSearchParams;method:string}[]=[];
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),q=url.searchParams,path=url.pathname,region=resolveRegion(q);
  regionalCalls.push({path,query:q,method:req.method()});
  const accounts=regionalAccounts.filter(a=>hotelInRegion(a.hotel,region)&&(!q.get('hotel')||q.get('hotel')==='All'||a.hotel===q.get('hotel')));
  if(path==='/api/portfolio')return route.fulfill({json:{accounts,status:'connected',refresh}});
  if(path==='/api/refresh')return route.fulfill({json:{...refresh,jobs:[]}});
  if(path==='/api/reports/options')return route.fulfill({json:{rows:accounts.map(a=>({hotel:a.hotel,account_id:a.id,account_name:a.name,account_type:a.type})),total:accounts.length}});
  if(path.startsWith('/api/account-settings/'))return route.fulfill({json:settings});
  if(path.startsWith('/api/accounts/')){const hotel=decodeURIComponent(path.split('/')[3]),account=regionalAccounts.find(a=>a.hotel===hotel)!;return route.fulfill({json:{invoices:account.agingBuckets!.map((b,index)=>({hotel,account_id:account.id,id:'invoice-'+index,invoice_no:'SYN-'+hotel+'-'+index,folio_no:'SYN-FOL-'+index,guest:'Synthetic guest',transaction_date:'2026-09-01',open:b.amount,original:b.amount,age:b.start,aging:b.label,collection_role:'standalone',collection_selectable:true,verification_state:'verified',workflow:{revision:0,billing_required:null,credit_term:null,first_billing_date:null,due_date:null,last_reminder_stage:null,last_reminder_date:null}}))}});}
  if(path==='/api/collection-queue')return route.fulfill({json:{rows:[]}});
  if(path==='/api/mail-reconciliation')return route.fulfill({json:{running:false,last:null}});
  if(path==='/api/remittances/options')return route.fulfill({json:{accounts:accounts.map(a=>({hotel:a.hotel,accountId:a.id,name:a.name,type:a.type,accountNo:a.account_no,verified:true})),config:{maxFileBytes:100000,maxFiles:5,maxTotalFileBytes:500000}}});
  if(path==='/api/remittances')return route.fulfill({json:{rows:[],total:0,summary:{documents:0,invoices:0,reportedAmount:'0.00',knownReportedAmount:'0.00',unspecifiedAmounts:0,linkedOpen:'0.00',knownLinkedOpen:'0.00',unverifiedInvoices:0}}});
  if(path==='/api/dashboard/aging-invoices'){
   const members=q.has('accounts')?JSON.parse(q.get('accounts')!) as [string,string][]:null;
   const selected=accounts.filter(a=>(!q.get('type')||q.get('type')===a.type)&&(!members||members.some(([h,id])=>a.hotel===h&&a.id===id)));
   const rows=selected.flatMap(a=>a.agingBuckets!.map((b,index)=>({hotel:a.hotel,accountId:a.id,accountName:a.name,accountType:a.type,invoiceId:'invoice-'+index,invoiceNo:'SYN-'+a.hotel+'-'+index,folioNo:'SYN-FOL-'+index,guest:'Synthetic guest',open:b.amount.toFixed(2),age:b.start,billingStatus:'setup',latestStage:'none',latestStageLabel:'No Follow-Up sent',dueStatus:'unknown',dueDate:null,held:false,needsReview:false,bucket:JSON.stringify([b.label,b.start,b.end,b.sequence])}))).filter(r=>!q.get('bucket')||r.bucket===q.get('bucket'));
   const amount=rows.reduce((n,r)=>n+Number(r.open),0).toFixed(2);
   return route.fulfill({json:{asOfDate:'2026-09-12',publications:regionHotels(region).map(hotel=>({hotel,sourceAt:at})),complete:true,accounts:selected.map(a=>({hotel:a.hotel,accountId:a.id,accountType:a.type,syncedAt:at,complete:true,unverified:0,buckets:[...a.agingBuckets!.map(b=>({key:JSON.stringify([b.label,b.start,b.end,b.sequence]),count:1,amount:b.amount.toFixed(2),creditAmount:'0.00',complete:true})),{key:null,count:6,amount:a.open.toFixed(2),creditAmount:'0.00',complete:true}]})),summary:{complete:true,count:rows.length,amount,creditAmount:'0.00',billing:[{key:'setup',label:'Billing setup needed',count:rows.length,amount}],followup:[{key:'none',label:'No Follow-Up sent',count:rows.length,amount}],due:[{key:'unknown',label:'Due date unavailable',count:rows.length,amount}],flags:[]},rows:q.get('details')==='1'?rows:[],total:rows.length}});
  }
  if(path==='/api/dashboard/hotel-overview'){
   const part=(list:Account[])=>{const count=list.length,amount=list.reduce((n,a)=>n+a.open,0).toFixed(2);return {balances:{asOfDate:q.get('to'),mode:'current',capturedAt:at,sourceAt:at,complete:true,missingHotels:[],metrics:['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled'].map(key=>({key,count:key==='open'||key==='setup'?count:0,amount:key==='open'||key==='setup'?amount:'0.00'})),stages:[],rows:[],total:count,unverified:0},activity:{rows:[],total:0,summary:{invoices:0,messages:0,missingAmounts:0,kinds:[]}},external:{rows:[],total:0,summary:{records:0,invoices:0,firstBillingInvoices:0,amount:'0.00',unknownAmounts:0}},entries:{summary:{invoiceCount:0,paymentCount:0,amount:'0.00',unknownAmounts:0,notObserved:0,unknownSourceDates:0,mappingUnverified:0},coverage:{complete:true,lastSuccessAt:at,lastAttemptStatus:'succeeded'}},payments:{summary:{invoiceCount:0,paymentCount:0,amount:'0.00',unknownAmounts:0,notObserved:0,unknownSourceDates:0,mappingUnverified:0,paymentTotals:{creditPostings:'0.00',currentlyApplied:'0.00',currentlyUnallocated:'0.00',debitPostings:'0.00'}},coverage:{complete:true,lastSuccessAt:at,lastAttemptStatus:'succeeded'}},paid:{rows:[],total:0,summary:{count:0,amount:'0.00'},complete:true,unknownMappings:0,sourceAt:at}};};
   return route.fulfill({json:{from:q.get('from'),to:q.get('to'),total:part(accounts),hotels:regionHotels(region).map(hotel=>({hotel,...part(accounts.filter(a=>a.hotel===hotel))}))}});
  }
  return route.fallback();
 });
 return {...base,regionalCalls};
}
