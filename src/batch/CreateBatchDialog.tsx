import '../document-route.css';
import {useEffect,useRef,useState} from 'react';
import type {RegionId} from '../domain/hotels';
import type {BatchSelection} from './selection';
import {activeBatchId,createBatch,saveBatch,type BatchOptions} from './state';
export default function CreateBatchDialog({owner,region,selections,onClose,onCreated}:{owner:string;region:RegionId;selections:BatchSelection[];onClose:()=>void;onCreated:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[options,setOptions]=useState<BatchOptions>({content:'both',layout:'combined'}),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const existing=activeBatchId(sessionStorage,owner,region);
 function create(){try{const active=activeBatchId(sessionStorage,owner,region);if(active){onCreated(active);return;}const batch=createBatch(owner,region,selections,options);saveBatch(sessionStorage,batch);onCreated(batch.id);}catch(e){setError(e instanceof Error?e.message:'The batch could not be created.');}}
 return <dialog ref={dialog} className="document-dialog batch-create" onCancel={onClose}><h2>{existing?'Resume unfinished batch':'Prepare selected accounts'}</h2>{existing&&<p>This tab has an unfinished batch. Finish or close that batch before preparing another.</p>}<p>{selections.length} work groups · {selections.reduce((n,g)=>n+g.ids.length,0)} invoices</p>
 <ul>{selections.map(g=><li key={g.key}><strong>{g.accountName}</strong><span>{g.hotel} · {g.stage} · {g.ids.length} invoices</span></li>)}</ul>
 <label>Document content<select value={options.content} onChange={e=>setOptions({...options,content:e.target.value as BatchOptions['content']})}><option value="both">Statement and Invoices</option><option value="invoices">Invoices</option><option value="statement">Statement only</option></select></label>
 <label>Files for each account<select value={options.layout} onChange={e=>setOptions({...options,layout:e.target.value as BatchOptions['layout']})}><option value="combined">One combined PDF per account</option><option value="statement_bundle">Statement + invoice bundle</option><option value="separate">Statement + each invoice separately</option></select></label>
 <p>Recipients can be added when reviewing each email.</p>{error&&<p role="alert" className="error-message">{error}</p>}<footer><button onClick={onClose}>Cancel</button><button className="primary-button" onClick={create}>{existing?'Resume existing batch':'Prepare accounts'}</button></footer></dialog>;
}
