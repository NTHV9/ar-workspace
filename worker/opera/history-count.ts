import { OperaError } from './client';
/** OPERA paginates roots; inclDetails also returns compressed children in that slot.
 * All rows are retained. Only explicit, unambiguous same-page parent links affect count.
 */
export function historyRootCount(rows:{kind:string;value:Record<string,unknown>}[]):number {
  const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^[1-9]\d*$/.test(v)?v:null;
  let children=0;
  for(const row of rows){
    if(row.kind!=='invoice'||row.value.parentInvoiceNo===undefined||row.value.parentInvoiceNo===null)continue;
    const ref=number(row.value.parentInvoiceNo);
    const parents=rows.filter(p=>p.kind==='invoice'&&p!==row&&p.value.compressed===true&&number(p.value.invoiceNo)===ref&&p.value.parentInvoiceNo==null);
    if(!ref||parents.length!==1||row.value.compressed===true)throw new OperaError('invalid_response',undefined,'history_parent_link');
    children++;
  }
  return rows.length-children;
}
