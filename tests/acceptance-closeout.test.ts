import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/drive/oauth',()=>({driveToken:async()=> 'synthetic-token'}));
import {closeAcceptance} from '../worker/acceptance/closeout';
const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',ACCEPTANCE_ENABLED:'true'};
afterEach(()=>vi.unstubAllGlobals());
function harness(options:{blocked?:boolean;child?:boolean;wrongOwner?:boolean;lostAccess?:boolean}={}){
 let folder=true,bucket=true;const calls:string[]=[];const summary={phase:'closing',folderDeleteAcknowledged:false,bucketDeleteAcknowledged:false};
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const u=new URL(String(input)),body=init.body?JSON.parse(String(init.body)):{};calls.push((init.method??'GET')+' '+u.pathname);expect(init.redirect).toBe('manual');
  if(u.pathname.endsWith('ar_acceptance_close_begin'))return Response.json(options.blocked?{error:'acceptance_files_remaining'}:{id,owner:actor,folder:'syntheticTestFolder',parent:'syntheticOriginalParent',summary});
  if(u.pathname.endsWith('ar_acceptance_close_record')){if(body.p_step==='folder')summary.folderDeleteAcknowledged=true;if(body.p_step==='bucket')summary.bucketDeleteAcknowledged=true;if(body.p_step==='verified'){expect(folder).toBe(false);expect(bucket).toBe(false);summary.phase='providers_removed';}return Response.json(summary);}
  if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'ar@katathani.com'}});
  if(u.pathname.endsWith('/permissions'))return Response.json({permissions:[{type:'user',role:'owner',emailAddress:'ar@katathani.com'}]});
  if(u.pathname.endsWith('/syntheticOriginalParent'))return Response.json({id:'syntheticOriginalParent',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true},owners:[{emailAddress:'ar@katathani.com'}]});
  if(u.pathname.endsWith('/syntheticTestFolder')){if(init.method==='DELETE'){folder=false;return new Response(null,{status:204});}return folder&&!options.lostAccess?Response.json({id:'syntheticTestFolder',mimeType:'application/vnd.google-apps.folder',parents:['syntheticOriginalParent'],trashed:false,appProperties:{ar_acceptance:options.wrongOwner?'other':id,ar_owner:actor},owners:[{emailAddress:'ar@katathani.com'}],capabilities:{canAddChildren:true}}):new Response(null,{status:404});}
  if(u.pathname==='/drive/v3/files'){expect(u.searchParams.get('q')).toBe("'syntheticTestFolder' in parents");return Response.json({files:options.child?[{id:'unrecordedChild'}]:[]});}
  if(u.pathname==='/storage/v1/bucket/ar-acceptance-files'&&init.method==='DELETE'){bucket=false;return Response.json({message:'deleted'});}
  throw Error('Unexpected synthetic call '+u.pathname);
 });return calls;
}
it('removes only verified-empty registered containers, records acknowledgements, and replays without deleting again',async()=>{const calls=harness();expect(await closeAcceptance(env,actor,id)).toEqual({closed:true});expect(await closeAcceptance(env,actor,id)).toEqual({closed:true});expect(calls.filter(c=>c.startsWith('DELETE'))).toEqual(['DELETE /drive/v3/files/syntheticTestFolder','DELETE /storage/v1/bucket/ar-acceptance-files']);});
it.each([{blocked:true},{child:true},{wrongOwner:true},{lostAccess:true}])('does not delete when scope or completeness is uncertain: %s',async options=>{const calls=harness(options);await expect(closeAcceptance(env,actor,id)).rejects.toThrow();expect(calls.some(c=>c.startsWith('DELETE'))).toBe(false);});
