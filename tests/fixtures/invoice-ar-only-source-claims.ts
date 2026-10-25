import {zeroVatNetPacket} from './invoice-ar-only-zero-vat-net';
import {nonVatPacket} from './invoice-ar-only-nonvat';
import {posPacket} from './invoice-ar-only-pos';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {money} from './invoice-packet';
export function sourceClaimsPacket(legacyOnly=false){
 const zero=zeroVatNetPacket(),p=zero.p,legacy=nonVatPacket([20,-10]),owner=structuredClone(legacy.groups[1]);
 p.postings.invoicePostingsDetails.push(structuredClone(legacy.p.postings.invoicePostingsDetails[2]));p.postings.trxCodesInfo.push(structuredClone(legacy.p.postings.trxCodesInfo[2]));p.taxRows.push(structuredClone(legacy.p.taxRows[4]));p.manifest.open-=10;
 const ordinary=posPacket(),selected=structuredClone(ordinary.p.postings.invoicePostingsDetails.slice(1)),entries=structuredClone(ordinary.p.taxRows.slice(3)).map(e=>({...e,posting:{...e.posting,hotelId:'TSAN',folioWindowNo:1}}));p.postings.invoicePostingsDetails.push(...selected);p.postings.trxCodesInfo.push(...ordinary.p.postings.trxCodesInfo.slice(1).map(d=>({...d,hotelId:'TSAN'})));const taxRows=[...p.taxRows,...entries];p.manifest.open+=1177;
 const zeroGroups=[...zero.proof.groups,owner];if(legacyOnly){p.postings.invoicePostingsDetails.splice(1,1);taxRows.splice(3,1);zeroGroups.shift();p.manifest.open-=20;}
 p.invoice.amount=p.invoice.balance=money(p.manifest.open);const definitions=ordinary.rules.map(before=>{before.transactionCode.hotelId='TSAN';return {before,after:structuredClone(before)};});
 const complete={...p,taxRows};const proof={version:1 as const,kind:'ar-only-source-claims' as const,sourceBefore:structuredClone(arOnlyTaxSource(complete)),sourceAfter:structuredClone(arOnlyTaxSource(complete)),directZero:{groups:zeroGroups},ordinaryPos:{definitions}};return {p:complete,proof};
}
