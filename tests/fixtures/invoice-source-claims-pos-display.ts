import {sourceClaimsPacket} from './invoice-ar-only-source-claims';
import {posPacket} from './invoice-ar-only-pos';
import {postedPosFeePacket,feeAmount} from './invoice-ar-only-posted-pos-fee';
import {explicitRevenuePosPacket} from './invoice-ar-only-explicit-revenue-pos';
import {posDisplayFixture} from './invoice-pos-display';
import {money} from './invoice-packet';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {verifyArOnlySourceClaimsWithDisplayRegion} from '../../worker/invoice/ar-only-source-claims';
import type {InvoicePacket} from '../../worker/invoice/model';
import type {ArPosDisplayProof} from '../../worker/invoice/pos-display-proof';
export type ComposedDisplayKind='v1'|'posted'|'signed-fee'|'explicit'|'exclusive'|'zero-group';
export function sourceClaimsPosDisplayFixture(kind:ComposedDisplayKind='v1'){
 let packet:InvoicePacket;
 if(kind==='v1'){const f=sourceClaimsPacket();packet={...f.p,arOnlySourceClaimsProof:f.proof};}
 else if(kind==='explicit')packet=explicitRevenuePosPacket().p;
 else if(kind==='signed-fee'){const f=postedPosFeePacket();feeAmount(f,60002,-100);packet={...f.p,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:arOnlyTaxSource(f.p),sourceAfter:arOnlyTaxSource(f.p),components:[{kind:'posted-pos-mapped-fee',...f.evidence}]}};}
 else{const f=posPacket();if(kind==='exclusive'){const d=f.rules[1].transactionCode;d.classification.group.code='F&B';Reflect.set(f.p.postings.trxCodesInfo[2],'transactionGroup','F&B');Object.assign(d,{compTransaction:false,trxSetup:{...d.trxSetup,revenue:false,manualPosting:false,useForPaidout:false,depositPostingOnly:false},transactionAdjustments:[]});}
  if(kind==='zero-group')for(let n=0;n<3;n++){const s=structuredClone(f.p.postings.invoicePostingsDetails[n+1]),e=structuredClone(f.p.taxRows.find(e=>e.posting.transactionNo===s.transactionNo)!);s.transactionNo=60004+n;s.debitAmount=money(-s.debitAmount.amount);e.posting.transactionNo=s.transactionNo;Object.assign(e.posting,{debitAmount:s.debitAmount,postedAmount:s.debitAmount,transactionAmount:s.debitAmount.amount});if('postingBreakdown'in e)e.postingBreakdown.grossAmount=e.postingBreakdown.netAmount=s.debitAmount;f.p.postings.invoicePostingsDetails.push(s);f.p.taxRows.push(e);}
  packet={...f.p,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:arOnlyTaxSource(f.p),sourceAfter:arOnlyTaxSource(f.p),components:[{kind:kind==='exclusive'?'posted-pos-exclusive-nonrevenue':'posted-pos-vat',definitions:f.rules.map(before=>({before,after:structuredClone(before)}))}]}};
 }
 const selected=(packet.postings as {invoicePostingsDetails:Record<string,unknown>[]}).invoicePostingsDetails,source=packet.taxRows.map(e=>(e as {posting:Record<string,unknown>}).posting),pos=selected.filter(p=>Number(p.transactionNo)>=60001&&Number(p.transactionNo)<70000),reference='Room# 101 : CHECK# 10 [99]';
 for(const p of pos){p.reference=reference;source.find(s=>String(s.transactionNo)===String(p.transactionNo))!.reference=reference;}
 const total=selected.reduce((n,p)=>n+Number((p.debitAmount as {amount:number}|undefined)?.amount??0)-Number((p.creditAmount as {amount:number}|undefined)?.amount??0),0);packet.manifest.open=total;Object.assign(packet.invoice as object,{amount:money(total),balance:money(total)});packet.arOnlySourceClaimsProof!.sourceBefore=structuredClone(arOnlyTaxSource(packet));packet.arOnlySourceClaimsProof!.sourceAfter=structuredClone(arOnlyTaxSource(packet));
 const page=structuredClone(posDisplayFixture().page),first=pos[0],posted=source.find(p=>String(p.transactionNo)===String(first.transactionNo))!;page.hotelId=packet.manifest.hotel;page.reservationId=packet.manifest.reservation_id!;page.folioWindowNo=Number(posted.folioWindowNo);page.windows[0].folioWindowNo=page.folioWindowNo;
 const header=page.windows[0].folios[0].postings[0];header.transactionNo=String(pos[1].transactionNo);header.transactionDate=String(first.transactionDate);header.checkNo=String(first.checkNo);header.reference=header.checkNo;header.groupTypeInfo={groupId:header.checkNo,groupCount:pos.length,groupDescription:'Source-claimed venue'};
 page.windows[0].folios[0].postings=[header,...pos.map(p=>({transactionNo:String(p.transactionNo),transactionDate:String(p.transactionDate),transactionCode:String(p.transactionCode),reference:String(p.reference),checkNo:String(p.checkNo),cashierInfo:{cashierId:3},groupTypeInfo:{subGroupId:String(p.checkNo)}}))];
 const proof:ArPosDisplayProof={version:1,kind:'ar-pos-checkno-source-display',sourceBefore:structuredClone(arOnlyTaxSource(packet)),sourceAfter:structuredClone(arOnlyTaxSource(packet)),contexts:[{hotel:packet.manifest.hotel,reservationId:packet.manifest.reservation_id!,folioWindowNo:page.folioWindowNo,before:[structuredClone(page)],after:[structuredClone(page)]}]};const verified=verifyArOnlySourceClaimsWithDisplayRegion(packet);return {packet,page,proof,region:verified.posRegion!,claims:verified.claims};
}
