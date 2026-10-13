import {hotelName,type HotelId} from '../domain/hotels';
import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {amount,number} from './period-data';
import type {ComparisonAccount,ComparisonCell,ComparisonRow,ComparisonSort,ComparisonSortKey} from './account-comparison';
import './account-comparison.css';

export function AccountComparison({rows,hotels,sort,onSort,onOpen,visible=Number.POSITIVE_INFINITY,aged=false,unit='invoices',amountLabel='Open amount',label,continuation,scopeKey=''}:{rows:ComparisonRow[];hotels:readonly HotelId[];sort:ComparisonSort;onSort:(sort:ComparisonSort)=>void;onOpen:(account:ComparisonAccount)=>void;visible?:number;aged?:boolean;unit?:string;amountLabel?:string;label:string;continuation?:ReactNode;scopeKey?:string}){
 const titleId=useId();
 const [picker,setPicker]=useState<{key:string;hotel:HotelId;scope:string;members:ComparisonAccount[]}|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 const closePicker=()=>{dialog.current?.close();setPicker(null);trigger.current?.focus();};
 const pickerCell=picker?.scope===scopeKey?rows.find(row=>row.key===picker.key)?.cells[picker.hotel]:undefined;
 useEffect(()=>{
  if(!picker)return;
  if(!pickerCell||pickerCell.members.length<2||JSON.stringify(pickerCell.members)!==JSON.stringify(picker.members)){closePicker();return;}
  if(!dialog.current?.open)dialog.current?.showModal();
 },[picker,pickerCell,scopeKey]);
 const openCell=(cell:ComparisonCell,key:string,button:HTMLButtonElement)=>{if(cell.members.length===1)onOpen(cell.members[0]);else{trigger.current=button;setPicker({key,hotel:cell.hotel,scope:scopeKey,members:cell.members});}};
 const selectedHotel=hotels.includes(sort.hotel)?sort.hotel:hotels[0];
 const choices:[ComparisonSortKey,string][]=[['account','Account name'],['amount',amountLabel],['count',unit==='records'?'Records':unit==='items'?'Items':'Invoices'],['oldest','Oldest invoice'],['number','Account number'],['type','Account type'],...(aged?[['unbilled','Not billed'] as [ComparisonSortKey,string]]:[])];
 const accounts=rows.reduce((n,row)=>n+Object.values(row.cells).reduce((total,cell)=>total+cell!.members.length,0),0);
 return <div className="dashboard-account-comparison" role="region" aria-label={label}>
  <div className="dashboard-comparison-controls"><label>Sort by<select aria-label="Account comparison sort" value={sort.key} onChange={event=>onSort({...sort,key:event.target.value as ComparisonSortKey,descending:!['account','number','type'].includes(event.target.value)})}>{choices.map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label><label>Sort values for<select aria-label="Account comparison sort hotel" value={selectedHotel} disabled={sort.key==='account'} onChange={event=>onSort({...sort,hotel:event.target.value as HotelId})}>{hotels.map(hotel=><option value={hotel} key={hotel}>{hotel} · {hotelName(hotel)}</option>)}</select></label><button aria-label="Change account comparison sort direction" onClick={()=>onSort({...sort,descending:!sort.descending})}>{sort.descending?'Descending':'Ascending'}</button><span>{number(rows.length)} comparison {rows.length===1?'row':'rows'} · {number(accounts)} {accounts===1?'account':'accounts'}</span></div>
  <p className="dashboard-comparison-basis">{amountLabel} · THB · Hotel ledgers shown separately.</p>
  {rows.some(row=>row.independent)&&<p className="dashboard-comparison-note">Accounts that cannot be safely grouped are shown as separate ledgers.</p>}
  <div className="dashboard-comparison-scroll" tabIndex={0} role="region" aria-label={label+' table'}><table style={{'--comparison-hotel-count':hotels.length} as CSSProperties}><colgroup><col className="dashboard-comparison-account-col"/>{hotels.map(hotel=><col key={hotel} className="dashboard-comparison-hotel-col"/>)}</colgroup><thead><tr><th scope="col">Account</th>{hotels.map(hotel=><th scope="col" key={hotel} data-hotel={hotel}>{hotel}<small>{hotelName(hotel)}</small></th>)}</tr></thead><tbody>{rows.slice(0,visible).map(row=><tr key={row.key} data-dashboard-comparison-row="true"><th scope="row"><strong>{row.name}</strong>{row.independent&&Object.values(row.cells).map(cell=><small key={cell!.hotel}>{cell!.hotel} · {cell!.members[0].accountNo??cell!.members[0].accountId} · Separate ledger</small>)}</th>{hotels.map(hotel=>{const account=row.cells[hotel];return <td key={hotel} data-hotel={hotel}>{account?<button data-dashboard-account="true" aria-label={account.members.length===1?'Open '+account.members[0].accountName+' · '+hotel+' · Account '+(account.members[0].accountNo??account.members[0].accountId):'Choose '+hotel+' account for '+row.name} onClick={event=>openCell(account,row.key,event.currentTarget)}><strong>{account.amount===null?'Unavailable':amount(account.amount)}</strong><span>{number(account.count)} {unit}</span><small>{account.members.length===1?(account.members[0].accountNo??account.members[0].accountId):number(account.members.length)+' accounts · Choose ledger'} · {account.accountType}</small>{account.oldest!=null&&<small>Oldest {account.oldest} days</small>}{aged&&account.unbilled!==undefined&&<small>Not billed {number(account.unbilled)} · {account.unbilledAmount==null?'Unavailable':amount(account.unbilledAmount)}</small>}</button>:<span className="dashboard-comparison-missing" aria-label={'No matching Account in '+hotel+' within this scope'}>—</span>}</td>;})}</tr>)}</tbody></table>{continuation}</div>
  <dialog ref={dialog} className="dashboard-account-picker" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();closePicker();}}>
   <h3 id={titleId}>Choose {picker?.hotel} account</h3><p>{pickerCell?.members[0].accountName} · Each account opens its own hotel ledger.</p>
   <div>{pickerCell?.members.map(member=>{const duplicate=!member.accountNo?.trim()||pickerCell.members.filter(a=>a.accountNo?.trim()===member.accountNo?.trim()).length>1;return <button key={member.accountId} onClick={()=>{closePicker();onOpen(member);}}><strong>{member.accountNo?.trim()||member.accountId}{duplicate&&member.accountNo?.trim()?' · ID '+member.accountId:''}</strong><span>{member.accountType} · {member.amount===null?'Unavailable':amount(member.amount)} · {number(member.count)} {unit}</span></button>;})}</div>
   <button onClick={closePicker}>Cancel</button>
  </dialog>
 </div>;
}
