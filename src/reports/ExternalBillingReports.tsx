import type {RegionId} from '../domain/hotels';
import type {Account} from '../domain/portfolio';
import {ExternalBillingHistory} from '../billing/ExternalBilling';
import type {DashboardScope} from '../dashboard/model';
import {useRef} from 'react';
import {InvoiceRegister} from '../register/InvoiceRegister';
export default function ExternalBillingReports({region='phuket',token,hotel,accounts,onDirtyChange,initialContext,onBack,params,update,onOpen,dataVersion}:{region?:RegionId;token:string;hotel:string;accounts:Account[];onDirtyChange:(dirty:boolean)=>void;initialContext?:DashboardScope;onBack?:()=>void;params:URLSearchParams;update:(key:string,value:string)=>void;onOpen:(account:Account,invoice?:string)=>void;dataVersion:number}){
 const dirty=useRef(false);const changed=(value:boolean)=>{dirty.current=value;onDirtyChange(value);};const external=params.get('reportsTab')==='external'||params.has('externalBilling')||!!initialContext;
 const choose=(tab:string)=>{if(dirty.current&&!window.confirm('Discard unsaved report edits?'))return;dirty.current=false;onDirtyChange(false);update('reports','1');update('reportsTab',tab);if(params.has('externalBilling'))update('externalBilling','');if(params.has('fromDashboard'))update('fromDashboard','');};
 return <main className="page reports-only"><header className="dashboard-title"><div><h1>Reports</h1><p>Invoice records and billing activity.</p></div>{onBack&&<button onClick={onBack}>Back to Dashboard</button>}</header><nav className="reports-hub-tabs" aria-label="Reports views"><button aria-pressed={!external} onClick={()=>choose('register')}>Invoice Register</button><button aria-pressed={external} onClick={()=>choose('external')}>External billing activity</button></nav>{external?<ExternalBillingHistory region={region} key={hotel} token={token} hotel={hotel} accounts={accounts} onDirtyChange={changed} initialContext={initialContext}/>:<InvoiceRegister token={token} region={region} hotel={hotel} accounts={accounts} params={params} update={update} onDirtyChange={changed} onOpen={onOpen} dataVersion={dataVersion}/>}</main>;
}
