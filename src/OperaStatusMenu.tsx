import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Database,X} from 'lucide-react';
import './opera-status-menu.css';
export function OperaStatusMenu({status,busy,connected,children}:{status:string;busy:boolean;connected:boolean;children:ReactNode}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false);
 useEffect(()=>{const close=()=>{if(panel.current?.matches(':popover-open'))panel.current.hidePopover();};window.addEventListener('resize',close);return()=>window.removeEventListener('resize',close);},[]);
 return <><button className="opera-status-trigger" popoverTarget={id} aria-label="OPERA data status" aria-expanded={open} aria-controls={id} title={status} onClick={event=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  panel.current?.style.setProperty('--opera-menu-top',Math.min(bounds.bottom+10,window.innerHeight-200)+'px');
  panel.current?.style.setProperty('--opera-menu-right',Math.max(16,window.innerWidth-bounds.right)+'px');
 }}><Database size={16} aria-hidden="true"/><span>OPERA</span><i aria-hidden="true" data-state={busy?'refreshing':connected?'connected':'unavailable'}/></button>
 <div ref={panel} id={id} popover="auto" className="opera-status-menu" role="region" aria-label="OPERA connection and data" onToggle={event=>setOpen(event.newState==='open')}>
  <header><strong>OPERA data</strong><button className="icon-button" aria-label="Close OPERA data status" popoverTarget={id} popoverTargetAction="hide"><X size={17}/></button></header>
  <p className="opera-status-copy" role="status">{status}</p><div className="opera-status-actions">{children}</div>
 </div></>;
}
