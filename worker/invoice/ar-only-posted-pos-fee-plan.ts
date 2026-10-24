import {canPlanArOnlyPosFee,posFeeCandidate} from './ar-only-pos-fee-proof';
import {verifyArOnlyPosMetadata,type ArOnlyPosAtom,type ArOnlyPosDefinition,type PosRole} from './ar-only-pos-proof';
const object=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** Read planning only. Preserve established fee/signed/multi profiles whenever
 * their independent source partitions qualify. Claims are recomputed later. */
export function canPlanPostedPosFee(atoms:ArOnlyPosAtom[],definitions:ArOnlyPosDefinition[],hotel:string,composed=false):boolean{
 if(!canPlanArOnlyPosFee(atoms,definitions,hotel))return false;
 const roles=new Map<string,PosRole>(),groups=new Map<string,ArOnlyPosAtom[]>();let fees=0;
 for(const atom of atoms){const evidence=definitions.find(e=>object(object(e.before).transactionCode).code===atom.code);if(!evidence)return false;const {definition,group,type}=verifyArOnlyPosMetadata(atom,evidence,hotel);let role:PosRole;
  if(type==='NonRevenue'&&group==='F&B'&&posFeeCandidate(atom,evidence,hotel)){role='fee';fees++;}else if(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(String(object(definition.description).defaultText)))role='vat';else if(type==='NonRevenue'&&group==='SVC')role='service';else if(type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group)))role='base';else return false;roles.set(atom.id,role);const scope=groups.get(atom.group)??[];scope.push(atom);groups.set(atom.group,scope);
 }
 if(!fees)return false;let deviation=composed,signedRepeated=false,feeRepeated=false;
 for(const group of groups.values()){const hasFee=group.some(a=>roles.get(a.id)==='fee'),vats=group.filter(a=>roles.get(a.id)==='vat');if(hasFee){if(!vats.length||!group.some(a=>roles.get(a.id)==='base'))return false;if(group.some(a=>a.signedCents<=0))deviation=true;if(vats.length>1)feeRepeated=true;}
  for(const sign of [1,-1]){const partition=group.filter(a=>Math.sign(a.signedCents)===sign);if(!partition.length)continue;const tax=partition.filter(a=>roles.get(a.id)==='vat'),base=partition.filter(a=>roles.get(a.id)!=='vat'),vat=tax.reduce((n,a)=>n+BigInt(a.signedCents),0n),basis=base.reduce((n,a)=>n+BigInt(a.signedCents),0n),difference=vat*100n-basis*7n;if(!tax.length||!base.some(a=>roles.get(a.id)==='base')||(difference<0n?-difference:difference)>100n)deviation=true;if(!group.every(a=>a.signedCents>0)&&tax.length>1)signedRepeated=true;}
 }
 return deviation||signedRepeated&&feeRepeated;
}
