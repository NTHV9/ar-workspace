import {emailRpc,type EmailEnv} from '../email/shared';
/** Server-only: SQL reads its persisted send/verified proof, never caller truth flags. */
export async function retireCompletedPreparation(env:EmailEnv,owner:string,deliveryId:string){
 if(env.ACCEPTANCE)return undefined;
 try{const result=await emailRpc<{accepted?:boolean; jobs?:{accepted?:boolean;retirementId?:string}[]}>(env,'ar_preparation_complete',{p_actor:owner,p_delivery:deliveryId});return result?.accepted===true?{accepted:true as const}:undefined;}catch{return undefined;}
}
