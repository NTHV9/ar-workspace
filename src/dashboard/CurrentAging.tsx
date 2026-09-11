import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronDown,ChevronRight,Columns3,RefreshCw} from 'lucide-react';
import {sourceAging,type Account,type AgingBucket,type RefreshState} from '../domain/portfolio';
import {agingBucketKey,agingColumns,agingComparison,agingHotels,agingInvoiceEvidence,agingOverview,agingPercentage,parseAgingInvoices,type AgingCell,type AgingComparisonRow,type AgingHotel,type AgingInvoice} from './aging-model';
import './aging.css';

interface AgingColumnVisibility {bucketKeys:string[]|null;net:boolean;percentages:boolean}
export interface AgingContext {hotel:string;type?:string;accountKey?:string;search:string;page:number;sort:{key:string;hotel:AgingHotel;descending:boolean};bucketKey:string;invoiceHotel:AgingHotel;invoiceView:'bucket'|'unassigned';invoicePage:number;invoiceDescending:boolean;columnVisibility?:AgingColumnVisibility}
interface Props {revision?:number;token:string;hotel:string;accounts:Account[];refresh?:RefreshState|null;onOpenInvoice:(hotel:string,accountId:string,invoiceId?:string)=>void;initialContext?:AgingContext;onContextChange?:(context:AgingContext)=>void}
const amount=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stamp=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})+' ICT':'Publication unavailable';
const stateLabel:Record<AgingCell['state'],string>={verified:'',absent:'No matching account',outside:'Outside scope',unavailable:'Source unverified'};
const pageSize=25;

