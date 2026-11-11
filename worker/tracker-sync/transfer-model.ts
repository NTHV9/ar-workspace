import type {ProviderRow,ProviderSnapshot,ProviderWrite} from './service';

export interface TransferWrite {
 version:string;rowKey:string;expectedIdentity:ProviderWrite['expectedIdentity'];expectedAgent:string;
 agent:string;accountNo:string;newRowKey:string;
}
export interface TransferOutcome {status:'written'|'conflict'|'uncertain';version?:string;mutationStarted:boolean}

const plain=(v:unknown,max=500):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function transferIdentityMatches(row:ProviderRow,i:ProviderWrite['expectedIdentity']):boolean {
 return row.hotel===i.hotel&&row.accountNo===i.accountNo&&row.invoiceNo===i.invoiceNo&&row.folio===i.folio&&row.transactionDate===i.transactionDate;
}
export function transferWasWritten(snapshot:ProviderSnapshot,input:TransferWrite):boolean {
 const matches=snapshot.rows.filter(r=>r.rowKey===input.newRowKey);
 if(matches.length!==1)return false;
 const row=matches[0];
 return row.agent===input.agent&&transferIdentityMatches(row,{...input.expectedIdentity,accountNo:input.accountNo})&&
  (input.rowKey===input.newRowKey||!snapshot.rows.some(r=>r.rowKey===input.rowKey));
}
/** A full tuple and exact old values fence writes; never select by invoice number alone. */
export function validateTransferBatch(snapshot:ProviderSnapshot,inputs:readonly TransferWrite[]):ProviderRow[] {
 if(!inputs.length||inputs.length>10||new Set(inputs.map(i=>i.rowKey)).size!==inputs.length||new Set(inputs.map(i=>i.newRowKey)).size!==inputs.length)throw Error('tracker_transfer_invalid');
 return inputs.map(input=>{
  if(!plain(input.rowKey)||!plain(input.newRowKey)||!plain(input.agent,200)||!plain(input.accountNo,200)||
   !plain(input.expectedAgent,200)||!plain(input.expectedIdentity.folio)||!plain(input.expectedIdentity.transactionDate))throw Error('tracker_transfer_invalid');
  const rows=snapshot.rows.filter(r=>r.rowKey===input.rowKey);
  if(rows.length!==1)throw Error('tracker_identity_conflict');
  const row=rows[0];
  if(!transferIdentityMatches(row,input.expectedIdentity)||row.agent!==input.expectedAgent||row.issues?.some(i=>!/^([A-Z]{1,2})_invalid$/.test(i)))throw Error('tracker_identity_conflict');
  const prefix=row.property+'|'+input.expectedAgent+'|';
  if(!row.property||input.expectedAgent.includes('|')||input.agent.includes('|')||!input.rowKey.startsWith(prefix)||
   input.newRowKey!==row.property+'|'+input.agent+'|'+input.rowKey.slice(prefix.length))throw Error('tracker_transfer_invalid');
  const tuple=snapshot.rows.filter(r=>r.hotel===row.hotel&&r.invoiceNo===row.invoiceNo&&r.folio===row.folio&&r.transactionDate===row.transactionDate);
  if(tuple.length!==1||snapshot.rows.some(r=>r!==row&&r.rowKey===input.newRowKey))throw Error('tracker_identity_conflict');
  return row;
 });
}
