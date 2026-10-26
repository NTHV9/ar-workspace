import {parseProviderUsage,type ProviderId,type ProviderUsageResponse} from '../../src/operations/provider-usage';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
export type ProviderUsageEnvironment=RefreshEnv;
export interface ProviderAlertInput {provider:ProviderId;warningPercent:number;expectedRevision:number;commandId:string}
export interface ProviderAlertSetting {provider:ProviderId;warningPercent:number;revision:number}
export class ProviderUsageError extends Error {constructor(code:string,readonly latest?:ProviderAlertSetting){super(code);}}
function realActor(env:ProviderUsageEnvironment,actor:string){if(!actor||env.REQUEST_ACCESS&&!env.REQUEST_ACCESS.administrator||env.REQUEST_ACTOR&&env.REQUEST_ACTOR!==actor)throw new ProviderUsageError('provider_forbidden');return actor;}
export function validProviderAlertInput(value:unknown):value is ProviderAlertInput {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).sort().join(',')==='commandId,expectedRevision,provider,warningPercent'&&['cloudflare','supabase'].includes(String(v.provider))&&typeof v.warningPercent==='number'&&Number.isInteger(v.warningPercent)&&v.warningPercent>=1&&v.warningPercent<=100&&Number.isSafeInteger(v.expectedRevision)&&Number(v.expectedRevision)>=0&&typeof v.commandId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.commandId);
}
function setting(value:unknown):ProviderAlertSetting|undefined {if(!value||typeof value!=='object')return;const v=value as Record<string,unknown>;if(!['cloudflare','supabase'].includes(String(v.provider))||!Number.isInteger(v.warningPercent)||Number(v.warningPercent)<1||Number(v.warningPercent)>100||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return;return {provider:v.provider as ProviderId,warningPercent:Number(v.warningPercent),revision:Number(v.revision)};}
export async function readProviderUsage(env:ProviderUsageEnvironment,actor:string):Promise<ProviderUsageResponse> {
 realActor(env,actor);
 try{const value=await backendRpc<Record<string,unknown>>(env,'ar_provider_usage_read',{p_actor:actor});if(value?.error==='provider_forbidden')throw new ProviderUsageError('provider_forbidden');return parseProviderUsage(value);}catch(error){if(error instanceof ProviderUsageError)throw error;return parseProviderUsage(null);}
}
export async function saveProviderAlert(env:ProviderUsageEnvironment,actor:string,input:ProviderAlertInput):Promise<ProviderAlertSetting> {
 realActor(env,actor);if(!validProviderAlertInput(input))throw new ProviderUsageError('provider_invalid');
 const value=await backendRpc<Record<string,unknown>>(env,'ar_provider_alert_save',{p_actor:actor,p_provider:input.provider,p_warning_percent:input.warningPercent,p_expected_revision:input.expectedRevision,p_command_id:input.commandId});
 if(value?.error){const code=String(value.error);throw new ProviderUsageError(['provider_forbidden','provider_invalid','provider_revision_conflict','provider_command_conflict'].includes(code)?code:'provider_unavailable',setting(value.latest));}
 const result=setting(value);if(!result||result.provider!==input.provider)throw new ProviderUsageError('provider_unavailable');return result;
}