export default function CurrentAging(props:Props){return <AgingWorkspace key={props.token+'|'+props.hotel} {...props}/>;}
function AgingWorkspace({revision=0,token,hotel,accounts,refresh,onOpenInvoice,initialContext,onContextChange}:Props){
 const initial=initialContext?.hotel===hotel?initialContext:undefined;
 const [type,setType]=useState<string|undefined>(initial?.type),[accountKey,setAccountKey]=useState<string|undefined>(initial?.accountKey),[search,setSearch]=useState(initial?.search??''),[page,setPage]=useState(initial?.page??1);
 const [sort,setSort]=useState(initial?.sort??{key:'net',hotel:'Total' as AgingHotel,descending:true}),[bucketKey,setBucketKey]=useState(initial?.bucketKey??''),[invoiceHotel,setInvoiceHotel]=useState<AgingHotel>(initial?.invoiceHotel??'Total');
 const [invoiceView,setInvoiceView]=useState<'bucket'|'unassigned'>(initial?.invoiceView??'bucket'),[invoicePage,setInvoicePage]=useState(initial?.invoicePage??1),[invoiceDescending,setInvoiceDescending]=useState(initial?.invoiceDescending??true);
 const [columnVisibility,setColumnVisibility]=useState<AgingColumnVisibility>(initial?.columnVisibility??{bucketKeys:null,net:true,percentages:true});
 const context=useMemo<AgingContext>(()=>({hotel,type,accountKey,search,page,sort,bucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,columnVisibility}),[hotel,type,accountKey,search,page,sort,bucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,columnVisibility]);
 useEffect(()=>{onContextChange?.(context);},[context,onContextChange]);
 const columns=useMemo(()=>agingColumns(accounts),[accounts]);
 const rows=useMemo(()=>agingComparison(accounts,hotel,type),[accounts,hotel,type]);
 const selected=rows.find(r=>r.key===accountKey),selectedBucket=columns.find(b=>agingBucketKey(b)===bucketKey)??columns[0];
 const sorted=useMemo(()=>{
  const query=search.trim().toLocaleLowerCase();
  const filtered=rows.filter(row=>!query||[row.name,...row.members.flatMap(a=>[a.name,a.account_no??'',a.id])].some(s=>s.toLocaleLowerCase().includes(query)));
  return filtered.sort((a,b)=>{
   if(sort.key==='name')return a.name.localeCompare(b.name,'en',{numeric:true})*(sort.descending?-1:1);
   const index=columns.findIndex(c=>agingBucketKey(c)===sort.key),read=(row:AgingComparisonRow)=>(sort.key==='net'?row.net:row.cells[index])?.[sort.hotel].amount??null,x=read(a),y=read(b);
   return x===null?y===null?a.name.localeCompare(b.name):1:y===null?-1:(x-y)*(sort.descending?-1:1)||a.name.localeCompare(b.name);
  });
 },[rows,search,sort,columns]);
 const maxPage=Math.max(1,Math.ceil(sorted.length/pageSize)),currentPage=Math.min(page,maxPage),shown=selected?[selected]:sorted.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const visibleColumns=columns.filter(b=>columnVisibility.bucketKeys===null||columnVisibility.bucketKeys.includes(agingBucketKey(b)));
 const showNetOpen=columnVisibility.net||visibleColumns.length===0;
 const overview=agingOverview(accounts,hotel,(selected?[selected]:sorted).flatMap(row=>row.members));
 const columnPreset=showNetOpen&&visibleColumns.length===columns.length?'All aging':showNetOpen&&visibleColumns.length===0?'Summary':'Custom';
 const toggleBucket=(key:string)=>setColumnVisibility(previous=>{
  const keys=previous.bucketKeys??columns.map(agingBucketKey),next=keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];
  return {...previous,bucketKeys:next,net:next.length===0?true:previous.net};
 });
 const chooseType=(value?:string)=>{setType(value);setAccountKey(undefined);setSearch('');setPage(1);};
 const drill=(row:AgingComparisonRow,h:AgingHotel='Total',bucket=columns[0])=>{
  setInvoiceHotel(h==='Total'||row.members.some(a=>a.hotel===h)?h:'Total');setInvoicePage(1);setInvoiceView('bucket');if(bucket)setBucketKey(agingBucketKey(bucket));
  if(type===undefined)chooseType(row.key);else setAccountKey(row.key);
 };
 const changeSort=(key:string,h:AgingHotel='Total')=>{setSort(previous=>({key,hotel:h,descending:previous.key===key&&previous.hotel===h?!previous.descending:true}));setPage(1);};
 const sortState=(key:string,h:AgingHotel='Total')=>sort.key===key&&sort.hotel===h?(sort.descending?'descending':'ascending'):'none';
 const types=[...new Set(accounts.filter(a=>hotel==='All'||a.hotel===hotel).map(a=>a.type))].sort();
 const published=(refresh?.hotels??[]).filter(h=>hotel==='All'||h.hotel===hotel);
 return <section className="current-aging" aria-labelledby="current-aging-title">
  <header className="aging-heading"><div><h2 id="current-aging-title">Current Aging</h2><p>Latest saved OPERA aging · independent of the Dashboard date range.</p></div><span className="aging-scope">{hotel==='All'?'TSK + KAT':hotel} · THB</span></header>
  <div className="aging-publications">{published.length?published.map(h=><span key={h.hotel}><i className={h.hotel.toLowerCase()}/>{h.hotel} · {stamp(h.last_success_at)}{h.status==='failed'?' · latest refresh failed':''}</span>):<span>Publication timestamps unavailable. Amounts require verified account source data.</span>}{refresh?.running&&<span>Refresh in progress · showing the saved publication</span>}</div>
  <nav className="aging-breadcrumbs" aria-label="Current Aging drilldown"><button onClick={()=>chooseType()} disabled={type===undefined}>All account types</button>{type!==undefined&&<><ChevronRight size={13}/><button onClick={()=>setAccountKey(undefined)} disabled={!selected}>{type}</button></>}{selected&&<><ChevronRight size={13}/><span>{selected.name}</span></>}</nav>
  {!selected&&<div className="aging-controls"><label>Current Account Type<select aria-label="Current Account Type" value={type??''} onChange={e=>chooseType(e.target.value||undefined)}><option value="">All account types</option>{types.map(t=><option key={t}>{t}</option>)}</select></label><label className="aging-search">Search {type===undefined?'types or accounts':'matched accounts'}<input aria-label="Search current aging" type="search" value={search} placeholder="Name or Account No." onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><span>{sorted.length} {type===undefined?'account types':'matched accounts'} · every row available</span></div>}
  {selected&&<button className="aging-back" onClick={()=>setAccountKey(undefined)}><ArrowLeft size={14}/> Back to {type} accounts</button>}
  {accountKey&&!selected&&<p className="aging-notice" role="status">The selected account is no longer in this current scope. Choose an account below.</p>}
  {columns.length>0&&<AgingOverview data={overview} columns={columns} label={selected?.name??(type?`${type}${search?' · search results':''}`:search?'Search results':'All account types')}/>}
  <div className="aging-table-toolbar"><div><h3>{selected?'Account comparison':type===undefined?'Compare account types':'Compare matched accounts'}</h3><p>TSK, KAT and Total stay together in each column group.</p></div><details className="aging-column-controls"><summary><Columns3 size={15}/> Columns <span>{columnPreset}</span><ChevronDown size={14}/></summary><div className="aging-column-panel">
   <div className="aging-column-presets" aria-label="Aging column presets"><button aria-pressed={columnPreset==='Summary'} onClick={()=>setColumnVisibility(p=>({...p,net:true,bucketKeys:[]}))}>Summary</button><button aria-pressed={columnPreset==='All aging'} onClick={()=>setColumnVisibility(p=>({...p,net:true,bucketKeys:null}))}>All aging</button></div>
   <fieldset><legend>Comparison measures</legend><label><input type="checkbox" checked={showNetOpen} disabled={visibleColumns.length===0} onChange={e=>setColumnVisibility(p=>({...p,net:e.target.checked}))}/> Net open</label><label><input type="checkbox" checked={columnVisibility.percentages} onChange={e=>setColumnVisibility(p=>({...p,percentages:e.target.checked}))}/> Bucket percentages</label></fieldset>
   <fieldset><legend>Source aging ranges</legend><div className="aging-bucket-options">{columns.map(bucket=><label key={agingBucketKey(bucket)}><input type="checkbox" checked={visibleColumns.includes(bucket)} onChange={()=>toggleBucket(agingBucketKey(bucket))}/> {bucket.label} days</label>)}</div></fieldset><p>Applies to this table. The overview always includes all source ranges.</p>
  </div></details></div>
  {columns.length?<div className="aging-table-scroll" tabIndex={0} role="region" aria-label="Scroll all source aging buckets"><table className="aging-matrix" aria-label="Current source aging comparison">
   <thead><tr><th rowSpan={2} scope="col" className="aging-identity" aria-sort={sortState('name')}><button onClick={()=>changeSort('name')}>{type===undefined?'Account Type':'Matched Account'}{sort.key==='name'?(sort.descending?' ↓':' ↑'):''}</button></th>{showNetOpen&&<th colSpan={3} scope="colgroup">Net open · THB</th>}{visibleColumns.map(b=><th key={agingBucketKey(b)} colSpan={3} scope="colgroup">{b.label} days</th>)}</tr><tr>{[...(showNetOpen?['net']:[]),...visibleColumns.map(agingBucketKey)].flatMap(key=>agingHotels.map(h=><th key={key+h} scope="col" className={'aging-'+h.toLowerCase()} aria-sort={sortState(key,h)}><button aria-label={`Sort ${key==='net'?'net open':columns.find(b=>agingBucketKey(b)===key)?.label} ${h}`} onClick={()=>changeSort(key,h)}>{h}{sort.key===key&&sort.hotel===h?(sort.descending?' ↓':' ↑'):''}</button></th>))}</tr></thead>
   <tbody>{shown.map(row=><tr key={row.key}><th scope="row" className="aging-identity"><button className="aging-row-link" aria-label={type===undefined?`Open accounts in ${row.name}`:`Open invoices for ${row.name}`} onClick={()=>drill(row,invoiceHotel,selectedBucket)}>{row.name}<ChevronRight size={13}/></button><small>{type===undefined?`${row.members.length} hotel accounts`:row.members.map(a=>`${a.hotel} · ${a.account_no||a.id}`).join(' / ')}</small></th>{showNetOpen&&agingHotels.map(h=><td key={'net'+h} className={'aging-'+h.toLowerCase()}><strong>{amount(row.net[h].amount)}</strong>{row.net[h].state!=='verified'&&<small>{stateLabel[row.net[h].state]}</small>}</td>)}{visibleColumns.flatMap(bucket=>agingHotels.map(h=>{
    const index=columns.indexOf(bucket);
    const cell=row.cells[index][h],percentage=agingPercentage(cell.amount,row.net[h].amount);
    return <td key={agingBucketKey(bucket)+h} className={'aging-'+h.toLowerCase()}><button className="aging-cell-button" aria-label={`${row.name} · ${h} · ${bucket.label}`} disabled={cell.state==='absent'||cell.state==='outside'} onClick={()=>drill(row,h,bucket)}><strong>{amount(cell.amount)}</strong>{(cell.state!=='verified'||columnVisibility.percentages)&&<small>{cell.state==='verified'?percentage===null?'% unavailable':`${percentage.toFixed(1)}%`:stateLabel[cell.state]}</small>}</button></td>;
   }))}</tr>)}</tbody>
  </table>{shown.length===0&&<p className="aging-empty">No current accounts match these filters.</p>}</div>:<p className="aging-notice" role="status">Source aging buckets are unavailable. Refresh OPERA data from the main refresh control, then return here.</p>}
  {!selected&&columns.length>0&&<Pagination page={currentPage} pages={maxPage} count={sorted.length} label={type===undefined?'account types':'matched accounts'} change={setPage}/>}
  <p className="aging-footnote">{visibleColumns.length} of {columns.length} source ranges shown · use Columns to choose ranges. Scroll horizontally for the full comparison. “No matching account” is different from a verified 0.00.</p>
  <p className="aging-explanation">Amounts include credits. Each % is the bucket amount divided by net open for the same hotel, or Total. Zero or negative net open has no %. Credits can produce negative shares or shares above 100%.</p>
  {selected&&selectedBucket&&<InvoiceDrill key={selected.key} externalRevision={revision} token={token} row={selected} bucket={selectedBucket} columns={columns} hotel={invoiceHotel} setHotel={setInvoiceHotel} setBucket={setBucketKey} refresh={refresh} onOpenInvoice={onOpenInvoice} view={invoiceView} setView={setInvoiceView} page={invoicePage} setPage={setInvoicePage} descending={invoiceDescending} setDescending={setInvoiceDescending}/>}
 </section>;
}
function AgingOverview({data,columns,label}:{data:ReturnType<typeof agingOverview>;columns:AgingBucket[];label:string}){
 const hotels=agingHotels.filter((h):h is 'TSK'|'KAT'=>h!=='Total'&&data.net[h].state!=='outside');
 const values=data.cells.flatMap(group=>hotels.map(h=>group[h].amount)).filter((n):n is number=>n!==null);
 const maximum=Math.max(1,...values.map(Math.abs)),signed=values.some(n=>n<0);
 const share=(value:number|null,net:number|null)=>{const p=agingPercentage(value,net);return p===null?'% unavailable':`${p.toFixed(1)}%`;};
 return <section className="aging-overview" aria-label="Current aging overview">
  <div className="aging-overview-total"><h3>Net open</h3><strong className="aging-overview-amount">{amount(data.net.Total.amount)} <small>THB</small></strong><p>{label} · {data.members.length} hotel accounts</p>{data.net.Total.state!=='verified'&&<p className="aging-overview-unavailable">{data.members.length?'Source unverified · total unavailable':'No matching accounts'}</p>}
   <div className="aging-hotel-totals">{hotels.map(h=>{const cell=data.net[h];return <div key={h}><span className={`aging-hotel-label aging-hotel-${h.toLowerCase()}`}><i/>{h}</span><strong>{amount(cell.amount)}</strong><small>{cell.state==='verified'?`${share(cell.amount,data.net.Total.amount)} of net open`:stateLabel[cell.state]}</small></div>;})}</div>
   <p className="aging-overview-caption">Every source range is shown here. Select the table columns you want to compare below.</p>
  </div>
  <div className="aging-overview-profile"><div className="aging-profile-heading"><h3>Aging profile</h3><span>Share of net open · THB</span></div><div className="aging-bucket-overview">{columns.map((bucket,index)=>{const group=data.cells[index];return <article className="aging-bucket-summary" key={agingBucketKey(bucket)} aria-label={`${bucket.label} days overview`}>
   <div className="aging-bucket-heading"><h4>{bucket.label} <span>days</span></h4><span>{share(group.Total.amount,data.net.Total.amount)}</span></div><strong className="aging-bucket-amount">{amount(group.Total.amount)}</strong>
   <div className="aging-bucket-series">{hotels.map(h=>{const cell=group[h],size=cell.amount===null?0:Math.abs(cell.amount)/maximum*(signed?50:100),origin=signed?50:0;return <div key={h}><div className="aging-series-label"><span className={`aging-hotel-label aging-hotel-${h.toLowerCase()}`}><i/>{h}</span><span>{amount(cell.amount)}</span></div><div className={'aging-series-track'+(signed?' is-signed':'')} aria-hidden="true"><span className={`aging-series-bar aging-series-${h.toLowerCase()}`} style={{left:`${cell.amount!==null&&cell.amount<0?origin-size:origin}%`,width:`${size}%`}}/></div>{cell.state!=='verified'&&<small>{stateLabel[cell.state]}</small>}</div>;})}</div>
  </article>;})}</div><p className="aging-chart-note">{signed?'Bars share one scale; credit amounts extend left of the zero line.':'Hotel bars share one amount scale across all source ranges.'}</p></div>
 </section>;
}
function Pagination({page,pages,count,label,change}:{page:number;pages:number;count:number;label:string;change:(n:number)=>void}){return <div className="aging-pagination"><span>{count.toLocaleString()} {label} · page {page} of {pages}</span><button disabled={page===1} onClick={()=>change(page-1)}>Previous</button><button disabled={page>=pages} onClick={()=>change(page+1)}>Next</button></div>;}

