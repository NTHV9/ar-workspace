/** Static operational labels only. Never accept provider text, IDs or versions. */
export const trackerWriteDiagnosticCodes=['cas_disabled','missing_etag','not_editable','snapshot_changed','row_identity_changed','cell_preimage_changed','formula_or_missing_cell','cell_metadata_unsupported','signed_workbook','patch_rejected','cas_412','readback_changed','upload_transport_unknown','upload_http_unknown','readback_unavailable','adapter_exception_unknown'] as const;
export interface TrackerWriteDiagnostic {code:(typeof trackerWriteDiagnosticCodes)[number];mutationStarted:boolean|null;upstreamStatus?:number}
export interface TrackerWriteOutcome {status:'written'|'conflict'|'uncertain';version?:string;diagnostic?:TrackerWriteDiagnostic}
export function validTrackerWriteDiagnostic(value:unknown):value is TrackerWriteDiagnostic {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).every(k=>['code','mutationStarted','upstreamStatus'].includes(k))&&trackerWriteDiagnosticCodes.some(code=>code===v.code)&&(v.code==='adapter_exception_unknown'?v.mutationStarted===null:typeof v.mutationStarted==='boolean')&&(v.upstreamStatus===undefined||typeof v.upstreamStatus==='number'&&Number.isSafeInteger(v.upstreamStatus)&&v.upstreamStatus>=100&&v.upstreamStatus<=599);
}
