import {invoiceAgingAccounts} from './invoice-aging';
import {thaiToday} from '../domain/collection';
import {isHotelId,regionHotels,hotelInRegion,type RegionId} from '../domain/hotels';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronDown,ChevronRight,Columns3,RefreshCw} from 'lucide-react';
import {sourceAging,type Account,type AgingBucket,type RefreshState} from '../domain/portfolio';
import {agingBucketKey,agingColumns,agingComparison,comparisonHotels,agingInvoiceEvidence,agingOverview,parseAgingInvoices,type AgingCell,type AgingComparisonRow,type AgingHotel,type AgingInvoice} from './aging-model';
import './aging.css';
import AgingAllTable from './AgingAllTable';
import AgingOverview from './AgingOverview';
import {useSource} from './data';
import {agingCatalogRevision,agingCountFor,isEmptyAgingRow,agingInvoicesResult,agingSourceRevision,agingStatusTarget,type AgingStatusFilters} from './aging-invoice-data';
import {AgingInvoiceBreakdown} from './AgingInvoiceBreakdown';

interface AgingColumnVisibility {debitCredit?:boolean;bucketKeys:string[]|null;net:boolean;percentages:boolean}
interface AccountReturn {key:string;scroll:number;top:number;page:number;sort:{key:string;hotel:AgingHotel;descending:boolean}}
export interface AgingContext {accountReturn?:AccountReturn;allAccounts?:boolean;over90?:boolean;hotel:string;type?:string;accountKey?:string;search:string;page:number;sort:{key:string;hotel:AgingHotel;descending:boolean};bucketKey:string;invoiceHotel:AgingHotel;invoiceView:'all'|'bucket'|'unassigned';invoicePage:number;invoiceDescending:boolean;hideZero?:boolean;columnVisibility?:AgingColumnVisibility;comparisonView?:'range'|'matrix';countSelection?:{rowKey:string;hotel:AgingHotel;bucketKey:string|null}|null;countFilters?:{key:string;filters:AgingStatusFilters}|null}
interface Props {region?:RegionId;revision?:number;token:string;hotel:string;accounts:Account[];refresh?:RefreshState|null;onOpenInvoice:(hotel:string,accountId:string,invoiceId?:string)=>void;initialContext?:AgingContext;onContextChange?:(context:AgingContext)=>void}
const amount=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stamp=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})+' ICT':'Publication unavailable';
const stateLabel:Record<AgingCell['state'],string>={verified:'',absent:'No matching account',outside:'Outside scope',unavailable:'Source unverified'};
const pageSize=25;