function InvoiceDrill({externalRevision,token,row,bucket,columns,hotel,setHotel,setBucket,refresh,onOpenInvoice,view,setView,page,setPage,descending,setDescending}:{externalRevision:number;token:string;row:AgingComparisonRow;bucket:AgingBucket;columns:AgingBucket[];hotel:AgingHotel;setHotel:(h:AgingHotel)=>void;setBucket:(key:string)=>void;refresh?:RefreshState|null;onOpenInvoice:Props['onOpenInvoice'];view:'bucket'|'unassigned';setView:(v:'bucket'|'unassigned')=>void;page:number;setPage:(page:number)=>void;descending:boolean;setDescending:(value:boolean)=>void}){
 const [request,setRequest]=useState<{key:string;state:'loading'|'ready'|'error';rows:AgingInvoice[]}>({key:'',state:'loading',rows:[]}),[revision,setRevision]=useState(0);
 const members=row.members.filter(a=>hotel==='Total'||a.hotel===hotel),memberKey=JSON.stringify(members.map(a=>[a.hotel,a.id,a.verification_state,a.agingBuckets]));
 const publication=(refresh?.hotels??[]).map(h=>[h.hotel,h.last_success_at].join(':')).join('|'),requestKey=token+'|'+memberKey+'|'+publication+'|'+revision+'|'+externalRevision;
 useEffect(()=>{
  const controller=new AbortController();setRequest({key:requestKey,state:'loading',rows:[]});
  void Promise.all(members.map(async account=>{
   const response=await fetch(`/api/accounts/${encodeURIComponent(account.hotel)}/${encodeURIComponent(account.id)}`,{signal:controller.signal,headers:{Authorization:`Bearer ${token}`},redirect:'error'});
   if(!response.ok)throw Error('Invoice data is unavailable');return parseAgingInvoices(await response.json(),account);
  })).then(parts=>{if(!controller.signal.aborted)setRequest({key:requestKey,state:'ready',rows:parts.flat()});}).catch(()=>{if(!controller.signal.aborted)setRequest({key:requestKey,state:'error',rows:[]});});
  return()=>controller.abort();
 },[requestKey]);
 const state=request.key===requestKey?request.state:'loading';
 const evidence=members.map(account=>{
  const schema=sourceAging([account],account.hotel),source=schema.find(b=>agingBucketKey(b)===agingBucketKey(bucket));
  const verified=account.verification_state==='verified'||account.verification_state==='cleared'&&account.open===0;
  return {account,source:verified?source:undefined,...agingInvoiceEvidence(state==='ready'?request.rows.filter(i=>i.hotel===account.hotel&&i.accountId===account.id):[],source??bucket,schema)};
 });
 const invoiceRows=evidence.flatMap(e=>view==='unassigned'?e.unassigned:e.rows).sort((a,b)=>a.open===null?1:b.open===null?-1:(a.open-b.open)*(descending?-1:1)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(invoiceRows.length/pageSize)),currentPage=Math.min(page,pages),shown=invoiceRows.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const reset=()=>{setPage(1);setView('bucket');};
 const hotels=[...new Set(row.members.map(a=>a.hotel))];
 return <section className="aging-invoice-drill" aria-labelledby="aging-invoice-title">
  <header className="aging-heading"><div><h3 id="aging-invoice-title">Invoices · {bucket.label} days</h3><p>{row.name} · {hotel==='Total'?'all matching hotel ledgers':hotel}</p></div><button onClick={()=>setRevision(n=>n+1)}><RefreshCw size={13}/> Reload invoices</button></header>
  <div className="aging-controls"><label>Invoice hotel<select aria-label="Invoice hotel" value={hotel} onChange={e=>{setHotel(e.target.value as AgingHotel);reset();}}><option value="Total">Total · matching hotels</option>{hotels.map(h=><option key={h}>{h}</option>)}</select></label><label>Source aging bucket<select aria-label="Invoice aging bucket" value={agingBucketKey(bucket)} onChange={e=>{setBucket(e.target.value);reset();}}>{columns.map(b=><option key={agingBucketKey(b)} value={agingBucketKey(b)}>{b.label}</option>)}</select></label><label>Evidence<select aria-label="Invoice evidence view" value={view} onChange={e=>{setView(e.target.value==='unassigned'?'unassigned':'bucket');setPage(1);}}><option value="bucket">Verified bucket invoices</option><option value="unassigned">Unverified / unassigned invoices</option></select></label></div>
  {state==='loading'?<p className="aging-empty" role="status">Loading current invoice evidence…</p>:state==='error'?<p className="aging-notice" role="alert">Invoice data is unavailable. No balance has been treated as zero. <button onClick={()=>setRevision(n=>n+1)}>Retry invoice read</button></p>:<>
   <div className="aging-reconciliation">{evidence.map(e=><div key={e.account.hotel+e.account.id}><strong>{e.account.hotel} · {e.account.name}</strong><span>Source bucket · THB {amount(e.source?.amount??null)}</span><span>Verified root invoices · THB {amount(e.amount)}</span><span>Difference · THB {amount(e.source?e.difference:null)}</span><small>Source debit {amount(e.source?.debit??null)} · source credit {amount(e.source?.credit??null)}{e.excludedChildren>0&&<> · <span>{e.excludedChildren} child {e.excludedChildren===1?'row':'rows'} excluded</span></>}{e.unassigned.length>0&&` · ${e.unassigned.length} invoices need membership or age verification`}</small></div>)}</div>
   {evidence.some(e=>!e.source||e.difference!==0||!e.complete)&&<p className="aging-notice" role="status">Source aging and invoice evidence do not fully reconcile. Credits, source timing, or unverified membership may explain a difference. Review the unassigned invoices and Account Detail; the source amount is retained.</p>}
   <div className="aging-table-scroll" tabIndex={0} role="region" aria-label="Current invoice evidence"><table className="aging-invoices" aria-label="Current aging invoices"><thead><tr><th scope="col">Hotel</th><th scope="col">Invoice No.</th><th scope="col">Folio No.</th><th scope="col">Guest</th><th scope="col">Source date</th><th scope="col">OPERA age</th><th scope="col">Evidence</th><th scope="col" aria-sort={descending?'descending':'ascending'}><button onClick={()=>{setDescending(!descending);setPage(1);}}>Open · THB {descending?'↓':'↑'}</button></th></tr></thead><tbody>{shown.map(i=><tr key={JSON.stringify([i.hotel,i.accountId,i.id])}><td>{i.hotel}</td><td><button className="aging-invoice-link" aria-label={`Open invoice ${i.invoiceNo||i.id}`} onClick={()=>onOpenInvoice(i.hotel,i.accountId,i.id)}>{i.invoiceNo||'No invoice number'} <ArrowUpRight size={13}/></button></td><td>{i.folioNo||'—'}</td><td>{i.guest||'—'}</td><td>{i.date||'—'}</td><td>{i.age===null?'Unknown':i.age}</td><td>{i.verified?i.role==='parent'?'Parent invoice':i.role==='standalone'?'Standalone':`Relationship ${i.role||'unknown'}`:'Source unverified'}</td><td>{amount(i.open)}</td></tr>)}</tbody></table>{shown.length===0&&<p className="aging-empty">{view==='bucket'?'No verified nonzero invoices in this bucket.':'No unassigned invoices in this account scope.'}</p>}</div>
   <Pagination page={currentPage} pages={pages} count={invoiceRows.length} label="invoices" change={setPage}/>
  </>}
  <p className="aging-footnote">Parent and standalone invoices only contribute to the amount; compressed child balances are excluded. OPERA age selects the source bucket and is separate from Past Due date. An empty list alone does not prove an invoice is cleared.</p>
 </section>;
}
