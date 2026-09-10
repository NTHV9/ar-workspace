import type {RemittanceDiagnostic} from '../../src/remittance/model';
import {syntheticPdf} from '../drive/archive';
import {inspectSupplemental} from '../email/supplemental-validation';
import {remittanceFileRpc,readRemittanceObject,writeRemittanceObject,type RemittanceFilesEnv} from './files';
import {parseRemittanceId} from './validation';

function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('remittance_diagnostic_failed');return value as Record<string,unknown>;}
/** Explicit diagnostic: no customer input, business save, email, Drive write or purge. */
export async function runRemittanceDiagnostic(env:RemittanceFilesEnv,actor:string,commandId:string):Promise<RemittanceDiagnostic>{
 try{actor=parseRemittanceId(actor);}catch{throw Error('remittance_forbidden');}commandId=parseRemittanceId(commandId);
 const database=object(await remittanceFileRpc(env,'ar_remittance_diagnostic_check',{p_actor:actor}));
 if(database.passed!==true||database.rolledBack!==true||typeof database.checks!=='number'||!Number.isSafeInteger(database.checks)||database.checks<1)throw Error('remittance_diagnostic_failed');
 const name='Remittance-connection-test.pdf',bytes=syntheticPdf(),inspection=await inspectSupplemental(bytes,name,'application/pdf');
 const expected={name,mime:inspection.mime,byteCount:inspection.byte_count,sha256:inspection.sha256};
 const receipt=object(await remittanceFileRpc(env,'ar_remittance_diagnostic_begin',{p_actor:actor,p_command:commandId,p_file:expected}));
 const storageKey=`remittance-diagnostics/${actor}/${commandId}`;
 if(receipt.storageKey!==storageKey||typeof receipt.verified!=='boolean'||receipt.byteCount!==expected.byteCount||receipt.sha256!==expected.sha256)throw Error('remittance_diagnostic_failed');
 const file={...expected,storageKey};
 if(receipt.verified)await readRemittanceObject(env,file);else await writeRemittanceObject(env,file,bytes);
 const finish=object(await remittanceFileRpc(env,'ar_remittance_diagnostic_finish',{p_actor:actor,p_command:commandId}));
 if(finish.passed!==true||finish.retained!==true||finish.byteCount!==expected.byteCount||finish.sha256!==expected.sha256)throw Error('remittance_diagnostic_failed');
 return {database:{passed:true,rolledBack:true,checks:database.checks},storage:{passed:true,byteCount:expected.byteCount,sha256:expected.sha256,retained:true},businessRecordsChanged:false};
}
