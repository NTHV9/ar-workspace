import {REGION_IDS,isRegionId,type RegionId} from '../domain/hotels';
export const administratorEmail='ar@katathani.com';
export interface UserAccess {workspaceOwnerId?:string;email:string|null;displayName?:string|null;position?:string;username?:string|null;memberId?:string;accountKind?:'email'|'username';administrator:boolean;regions:RegionId[];revision:number}
export interface AccessMember extends UserAccess {active:boolean;registered:boolean;hasLoginAccount?:boolean;setupState?:'ready'|'creating'|'deleting';pendingCommand?:string|null}
export interface AccessList {rows:AccessMember[];total:number}
export function parseAccess(value:unknown):UserAccess {
 if(!value||typeof value!=='object')throw Error('access_unavailable');
 const v=value as Record<string,unknown>;
 const named=v.accountKind==='username'&&v.email===null&&typeof v.username==='string'&&/^[a-z0-9][a-z0-9._-]{2,31}$/.test(v.username);
 if(!named&&typeof v.email!=='string'||typeof v.administrator!=='boolean'||!Array.isArray(v.regions)||!v.regions.length||v.regions.some(r=>!isRegionId(r))||new Set(v.regions).size!==v.regions.length||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw Error('access_unavailable');
 if(v.administrator&&(v.email!==administratorEmail||v.regions.length!==2))throw Error('access_unavailable');
 if(v.workspaceOwnerId!==undefined&&(typeof v.workspaceOwnerId!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.workspaceOwnerId)))throw Error('access_unavailable');
 return {...(typeof v.workspaceOwnerId==='string'?{workspaceOwnerId:v.workspaceOwnerId}:{}),email:v.email as string|null,...(typeof v.position==='string'?{position:v.position}:{}),...(typeof v.displayName==='string'?{displayName:v.displayName}:{}),administrator:v.administrator,regions:REGION_IDS.filter(r=>(v.regions as unknown[]).includes(r)),revision:Number(v.revision),...(named?{username:String(v.username),accountKind:'username' as const}:{}),...(typeof v.memberId==='string'?{memberId:v.memberId}:{})};
}
export const memberLogin=(member:UserAccess)=>member.username??member.email??'';