export default function CurrentAging(props:Props){return <AgingWorkspace key={props.token+'|'+props.hotel+'|'+props.region} {...props}/>;}
function AgingWorkspace({region='phuket',revision=0,token,hotel,accounts:catalog,refresh,onOpenInvoice,initialContext,onContextChange}:Props){
 const agingHotels=comparisonHotels(catalog,region);
 const initial=initialContext?.hotel===hotel?initialContext:undefined;
 const columns=useMemo(()=>agingColumns(catalog),[catalog]);
 const [accountReturn,setAccountReturn]=useState<AccountReturn|undefined>(initial?.accountReturn);const restoreList=useRef(false);
 const [type,setType]=useState<string|undefined>(initial?.type),[accountKey,setAccountKey]=useState<string|undefined>(initial?.accountKey),[search,setSearch]=useState(initial?.search??''),[page,setPage]=useState(initial?.page??1);
 const [sort,setSort]=useState(initial?.sort??{key:'net',hotel:'Total' as AgingHotel,descending:true});
 const [bucketKey,setBucketKey]=useState(initial?.bucketKey??(columns[0]?agingBucketKey(columns[0]):'')),[invoiceHotel,setInvoiceHotel]=useState<AgingHotel>(initial?.invoiceHotel??'Total');
 const [invoiceView,setInvoiceView]=useState<'all'|'bucket'|'unassigned'>(initial?.invoiceView??'all'),[invoicePage,setInvoicePage]=useState(initial?.invoicePage??1),[invoiceDescending,setInvoiceDescending]=useState(initial?.invoiceDescending??true);
 const [allAccounts,setAllAccounts]=useState(initial?.allAccounts??false),[over90,setOver90]=useState(initial?.over90??false);
 const typeView=type===undefined&&!allAccounts;
 const [hideZero,setHideZero]=useState(initial?.hideZero??false);
 const [columnVisibility,setColumnVisibility]=useState<AgingColumnVisibility>(initial?.columnVisibility??{bucketKeys:null,net:true,percentages:true});
 const [countRevision,setCountRevision]=useState(0),[countSelection,setCountSelection]=useState<{rowKey:string;hotel:AgingHotel;bucketKey:string|null}|null>(initial?.countSelection??null);
 const [countFilters,setCountFilters]=useState<{key:string;filters:AgingStatusFilters}|null>(initial?.countFilters??null);
 const countTrigger=useRef<HTMLElement|null>(null);
 const countScope=JSON.stringify([hotel,type,accountKey,search,hideZero,allAccounts,over90]),previousCountScope=useRef(countScope);
 const counts=useSource(catalog.length?'/api/dashboard/aging-invoices'+(region==='khao-lak'?'?region=khao-lak'+(isHotelId(hotel)?'&hotel='+hotel:''):isHotelId(hotel)?'?hotel='+hotel:''):null,token,agingSourceRevision(revision+countRevision+agingCatalogRevision(catalog),refresh??undefined),agingInvoicesResult,true);
 const accounts=useMemo(()=>invoiceAgingAccounts(catalog,counts,refresh??undefined,thaiToday()),[catalog,counts,refresh]);
 useEffect(()=>{if(previousCountScope.current!==countScope){previousCountScope.current=countScope;setCountSelection(null);setCountFilters(null);}},[countScope]);
 const comparisonView='matrix' as const;
 const rows=useMemo(()=>agingComparison(accounts,hotel,type,allAccounts),[accounts,hotel,type,allAccounts]);
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
 const context=useMemo<AgingContext>(()=>({hotel,accountReturn,allAccounts,over90,type,accountKey,search,page,sort,bucketKey:effectiveBucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,hideZero,columnVisibility,comparisonView,countSelection,countFilters}),[hotel,accountReturn,allAccounts,over90,type,accountKey,search,page,sort,effectiveBucketKey,invoiceHotel,invoiceView,invoicePage,invoiceDescending,hideZero,columnVisibility,comparisonView,countSelection,countFilters]);
 useEffect(()=>{onContextChange?.(context);},[context,onContextChange]);
 const matched=useMemo(()=>{
  const query=search.trim().toLocaleLowerCase();
  return rows.filter(row=>(!over90||row.members.some(a=>a.over90>0))&&(!query||[row.name,...row.members.flatMap(a=>[a.name,a.account_no??'',a.id])].some(s=>s.toLocaleLowerCase().includes(query)))).sort((a,b)=>{
   if(activeSort.key==='name')return a.name.localeCompare(b.name,'en',{numeric:true})*(activeSort.descending?-1:1);
   const index=columns.findIndex(c=>agingBucketKey(c)===activeSort.key),read=(row:AgingComparisonRow)=>(activeSort.key==='net'?row.net:row.cells[index])?.[activeSort.hotel].amount??null,x=read(a),y=read(b);
   return x===null?y===null?a.name.localeCompare(b.name):1:y===null?-1:(x-y)*(activeSort.descending?-1:1)||a.name.localeCompare(b.name);
  });
 },[rows,search,over90,activeSort.key,activeSort.hotel,activeSort.descending,columns]);
 const sorted=useMemo(()=>hideZero?matched.filter(row=>!isEmptyAgingRow(row,counts,refresh??undefined)):matched,[matched,hideZero,counts,refresh]);
 const maxPage=Math.max(1,Math.ceil(sorted.length/pageSize)),currentPage=Math.min(page,maxPage),shown=selected?[selected]:sorted.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const overview=agingOverview(accounts,hotel,(selected?[selected]:matched).flatMap(row=>row.members));
 const countRow=countSelection?rows.find(row=>row.key===countSelection.rowKey):undefined;
 const countBucket=countSelection?.bucketKey?columns.find(bucket=>agingBucketKey(bucket)===countSelection.bucketKey):undefined;
 const countTarget=countRow&&countSelection&&(countSelection.bucketKey===null||countBucket)?agingStatusTarget(countRow,countSelection.hotel,countBucket,typeView,columns):null;
 const columnPreset=(columnVisibility.net||matrixColumns.length===0)&&matrixColumns.length===columns.length?'All aging':matrixColumns.length===0?'Summary':'Custom';
 const selectRange=(key:string)=>{
  setBucketKey(key);setInvoicePage(1);setInvoiceView('bucket');
  setCountSelection(current=>current?{...current,bucketKey:key}:null);
  // Range highlights and invoice drill targets do not change the all-range comparison page.
 };
 const toggleBucket=(key:string)=>{setColumnVisibility(previous=>{
  const keys=previous.bucketKeys??columns.map(agingBucketKey),next=keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];
  return {...previous,bucketKeys:next,net:next.length===0?true:previous.net};
 });};
 const chooseType=(value?:string)=>{setType(value);setAccountKey(undefined);setSearch('');setPage(1);};
 const drill=(row:AgingComparisonRow,h:AgingHotel='Total',bucket?:AgingBucket)=>{
  if(!selected&&!typeView){const node=[...document.querySelectorAll<HTMLElement>('[data-aging-group]')].find(n=>n.dataset.agingGroup===row.key&&n.getClientRects().length>0);setAccountReturn({key:row.key,scroll:window.scrollY,top:node?.getBoundingClientRect().top??0,page,sort});}
  setInvoiceHotel(h==='Total'||row.members.some(a=>a.hotel===h)?h:'Total');setInvoicePage(1);setInvoiceView(bucket?'bucket':'all');if(bucket&&agingBucketKey(bucket)!==effectiveBucketKey)selectRange(agingBucketKey(bucket));
  if(typeView)chooseType(row.key);else setAccountKey(row.key);
 };
 const returnToAccounts=()=>{restoreList.current=true;setAccountKey(undefined);setCountSelection(null);setCountFilters(null);if(accountReturn){setPage(accountReturn.page);setSort(accountReturn.sort);}};
 useLayoutEffect(()=>{if(selected||!restoreList.current)return;restoreList.current=false;const node=[...document.querySelectorAll<HTMLElement>('[data-aging-group]')].find(n=>n.dataset.agingGroup===accountReturn?.key&&n.getClientRects().length>0);node?.querySelector<HTMLButtonElement>('.aging-row-link')?.focus({preventScroll:true});window.scrollTo({top:node&&accountReturn?window.scrollY+node.getBoundingClientRect().top-accountReturn.top:accountReturn?.scroll??0,behavior:'instant'});},[selected,accountReturn]);
 const changeSort=(key:string,h:AgingHotel='Total')=>{setSort({key,hotel:h,descending:activeSort.key===key&&activeSort.hotel===h?!activeSort.descending:true});setPage(1);};
 const types=[...new Set(accounts.filter(a=>hotel==='All'||a.hotel===hotel).map(a=>a.type))].sort();
 const published=(refresh?.hotels??[]).filter(h=>hotelInRegion(h.hotel,region)&&(hotel==='All'||h.hotel===hotel));
 return <section className="current-aging" aria-labelledby="current-aging-title">
  <header className="aging-heading"><div><h2 id="current-aging-title">Current Aging</h2></div><span className="aging-scope">{hotel==='All'?regionHotels(region).join(' + '):hotel} · THB</span></header>
  <div className="aging-publications">{published.length?published.map(h=><span key={h.hotel}><i className={h.hotel.toLowerCase()}/>{h.hotel} · {stamp(h.last_success_at)}{h.status==='failed'?' · latest refresh failed':''}</span>):<span>Publication timestamps unavailable. Amounts require verified account source data.</span>}{refresh?.running&&<span>Refresh in progress · showing the saved publication</span>}</div>
  {columns.length>0&&<AgingOverview region={region} counts={Object.fromEntries(agingHotels.map(h=>[h,agingCountFor(overview,h,undefined,counts,refresh??undefined)]))} data={overview} columns={columns} selectedKey={effectiveBucketKey} onSelect={selectRange} label={selected?.name??(type?`${type}${search?' · search results':''}`:search?'Search results':'All account types')}/>}
  <nav className="aging-breadcrumbs" aria-label="Current Aging drilldown"><button onClick={()=>chooseType()} disabled={typeView}>All account types</button>{type!==undefined&&<><ChevronRight size={13}/><button onClick={returnToAccounts} disabled={!selected}>{type}</button></>}{selected&&<><ChevronRight size={13}/><span>{selected.name}</span></>}</nav>
  {!selected&&<div className="aging-controls"><label>View<select aria-label="Aging view" value={allAccounts?'accounts':'types'} onChange={e=>{setAllAccounts(e.target.value==='accounts');setType(undefined);setAccountKey(undefined);setPage(1);}}><option value="types">Account types</option><option value="accounts">Accounts</option></select></label><label>Current Account Type<select aria-label="Current Account Type" value={type??''} onChange={e=>chooseType(e.target.value||undefined)}><option value="">All account types</option>{types.map(t=><option key={t}>{t}</option>)}</select></label><label className="aging-search">Search {typeView?'types or accounts':'matched accounts'}<input aria-label="Search current aging" type="search" value={search} placeholder="Name or Account No." onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><label>Exposure<select aria-label="Aging exposure" value={over90?'over90':'all'} onChange={e=>{setOver90(e.target.value==='over90');setAccountKey(undefined);setPage(1);}}><option value="all">All ages</option><option value="over90">Over 90 days</option></select></label><button onClick={()=>{setType(undefined);setAccountKey(undefined);setSearch('');setOver90(false);setPage(1);}}>Clear filters</button><span>{sorted.length} {typeView?'account types':'matched accounts'} · {hideZero?`${matched.length-sorted.length} hidden`:'every row available'}</span></div>}
  {selected&&<button className="aging-back aging-inline-back" onClick={returnToAccounts}><ArrowLeft size={14}/> Back to {type??'all'} accounts</button>}
  {accountKey&&!selected&&<p className="aging-notice" role="status">The selected account is no longer in this current scope. Choose an account below.</p>}
  <div className="aging-table-toolbar"><div><h3>All-range comparison <span>· {selected?'account':typeView?'account types':'matched accounts'}</span></h3></div>
   <div className="aging-table-actions aging-sort-controls">{!selected&&<label className="aging-hide-zero"><input type="checkbox" checked={hideZero} onChange={e=>{setHideZero(e.target.checked);setPage(1);}}/> Hide empty accounts</label>}<label>Sort hotel<select aria-label="Sort hotel" value={activeSort.hotel} onChange={e=>{setSort(p=>({...p,hotel:e.target.value as AgingHotel}));setPage(1);}}>{agingHotels.filter(h=>hotel==='All'||h==='Total'||h===hotel).map(h=><option key={h}>{h}</option>)}</select></label><span className={'aging-mobile-sort'+(visibleColumns.length+(showNetOpen?1:0)>8?' is-required':'')}><label>Sort by<select aria-label="Sort measure" value={activeSort.key} onChange={e=>{setSort(p=>({...p,key:e.target.value}));setPage(1);}}><option value="name">Name</option>{showNetOpen&&<option value="net">Net open</option>}{visibleColumns.map(b=><option key={agingBucketKey(b)} value={agingBucketKey(b)}>{b.label} days</option>)}</select></label><button aria-label="Toggle sort direction" aria-pressed={activeSort.descending} onClick={()=>{setSort(p=>({...p,descending:!activeSort.descending}));setPage(1);}}>{activeSort.key==='name'?(activeSort.descending?'Z to A':'A to Z'):activeSort.descending?'High to low':'Low to high'}</button></span><button onClick={()=>setColumnVisibility(p=>({...p,net:true,bucketKeys:null}))}>Show all ranges</button>
   <details className="aging-column-controls"><summary><Columns3 size={15}/> Columns<ChevronDown size={14}/></summary><div className="aging-column-panel">
    <div className="aging-column-presets" aria-label="Aging column presets"><button aria-pressed={columnPreset==='Summary'} onClick={()=>{setColumnVisibility(p=>({...p,net:true,bucketKeys:[]}));}}>Summary</button><button aria-pressed={columnPreset==='All aging'} onClick={()=>{setColumnVisibility(p=>({...p,net:true,bucketKeys:null}));}}>All aging</button></div>
    <p className="aging-column-state">{columnPreset}</p>
    <fieldset><legend>Comparison measures</legend><label><input type="checkbox" checked={columnVisibility.net||matrixColumns.length===0} disabled={matrixColumns.length===0} onChange={e=>{setColumnVisibility(p=>({...p,net:e.target.checked}));}}/> Net open</label><label><input type="checkbox" checked={columnVisibility.percentages} onChange={e=>setColumnVisibility(p=>({...p,percentages:e.target.checked}))}/> Bucket percentages</label><label><input type="checkbox" checked={columnVisibility.debitCredit??false} onChange={e=>setColumnVisibility(p=>({...p,debitCredit:e.target.checked}))}/> Debit / credit</label></fieldset>
    <fieldset><legend>Source aging ranges</legend><div className="aging-bucket-options">{columns.map(bucket=><label key={agingBucketKey(bucket)}><input type="checkbox" checked={matrixColumns.includes(bucket)} onChange={()=>toggleBucket(agingBucketKey(bucket))}/> {bucket.label} days</label>)}</div></fieldset>
   </div></details></div>
  </div>
  {counts.state==='error'&&<p className="aging-notice" role="status">Aging data could not be updated. <button onClick={()=>setCountRevision(n=>n+1)}>Retry invoice counts</button></p>}
  {columns.length?<AgingAllTable netTotals={Object.fromEntries(agingHotels.map(h=>[h,overview.net[h].amount]))} onOpenAccount={(h,id)=>onOpenInvoice(h,id)} region={region} rows={shown} columns={visibleColumns} allColumns={columns} showNet={showNetOpen} percentages={columnVisibility.percentages} hotel={hotel} type={typeView?undefined:type??'All'} debitCredit={columnVisibility.debitCredit} selectedKey={effectiveBucketKey} sort={activeSort} onSort={key=>changeSort(key,activeSort.hotel)} onDrill={drill} getCount={(row,h,bucket)=>agingCountFor(row,h,bucket,counts,refresh??undefined)} onCounts={(row,h,bucket)=>{countTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setCountFilters(null);setCountSelection({rowKey:row.key,hotel:h,bucketKey:bucket?agingBucketKey(bucket):null});if(bucket)selectRange(agingBucketKey(bucket));}}/>:<p className="aging-notice" role="status">Source aging buckets are unavailable. Refresh OPERA data from the main refresh control, then return here.</p>}
  {countTarget&&<AgingInvoiceBreakdown key={countTarget.key} target={countTarget} token={token} revision={revision+countRevision+agingCatalogRevision(accounts)} refresh={refresh??undefined} initialFilters={countFilters?.key===countTarget.key?countFilters.filters:undefined} onFiltersChange={filters=>setCountFilters(previous=>previous?.key===countTarget.key&&JSON.stringify(previous.filters)===JSON.stringify(filters)?previous:{key:countTarget.key,filters})} onClose={()=>{setCountSelection(null);setCountFilters(null);requestAnimationFrame(()=>{const label=`View invoice statuses for ${countTarget.title} · ${countTarget.hotel} · ${countTarget.bucketLabel==='All ages'?'All ages':countTarget.bucketLabel}`;const trigger=countTrigger.current?.isConnected?countTrigger.current:[...document.querySelectorAll<HTMLButtonElement>('.aging-count-button')].find(button=>button.getAttribute('aria-label')===label&&button.getClientRects().length>0);trigger?.focus();});}} onOpenInvoice={onOpenInvoice}/>}
  {!selected&&columns.length>0&&<Pagination page={currentPage} pages={maxPage} count={sorted.length} label={typeView?'account types':'matched accounts'} change={setPage}/>}

  {selected&&selectedBucket&&<InvoiceDrill key={selected.key} externalRevision={revision} token={token} row={selected} bucket={selectedBucket} columns={columns} hotel={invoiceHotel} setHotel={setInvoiceHotel} setBucket={selectRange} refresh={refresh} onOpenInvoice={onOpenInvoice} view={invoiceView} setView={setInvoiceView} page={invoicePage} setPage={setInvoicePage} descending={invoiceDescending} setDescending={setInvoiceDescending}/>}
  {selected&&<div className="aging-return-footer"><button className="aging-back aging-inline-back" onClick={returnToAccounts}><ArrowLeft size={14}/> Back to {type??'all'} accounts</button></div>}
 </section>;
}
function Pagination({page,pages,count,label,change}:{page:number;pages:number;count:number;label:string;change:(n:number)=>void}){return <div className="aging-pagination"><span>{count.toLocaleString()} {label} · page {page} of {pages}</span><button disabled={page===1} onClick={()=>change(page-1)}>Previous</button><button disabled={page>=pages} onClick={()=>change(page+1)}>Next</button></div>;}

