import type {RegionId} from '../domain/hotels';
import type {Account} from '../domain/portfolio';
import {ExternalBillingHistory} from '../billing/ExternalBilling';
import type {DashboardScope} from '../dashboard/model';
export default function ExternalBillingReports({region='phuket',token,hotel,accounts,onDirtyChange,initialContext,onBack}:{region?:RegionId;token:string;hotel:string;accounts:Account[];onDirtyChange:(dirty:boolean)=>void;initialContext?:DashboardScope;onBack?:()=>void}){
 return <main className="page reports-only"><header className="dashboard-title"><div><h1>Reports</h1><p>Billing recorded through an account portal or outside this app.</p></div>{onBack&&<button onClick={onBack}>Back to Dashboard</button>}</header><ExternalBillingHistory region={region} key={hotel} token={token} hotel={hotel} accounts={accounts} onDirtyChange={onDirtyChange} initialContext={initialContext}/></main>;
}
