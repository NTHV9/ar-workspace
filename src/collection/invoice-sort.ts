import type {Group} from '../CollectionQueue';
import {compareValues} from '../table-sort';
import {stageLabel} from '../domain/collection';
import {legacyStageSnapshot} from '../domain/collection-policy';
export type QueueSortKey='invoice'|'folio'|'guest'|'date'|'latest'|'open';
export function sortQueueInvoices(rows:Group['rows'],key:QueueSortKey,descending:boolean){
 const value=(r:Group['rows'][number])=>key==='invoice'?r.invoice_no:key==='folio'?r.folio_no:key==='guest'?r.guest:key==='date'?r.action.date:key==='open'?r.open:stageLabel(r.action.latest,undefined,r.workflow?.last_reminder_stage_snapshot??legacyStageSnapshot(r.action.latest));
 return [...rows].sort((a,b)=>compareValues(value(a),value(b),descending)||compareValues(a.id,b.id));
}