function InvoiceDrill({externalRevision,token,row,bucket,columns,hotel,setHotel,setBucket,refresh,onOpenInvoice,view,setView,page,setPage,descending,setDescending}:{externalRevision:number;token:string;row:AgingComparisonRow;bucket:AgingBucket;columns:AgingBucket[];hotel:AgingHotel;setHotel:(h:AgingHotel)=>void;setBucket:(key:string)=>void;refresh?:RefreshState|null;onOpenInvoice:Props['onOpenInvoice'];view:'all'|'bucket'|'unassigned';setView:(v:'all'|'bucket'|'unassigned')=>void;page:number;setPage:(page:number)=>void;descending:boolean;setDescending:(value:boolean)=>void}){
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
  return {account,source:verified?source:undefined,...agingInvoiceEvidence(state==='ready'?request.rows.filter(i=>i.hotel===account.hotel&&i.accountId===account.id):[],source??bucket,schema,account.agingAccountCredits?.filter(c=>c.bucketKey===agingBucketKey(bucket)).reduce((n,c)=>n+c.amount,0)??0)};
 });
 const invoiceRows=(view==='all'?request.rows.filter(i=>i.verified&&i.open!==null&&i.open!==0&&['parent','standalone'].includes(i.role)&&!i.parentId):evidence.flatMap(e=>view==='unassigned'?e.unassigned:e.rows)).sort((a,b)=>a.open===null?1:b.open===null?-1:(a.open-b.open)*(descending?-1:1)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(invoiceRows.length/pageSize)),currentPage=Math.min(page,pages),shown=invoiceRows.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const reset=()=>setPage(1);
 const credits=view==='unassigned'?[]:members.flatMap(a=>(a.agingAccountCredits??[]).filter(c=>view==='all'||c.bucketKey===agingBucketKey(bucket)).map(c=>({...c,hotel:a.hotel})));
 const hotels=[...new Set(row.members.map(a=>a.hotel))];
 return <section className="aging-invoice-drill" aria-labelledby="aging-invoice-title">
  <header className="aging-heading"><div><h3 id="aging-invoice-title">Invoices · {view==='all'?'All ages':bucket.label+' days'}</h3><p>{row.name} · {hotel==='Total'?'all matching hotel ledgers':hotel}</p></div><button onClick={()=>setRevision(n=>n+1)}><RefreshCw size={13}/> Reload invoices</button></header>
  <div className="aging-controls"><label>Invoice hotel<select aria-label="Invoice hotel" value={hotel} onChange={e=>{setHotel(e.target.value as AgingHotel);reset();}}><option value="Total">Total · matching hotels</option>{hotels.map(h=><option key={h}>{h}</option>)}</select></label><label>Aging<select aria-label="Invoice aging bucket" value={view==='all'?'all':agingBucketKey(bucket)} onChange={e=>{if(e.target.value==='all')setView('all');else{setBucket(e.target.value);setView('bucket');}reset();}}><option value="all">All ages</option>{columns.map(b=><option key={agingBucketKey(b)} value={agingBucketKey(b)}>{b.label}</option>)}</select></label><label>Show<select aria-label="Invoice evidence view" value={view} onChange={e=>{setView(e.target.value as 'all'|'bucket'|'unassigned');setPage(1);}}><option value="all">All invoices</option><option value="bucket">Selected age range</option><option value="unassigned">Unverified / unassigned invoices</option></select></label></div>
  {state==='loading'?<p className="aging-empty" role="status">Loading current invoice evidence…</p>:state==='error'?<p className="aging-notice" role="alert">Invoice data is unavailable. No balance has been treated as zero. <button onClick={()=>setRevision(n=>n+1)}>Retry invoice read</button></p>:<>
   {evidence.some(e=>!e.source||e.difference!==0||!e.complete)&&<p className="aging-notice" role="status">Some invoices need verification.</p>}
   <div className="aging-table-scroll" tabIndex={0} role="region" aria-label="Current invoice evidence"><table className="aging-invoices" aria-label="Current aging invoices"><thead><tr><th scope="col">Hotel</th><th scope="col">Invoice No.</th><th scope="col">Folio No.</th><th scope="col">Guest</th><th scope="col">Source date</th><th scope="col">OPERA age</th><th scope="col" aria-sort={descending?'descending':'ascending'}><button onClick={()=>{setDescending(!descending);setPage(1);}}>Open · THB {descending?'↓':'↑'}</button></th></tr></thead><tbody>{shown.map(i=><tr key={JSON.stringify([i.hotel,i.accountId,i.id])}><td>{i.hotel}</td><td><button className="aging-invoice-link" aria-label={`Open invoice ${i.invoiceNo||i.id}`} onClick={()=>onOpenInvoice(i.hotel,i.accountId,i.id)}>{i.invoiceNo||'No invoice number'} <ArrowUpRight size={13}/></button></td><td>{i.folioNo||'—'}</td><td>{i.guest||'—'}</td><td>{i.date||'—'}</td><td>{i.age===null?'Unknown':i.age}</td><td>{amount(i.open)}</td></tr>)}</tbody>{credits.length>0&&<tfoot>{credits.map((c,index)=><tr key={c.hotel+c.bucketKey+index}><td>{c.hotel}</td><td colSpan={5}>Account credit</td><td>{amount(-c.amount)}</td></tr>)}</tfoot>}</table>{shown.length===0&&<p className="aging-empty">{view==='bucket'?'No verified nonzero invoices in this bucket.':'No unassigned invoices in this account scope.'}</p>}</div>
   <Pagination page={currentPage} pages={pages} count={invoiceRows.length} label="invoices" change={setPage}/>
  </>}
 </section>;
}
