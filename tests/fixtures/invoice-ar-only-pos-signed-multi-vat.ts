import {posMultiVatPacket} from './invoice-ar-only-pos-multi-vat';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
export function posSignedMultiVatPacket(){
 const {p,proof:positive,amount}=posMultiVatPacket();for(const [id,n] of [[60001,-1000],[60002,-100],[60003,-40],[60004,-37]])amount(id,n);
 const proof={version:1 as const,kind:'ar-only-pos-signed-multi-vat7' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),definitions:positive.definitions};return {p,proof,amount};
}
