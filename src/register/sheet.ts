import {rowKey,type RegisterResult,type RegisterRow} from './model';
export interface SheetPage extends RegisterResult {snapshot:string}
/** Bounded network pages become one coherent sheet, never separate user pages.
 * A changed source restarts the read instead of dropping or duplicating rows. */
export async function loadRegisterSheet(read:(page:number)=>Promise<SheetPage>,signal:AbortSignal,onProgress?:(loaded:number,total:number)=>void):Promise<SheetPage>{
 for(let attempt=0;attempt<3;attempt++){
  let first:SheetPage|undefined;const rows:RegisterRow[]=[],seen=new Set<string>();let changed=false;
  for(let page=0;page<501;page++){
   signal.throwIfAborted();const next=await read(page);signal.throwIfAborted();
   if(!Array.isArray(next.rows)||!Number.isSafeInteger(next.total)||next.total<0||!Number.isSafeInteger(next.hiddenTotal)||!/^[a-f0-9]{32}$/.test(next.snapshot))throw Error('register_sheet_unavailable');
   if(next.total>50000)throw Error('register_sheet_too_large');
   if(!first)first=next;else if(first.snapshot!==next.snapshot||first.total!==next.total){changed=true;break;}
   if(next.rows.length>100||next.rows.length===0&&rows.length<next.total)throw Error('register_sheet_incomplete');
   for(const row of next.rows){const key=rowKey(row);if(seen.has(key)){changed=true;break;}seen.add(key);rows.push(row);}
   if(changed)break;if(rows.length>next.total)throw Error('register_sheet_incomplete');onProgress?.(rows.length,next.total);
   if(rows.length===next.total)return {...first,rows};
   if(next.rows.length!==100)throw Error('register_sheet_incomplete');
  }
  if(!changed)throw Error('register_sheet_incomplete');
 }
 throw Error('register_sheet_changed');
}
export function visibleSheetRange(count:number,scrollTop:number,viewportHeight:number,rowHeight=52,overscan=8){
 const start=Math.max(0,Math.floor(Math.max(0,scrollTop)/rowHeight)-overscan),end=Math.min(count,Math.ceil((Math.max(0,scrollTop)+viewportHeight)/rowHeight)+overscan);
 return {start:Math.min(start,count),end,top:Math.min(start,count)*rowHeight,bottom:Math.max(0,count-end)*rowHeight};
}
