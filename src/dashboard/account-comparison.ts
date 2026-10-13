import {hotelRegion,type HotelId} from '../domain/hotels';
import {addAmounts} from './model';
import {compareValues,type SortValue} from '../table-sort';

export interface ComparisonAccount {
 hotel:HotelId;accountId:string;accountName:string;accountNo:string|null;accountType:string;
 count:number|null;amount:string|null;oldest:number|null;unbilled?:number;unbilledAmount?:string|null;
}
export type ComparisonSortKey='account'|'amount'|'count'|'oldest'|'type'|'number'|'unbilled';
export interface ComparisonSort {key:ComparisonSortKey;hotel:HotelId;descending:boolean}
export interface ComparisonCell {
 hotel:HotelId;members:ComparisonAccount[];accountType:string;count:number|null;amount:string|null;oldest:number|null;unbilled?:number|null;unbilledAmount?:string|null;
}
export interface ComparisonRow {key:string;name:string;independent:boolean;cells:Partial<Record<HotelId,ComparisonCell>>}
const normalized=(name:string)=>name.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
const identity=(account:ComparisonAccount)=>JSON.stringify([account.hotel,account.accountId]);

const aggregate=(members:ComparisonAccount[]):ComparisonCell=>({hotel:members[0].hotel,members,accountType:members[0].accountType,
 amount:addAmounts(members.map(a=>a.amount)),count:members.some(a=>a.count===null)?null:members.reduce((n,a)=>n+a.count!,0),
 oldest:members.some(a=>a.oldest===null)?null:Math.max(...members.map(a=>a.oldest!)),
 ...(members.some(a=>a.unbilled!==undefined)?{unbilled:members.some(a=>a.unbilled===undefined)?null:members.reduce((n,a)=>n+a.unbilled!,0),unbilledAmount:addAmounts(members.map(a=>a.unbilledAmount))}:{})});
/** Reporting groups preserve every operational Hotel + Account identity. */
export function comparisonRows(accounts:ComparisonAccount[],hotels:readonly HotelId[],search:string,sort:ComparisonSort):ComparisonRow[]{
 const groups=new Map<string,ComparisonAccount[]>(),seen=new Set<string>();
 for(const account of accounts){
  const id=identity(account);if(!hotels.includes(account.hotel)||seen.has(id))throw Error('dashboard_comparison_identity');seen.add(id);
  const name=normalized(account.accountName),type=normalized(account.accountType),region=hotelRegion(account.hotel);
  const key=region==='khao-lak'?(name&&type?'khao:'+JSON.stringify([name,type]):'ledger:'+id):(name?'phuket:name:'+name:'ledger:'+id),group=groups.get(key);
  if(group)group.push(account);else groups.set(key,[account]);
 }
 const rows:ComparisonRow[]=[];
 for(const [key,group] of groups){
  group.sort((a,b)=>hotels.indexOf(a.hotel)-hotels.indexOf(b.hotel)||a.accountId.localeCompare(b.accountId));
  const ambiguous=key.startsWith('ledger:')||(hotelRegion(group[0].hotel)==='phuket'&&hotels.some(hotel=>group.filter(account=>account.hotel===hotel).length>1));
  if(ambiguous)for(const account of group)rows.push({key:'ledger:'+identity(account),name:account.accountName.trim()||account.accountNo||account.accountId,independent:true,cells:{[account.hotel]:aggregate([account])}});
  else rows.push({key,name:group[0].accountName.trim(),independent:false,cells:Object.fromEntries(hotels.flatMap(hotel=>{const members=group.filter(a=>a.hotel===hotel);return members.length?[[hotel,aggregate(members)]]:[];}))});
 }
 const words=normalized(search).split(' ').filter(Boolean);
 const value=(row:ComparisonRow):SortValue=>{
  if(sort.key==='account')return normalized(row.name);
  const cell=row.cells[sort.hotel];if(!cell)return null;
  if(sort.key==='type')return cell.accountType;if(sort.key==='number')return cell.members.map(a=>a.accountNo??a.accountId).join(' ');
  const v=cell[sort.key];return v==null?null:Number(v);
 };
 return rows.filter(row=>{const text=normalized([row.name,...Object.values(row.cells).flatMap(cell=>cell!.members.flatMap(a=>[a.hotel,a.accountId,a.accountNo??'',a.accountName,a.accountType]))].join(' '));return words.every(word=>text.includes(word));})
  .sort((a,b)=>compareValues(value(a),value(b),sort.descending)||normalized(a.name).localeCompare(normalized(b.name))||a.key.localeCompare(b.key));
}
