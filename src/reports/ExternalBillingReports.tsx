import type {RegionId} from '../domain/hotels';
import type {Account} from '../domain/portfolio';

import type {DashboardScope} from '../dashboard/model';
import {GoogleSheetsReports} from './GoogleSheetsReports';
import {useRef} from 'react';
import {InvoiceRegister} from '../register/InvoiceRegister';
export default function ExternalBillingReports({administrator=false,region='phuket',token,hotel,accounts,onDirtyChange,onBack,params,update,onOpen,dataVersion}:{administrator?:boolean;region?:RegionId;token:string;hotel:string;accounts:Account[];onDirtyChange:(dirty:boolean)=>void;initialContext?:DashboardScope;onBack?:()=>void;params:URLSearchParams;update:(key:string,value:string)=>void;onOpen:(account:Account,invoice?:string)=>void;dataVersion:number}){
 const dirty=useRef(false);const changed=(value:boolean)=>{dirty.current=value;onDirtyChange(value);};const sheets=!administrator||params.get('reportsTab')!=='register';
 const choose=(tab:string)=>{if(dirty.current&&!window.confirm('Discard unsaved report edits?'))return;dirty.current=false;onDirtyChange(false);update('reports','1');update('reportsTab',tab);if(params.has('externalBilling'))update('externalBilling','');if(params.has('fromDashboard'))update('fromDashboard','');};
 return <main className="page reports-only">{(sheets||onBack)&&<header className="dashboard-title">{sheets&&<div><h1>Reports</h1></div>}{onBack&&<button onClick={onBack}>Back to Dashboard</button>}</header>}<nav className="reports-hub-tabs" aria-label="Reports views"><>{administrator&&<><button aria-pressed={!sheets} onClick={()=>choose('register')}>Invoice Register</button></>}</><button aria-pressed={sheets} onClick={()=>choose('sheets')}>Google Sheets</button></nav>{sheets?<GoogleSheetsReports token={token}/>:<InvoiceRegister token={token} region={region} hotel={hotel} accounts={accounts} params={params} update={update} onDirtyChange={changed} onOpen={onOpen} dataVersion={dataVersion}/>}</main>;
}
