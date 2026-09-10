export type LegacyStageKey='Friendly'|'Follow 1'|'Follow 2'|'Follow 3'|'Final';
export type CollectionStageKey=LegacyStageKey|`round_${string}`;
export interface CollectionRound {key:CollectionStageKey;label:string;anchor:'due'|'previous_sent';offsetDays:number;terminal:boolean;active:boolean}
export interface CollectionPolicy {version:number;rounds:CollectionRound[]}
export interface PolicyCommand {commandId:string;revision:number;confirmed:true;reason:string;rounds:CollectionRound[]}
export interface StageSnapshot extends Omit<CollectionRound,'active'> {policyVersion:number;position:number;earlierKeys:CollectionStageKey[]}
const legacyKeys:LegacyStageKey[]=['Friendly','Follow 1','Follow 2','Follow 3','Final'];
export const defaultCollectionPolicy:CollectionPolicy={version:1,rounds:[
 {key:'Friendly',label:'Friendly',anchor:'due',offsetDays:-7,terminal:false,active:true},
 {key:'Follow 1',label:'Follow-up 1',anchor:'due',offsetDays:1,terminal:false,active:true},
 {key:'Follow 2',label:'Follow-up 2',anchor:'previous_sent',offsetDays:7,terminal:false,active:true},
 {key:'Follow 3',label:'Follow-up 3',anchor:'previous_sent',offsetDays:7,terminal:false,active:true},
 {key:'Final',label:'Final',anchor:'previous_sent',offsetDays:7,terminal:true,active:true},
]};
const invalid=():never=>{throw Error('policy_invalid');};
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>;};
const only=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))return invalid();};
const integer=(v:unknown,min=1,max=2147483647)=>{if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)return invalid();return Number(v);};
function text(v:unknown,max:number){if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))return invalid();return v.trim();}
export function isCollectionStageKey(value:unknown):value is CollectionStageKey{return typeof value==='string'&&(legacyKeys.includes(value as LegacyStageKey)||/^round_[a-z0-9][a-z0-9_-]{0,63}$/.test(value));}
function round(value:unknown):CollectionRound {const v=obj(value);only(v,['key','label','anchor','offsetDays','terminal','active']);if(!isCollectionStageKey(v.key)||!['due','previous_sent'].includes(String(v.anchor))||typeof v.anchor!=='string'||typeof v.active!=='boolean'||typeof v.terminal!=='boolean')return invalid();return {key:v.key,label:text(v.label,80),anchor:v.anchor as CollectionRound['anchor'],offsetDays:integer(v.offsetDays,v.anchor==='due'?-365:0,3650),terminal:v.terminal,active:v.active};}
export function parseCollectionPolicy(value:unknown,previous?:CollectionPolicy):CollectionPolicy {
 const v=obj(value);only(v,['version','rounds']);const version=integer(v.version);if(!Array.isArray(v.rounds)||!v.rounds.length||v.rounds.length>100)return invalid();const rounds=v.rounds.map(round),keys=new Set(rounds.map(r=>r.key));if(keys.size!==rounds.length||previous?.rounds.some(r=>!keys.has(r.key)))return invalid();
 const active=rounds.filter(r=>r.active);if(!active.length||active[0].anchor!=='due'||active.filter(r=>r.terminal).length!==1||!active.at(-1)!.terminal||new Set(active.map(r=>r.label.toLowerCase())).size!==active.length)return invalid();
 let priorDue=-366,previousSent=false;for(const r of active){if(r.anchor==='previous_sent')previousSent=true;else{if(previousSent||r.offsetDays<=priorDue)return invalid();priorDue=r.offsetDays;}}
 return {version,rounds};
}
export function parsePolicyCommand(value:unknown):PolicyCommand {const v=obj(value);only(v,['commandId','revision','confirmed','reason','rounds']);if(typeof v.commandId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.commandId)||v.confirmed!==true)return invalid();const revision=integer(v.revision),reason=text(v.reason,1000),policy=parseCollectionPolicy({version:revision,rounds:v.rounds});return {commandId:v.commandId.toLowerCase(),revision,confirmed:true,reason,rounds:policy.rounds};}
export function stageSnapshot(policy:CollectionPolicy,key:string,allowRetired=false):StageSnapshot {const position=policy.rounds.findIndex(r=>r.key===key),r=policy.rounds[position];if(!r||!r.active&&!allowRetired)throw Error('policy_stage_unavailable');const {active:_active,...definition}=r;return {...definition,policyVersion:policy.version,position,earlierKeys:policy.rounds.slice(0,position).filter(r=>r.active).map(r=>r.key)};}
export function parseStageSnapshot(value:unknown):StageSnapshot {const v=obj(value);only(v,['key','label','anchor','offsetDays','terminal','policyVersion','position','earlierKeys']);const r=round({key:v.key,label:v.label,anchor:v.anchor,offsetDays:v.offsetDays,terminal:v.terminal,active:true});if(!Array.isArray(v.earlierKeys)||v.earlierKeys.length>100||v.earlierKeys.some(k=>!isCollectionStageKey(k)||k===r.key)||new Set(v.earlierKeys).size!==v.earlierKeys.length)return invalid();const {active:_active,...definition}=r;return {...definition,policyVersion:integer(v.policyVersion),position:integer(v.position,0,99),earlierKeys:v.earlierKeys as CollectionStageKey[]};}
export function legacyStageSnapshot(key:string):StageSnapshot|null {return legacyKeys.includes(key as LegacyStageKey)?stageSnapshot(defaultCollectionPolicy,key):null;}
export function policyStageLabel(key:string,policy?:CollectionPolicy|null,snapshot?:StageSnapshot|null){if(snapshot?.key===key)return snapshot.label;return policy?.rounds.find(r=>r.key===key)?.label??legacyStageSnapshot(key)?.label??key;}
export const activeCollectionRounds=(policy:CollectionPolicy)=>policy.rounds.filter(r=>r.active);
