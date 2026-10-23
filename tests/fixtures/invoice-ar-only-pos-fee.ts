import {posServicePacket} from './invoice-ar-only-pos-service';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function posFeePacket(){
 const {p,proof:service}=posServicePacket();
 for(const evidence of service.definitions){Object.assign(evidence.before.transactionCode.trxSetup,{manualPosting:false});Object.assign(evidence.before.transactionCode,{compTransaction:false,transactionAdjustments:[]});evidence.after=structuredClone(evidence.before);}
 const proof={version:1 as const,kind:'ar-only-pos-mapped-fee-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions:service.definitions,interfaces:service.interfaces};
 return {p,proof};
}
