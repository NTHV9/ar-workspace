import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import type {InvoicePacket} from './model';
import {discoverPostedGenerates,verifyPostedGenerates,type ArPostedGenerates,type PostedGenerateGraph} from './posted-generates';
export interface ArOnlyPostedProof {version:1;kind:'ar-only-posted-generates-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource}
const fail=():never=>{throw Error('document_invoice_ar_only_posted_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const rows=(v:unknown)=>Array.isArray(v)?v.map(object):fail();
/** Track identities, not bucket amounts: cancelling or rounded services cannot
 * conceal a missing member of the full VAT base. Rule evaluation order matters. */
export function verifyArOnlyPostedGraph(graph:PostedGenerateGraph,evidence:ArPostedGenerates,hotel:string):{vatCents:number;ids:string[]}{
 const verified=verifyPostedGenerates(graph,evidence,hotel),rootId=String(graph.root.transactionNo);
 const setup=object(object(evidence.rules).transactionCode).generatesSetup,generateSetup=object(setup);
 const buckets:Record<string,string[]>={Base:[rootId],Bucket1:[],Bucket2:[],Bucket3:[]};
 const add=(raw:unknown,key:string)=>{const flags=object(raw);for(const n of [1,2,3])if(flags['bucket'+n]===true)buckets['Bucket'+n].push(key);};
 add(generateSetup.addBaseAmtTo,rootId);
 const serviceIds=graph.children.filter(c=>graph.definitions.get(String(c.transactionCode))?.transactionGroup==='SVC').map(c=>String(c.transactionNo));
 const expected=[rootId,...serviceIds].sort();let vatCount=0;
 for(const generate of rows(generateSetup.generates)){
  const child=graph.children.find(c=>c.transactionCode===generate.code);if(!child)return fail();
  const key=String(child.transactionNo),group=graph.definitions.get(String(child.transactionCode))?.transactionGroup;
  if(group==='TAX'){
   const percentage=object(object(generate.rule).percentage),members=buckets[String(percentage.calculatedOn)];
   if(percentage.amount!==7||!members||canonical([...members].sort())!==canonical(expected))return fail();
   vatCount++;
  }
  add(generate.addGeneratedAmtTo,key);
 }
 if(vatCount!==1)return fail();return verified;
}
export function verifyArOnlyPostedProof(packet:InvoicePacket):true{
 const proof=packet.arOnlyPostedProof;
 if(!proof||proof.version!==1||proof.kind!=='ar-only-posted-generates-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arTransfer||packet.embeddedGenerateProof||packet.directZeroTaxProof)return fail();
 const current=canonical(arOnlyTaxSource(packet));
 if(canonical(proof.sourceBefore)!==current||canonical(proof.sourceAfter)!==current)return fail();
 const graphs=discoverPostedGenerates(packet.manifest,object(packet.account),packet.postings,packet.arDetails??[]),evidence=packet.arPostedGenerates??[];
 if(!graphs.length||evidence.length!==graphs.length||new Set(evidence.map(e=>e.postingId)).size!==evidence.length)return fail();
 const claimed=new Set<string>();
 for(const graph of graphs){const e=evidence.find(e=>e.postingId===String(graph.root.transactionNo));if(!e)return fail();for(const key of verifyArOnlyPostedGraph(graph,e,packet.manifest.hotel).ids){if(claimed.has(key))return fail();claimed.add(key);}}
 for(const e of packet.arSimulations??[]){if(claimed.has(e.postingId)||!e.generatedRulesAfter||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter))return fail();}
 return true;
}
