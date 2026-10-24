import {hasVerifiedSourceClaimsDisplayMembership,readVerifiedSourceClaimsDisplayMembership,type VerifiedSourceClaimsDisplayMembership} from './source-claims-display-membership';
import {explicitArPosDisplayReference} from './display-reference';
import {readVerifiedSourceClaimsPosRegion,type VerifiedSourceClaimsPosRegion} from './ar-only-source-claims';
import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectArOnlyPos,type PosRole} from './ar-only-pos-proof';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
export interface PosDisplayContext {hotel:string;reservationId:string;folioWindowNo:number}
export interface ArPosDisplayProof {version:1;kind:'ar-pos-checkno-source-display';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;contexts:(PosDisplayContext&{before:unknown[];after:unknown[]})[]}
export interface VerifiedPosDisplayGroup {representativeId:string;sourceIds:string[];date:string;description:string;reference:string}
export interface PosDisplayGap {category:'reference-unresolved'|'signed-partition-unsupported';sourceIds:string[]}
export type PosDisplayAuthority=ReadonlyMap<string,{role:PosRole;signedCents:number}>|VerifiedSourceClaimsPosRegion|VerifiedSourceClaimsDisplayMembership;
export type PosDisplayMembershipContext=PosDisplayContext&{pages:unknown[]};
const fail=():never=>{throw Error('document_invoice_ar_pos_display_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v)||v.length>4000)return fail();return v.map(object);};
const text=(v:unknown,max=2000)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))return fail();return v;};
const id=(v:unknown)=>{const value=typeof v==='number'&&Number.isSafeInteger(v)?String(v):text(v,16);return /^[1-9][0-9]{0,15}$/.test(value)?value:fail();};
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max?Number(v):fail();
const idOrder=(a:string,b:string)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;
export const comparePosDisplayGroups=(a:VerifiedPosDisplayGroup,b:VerifiedPosDisplayGroup)=>a.date.localeCompare(b.date)||idOrder(a.representativeId,b.representativeId);
const contextKey=(c:PosDisplayContext)=>JSON.stringify([c.hotel,c.reservationId,c.folioWindowNo]);
export type PosDisplayRegion=VerifiedSourceClaimsPosRegion|VerifiedSourceClaimsDisplayMembership;
function displayAtoms(packet:InvoicePacket,region?:PosDisplayRegion){return hasVerifiedSourceClaimsDisplayMembership(region)?readVerifiedSourceClaimsDisplayMembership(packet,region).atoms:region?[...readVerifiedSourceClaimsPosRegion(packet,region).atoms]:inspectArOnlyPos(packet);}
export function arPosDisplayContexts(packet:InvoicePacket,region?:PosDisplayRegion):PosDisplayContext[]{
 const result=new Map<string,PosDisplayContext>();for(const atom of displayAtoms(packet,region)){const c={hotel:packet.manifest.hotel,reservationId:packet.manifest.reservation_id!,folioWindowNo:integer(atom.posting.folioWindowNo,1,999)};result.set(contextKey(c),c);}
 if(result.size>8)return fail();return [...result.values()].sort((a,b)=>a.folioWindowNo-b.folioWindowNo);
}
export interface PosDisplayPageView {pageCount:number;totalResults:number;nextOffset:number;outerRows:number;postings:Row[]}
/** Provider pagination counts headers/regular rows, not expanded children. */
export function posDisplayPageView(context:PosDisplayContext,raw:unknown,pageIndex:number):PosDisplayPageView{
 const page=object(raw);if(page.hotelId!==context.hotel||page.reservationId!==context.reservationId||page.folioWindowNo!==context.folioWindowNo||page.missingWindow!==false)return fail();
 const all=rows(page.windows);if(all.some(w=>w.folioWindowNo!==context.folioWindowNo||!['current','history'].includes(String(w.section))))return fail();const current=all.filter(w=>w.section==='current');if(current.length!==1)return fail();const window=current[0];
 const pageCount=integer(window.totalPages,1,20),totalResults=integer(window.totalResults,0,4000),limit=integer(window.limit,200,200),nextOffset=integer(window.offset,1,4000);if(nextOffset!==(pageIndex+1)*limit)return fail();
 if(window.hasMore!==undefined&&(typeof window.hasMore!=='boolean'||window.hasMore!==(pageIndex+1<pageCount)))return fail();
 const postings=rows(window.folios).flatMap(f=>rows(f.postings));if(postings.length>4000)return fail();let outerRows=0;
 for(const p of postings){const g=p.groupTypeInfo===undefined?{}:object(p.groupTypeInfo);if(g.groupId!==undefined&&g.subGroupId!==undefined)return fail();if(g.subGroupId===undefined)outerRows++;}
 return {pageCount,totalResults,nextOffset,outerRows,postings};
}
export function inspectPosDisplayPages(context:PosDisplayContext,pages:unknown[]){
 if(!Array.isArray(pages)||!pages.length||pages.length>20)return fail();const views=pages.map((p,i)=>posDisplayPageView(context,p,i)),first=views[0];
 if(views.length!==first.pageCount||views.some(v=>v.pageCount!==first.pageCount||v.totalResults!==first.totalResults)||views.reduce((n,v)=>n+v.outerRows,0)!==first.totalResults)return fail();
 const headers=new Map<string,Row>(),members=new Map<string,Row[]>(),memberIds=new Set<string>(),regularIds=new Set<string>();
 for(const view of views){
  const localHeaders=new Map<string,Row>(),localMembers=new Map<string,Row[]>();
  for(const p of view.postings){
   // This observed profile has no alternate financial-ID lists. Do not ignore
   // a contradictory ownership declaration or invent its namespace semantics.
   if(p.financialTransactionIdList!==undefined)return fail();
   const g=p.groupTypeInfo===undefined?{}:object(p.groupTypeInfo),key=id(p.transactionNo);
   if(g.groupId!==undefined){const groupId=text(g.groupId);if(!groupId||headers.has(groupId))return fail();headers.set(groupId,p);localHeaders.set(groupId,p);}
   else if(g.subGroupId!==undefined){const groupId=text(g.subGroupId);if(!groupId||memberIds.has(key))return fail();memberIds.add(key);const group=members.get(groupId)??[];group.push(p);members.set(groupId,group);const local=localMembers.get(groupId)??[];local.push(p);localMembers.set(groupId,local);}
   else{if(regularIds.has(key))return fail();regularIds.add(key);}
  }
  // Do not infer membership across an incomplete group/page boundary.
  for(const [groupId,header]of localHeaders)if(integer(object(header.groupTypeInfo).groupCount,1,4000)!==(localMembers.get(groupId)?.length??0))return fail();
  for(const groupId of localMembers.keys())if(!localHeaders.has(groupId))return fail();
 }
 if([...memberIds].some(key=>regularIds.has(key)))return fail();
 for(const [groupId,header]of headers){const group=members.get(groupId)??fail();if(!group.some(p=>id(p.transactionNo)===id(header.transactionNo)))return fail();}
 return {headers,members,memberIds,regularIds};
}
/** Empirical current-AR POS reference profile, qualified against 1,763 native
 * groups. Select the lexical minimum explicit reference independently of the
 * header representative used for display ordering. Preserve the raw source. */
