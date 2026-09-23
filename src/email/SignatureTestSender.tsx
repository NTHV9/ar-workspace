import {useState,useRef} from 'react';
import {HOTEL_IDS,hotelName,type HotelId} from '../domain/hotels';
type Batch={recipientHash:string;items:{hotel:HotelId;id:string;state:string}[]};
const key='ar-signature-preview-batch';
function previous():Batch|null{try{const v=JSON.parse(sessionStorage.getItem(key)??'null');return v&&typeof v.recipientHash==='string'&&Array.isArray(v.items)&&v.items.length===HOTEL_IDS.length&&v.items.every((x:{hotel:string;id:string;state:string},i:number)=>x.hotel===HOTEL_IDS[i]&&/^[0-9a-f-]{36}$/.test(x.id)&&typeof x.state==='string')?v:null;}catch{return null;}}
export default function SignatureTestSender({token,disabled,onBusyChange}:{token:string;disabled:boolean;onBusyChange:(value:boolean)=>void}){
 const running=useRef(false);
 const [recipient,setRecipient]=useState(''),[batch,setBatch]=useState<Batch|null>(previous),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const record=(value:Batch)=>{sessionStorage.setItem(key,JSON.stringify(value));setBatch({...value,items:[...value.items]});};
 async function run(check=false){if(running.current)return;running.current=true;try{await runBatch(check);}finally{running.current=false;}}
 async function runBatch(check=false){
  if(busy||disabled)return;setError('');let current=batch;
  if(!check){
   const email=recipient.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setError('Enter one test recipient.');return;}
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(current&&current.recipientHash!==hash){setError('Use the same recipient for this test batch.');return;}
   if(!window.confirm(`Send ${HOTEL_IDS.length} signature preview emails to ${email}? No customer documents are included.`))return;
   current??={recipientHash:hash,items:HOTEL_IDS.map(hotel=>({hotel,id:crypto.randomUUID(),state:'not_requested'}))};record(current);
  }
  if(!current)return;setBusy(true);onBusyChange(true);
  try{for(let i=0;i<current.items.length;i++){
   const item=current.items[i];if(item.state==='sent'||check&&item.state==='not_requested')continue;
   current.items[i]={...item,state:check?'checking':'requesting'};record(current);
   try{
    const r=await fetch(check?`/api/email/deliveries/${item.id}/check`:'/api/email/test-send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...check?{}:{body:JSON.stringify({commandId:item.id,recipient:recipient.trim(),confirmed:true,signatureHotel:item.hotel})}});
    const v=await r.json() as {state?:string;error?:string};if(!r.ok)throw Error(v.error??'test_unavailable');current.items[i]={...item,state:v.state??'needs_check'};
   }catch(e){current.items[i]={...item,state:'needs_check'};setError((e as Error).message+' — use Check test results before starting another batch.');}
   record(current);
  }}finally{setBusy(false);onBusyChange(false);}
 }
 return <section className="signature-tests" aria-label="Signature preview emails"><h2>Send signature previews</h2><p>One test email per hotel. Blank name or position uses clearly labelled sample text.</p><form onSubmit={e=>{e.preventDefault();void run();}}><label>Test recipient<input type="email" autoComplete="off" required value={recipient} disabled={busy} onChange={e=>setRecipient(e.target.value)}/></label><button disabled={disabled||busy||batch?.items.every(i=>i.state==='sent')}>{busy?'Checking delivery…':`Send ${HOTEL_IDS.length} preview emails`}</button></form>{disabled&&<p>Save your signature before testing.</p>}{error&&<p role="alert" className="error-message">{error}</p>}{batch&&<><ul aria-label="Signature test results">{batch.items.map(item=><li key={item.id}><span>{item.hotel} · {hotelName(item.hotel)}</span><strong>{item.state==='sent'?'Sent and verified':item.state.replaceAll('_',' ')}</strong></li>)}</ul><button disabled={busy} onClick={()=>void run(true)}>Check test results</button>{batch.items.every(i=>i.state==='sent')&&<button disabled={busy} onClick={()=>{sessionStorage.removeItem(key);setBatch(null);setRecipient('');setError('');}}>Start a new test batch</button>}</>}</section>;
}
