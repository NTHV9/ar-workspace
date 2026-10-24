import {posPacket} from './invoice-ar-only-pos';
import {postedPosFeePacket} from './invoice-ar-only-posted-pos-fee';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function explicitRevenuePosPacket(fee=false){
 const ordinary=posPacket(),mapped=postedPosFeePacket(),p=fee?mapped.p:ordinary.p,definitions=fee?mapped.evidence.definitions:ordinary.rules.map(before=>({before,after:structuredClone(before)}));
 const base=definitions[0].before.transactionCode;Reflect.deleteProperty(base.classification,'transactionType');Object.assign(base,{compTransaction:false,trxSetup:{...base.trxSetup,revenue:true,manualPosting:false,useForPaidout:false,depositPostingOnly:false},transactionAdjustments:[]});definitions[0].after=structuredClone(definitions[0].before);
 const evidence={definitions,...fee?{interfaces:mapped.evidence.interfaces}:{}};
 const proof={version:2 as const,kind:'ar-only-source-claims' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),components:[{kind:'posted-pos-explicit-revenue-base',...evidence}]};Reflect.set(p,'arOnlySourceClaimsProof',proof);return {p,evidence,proof};
}
