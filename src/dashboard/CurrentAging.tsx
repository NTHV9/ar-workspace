import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronDown,ChevronRight,Columns3,RefreshCw} from 'lucide-react';
import {sourceAging,type Account,type AgingBucket,type RefreshState} from '../domain/portfolio';
import {agingBucketKey,agingColumns,agingComparison,agingHotels,agingInvoiceEvidence,agingOverview,parseAgingInvoices,type AgingCell,type AgingComparisonRow,type AgingHotel,type AgingInvoice} from './aging-model';
import './aging.css';
import AgingAllTable from './AgingAllTable';
import AgingOverview from './AgingOverview';

interface AgingColumnVisibility {bucketKeys:string[]|null;net:boolean;percentages:boolean}
export interface AgingContext {hotel:string;type?:string;accountKey?:string;search:string;page:number;sort:{key:string;hotel:AgingHotel;descending:boolean};bucketKey:string;invoiceHotel:AgingHotel;invoiceView:'bucket'|'unassigned';invoicePage:number;invoiceDescending:boolean;columnVisibility?:AgingColumnVisibility;comparisonView?:'range'|'matrix'}
interface Props {revision?:number;token:string;hotel:string;accounts:Account[];refresh?:RefreshState|null;onOpenInvoice:(hotel:string,accountId:string,invoiceId?:string)=>void;initialContext?:AgingContext;onContextChange?:(context:AgingContext)=>void}
const amount=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stamp=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})+' ICT':'Publication unavailable';
const stateLabel:Record<AgingCell['state'],string>={verified:'',absent:'No matching account',outside:'Outside scope',unavailable:'Source unverified'};
const pageSize=25;

