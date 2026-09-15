import {regionHotels,type HotelId,type RegionId} from './hotels';
import {sourceAging,type Account,type AgingBucket,type RefreshState} from './portfolio';

export interface OverviewHotel {
 hotel:HotelId;
 available:boolean;
 members:Account[];
 amount:number|null;
 accountCount:number|null;
 itemCount:number|null;
 share:number|null;
 buckets:AgingBucket[]|null;
}

export interface PortfolioOverview {
 hotels:HotelId[];
 selectedHotels:HotelId[];
 partial:boolean;
 hasPublishedScope:boolean;
 missingHotels:HotelId[];
 total:number;
 accountCount:number;
 itemCount:number;
 regionalTotal:number;
 cards:OverviewHotel[];
 rows:OverviewHotel[];
 columns:AgingBucket[];
}

const defaultColumns=():AgingBucket[]=>[
 {label:'0–30',start:0,end:30},{label:'31–60',start:31,end:60},{label:'61–90',start:61,end:90},
 {label:'91–120',start:91,end:120},{label:'121–150',start:121,end:150},{label:'151+',start:151,end:null},
].map((column,sequence)=>({...column,sequence,amount:0,debit:0,credit:0}));
const bucketKey=(bucket:AgingBucket)=>JSON.stringify([bucket.label,bucket.start,bucket.end,bucket.sequence]);

/** The card comparison stays regional; the total and Aging rows follow hotel selection. */
export function buildPortfolioOverview(accounts:Account[],region:RegionId,hotel:string,refresh?:RefreshState,review=false):PortfolioOverview {
 const hotels=[...regionHotels(region)];
 const cards:OverviewHotel[]=hotels.map(h=>{
  const members=accounts.filter(account=>account.hotel===h);
  const available=review||members.length>0||!!refresh?.hotels.some(state=>state.hotel===h&&state.last_success_at&&Number.isFinite(Date.parse(state.last_success_at)));
  const amount=available?members.reduce((total,account)=>total+account.open,0):null;
  const source=sourceAging(members,h);
  let buckets:AgingBucket[]|null=source.length?source:null;
  // Existing illustrative proportions are confined to explicit visual review.
  if(!buckets&&review&&members.length){
   const proportions=[.43,.14,.08,.10,.12,.13];
   buckets=defaultColumns().map((column,index)=>{
    const value=amount!*proportions[index];
    return {...column,amount:value,debit:Math.max(0,value),credit:Math.min(0,value)};
   });
  }
  return {hotel:h,available,members,amount,accountCount:available?members.length:null,itemCount:available?members.reduce((total,account)=>total+account.items,0):null,share:null,buckets};
 });
 const regionalTotal=cards.reduce((total,card)=>total+(card.amount??0),0);
 for(const card of cards)card.share=card.amount!==null&&regionalTotal>0?card.amount/regionalTotal*100:null;
 const rows=cards.filter(card=>hotel==='All'||card.hotel===hotel);
 const selectedHotels=rows.map(row=>row.hotel);
 const missingHotels=rows.filter(row=>!row.available).map(row=>row.hotel);
 // Columns carry definitions only. Missing hotel cells remain null in rows.
 const definitions=new Map<string,AgingBucket>();
 for(const row of rows)for(const bucket of row.buckets??[])definitions.set(bucketKey(bucket),{...bucket,amount:0,debit:0,credit:0});
 const columns=definitions.size?[...definitions.values()].sort((a,b)=>a.sequence-b.sequence||(a.start??0)-(b.start??0)||a.label.localeCompare(b.label,'en')||(a.end??Infinity)-(b.end??Infinity)):defaultColumns();
 return {
  hotels,selectedHotels,partial:missingHotels.length>0,hasPublishedScope:rows.some(row=>row.available),missingHotels,
  total:rows.reduce((total,row)=>total+(row.amount??0),0),
  accountCount:rows.reduce((total,row)=>total+(row.accountCount??0),0),
  itemCount:rows.reduce((total,row)=>total+(row.itemCount??0),0),
  regionalTotal,cards,rows,columns,
 };
}
