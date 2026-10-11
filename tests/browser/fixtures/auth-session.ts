import type {Page} from '@playwright/test';
export interface SyntheticAuthUser {id:string;email:string;[key:string]:unknown}
/** Seed the current tab key when Auth creates it; no obsolete cross-tab login is inherited. */
export async function seedTabSession(page:Page,user:SyntheticAuthUser,accessToken='synthetic'){
 await page.addInitScript(({user,accessToken})=>{const session=JSON.stringify({access_token:accessToken,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}),set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){set.call(this,key,value);if(this===sessionStorage&&key==='ar-google-tab-v1')set.call(this,value,session);};},{user,accessToken});
}
export function syntheticWorkspaceAccess(user:Pick<SyntheticAuthUser,'id'|'email'>){return {memberId:user.id,email:user.email,displayName:'Synthetic Staff',active:true,administrator:true,regions:['phuket','khao-lak'],revision:1};}