function referenceFor(atoms:ReturnType<typeof inspectArOnlyPos>,mixed=false):string|undefined{
 const references=atoms.map(atom=>({id:atom.id,selected:text(atom.selected.reference??'').trim(),posted:text(atom.posting.reference??'').trim()}));if(references.some(row=>row.selected!==row.posted))return undefined;
 if(references.every(row=>!row.selected))return '';if(references.some(row=>!row.selected))return undefined;
 const selected=references.sort((a,b)=>a.selected<b.selected?-1:a.selected>b.selected?1:idOrder(a.id,b.id))[0].selected;
 return explicitArPosDisplayReference(selected)??(mixed&&!!selected&&!/^(?:Room\s*#|CHECK\s*#)/i.test(selected)?selected.replace(/\s+/g,' ').trim():undefined);
}
/** Common ownership check only. It never supplies financial admission/roles. */
export function inspectPosDisplayMembership(packet:InvoicePacket,evidenceContexts:PosDisplayMembershipContext[],region?:PosDisplayRegion){
 const membership=hasVerifiedSourceClaimsDisplayMembership(region)?readVerifiedSourceClaimsDisplayMembership(packet,region):undefined,originalPosIds=membership?new Set(membership.originalPosIds):undefined;
 const atoms=displayAtoms(packet,region),contexts=arPosDisplayContexts(packet,region);if(!atoms.length||!Array.isArray(evidenceContexts)||evidenceContexts.length!==contexts.length)return fail();const seenContexts=new Set<string>(),covered=new Set<string>(),allMetadataMembers=new Set<string>(),ownedGroups:{header:Row;atoms:typeof atoms;ids:string[]}[]=[];
 for(const evidence of evidenceContexts){
  const key=contextKey(evidence);if(seenContexts.has(key)||!contexts.some(c=>contextKey(c)===key))return fail();seenContexts.add(key);
  const metadata=inspectPosDisplayPages(evidence,evidence.pages);for(const memberId of metadata.memberIds){if(allMetadataMembers.has(memberId))return fail();allMetadataMembers.add(memberId);}
  for(const [groupId,header]of metadata.headers){
   const members=metadata.members.get(groupId)??fail(),owned=atoms.filter(a=>members.some(m=>id(m.transactionNo)===a.id));if(!owned.length)continue;
   const source=atoms.filter(a=>a.group===owned[0].group),ids=source.map(a=>a.id).sort(idOrder);if(source.length!==members.length||owned.length!==source.length||owned.some(a=>a.group!==source[0].group)||ids.some(value=>!members.some(m=>id(m.transactionNo)===value)))return fail();
   const first=source[0],check=text(first.selected.checkNo),date=text(first.posting.transactionDate),mixed=!!originalPosIds&&source.some(atom=>!originalPosIds.has(atom.id)),original=mixed?source.filter(atom=>originalPosIds!.has(atom.id)):source,cashier=object(original[0]?.posting.cashierInfo).cashierId;
   if(mixed&&(!Number.isSafeInteger(cashier)||original.some(atom=>object(atom.posting.cashierInfo).cashierId!==cashier)))return fail();
   if(groupId!==check||header.checkNo!==check||header.transactionDate!==date||object(header.cashierInfo).cashierId!==cashier||integer(first.posting.folioWindowNo,1,999)!==evidence.folioWindowNo)return fail();
   for(const member of members){const atom=source.find(a=>a.id===id(member.transactionNo))??fail();if(covered.has(atom.id)||member.checkNo!==check||member.transactionDate!==date||member.transactionCode!==atom.code||text(member.reference??'').trim()!==text(atom.selected.reference??'').trim()||object(member.cashierInfo).cashierId!==(originalPosIds?object(atom.posting.cashierInfo).cashierId:cashier)||member.arrangementCode!==undefined&&member.arrangementCode!==atom.posting.arrangementCode)return fail();covered.add(atom.id);}
   ownedGroups.push({header,atoms:source,ids});
  }
 }
 if(covered.size!==atoms.length)return fail();return ownedGroups;
}
/** Independent display evidence cannot admit money. The supplied role map must
 * come from the existing successful POS financial proof; this returns no money. */
export function verifyArPosDisplayProof(packet:InvoicePacket,proof:ArPosDisplayProof,authority:PosDisplayAuthority):{groups:VerifiedPosDisplayGroup[];gaps:PosDisplayGap[]}{
 const composed=!!packet.arOnlySourceClaimsProof;let region:PosDisplayRegion|undefined,admittedRoles:ReadonlyMap<string,{role:PosRole|'taxable';signedCents:number}>;
 if(composed){if(authority instanceof Map||![1,2].includes(packet.arOnlySourceClaimsProof!.version))return fail();region=authority as PosDisplayRegion;admittedRoles=hasVerifiedSourceClaimsDisplayMembership(region)?readVerifiedSourceClaimsDisplayMembership(packet,region).identities:readVerifiedSourceClaimsPosRegion(packet,region).identities;}else{if(!(authority instanceof Map))return fail();admittedRoles=authority;}
 const financial=[packet.arOnlyPosProof,packet.arOnlyPosServiceProof,packet.arOnlyPosFeeProof,packet.arOnlyPosDiscountProof,packet.arOnlyPosMultiVatProof,packet.arOnlyPosSignedMultiVatProof,packet.arOnlyPosSalesProof];
 const allowedEnvelopes=new Set(['arOnlyPosProof','arOnlyPosServiceProof','arOnlyPosFeeProof','arOnlyPosDiscountProof','arOnlyPosMultiVatProof','arOnlyPosSignedMultiVatProof','arOnlyPosSalesProof','arRateDisplayProof','arPosDisplayProof','arPaymentOffsetDisplayProof','arCountryDisplayProof','arEmbeddedCancellationDisplayProof','arOnlySourceClaimsProof']);
 if(Object.entries(packet).some(([key,value])=>value!==undefined&&(key.endsWith('Proof')||/source.*claims/i.test(key))&&!allowedEnvelopes.has(key)))return fail();
 if(financial.filter(Boolean).length!==(composed?0:1)||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPostedProof||packet.arOnlyWrapperNetVatProof||packet.arOnlyNonVatProof||packet.arTransfer||packet.directZeroTaxProof||packet.embeddedGenerateProof||packet.arDetails?.length||packet.arPostedGenerates?.length||packet.arSimulations?.length||!proof||proof.version!==1||proof.kind!=='ar-pos-checkno-source-display')return fail();
 const snapshot=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==snapshot||canonical(proof.sourceAfter)!==snapshot)return fail();
 const certificate=hasVerifiedSourceClaimsDisplayMembership(region)?readVerifiedSourceClaimsDisplayMembership(packet,region):undefined,originalPosIds=certificate?new Set(certificate.originalPosIds):undefined,atoms=displayAtoms(packet,region),financialAtoms=originalPosIds?atoms.filter(atom=>originalPosIds.has(atom.id)):atoms;if(!atoms.length||!admittedRoles||admittedRoles.size!==financialAtoms.length||financialAtoms.some(a=>admittedRoles.get(a.id)?.signedCents!==a.signedCents||!(composed?['taxable','vat']:['base','vat','service','fee','discount']).includes(admittedRoles.get(a.id)?.role??'')))return fail();
 if(!Array.isArray(proof.contexts)||proof.contexts.some(c=>canonical(c.before)!==canonical(c.after)))return fail();
 const membership=inspectPosDisplayMembership(packet,proof.contexts.map(c=>({...c,pages:c.before})),region),groups:VerifiedPosDisplayGroup[]=[],gaps:PosDisplayGap[]=[];
 for(const {header,atoms:source,ids}of membership){
  const negative=source.filter(a=>a.signedCents<0),signedAllowed=!!packet.arOnlyPosSignedMultiVatProof&&negative.every(a=>['base','service','vat'].includes(admittedRoles.get(a.id)!.role)),discountAllowed=!!packet.arOnlyPosDiscountProof&&negative.every(a=>admittedRoles.get(a.id)!.role==='discount')&&source.some(a=>a.signedCents>0);if(!composed&&negative.length&&!signedAllowed&&!discountAllowed){gaps.push({category:'signed-partition-unsupported',sourceIds:ids});continue;}
  const reference=referenceFor(source,!!originalPosIds&&source.some(atom=>!originalPosIds.has(atom.id)));if(reference===undefined){gaps.push({category:'reference-unresolved',sourceIds:ids});continue;}
  const description=text(object(header.groupTypeInfo).groupDescription).trim();if(!description)return fail();groups.push({representativeId:id(header.transactionNo),sourceIds:ids,date:text(source[0].posting.transactionDate),description,reference});
 }
 groups.sort(comparePosDisplayGroups);return {groups,gaps};
}
