import {regionHotels,resolveRegion,type HotelId} from './domain/hotels';
import { lazy, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { type RefreshState, aggregateAccounts, filterAccounts, sortRows, money, type Account, type Comparison } from './domain/portfolio';
import {LazyPanel} from './LazyPanel';
import PortfolioOverview,{PortfolioFreshness} from './PortfolioOverview';
import {buildPortfolioOverview} from './domain/portfolio-overview';
import {agingBucketKey} from './dashboard/aging-model';
import {agingCatalogRevision,type AgingStatusTarget} from './dashboard/aging-invoice-data';
const AgingInvoiceBreakdown=lazy(()=>import('./dashboard/AgingInvoiceBreakdown').then(m=>({default:m.AgingInvoiceBreakdown})));
import { SourceWarning, SearchBox, SortHead } from './ui';
const hotelColors:Record<HotelId,string>={KAT:'#4169ff',TSK:'#13b7ac',TLKL:'#397ba8',WAKL:'#8b60ad',TLFO:'#b88427',TSAN:'#b76471'};
export function Portfolio({ accounts, hotel, review, refresh, params, update, openAccount, token }: { accounts: Account[]; hotel: string; review: boolean; refresh?: RefreshState; params: URLSearchParams; update: (k:string,v:string)=>void; openAccount:(a:Account,invoiceId?:string)=>void;token?:string }) {
  const hotels=regionHotels(resolveRegion(params));
  const hotelAvailable=(h:string)=>review||accounts.some(a=>a.hotel===h)||!!refresh?.hotels.some(r=>r.hotel===h&&r.last_success_at&&Number.isFinite(Date.parse(r.last_success_at)));
  const scopedHotels=hotel==='All'?hotels:hotels.filter(h=>h===hotel),missingHotels=scopedHotels.filter(h=>!hotelAvailable(h)),partial=missingHotels.length>0;
  const region=resolveRegion(params);
  const [agingSelection,setAgingSelection]=useState<{hotel:HotelId;bucketKey:string|null}|null>(null);
  const agingTrigger=useRef<HTMLElement|null>(null);
  useEffect(()=>setAgingSelection(null),[hotel,region,review,token]);
  const [group, setGroup] = useState<Comparison|null>(null);
  const groupDialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(group)groupDialog.current?.showModal();},[group]);
  const type = params.get('type') || 'All', search = params.get('search') || '';
  const sort = (params.get('sort') || 'total') as keyof Comparison, direction = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const filtered = filterAccounts(accounts, { hotel, type, search:'' }).filter(a => params.get('aging')!=='over90' || a.over90>0);
  const propertyRows = filterAccounts(accounts, {hotel, type: 'All', search: ''});
  const withHotels=(rows:Comparison[])=>rows.map(row=>Object.assign(row,Object.fromEntries(hotels.map(h=>[h.toLowerCase(),row.amounts[h]??0]))));
  const typeRows = sortRows(withHotels(aggregateAccounts(propertyRows, true)), sort, direction);
  // Search a reporting row after pairing, including aliases from either hotel.
  const matchingRows = aggregateAccounts(filtered,false,accounts).filter(row =>
    (!params.get('accountFilter') || row.members.some(a=>a.name===params.get('accountFilter')))
    && row.members.some(a=>`${a.name} ${a.account_no??''} ${a.id}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const matchingTotal=matchingRows.reduce((sum,row)=>sum+row.total,0);
  const accountRows=sortRows(withHotels(matchingRows.map(row=>({...row,share:matchingTotal?row.total/matchingTotal*100:0}))),sort,direction);
  const onSort = (key:keyof Comparison) => { update('sort',key); update('dir',sort === key && direction === 'desc' ? 'asc':'desc'); };
  const headings: [string,keyof Comparison][] = [...hotels.map(h=>[h,h.toLowerCase()] as [string,keyof Comparison]),[partial?'Partial total open':'Total open','total'],['Over 90 days','over90'],['% share','share'],['Accounts','accounts'],['Items','items']];
  const table = (rows:Comparison[], isType:boolean) => <div className="table-scroll" role="region" aria-label={isType?'Account type comparison':'Accounts comparison'} tabIndex={0}><table className="comparison"><thead><tr><SortHead label={isType?'Account type':'Account'} active={sort==='name'} direction={direction} onClick={()=>onSort('name')}/>{headings.map(([label,key])=><SortHead key={key} label={label} active={sort===key} direction={direction} onClick={()=>onSort(key)}/>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key} className={isType && type===row.name?'selected-row':''}>
    <td><button className="name-link" onClick={()=>isType?update('type',type===row.name?'All':row.name):row.members.length===1?openAccount(row.members[0]):setGroup(row)}>{row.name}{!isType&&<ChevronRight size={12}/>}</button></td>
    {hotels.map(h=>{const key=h.toLowerCase();const members=row.members.filter(a=>a.hotel===h);return <td className={key} key={key}>{!hotelAvailable(h)?<span className="muted">—<small>Unavailable</small></span>:isType ? money(row.amounts[h]??0) : members.length ? <button className="amount-link" onClick={()=>members.length===1?openAccount(members[0]):setGroup({...row,members})}>{money(row.amounts[h]??0)}</button> : <span className="muted">—</span>}</td>;})}
    <td className="total-cell"><span className="value-bar" style={{width:`${Math.max(0,row.total/Math.max(...rows.map(r=>r.total),1)*96)}%`}}/><strong>{money(row.total)}</strong></td><td className="overdue">{money(row.over90)}</td><td className="percentage">{row.share.toFixed(1)}%</td><td>{row.accounts}</td><td>{row.items}</td>
  </tr>)}</tbody></table>{!rows.length&&<div className="empty-state"><strong>{accounts.length?'No matching accounts':'No OPERA data yet'}</strong><p>{accounts.length?'Try another account type or search.':'The workspace will show verified balances after OPERA is connected and refreshed.'}</p></div>}</div>;
  const closeAging=()=>{setAgingSelection(null);requestAnimationFrame(()=>agingTrigger.current?.isConnected&&agingTrigger.current.focus());};
  const detailRow=agingSelection?buildPortfolioOverview(accounts,region,hotel,refresh,review).rows.find(row=>row.hotel===agingSelection.hotel):undefined;
  const detailBucket=agingSelection?.bucketKey?detailRow?.buckets?.find(b=>agingBucketKey(b)===agingSelection.bucketKey):undefined;
  let agingTarget:AgingStatusTarget|null=null;
  if(agingSelection&&token&&!review&&detailRow?.members.length&&(agingSelection.bucketKey===null||detailBucket)){
    const query=new URLSearchParams({region,hotel:detailRow.hotel});if(detailBucket)query.set('bucket',agingBucketKey(detailBucket));
    agingTarget={key:query.toString(),title:detailRow.hotel,hotel:detailRow.hotel,hotels:[detailRow.hotel],bucketLabel:detailBucket?.label??'All ages',query:query.toString(),sourceAmount:detailBucket?.amount??detailRow.amount,accountPublications:detailRow.members.map(a=>({hotel:a.hotel,accountId:a.id,accountType:a.type,sourceAt:a.synced_at??null}))};
  }
  return <main className="page portfolio"><div className="page-title"><div><h1>Receivables portfolio</h1><p>All Hotels comparison with exact property contribution and account-level drill-down.</p></div><PortfolioFreshness region={region} hotels={scopedHotels} review={review} refresh={refresh}/></div>
        <PortfolioOverview accounts={accounts} region={region} hotel={hotel} review={review} refresh={refresh} onSelectHotel={h=>update('hotel',h)} onSelectAging={token&&!review?(h,b)=>{agingTrigger.current=document.activeElement as HTMLElement;setAgingSelection({hotel:h,bucketKey:b?agingBucketKey(b):null});}:undefined}/>
    {partial&&<p className="information-note" role="status">Partial portfolio · No successful OPERA publication is available for {missingHotels.join(', ')}. Totals, counts and shares reflect saved data only; missing hotel balances are not zero.</p>}
    {!review&&<SourceWarning accounts={propertyRows}/>}
    {agingTarget&&token&&<LazyPanel resetKey={region+hotel+agingTarget.key} fallback={<p role="status">Loading invoice details…</p>} onDismiss={closeAging} dismissLabel="Close invoice details"><AgingInvoiceBreakdown key={agingTarget.key} target={agingTarget} token={token} revision={agingCatalogRevision(accounts)} refresh={refresh} onClose={closeAging} onOpenInvoice={(h,id,invoice)=>{const a=accounts.find(a=>a.hotel===h&&a.id===id);if(a)openAccount(a,invoice);}}/></LazyPanel>}
<div className="filters"><label className="filter">Account Type<select aria-label="Account Type" value={type} onChange={e=>update('type',e.target.value)}><option value="All">All</option>{[...new Set(accounts.map(a=>a.type))].map(t=><option key={t}>{t}</option>)}</select></label><label className="filter">Account<select aria-label="Account filter" value={params.get('accountFilter')||''} onChange={e=>update('accountFilter',e.target.value)}><option value="">All</option>{[...new Set(accounts.map(a=>a.name))].map(n=><option key={n}>{n}</option>)}</select></label><label className="filter">Aging<select aria-label="Aging filter" value={params.get('aging')||'All'} onChange={e=>update('aging',e.target.value)}><option>All</option><option value="over90">Over 90 exposure</option></select></label><button className="filter" onClick={()=>{update('type','All');update('search','');update('accountFilter','');update('aging','');}}>Clear filters</button><span className="filter-count">{accountRows.length} matching accounts</span><SearchBox value={search} onChange={v=>update('search',v)} placeholder="Search Account / Account ID"/></div>
    <section className="panel table-panel"><div className="panel-heading"><h2>Account Type overview <small>All {typeRows.length} types · no top-N cutoff</small></h2><div className="property-key">{hotels.map(h=><span key={h}><i style={{background:hotelColors[h]}}/>{h}</span>)}</div></div><p className="table-scroll-hint">Compare {hotels.join(', ')} and Total.</p>{table(typeRows,true)}</section>
    <section className="panel table-panel accounts-panel"><div className="panel-heading"><h2>Accounts <span className="badge">{type==='All'?'All types':type}</span></h2><small>{hotel==='All'?hotels.join(' / '):`${hotel} only`} · {sort==='total'?'Sorted by Total Open':`Sorted by ${sort}`}</small></div><p className="table-scroll-hint">All {accountRows.length} matching accounts · scroll across for every column.</p>{table(accountRows,false)}<div className="table-foot">{review?'All values and account labels are synthetic. ':''}Matching Account No. shares one comparison row. Select a hotel amount to open its separate ledger.</div></section>
    {group&&<dialog ref={groupDialog} className="group-dialog panel" aria-label="Choose account hotel" onClose={()=>setGroup(null)} onClick={e=>{const box=e.currentTarget.getBoundingClientRect();if(e.target===e.currentTarget&&(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom))e.currentTarget.close();}}><h2>{group.name}</h2><p>Select an account to open its separate hotel ledger.</p>{group.members.map(a=><button key={a.hotel+a.id} className="hotel-choice" onClick={()=>openAccount(a)}><span><b>{a.hotel}</b><small>{a.name} · {a.account_no||a.id}</small></span><strong>{money(a.open)}</strong><ChevronRight size={16}/></button>)}<button onClick={()=>groupDialog.current?.close()}>Cancel</button></dialog>}
  </main>;
}
