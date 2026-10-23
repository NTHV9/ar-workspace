import {precise,abs,CENT} from './money-precision';
import {amountCents} from '../opera/normalize';
import {canonical,verifyArSimulation,type ArSimulation} from './ar-tax';
export type TransferProjectionCalculation=ArSimulation&{calculationAfter:unknown;generatedRulesAfter:unknown[]};
const fail=():never=>{throw Error('document_invoice_transfer_projection_calculation_unverified');};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
/** Calculator amounts corroborate a bounded report projection. They never
 * become posted tax identities or replace the selected root's gross amount. */
export function verifyTransferProjectionCalculation(evidence:TransferProjectionCalculation,hotel:string,code:string,gross:number):{projectedVatUnits:bigint;nonTaxable:0}{
 if(!evidence.calculationAfter||!Array.isArray(evidence.generatedRulesAfter)||canonical(evidence.calculation)!==canonical(evidence.calculationAfter)||canonical(evidence.generatedRules)!==canonical(evidence.generatedRulesAfter))fail();
 const calculation=object(evidence.calculation),result=object(calculation.result);const charges=result.charges;if(!Array.isArray(charges))return fail();
 for(const raw of [calculation,result,...charges]){const scoped=object(raw);if(Object.hasOwn(scoped,'hotelId')&&scoped.hotelId!==hotel||Object.hasOwn(scoped,'currencyCode')&&scoped.currencyCode!=='THB')fail();}
 const parent=object(object(evidence.rules).transactionCode),generates=object(parent.generatesSetup).generates;if(!Array.isArray(generates))return fail();const codes=generates.map(raw=>object(raw).code);if(new Set(codes).size!==codes.length||evidence.generatedRules.length!==codes.length)fail();const seen=new Set<unknown>();for(const raw of evidence.generatedRules){const d=object(object(raw).transactionCode);if(d.hotelId!==hotel||!codes.includes(d.code)||seen.has(d.code))fail();seen.add(d.code);}
 const projected=verifyArSimulation(evidence,hotel,code,gross),projectedVatUnits=precise({amount:projected.vat,currencyCode:'THB'}),grossCents=amountCents({amount:gross,currencyCode:'THB'},'THB');if(grossCents/100!==gross||abs(projectedVatUnits*107n-BigInt(grossCents)*CENT*7n)>100000000n)fail();return {projectedVatUnits,nonTaxable:0};
}
