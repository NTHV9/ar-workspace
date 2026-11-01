import {wrapperNetPacket} from './invoice-ar-only-wrapper-net-vat';
import {currentPacket} from './invoice-current-ar-tax';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {money} from './invoice-packet';

export function wrapperArAdjustmentFixture(){
 const w=wrapperNetPacket(),a=currentPacket(-107),original=w.components[0];
 const p=Object.assign(w.p,{arDetails:structuredClone(a.arDetails)});
 Object.assign(p.account,{accountNo:'SYN-AR-001'});
 p.postings.invoicePostingsDetails.push(structuredClone(a.postings.invoicePostingsDetails[1]));
 p.postings.trxCodesInfo.push({...a.postings.trxCodesInfo[1]});
 Object.assign(p.postings.trxCodesInfo.at(-1)!,{transactionGroup:'RM'});
 p.manifest.open=127.7;p.invoice.amount=p.invoice.balance=money(127.7);
 const root=p.arDetails[0].response.transactions[0];Object.assign(root,{folioWindowNo:2});
 Object.assign(original.generatedRules[1].transactionCode,{description:{defaultText:'VAT'}});
 original.generatedRulesAfter=structuredClone(original.generatedRules);
 const calculation=a.arSimulations[0],leaf={transactionCode:{...structuredClone(original.generatedRules[1].transactionCode),description:{defaultText:'VAT'}}};
 Object.assign(calculation.rules.transactionCode.classification,{type:'Revenue',transactionType:{code:'Lodging'},group:{code:'RM'}});
 Object.assign(calculation.rules.transactionCode.trxSetup,{manualPosting:true});
 Object.assign(calculation.rules.transactionCode,{compTransaction:false});
 calculation.rulesAfter=structuredClone(calculation.rules);calculation.generatedRules=[leaf];calculation.generatedRulesAfter=structuredClone(calculation.generatedRules);
 const evidence={...calculation,generatedRules:[leaf],generatedRulesAfter:[structuredClone(leaf)],calculationAfter:structuredClone(calculation.calculation)};
 const full=structuredClone(original);full.componentId='30002';full.generateIds=['300021','300022'];
 full.rules.transactionCode.code='FULL-BASE';full.rules.transactionCode.generatesSetup.generates[0].addGeneratedAmtTo.bucket1=true;full.rulesAfter=structuredClone(full.rules);
 const posted={kind:'posted-embedded-vat' as const,components:[structuredClone(original),full]};
 const adjustment={kind:'same-account-current-ar-adjustment-vat7' as const,roots:[evidence]};
 const proof={version:7 as const,kind:'ar-only-source-claims' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),components:[posted,adjustment]};
 Reflect.set(p,'arOnlySourceClaimsProof',proof);
 const refresh=()=>{proof.sourceBefore=structuredClone(arOnlyTaxSource(p));proof.sourceAfter=structuredClone(proof.sourceBefore);};
 return {p,root,posted,adjustment,proof,refresh};
}
