import {operationMessages} from '../../worker/operations/messages';
export interface DriveFolder {configured:boolean;id:string|null;name:string|null;revision:number|null;ready:boolean;verifiedAt:string|null;visibility:'public'|'restricted'|'unknown'}
export interface DriveStatus {configured:boolean;connected:boolean;email:string|null;folder:DriveFolder|null;cleanupDisabled:true;pickerConfigured:boolean;error?:string}
export interface DriveArchiveFile {ordinal:number;name:string;state:'pending'|'uploading'|'verified'|'error'|'trashed'|'expired';driveFileId:string|null;url:string|null;error?:string|null}
export interface DriveArchiveView {id:string;kind:'job'|'test';documentJobId:string|null;documentRevision:number|null;targetRevision:number;state:'pending'|'partial'|'verified'|'error'|'cleaned'|'expired';files:DriveArchiveFile[];createdAt:string}

export function driveFolderReady(status:DriveStatus|null){const folder=status?.folder;return !!(status?.configured&&status.connected&&!status.error&&folder?.configured&&folder.id&&Number.isSafeInteger(folder.revision)&&Number(folder.revision)>0&&folder.verifiedAt&&folder.ready&&folder.visibility==='restricted');}
export function safeDriveUrl(value:string|null|undefined){
 if(!value)return null;
 try {const url=new URL(value);return url.origin==='https://drive.google.com'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
const errors:Record<string,string>={
 drive_not_configured:'Drive is not configured for this application yet.',
 drive_not_connected:'Connect the AR Google account before continuing.',
 drive_reconnect_required:'The Drive connection needs authorization again. Reconnect Google Drive, then verify the folder.',
 drive_target_missing:'The confirmed destination has not been configured for this account yet.',
 drive_target_changed:'The archive destination changed. Reload Storage and verify the confirmed folder before continuing.',
 drive_target_not_ready:'The destination needs verification. Open Storage and verify the confirmed folder.',
 drive_target_not_private:'The destination must have Restricted sharing. Check its sharing in Drive, then verify the folder again.',
 drive_folder_unavailable:'The confirmed folder is unavailable to this application. Choose it in Google Picker and verify access again.',
 drive_identity_mismatch:'Connect the authorized AR Google account, then choose the confirmed folder again.',
 drive_folder_mismatch:'That folder is not the confirmed destination. Open Picker again and select the confirmed folder.',
 drive_picker_unavailable:'Google Picker could not load. Check your connection, then retry loading Picker.',
 drive_picker_scope_invalid:'Google returned an unexpected permission grant. Open Picker again to authorize Drive file access only.',
 drive_picker_popup_closed:'Google sign-in was closed. Choose the confirmed folder again when ready.',
 drive_picker_authorization_failed:'Google could not authorize folder selection. Try again and allow the sign-in popup.',
 drive_picker_expired:'Folder selection expired. Choose the confirmed folder again.',
 drive_folder_public:'The destination is publicly shared. Set it to Restricted in Google Drive, then verify it again before archiving documents.',
 drive_folder_visibility_unknown:'Folder sharing could not be verified. Verify the destination again before archiving documents.',
 drive_folder_not_ready:'The destination needs verification. Open Storage and verify the confirmed folder.',
 drive_checksum_mismatch:'The uploaded file did not pass the checksum check. It is not verified. Retry the existing archive to reconcile the result.',
 document_revision_conflict:'This document has a newer revision. Reopen the document job and review the current files.',
 drive_document_revision_conflict:'This document has a newer revision. Reopen the document job and review the current files.',
 drive_revision_conflict:'The destination or document revision changed. Reload the current details before continuing.',
 drive_command_busy:'The existing command is still running. Check its result before retrying.',
 drive_busy:'The existing command is still running. Check its result before retrying.',
 drive_upload_pending:'The upload has no verified result yet. Check the archive or retry the existing command.',
 drive_cleanup_failed:'The synthetic file could not be moved to Trash. Retry the existing test to reconcile only that file.',
 drive_command_conflict:'This command belongs to a different destination or document revision. Reload the current details before continuing.',
 drive_unreviewed:'Review and acknowledge the complete PDF export set before archiving.',
 drive_incomplete:'The document export set is incomplete. Reopen the document job and review all intended files.',
 drive_source_changed:'A source file changed after review. Reopen and review the document job before archiving.',
 drive_source_unavailable:'A reviewed source file is unavailable. Check the document job before retrying the archive.',
 drive_metadata_mismatch:'The Drive file did not match the expected archive metadata. It remains unverified; retry the existing command to check it.',
 drive_connection_failed:'Google Drive connection was not completed. Connect the AR Google account again.',
 drive_command_storage_unavailable:'This browser cannot retain the retry command. Allow session storage, then try again.',
};
export function driveMessage(value:unknown){return typeof value==='string'&&errors[value]?errors[value]:'Drive could not complete this request. Check the result before retrying; the existing command will be reused.';}
export async function driveRequest<T>(path:string,token:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...init,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 const result:unknown=await response.json().catch(()=>null);
 if(!response.ok){if(response.status===401||response.status===403)throw new Error('Your session or Drive permission is unavailable. Sign in again and check the connection.');throw new Error(driveMessage(result&&typeof result==='object'&&'error'in result?result.error:undefined));}
 if(!result||typeof result!=='object')throw new Error('Drive returned an incomplete response. Retry loading its current status.');
 return result as T;
}
/** Only a command UUID is persisted; no provider tokens or document data. */
export function retainedCommand(key:string,startNew=false){
 try{const existing=sessionStorage.getItem(key);if(!startNew&&existing&&/^[0-9a-f-]{36}$/.test(existing))return existing;const id=crypto.randomUUID();sessionStorage.setItem(key,id);return id;}catch{throw new Error(driveMessage('drive_command_storage_unavailable'));}
}
