import {OperaError,type OperaReader} from '../opera/client';
import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {arPaymentOffsetDisplayIds,verifyArPaymentOffsetDisplayProof,type ArPaymentOffsetDisplayProof} from './payment-offset-display-proof';

type Reader=Partial<Pick<OperaReader,'invoiceTransactionDetails'>>;
export interface PaymentOffsetDisplayReadResult {proof?:ArPaymentOffsetDisplayProof;gap?:'payment-offset-display-capability'|'payment-offset-display-evidence'|'payment-offset-display-provider'}
export interface PaymentOffsetDisplayRead {finish:(fresh:CurrentArTaxSource)=>Promise<PaymentOffsetDisplayReadResult>}
const changed=():never=>{throw Error('document_source_changed');};
const gapFor=(error:unknown):PaymentOffsetDisplayReadResult['gap']=>error instanceof OperaError?'payment-offset-display-provider':'payment-offset-display-evidence';
const gap=(reason:PaymentOffsetDisplayReadResult['gap']):PaymentOffsetDisplayRead=>({finish:async()=>({gap:reason})});
/** An optional display-only read around the caller's existing whole financial
 * fence. No additional financial source read, report or calculator is used. */
export async function beginArPaymentOffsetDisplayRead(reader:Reader,packet:CurrentArTaxSource):Promise<PaymentOffsetDisplayRead>{
 const sourceBefore=structuredClone(arOnlyTaxSource(packet));let ids:string[];
 try{ids=arPaymentOffsetDisplayIds(packet);}catch(error){return gap(gapFor(error));}
 if(!ids.length){let finished=false;return {finish:async fresh=>{if(finished||canonical(sourceBefore)!==canonical(arOnlyTaxSource(fresh)))return changed();finished=true;return {};}};}
 if(!reader.invoiceTransactionDetails)return gap('payment-offset-display-capability');
 const read=reader.invoiceTransactionDetails.bind(reader),blocks:{ids:string[];before:unknown}[]=[];
 try{
  for(let n=0;n<ids.length;n+=40){const part=ids.slice(n,n+40);blocks.push({ids:part,before:structuredClone(await read(part))});}
  verifyArPaymentOffsetDisplayProof(packet,{version:1,kind:'ar-owned-payment-offset-display',sourceBefore,sourceAfter:sourceBefore,details:blocks.map(b=>({...b,after:b.before}))});
 }catch(error){return gap(gapFor(error));}
 let finished=false;
 return {finish:async fresh=>{
  if(finished)return changed();finished=true;const sourceAfter=structuredClone(arOnlyTaxSource(fresh));if(canonical(sourceBefore)!==canonical(sourceAfter))return changed();
  const details:ArPaymentOffsetDisplayProof['details']=[];
  try{for(const block of blocks){const after=structuredClone(await read(block.ids));if(canonical(block.before)!==canonical(after))return changed();details.push({...block,after});}}
  catch(error){if(error instanceof Error&&error.message==='document_source_changed')throw error;return {gap:gapFor(error)};}
  const proof:ArPaymentOffsetDisplayProof={version:1,kind:'ar-owned-payment-offset-display',sourceBefore,sourceAfter,details};
  try{verifyArPaymentOffsetDisplayProof(fresh,proof);return {proof};}catch{return changed();}
 }};
}
