import {canonical} from './ar-tax';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {EmbeddedGenerateUnverified,inspectEmbeddedSource,verifyEmbeddedGenerateProof,type EmbeddedGenerateProof,type EmbeddedPlan} from './embedded-generates';
import type {InvoicePacket} from './model';

/** Optional, narrow alternative to a whole-folio print: every selected revenue
 * posting must have a closed VAT7 graph or current explicit direct NonVAT proof.
 * Unqualified profiles retain native fallback; observed source changes never do. */
export async function readEmbeddedGenerateEvidence(packet:InvoicePacket,readRules:(code:string)=>Promise<unknown>,readFresh:()=>Promise<InvoicePacket>,readCalculation?:(code:string,amount:number)=>Promise<unknown>):Promise<InvoicePacket|undefined>{
 let plan:EmbeddedPlan;
 try{plan=inspectEmbeddedSource(packet);}catch(error){if(error instanceof EmbeddedGenerateUnverified)return;throw error;}
 if(plan.nonVatGroups.length&&!readCalculation)return;
 const calculationKey=(g:EmbeddedPlan['nonVatGroups'][number])=>JSON.stringify([g.posting.transactionCode,g.signedCents]);
 const requests=[...new Map(plan.nonVatGroups.map(g=>[calculationKey(g),g])).entries()];
 const readCalculations=async()=>{
  const result=new Map<string,unknown>();
  for(let offset=0;offset<requests.length;offset+=4){
   const batch=requests.slice(offset,offset+4),values=await Promise.allSettled(batch.map(([,g])=>readCalculation!(String(g.posting.transactionCode),g.signedCents/100)));
   for(let n=0;n<batch.length;n++){const value=values[n];if(value.status==='rejected')throw value.reason;result.set(batch[n][0],value.value);}
  }
  return result;
 };
 const readAll=async()=>{
  const result=new Map<string,unknown>();
  for(let offset=0;offset<plan.codes.length;offset+=4){
   const codes=plan.codes.slice(offset,offset+4),values=await Promise.allSettled(codes.map(readRules));
   for(let n=0;n<codes.length;n++){const value=values[n];if(value.status==='rejected')throw value.reason;result.set(codes[n],value.value);}
  }
  return result;
 };
 const before=await readAll();
 if(plan.nonVatGroups.some(g=>!directNonVatProvenance(before.get(String(g.posting.transactionCode)),packet.manifest.hotel,String(g.posting.transactionCode),g.definition)))return;
 const calculationsBefore=await readCalculations();
 const evidence=(after:Map<string,unknown>,calculationsAfter:Map<string,unknown>,sourceAfter=plan.source):EmbeddedGenerateProof=>({version:1,sourceBefore:plan.source,sourceAfter,groups:plan.groups.map(g=>({postingId:String(g.posting.transactionNo),generateIds:g.taxes.map(t=>String(t.transactionNo)),rules:before.get(String(g.posting.transactionCode)),rulesAfter:after.get(String(g.posting.transactionCode)),generatedRules:g.taxes.map(t=>before.get(String(t.transactionCode))),generatedRulesAfter:g.taxes.map(t=>after.get(String(t.transactionCode)))})),nonVatGroups:plan.nonVatGroups.map(g=>{const code=String(g.posting.transactionCode),rules=before.get(code),key=calculationKey(g);return {postingId:String(g.posting.transactionNo),rules,rulesAfter:after.get(code),calculation:calculationsBefore.get(key),calculationAfter:calculationsAfter.get(key),provenance:directNonVatProvenance(rules,packet.manifest.hotel,code,g.definition)};})});
 try{verifyEmbeddedGenerateProof(packet,evidence(before,calculationsBefore));}catch(error){if(error instanceof EmbeddedGenerateUnverified)return;throw error;}
 const fresh=await readFresh();let current:EmbeddedPlan;
 try{current=inspectEmbeddedSource(fresh);}catch(error){throw Error('document_source_changed',{cause:error});}
 if(plan.fingerprint!==current.fingerprint)throw Error('document_source_changed');
 const calculationsAfter=await readCalculations(),after=await readAll();
 if(requests.some(([key])=>canonical(calculationsBefore.get(key))!==canonical(calculationsAfter.get(key))))throw Error('document_source_changed');
 if(plan.codes.some(code=>canonical(before.get(code))!==canonical(after.get(code))))throw Error('document_source_changed');
 const proof=evidence(after,calculationsAfter,current.source);verifyEmbeddedGenerateProof(fresh,proof);
 return {...fresh,embeddedGenerateProof:proof};
}
