import {mapSourceTextRect} from './row-layout';
import type {DetectedText,PdfLayer,PdfProjectPage} from './types';

/** Only recognized table items share vertical flow; stationery fields are independent. */
export function tableTextFlows(page:PdfProjectPage,layer:PdfLayer,runs:DetectedText[]):boolean {
 if(layer.tableRow)return true;
 const shown=runs.flatMap(run=>{const rect=mapSourceTextRect(run,page.rowEdits??[],run.fontSize*.72);return rect?[{...rect,text:run.text.trim().toUpperCase()}]:[];});
 const headings=shown.filter(r=>r.text==='DATE'&&r.y<layer.y);
 return headings.some(date=>{
  const description=shown.find(r=>r.text==='DESCRIPTION'&&Math.abs(r.y-date.y)<3);
  if(!description)return false;
  const end=shown.filter(r=>r.y>date.y&&/^(BALANCE DUE|TOTAL(?:\s|$)|AGING SUMMARY)/.test(r.text)).sort((a,b)=>a.y-b.y)[0];
  return layer.y>date.y+date.height*.5&&(!end||layer.y<end.y);
 });
}
