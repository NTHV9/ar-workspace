import {useEffect,useId,useRef,useState} from 'react';
import {pdfFilename} from './filenames';

export function FilenameField({label,value,disabled,onApply,onPending}:{label:string;value:string;disabled?:boolean;onApply:(name:string)=>void;onPending:(pending:boolean)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState(''),id=useId();
 const pendingCallback=useRef(onPending);pendingCallback.current=onPending;
 useEffect(()=>{setDraft(value);setError('');pendingCallback.current(false);},[value]);
 useEffect(()=>()=>pendingCallback.current(false),[]);
 function apply(){try{const name=pdfFilename(draft);onApply(name);setDraft(name);setError('');onPending(false);}catch(e){setError(e instanceof Error?e.message:'Choose a valid PDF filename.');}}
 return <div className="pdf-filename-field"><label htmlFor={id}>{label}</label><div><input id={id} value={draft} disabled={disabled} aria-invalid={!!error} aria-describedby={error?id+'-error':undefined} onChange={e=>{setDraft(e.target.value);setError('');onPending(e.target.value!==value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}if(e.key==='Escape'){setDraft(value);setError('');onPending(false);}}}/>{draft!==value&&<button disabled={disabled} onClick={apply}>Apply name</button>}</div>{error&&<p id={id+'-error'} role="alert">{error}</p>}</div>;
}
