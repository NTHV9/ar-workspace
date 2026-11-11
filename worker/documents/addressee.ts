import {OperaError} from '../opera/client';
type Row=Record<string,unknown>;
const record=(value:unknown):Row=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('document_addressee_invalid');return value as Row;};
const optional=(value:unknown)=>value==null?{}:record(value);
const isArAddress=(address:Row)=>typeof address.type==='string'&&address.type.trim().toUpperCase()==='AR ADDRESS';
/** Select AR stationery within the verified Account profile, independently of its primary BUSINESS address. */
export async function accountWithAddressee(reader:{profile?:(profileId:string)=>Promise<unknown>},hotel:string,accountId:string,input:unknown):Promise<Row>{
 const account=record(input);
 if(account.hotelId!==hotel||String(record(account.accountId).id)!==accountId)throw Error('document_addressee_scope_invalid');
 const attached=optional(account.address),inline=optional(attached.address);
 if(inline.addressLine!==undefined&&!Array.isArray(inline.addressLine))throw Error('document_addressee_invalid');
 const profileId=optional(account.profileId).id;
 // Accounts without a linked profile expose their own AR stationery directly.
 // An explicitly different address type cannot qualify as AR stationery.
 if(profileId==null){
  if(inline.type!=null&&!isArAddress(inline))throw Error('document_addressee_ar_missing');
  return account;
 }
 if(typeof profileId!=='string'||!profileId||!reader.profile)throw Error('document_addressee_unavailable');
 let response:unknown;try{response=await reader.profile(profileId);}catch(error){if(error instanceof OperaError)throw new OperaError(error.code,error.upstreamStatus,'addressee_profile',error.providerMessage);throw Error('document_addressee_unavailable');}
 const profile=record(response);
 if(!Array.isArray(profile.profileIdList)||profile.profileIdList.map(record).filter(id=>id.type==='Profile'&&id.id===profileId).length!==1)throw Error('document_addressee_scope_invalid');
 const envelope=optional(record(profile.profileDetails).addresses);
 if(!Array.isArray(envelope.addressInfo))throw Error('document_addressee_unavailable');
 const addresses=envelope.addressInfo.map(record);
 if(envelope.totalResults!==undefined&&envelope.totalResults!==addresses.length||envelope.count!==undefined&&envelope.count!==addresses.length)throw Error('document_addressee_incomplete');
 const attachedId=attached.id;
 if(attachedId!=null&&(typeof attachedId!=='string'||!attachedId))throw Error('document_addressee_invalid');
 const linked=attachedId?addresses.filter(row=>row.id===attachedId):[];
 if(attachedId&&linked.length!==1)throw Error('document_addressee_ambiguous');
 const arAddresses=addresses.filter(row=>isArAddress(record(row.address)));
 if(!arAddresses.length)throw Error('document_addressee_ar_missing');
 const linkedAr=linked.filter(row=>isArAddress(record(row.address)));
 // Preserve an explicit Account AR selection, then prefer AR primary.
 // Owner permits the first AR address in provider order when none is primary.
 const primaryAr=arAddresses.filter(row=>record(row.address).primaryInd===true);
 const matches=linkedAr.length?linkedAr:primaryAr.length?primaryAr:arAddresses.slice(0,1);
 if(matches.length!==1)throw Error('document_addressee_ambiguous');
 const chosen=matches[0],address=record(chosen.address);
 // Keep verified blank AR lines and country as supplied. Never invent postal text.
 if(!Array.isArray(address.addressLine)||!address.addressLine.every(value=>typeof value==='string'))throw Error('document_addressee_unavailable');
 return {...account,address:chosen};
}
