import type {DetectedText} from './types';

type Cell={run:DetectedText;rect:{x:number;y:number;width:number;height:number};baseline:number};
const headings=['DATE','DESCRIPTION','REFERENCE','DEBIT','CREDIT'];
function heading(text:string){return text.toUpperCase().replace(/\s*\(THB\)\s*$/,'').trim().replace(/S$/,'');}

/** Fill sparse invoice rows from their complete header and nearby body cells.
 * Source runs remain genuine font references; only the new cell's placement is
 * synthesized. Unrecognized tables retain their existing physical row model.
 */
export function completeInvoiceColumns<T extends Cell>(row:T[],bands:T[][],index:number,pageWidth=Infinity):T[]{
 if(row.length<2||row.some(c=>/^total\b/i.test(c.run.text)))return row;
 let header:T[]|undefined,headerIndex=-1;
 for(let n=index-1;n>=0;n--){
  const ordered=[...bands[n]].sort((a,b)=>a.rect.x-b.rect.x);
  if(ordered.length===5&&ordered.every((c,i)=>heading(c.run.text)===headings[i])){header=ordered;headerIndex=n;break;}
 }
 if(!header)return row;
 const column=(c:Cell)=>header!.findIndex((h,i)=>c.rect.x>=h.rect.x-4&&c.rect.x<(header![i+1]?.rect.x??Infinity)-4);
 if(row.some(c=>column(c)<0)||new Set(row.map(column)).size!==row.length)return row;
 const body: T[][]=[];
 for(let n=headerIndex+1;n<bands.length;n++){
  const band=bands[n];
  if(band.some(c=>/^total\b/i.test(c.run.text)))break;
  if(band.length>=2&&band.every(c=>Math.abs(c.run.fontSize-row[0].run.fontSize)<.5&&column(c)>=0))body.push(band);
 }
 return header.map((h,i)=>{
  const own=row.find(c=>column(c)===i);
  const donors=body.flat().filter(c=>column(c)===i).sort((a,b)=>Math.abs(a.baseline-row[0].baseline)-Math.abs(b.baseline-row[0].baseline));
  const donor=own??donors[0]??row[0],baseline=row[0].baseline;
  const x=own?.rect.x??(donors.length?donor.rect.x:h.rect.x);
  const right=header![i+1]?.rect.x??Math.min(pageWidth-4,Math.max(h.rect.x+h.rect.width,donor.rect.x+donor.rect.width)+8);
  const width=Math.max(2,right-x-4);
  return {...donor,baseline,rect:{...donor.rect,x,y:baseline-(donor.baseline-donor.rect.y),width}};
 });
}
