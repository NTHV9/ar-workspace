import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,verifyArOnlyPosMetadata,verifyArOnlyPosDefinition,verifyArOnlyPosPartitions,type ArOnlyPosDefinition,type ArOnlyPosAtom,type PosRole} from './ar-only-pos-proof';
import {parseFullServiceReceipt,verifyMappedScCode,type PosReceiptEvidence,type PosInterfaceEvidence} from './pos-receipt-service';
import type {InvoicePacket} from './model';
export interface ArOnlyPosServiceProof {version:1;kind:'ar-only-pos-receipt-service-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[];interfaces:PosInterfaceEvidence;receipts:PosReceiptEvidence[]}
const fail=():never=>{throw Error('document_invoice_ar_only_pos_service_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
/** Only explicit unsupported NonRevenue/F&B metadata is a candidate. Discovery
 * grants no service role; complete typed mappings and an exact receipt must do so. */
export function posServiceCandidate(atom:ArOnlyPosAtom,e:ArOnlyPosDefinition,hotel:string){const {group,type}=verifyArOnlyPosMetadata(atom,e,hotel);return type==='NonRevenue'&&group==='F&B';}
export function inspectArOnlyPosService(atoms:ArOnlyPosAtom[],evidence:ArOnlyPosDefinition[],hotel:string){
 const codes=new Set(atoms.map(a=>a.code)),definitions=new Map<string,ArOnlyPosDefinition>();
 if(!Array.isArray(evidence)||evidence.length!==codes.size)fail();
 for(const e of evidence){const code=object(object(e.before).transactionCode).code;if(typeof code!=='string'||!codes.has(code)||definitions.has(code))fail();definitions.set(code as string,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>(),groups=new Map<string,ArOnlyPosAtom[]>(),candidates=new Set<string>();
 for(const atom of atoms){const e=definitions.get(atom.code)??fail(),candidate=posServiceCandidate(atom,e,hotel);if(candidate)candidates.add(atom.id);result.set(atom.id,{role:candidate?'service':verifyArOnlyPosDefinition(atom,e,hotel),signedCents:atom.signedCents});const group=groups.get(atom.group)??[];group.push(atom);groups.set(atom.group,group);}
 if(!candidates.size)fail();
 const exceptionGroups=[...groups.values()].filter(g=>g.some(a=>candidates.has(a.id))),requests:{atoms:ArOnlyPosAtom[];code:string;checkNumber:string;date:string}[]=[],checks=new Set<string>();
 for(const group of exceptionGroups){
  const candidateCodes=new Set(group.filter(a=>candidates.has(a.id)).map(a=>a.code)),serviceCodes=new Set(group.filter(a=>result.get(a.id)!.role==='service').map(a=>a.code)),vatAtoms=group.filter(a=>result.get(a.id)!.role==='vat');
  if(candidateCodes.size!==1||serviceCodes.size!==1||vatAtoms.length!==1||group.some(a=>a.signedCents<=0||a.posting.deferredTax!==undefined&&a.posting.deferredTax!==false))fail();
  const code=[...candidateCodes][0];
  const rawCheck=group[0].selected.checkNo,check=typeof rawCheck==='string'?rawCheck:fail();if(group.some(a=>a.selected.checkNo!==check||a.posting.checkNo!==check))fail();
  if(checks.has(check))fail();checks.add(check);requests.push({atoms:group,code,checkNumber:check,date:String(group[0].posting.transactionDate)});
 }
 return {result,requests};
}
export function verifyArOnlyPosServiceProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosServiceProof??fail(),hotel=packet.manifest.hotel;
 if(proof.version!==1||proof.kind!=='ar-only-pos-receipt-service-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPostedProof||packet.arOnlyNonVatProof||packet.arOnlyWrapperNetVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source||proof.interfaces.hotel!==hotel||!Array.isArray(proof.receipts))fail();
 const atoms=inspectArOnlyPos(packet),{result,requests}=inspectArOnlyPosService(atoms,proof.definitions,hotel),used=new Set<string>();
 if(proof.receipts.length!==requests.length||new Set(proof.receipts.map(r=>r.hotel+'\0'+r.checkNumber)).size!==proof.receipts.length)fail();
 for(const request of requests){const group=request.atoms,check=request.checkNumber;verifyMappedScCode(proof.interfaces,request.code);
  const receipt=proof.receipts.find(r=>r.hotel===hotel&&r.checkNumber===check)??fail();if(used.has(check)||canonical(receipt.before)!==canonical(receipt.after))fail();used.add(check);
  for(const raw of [receipt.before,receipt.after]){const value=object(raw);if(value.hotelId!==undefined&&value.hotelId!==hotel||value.checkNumber!==undefined&&value.checkNumber!==check)fail();}
  const parsed=parseFullServiceReceipt(receipt.before,String(group[0].posting.transactionDate));
  const sum=(role:PosRole)=>group.filter(a=>result.get(a.id)!.role===role).reduce((n,a)=>n+a.signedCents,0),base=sum('base'),service=sum('service'),vat=sum('vat'),gross=group.reduce((n,a)=>n+a.signedCents,0);
  if(!Number.isSafeInteger(gross)||base!==parsed.baseCents||service!==parsed.serviceCents||vat!==parsed.vatCents||gross!==parsed.totalCents)fail();
 }
 verifyArOnlyPosPartitions(atoms,result);return result;
}
