import {useEffect,useId,useRef,useState} from 'react';
import './field-feedback.css';
export type FieldIssues=Record<string,string>;
export function useFieldFeedback(){
 const id=useId(),[issues,setIssues]=useState<FieldIssues>({}),pending=useRef<string|null>(null);
 const fieldId=(key:string)=>id+'-'+key;
 useEffect(()=>{if(pending.current){const field=document.getElementById(fieldId(pending.current));if(field){field.focus();pending.current=null;}}});
 return {issues,show(next:FieldIssues){pending.current=Object.keys(next)[0]??null;setIssues(next);},clear(key?:string){if(!key){pending.current=null;setIssues({});return;}setIssues(old=>{const next={...old};delete next[key];return next;});},props(key:string){return {id:fieldId(key),'aria-invalid':!!issues[key],'aria-describedby':issues[key]?fieldId(key)+'-error':undefined};},message(key:string){return issues[key]?<small className="field-error" id={fieldId(key)+'-error'}>{issues[key]}</small>:null;}};
}
