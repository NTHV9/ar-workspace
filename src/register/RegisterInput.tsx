import {useCollectionPolicy} from '../collection/PolicyContext';
import {stageLabel,thaiToday} from '../domain/collection';
import {trackingStatuses,type RegisterValues} from './model';
export const fieldLabels:Record<keyof RegisterValues,string>={billingRequired:'Billing requirement',creditTerm:'Credit term',firstBillingDate:'First billing date',lastReminderStage:'Latest reminder',lastReminderDate:'Reminder date',promisedDate:'Promised payment date',trackingStatus:'Tracking status',ownerName:'Owner',reportedReceived:'Reported received',note:'Invoice note'};
export function RegisterInput({field,values,onChange,disabled=false,autoFocus=false}:{field:keyof RegisterValues;values:RegisterValues;onChange:(patch:Partial<RegisterValues>)=>void;disabled?:boolean;autoFocus?:boolean}){
 const {policy}=useCollectionPolicy(),label=fieldLabels[field],props={disabled,autoFocus,'aria-label':label};
 if(field==='billingRequired')return <select {...props} value={values[field]===null?'unset':values[field]?'required':'not_required'} onChange={e=>onChange({billingRequired:e.target.value==='unset'?null:e.target.value==='required'})}><option value="unset">Not configured</option><option value="required">Required</option><option value="not_required">Not required</option></select>;
 if(field==='lastReminderStage')return <select {...props} value={values[field]??''} onChange={e=>onChange({lastReminderStage:e.target.value||null,...!e.target.value?{lastReminderDate:null}:{}})}><option value="">No reminders</option>{[...new Set([...(policy?.rounds.map(r=>r.key)??[]),...(values.lastReminderStage?[values.lastReminderStage]:[])])].map(s=><option key={s} value={s}>{stageLabel(s,policy)}</option>)}</select>;
 if(field==='trackingStatus')return <select {...props} value={values[field]} onChange={e=>onChange({trackingStatus:e.target.value})}>{trackingStatuses.map(s=><option key={s} value={s}>{s||'Not started'}</option>)}</select>;
 if(field==='note')return <textarea {...props} rows={2} maxLength={4000} value={values.note} onChange={e=>onChange({note:e.target.value})}/>;
 if(field==='creditTerm')return <input {...props} type="number" min="0" max="3650" step="1" placeholder="—" value={values[field]??''} onChange={e=>onChange({creditTerm:e.target.value===''?null:Number(e.target.value)})}/>;
 if(field==='reportedReceived')return <input {...props} inputMode="decimal" placeholder="—" value={values[field]??''} onChange={e=>onChange({reportedReceived:e.target.value||null})}/>;
 if(field==='ownerName')return <input {...props} maxLength={160} value={values[field]} onChange={e=>onChange({ownerName:e.target.value})}/>;
 return <input {...props} type="date" max={field==='promisedDate'?undefined:thaiToday()} value={values[field]??''} onChange={e=>onChange({[field]:e.target.value||null})}/>;
}
