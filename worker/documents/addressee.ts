import {OperaError} from '../opera/client';
type Row=Record<string,unknown>;
const record=(value:unknown):Row=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('document_addressee_invalid');return value as Row;};
const optional=(value:unknown)=>value==null?{}:record(value);
const hasLines=(address:Row)=>Array.isArray(address.addressLine)&&address.addressLine.some(value=>typeof value==='string'&&value.trim());
/** AR may return an empty address even though its linked profile has full stationery data. */
export async function accountWithAddressee(reader:{profile?:(profileId:string)=>Promise<unknown>},hotel:string,accountId:string,input:unknown):Promise<Row>{
 const account=record(input);
 if(account.hotelId!==hotel||String(record(account.accountId).id)!==accountId)throw Error('document_addressee_scope_invalid');
 const attached=optional(account.address),inline=optional(attached.address);
 if(inline.addressLine!==undefined&&!Array.isArray(inline.addressLine))throw Error('document_addressee_invalid');
 if(hasLines(inline))return account;
 const profileId=optional(account.profileId).id;
 // A non-profile account can legitimately have no postal address. Never invent one.
 if(profileId==null)return account;
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
 const matches=attachedId?addresses.filter(row=>row.id===attachedId):addresses.filter(row=>record(row.address).primaryInd===true);
 if(!addresses.length&&!attachedId)return account;
 if(matches.length!==1)throw Error('document_addressee_ambiguous');
 const chosen=matches[0],address=record(chosen.address);
 if(!Array.isArray(address.addressLine)||!hasLines(address))throw Error('document_addressee_unavailable');
 return {...account,address:chosen};
}