export default function CurrentAging(props:Props){return <AgingWorkspace key={props.token+'|'+props.hotel} {...props}/>;}
function AgingWorkspace({revision=0,token,hotel,accounts,refresh,onOpenInvoice,initialContext,onContextChange}:Props){
 const initial=initialContext?.hotel===hotel?initialContext:undefined;
 const columns=useMemo(()=>agingColumns(accounts),[accounts]);
 const [type,setType]=useState<string|undefined>(initial?.type),[accountKey,setAccountKey]=useState<string|undefined>(initial?.accountKey),[search,setSearch]=useState(initial?.search??''),[page,setPage]=useState(initial?.page??1);
 const [sort,setSort]=useState(initial?.sort??{key:'net',hotel:'Total' as AgingHotel,descending:true});
 const [bucketKey,setBucketKey]=useState(initial?.bucketKey??(columns[0]?agingBucketKey(columns[0]):'')),[invoiceHotel,setInvoiceHotel]=useState<AgingHotel>(initial?.invoiceHotel??'Total');
 const [invoiceView,setInvoiceView]=useState<'bucket'|'unassigned'>(initial?.invoiceView??'bucket'),[invoicePage,setInvoicePage]=useState(initial?.invoicePage??1),[invoiceDescending,setInvoiceDescending]=useState(initial?.invoiceDescending??true);
 const [columnVisibility,setColumnVisibility]=useState<AgingColumnVisibility>(initial?.columnVisibility??{bucketKeys:null,net:true,percentages:true});
 const comparisonView='matrix' as const;
 const rows=useMemo(()=>agingComparison(accounts,hotel,type),[accounts,hotel,type]);
 const selected=rows.find(r=>r.key===accountKey),selectedBucket=columns.find(b=>agingBucketKey(b)===bucketKey)??columns[0];
 const effectiveBucketKey=selectedBucket?agingBucketKey(selectedBucket):'';
 const matrixColumns=columns.filter(b=>columnVisibility.bucketKeys===null||columnVisibility.bucketKeys.includes(agingBucketKey(b)));
 const visibleColumns=matrixColumns;
 const showNetOpen=columnVisibility.net||visibleColumns.length===0;
 const sortVisible=sort.key==='name'||sort.key==='net'&&showNetOpen||visibleColumns.some(b=>agingBucketKey(b)===sort.key);
 const fallbackSort=visibleColumns.some(b=>agingBucketKey(b)===effectiveBucketKey)?effectiveBucketKey:showNetOpen?'net':visibleColumns[0]?agingBucketKey(visibleColumns[0]):'name';
 const sortHotelVisible=hotel==='All'||sort.hotel==='Total'||sort.hotel===hotel;
 const activeSort={...sort,key:sortVisible?sort.key:fallbackSort,hotel:sortHotelVisible?sort.hotel:'Total' as AgingHotel};
 useEffect(()=>{if(!sortHotelVisible)setSort(p=>({...p,hotel:'Total'}));},[sortHotelVisible]);
 useEffect(()=>{if(bucketKey!==effectiveBucketKey)setBucketKey(effectiveBucketKey);},[bucketKey,effectiveBucketKey]);
 useEffect(()=>{if(!sortVisible)setSort(previous=>({...previous,key:fallbackSort}));},[sortVisible,fallbackSort]);
 const context=useMemo<AgingContext>(()=>({hotel,type,accountKey,search,page,sort,bucketKey:effectiveBucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,columnVisibility,comparisonView}),[hotel,type,accountKey,search,page,sort,effectiveBucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,columnVisibility,comparisonView]);
 useEffect(()=>{onContextChange?.(context);},[context,onContextChange]);
 const sorted=useMemo(()=>{
  const query=search.trim().toLocaleLowerCase();
  return rows.filter(row=>!query||[row.name,...row.members.flatMap(a=>[a.name,a.account_no??'',a.id])].some(s=>s.toLocaleLowerCase().includes(query))).sort((a,b)=>{
   if(activeSort.key==='name')return a.name.localeCompare(b.name,'en',{numeric:true})*(activeSort.descending?-1:1);
   const index=columns.findIndex(c=>agingBucketKey(c)===activeSort.key),read=(row:AgingComparisonRow)=>(activeSort.key==='net'?row.net:row.cells[index])?.[activeSort.hotel].amount??null,x=read(a),y=read(b);
   return x===null?y===null?a.name.localeCompare(b.name):1:y===null?-1:(x-y)*(activeSort.descending?-1:1)||a.name.localeCompare(b.name);
  });
 },[rows,search,activeSort.key,activeSort.hotel,activeSort.descending,columns]);
 const maxPage=Math.max(1,Math.ceil(sorted.length/pageSize)),currentPage=Math.min(page,maxPage),shown=selected?[selected]:sorted.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const overview=agingOverview(accounts,hotel,(selected?[selected]:sorted).flatMap(row=>row.members));
 const columnPreset=(columnVisibility.net||matrixColumns.length===0)&&matrixColumns.length===columns.length?'All aging':matrixColumns.length===0?'Summary':'Custom';
 const selectRange=(key:string)=>{
  setBucketKey(key);setInvoicePage(1);setInvoiceView('bucket');
  // Range highlights and invoice drill targets do not change the all-range comparison page.
 };
 const toggleBucket=(key:string)=>{setColumnVisibility(previous=>{
  const keys=previous.bucketKeys??columns.map(agingBucketKey),next=keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];
  return {...previous,bucketKeys:next,net:next.length===0?true:previous.net};
 });};
 const chooseType=(value?:string)=>{setType(value);setAccountKey(undefined);setSearch('');setPage(1);};
 const drill=(row:AgingComparisonRow,h:AgingHotel='Total',bucket=selectedBucket)=>{
  setInvoiceHotel(h==='Total'||row.members.some(a=>a.hotel===h)?h:'Total');setInvoicePage(1);setInvoiceView('bucket');if(bucket&&agingBucketKey(bucket)!==effectiveBucketKey)selectRange(agingBucketKey(bucket));
  if(type===undefined)chooseType(row.key);else setAccountKey(row.key);
 };
 const changeSort=(key:string,h:AgingHotel='Total')=>{setSort({key,hotel:h,descending:activeSort.key===key&&activeSort.hotel===h?!activeSort.descending:true});setPage(1);};
 const types=[...new Set(accounts.filter(a=>hotel==='All'||a.hotel===hotel).map(a=>a.type))].sort();
 const published=(refresh?.hotels??[]).filter(h=>hotel==='All'||h.hotel===hotel);
 return <section className="current-aging" aria-labelledby="current-aging-title">
  <header className="aging-heading"><div><h2 id="current-aging-title">Current Aging</h2><p>Latest saved OPERA balances · separate from the Dashboard date range.</p></div><span className="aging-scope">{hotel==='All'?'TSK + KAT':hotel} · THB</span></header>
  <div className="aging-publications">{published.length?published.map(h=><span key={h.hotel}><i className={h.hotel.toLowerCase()}/>{h.hotel} · {stamp(h.last_success_at)}{h.status==='failed'?' · latest refresh failed':''}</span>):<span>Publication timestamps unavailable. Amounts require verified account source data.</span>}{refresh?.running&&<span>Refresh in progress · showing the saved publication</span>}</div>
  {columns.length>0&&<AgingOverview data={overview} columns={columns} selectedKey={effectiveBucketKey} onSelect={selectRange} label={selected?.name??(type?`${type}${search?' · search results':''}`:search?'Search results':'All account types')}/>}
  <nav className="aging-breadcrumbs" aria-label="Current Aging drilldown"><button onClick={()=>chooseType()} disabled={type===undefined}>All account types</button>{type!==undefined&&<><ChevronRight size={13}/><button onClick={()=>setAccountKey(undefined)} disabled={!selected}>{type}</button></>}{selected&&<><ChevronRight size={13}/><span>{selected.name}</span></>}</nav>
  {!selected&&<div className="aging-controls"><label>Current Account Type<select aria-label="Current Account Type" value={type??''} onChange={e=>chooseType(e.target.value||undefined)}><option value="">All account types</option>{types.map(t=><option key={t}>{t}</option>)}</select></label><label className="aging-search">Search {type===undefined?'types or accounts':'matched accounts'}<input aria-label="Search current aging" type="search" value={search} placeholder="Name or Account No." onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><span>{sorted.length} {type===undefined?'account types':'matched accounts'} · every row available</span></div>}
  {selected&&<button className="aging-back" onClick={()=>setAccountKey(undefined)}><ArrowLeft size={14}/> Back to {type} accounts</button>}
  {accountKey&&!selected&&<p className="aging-notice" role="status">The selected account is no longer in this current scope. Choose an account below.</p>}
  <div className="aging-table-toolbar"><div><h3>All-range comparison <span>· {selected?'account':type===undefined?'account types':'matched accounts'}</span></h3><p>{visibleColumns.length} of {columns.length} source ranges shown. Click an amount to view its invoices.</p></div>
   <div className="aging-table-actions aging-sort-controls"><label>Sort hotel<select aria-label="Sort hotel" value={activeSort.hotel} onChange={e=>{setSort(p=>({...p,hotel:e.target.value as AgingHotel}));setPage(1);}}>{agingHotels.filter(h=>hotel==='All'||h==='Total'||h===hotel).map(h=><option key={h}>{h}</option>)}</select></label><span className={'aging-mobile-sort'+(visibleColumns.length+(showNetOpen?1:0)>8?' is-required':'')}><label>Sort by<select aria-label="Sort measure" value={activeSort.key} onChange={e=>{setSort(p=>({...p,key:e.target.value}));setPage(1);}}><option value="name">Name</option>{showNetOpen&&<option value="net">Net open</option>}{visibleColumns.map(b=><option key={agingBucketKey(b)} value={agingBucketKey(b)}>{b.label} days</option>)}</select></label><button aria-label="Toggle sort direction" aria-pressed={activeSort.descending} onClick={()=>{setSort(p=>({...p,descending:!activeSort.descending}));setPage(1);}}>{activeSort.key==='name'?(activeSort.descending?'Z to A':'A to Z'):activeSort.descending?'High to low':'Low to high'}</button></span><button onClick={()=>setColumnVisibility(p=>({...p,net:true,bucketKeys:null}))}>Show all ranges</button>
   <details className="aging-column-controls"><summary><Columns3 size={15}/> Columns<ChevronDown size={14}/></summary><div className="aging-column-panel">
    <div className="aging-column-presets" aria-label="Aging column presets"><button aria-pressed={columnPreset==='Summary'} onClick={()=>{setColumnVisibility(p=>({...p,net:true,bucketKeys:[]}));}}>Summary</button><button aria-pressed={columnPreset==='All aging'} onClick={()=>{setColumnVisibility(p=>({...p,net:true,bucketKeys:null}));}}>All aging</button></div>
    <p className="aging-column-state">{columnPreset}</p>
    <fieldset><legend>Comparison measures</legend><label><input type="checkbox" checked={columnVisibility.net||matrixColumns.length===0} disabled={matrixColumns.length===0} onChange={e=>{setColumnVisibility(p=>({...p,net:e.target.checked}));}}/> Net open</label><label><input type="checkbox" checked={columnVisibility.percentages} onChange={e=>setColumnVisibility(p=>({...p,percentages:e.target.checked}))}/> Bucket percentages</label></fieldset>
    <fieldset><legend>Source aging ranges</legend><div className="aging-bucket-options">{columns.map(bucket=><label key={agingBucketKey(bucket)}><input type="checkbox" checked={matrixColumns.includes(bucket)} onChange={()=>toggleBucket(agingBucketKey(bucket))}/> {bucket.label} days</label>)}</div></fieldset><p>Choose the ranges to show. The age distribution always includes every source range.</p>
   </div></details></div>
  </div>
  {columns.length?<AgingAllTable rows={shown} columns={visibleColumns} allColumns={columns} showNet={showNetOpen} percentages={columnVisibility.percentages} hotel={hotel} type={type} selectedKey={effectiveBucketKey} sort={activeSort} onSort={key=>changeSort(key,activeSort.hotel)} onDrill={drill}/>:<p className="aging-notice" role="status">Source aging buckets are unavailable. Refresh OPERA data from the main refresh control, then return here.</p>}
  {!selected&&columns.length>0&&<Pagination page={currentPage} pages={maxPage} count={sorted.length} label={type===undefined?'account types':'matched accounts'} change={setPage}/>}
  <p className="aging-footnote">All amounts in THB. “No matching account” is different from a verified 0.00. No account means no matching hotel ledger; Unverified means source data needs verification.</p>
  <details className="aging-definitions"><summary>How aging amounts and percentages work</summary><p className="aging-explanation">Amounts include credits. Each % is the bucket amount divided by net open for the same hotel, or Total. Zero or negative net open has no %. Credits can produce negative shares or shares above 100%. OPERA age is separate from Past Due date.</p></details>
  {selected&&selectedBucket&&<InvoiceDrill key={selected.key} externalRevision={revision} token={token} row={selected} bucket={selectedBucket} columns={columns} hotel={invoiceHotel} setHotel={setInvoiceHotel} setBucket={selectRange} refresh={refresh} onOpenInvoice={onOpenInvoice} view={invoiceView} setView={setInvoiceView} page={invoicePage} setPage={setInvoicePage} descending={invoiceDescending} setDescending={setInvoiceDescending}/>}
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
