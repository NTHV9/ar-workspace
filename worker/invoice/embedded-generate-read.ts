import {canonical} from './ar-tax';
import {EmbeddedGenerateUnverified,inspectEmbeddedSource,verifyEmbeddedGenerateProof,type EmbeddedGenerateProof,type EmbeddedPlan} from './embedded-generates';
import type {InvoicePacket} from './model';

/** Optional, narrow alternative to a whole-folio print: every selected revenue
 * posting must already contain a closed, fully taxed inclusive generate graph.
 * Unqualified profiles retain native fallback; observed source changes never do. */
export async function readEmbeddedGenerateEvidence(packet:InvoicePacket,readRules:(code:string)=>Promise<unknown>,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket|undefined>{
 let plan:EmbeddedPlan;
 try{plan=inspectEmbeddedSource(packet);}catch(error){if(error instanceof EmbeddedGenerateUnverified)return;throw error;}
 const readAll=async()=>{
  const result=new Map<string,unknown>();
  for(let offset=0;offset<plan.codes.length;offset+=4){
   const codes=plan.codes.slice(offset,offset+4),values=await Promise.allSettled(codes.map(readRules));
   for(let n=0;n<codes.length;n++){const value=values[n];if(value.status==='rejected')throw value.reason;result.set(codes[n],value.value);}
  }
  return result;
 };
 const before=await readAll();
 const evidence=(after:Map<string,unknown>,sourceAfter=plan.source):EmbeddedGenerateProof=>({version:1,sourceBefore:plan.source,sourceAfter,groups:plan.groups.map(g=>({postingId:String(g.posting.transactionNo),generateIds:g.taxes.map(t=>String(t.transactionNo)),rules:before.get(String(g.posting.transactionCode)),rulesAfter:after.get(String(g.posting.transactionCode)),generatedRules:g.taxes.map(t=>before.get(String(t.transactionCode))),generatedRulesAfter:g.taxes.map(t=>after.get(String(t.transactionCode)))}))});
 try{verifyEmbeddedGenerateProof(packet,evidence(before));}catch(error){if(error instanceof EmbeddedGenerateUnverified)return;throw error;}
 const fresh=await readFresh();let current:EmbeddedPlan;
 try{current=inspectEmbeddedSource(fresh);}catch(error){throw Error('document_source_changed',{cause:error});}
 if(plan.fingerprint!==current.fingerprint)throw Error('document_source_changed');
 const after=await readAll();
 if(plan.codes.some(code=>canonical(before.get(code))!==canonical(after.get(code))))throw Error('document_source_changed');
 const proof=evidence(after,current.source);verifyEmbeddedGenerateProof(fresh,proof);
 return {...fresh,embeddedGenerateProof:proof};
}
