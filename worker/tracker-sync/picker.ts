import {isRegionId} from '../../src/domain/hotels';
import {backendRpc} from '../refresh/backend';
import {driveConfigured,driveToken} from '../drive/oauth';
import {identity} from '../drive/provider';
import {driveScope,allowedEmail} from '../drive/shared';
import {trackerFile,type TrackerEnv} from './service';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
/** Public Picker configuration is scoped like Reports links. No provider token,
 * refresh credential, arbitrary destination or browser-chosen target is returned. */
export async function trackerPickerConfig(request:Request,env:TrackerEnv,owner:string){
 const url=new URL(request.url),region=url.searchParams.get('region'),actor=env.REQUEST_ACTOR??owner;
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(!isRegionId(region)||url.searchParams.size!==1)return json({error:'tracker_invalid'},400);
 if(env.REQUEST_ACCESS&&!env.REQUEST_ACCESS.regions.includes(region))return json({error:'tracker_forbidden'},403);
 try{
  await backendRpc(env,'ar_tracker_status',{p_actor:actor,p_region:region});
  const fileId=trackerFile(env,region);
  if(env.TRACKER_SYNC_ENABLED!=='true')return json({error:'tracker_disabled'},409);
  if(!fileId||!/^[A-Za-z0-9_-]{20,200}$/.test(fileId))return json({error:'tracker_target_unconfigured'},409);
  if(!driveConfigured(env)||!env.GMAIL_CLIENT_ID||!env.GOOGLE_PICKER_BROWSER_KEY||!/^\d{1,20}$/.test(env.GOOGLE_PROJECT_NUMBER??''))return json({error:'tracker_picker_not_configured'},409);
  // Check the existing AR-owned grant, independently of the browser login.
  await identity(await driveToken(env,owner));
  return json({clientId:env.GMAIL_CLIENT_ID,browserKey:env.GOOGLE_PICKER_BROWSER_KEY,projectNumber:env.GOOGLE_PROJECT_NUMBER,scope:driveScope,fileId,accountEmail:allowedEmail,
   fileName:region==='phuket'?'Master_KAT_AR_Tracker_Phuket.xlsx':'Master_SAN_AR_Tracker',
   mimeType:region==='phuket'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.google-apps.spreadsheet'});
 }catch{return json({error:'tracker_picker_drive_not_connected'},409);}
}
