import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/drive/oauth',()=>({driveToken:async()=> 'synthetic-token'}));
vi.mock('../worker/operations/budget',()=>({operationBudgetLimits:()=>({}),reserveOperationBudget:vi.fn(async()=>({})),startOperationBudget:vi.fn(async()=>({}))}));
import {prepareAcceptance} from '../worker/acceptance/lifecycle';
const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',budget='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',ACCEPTANCE_ENABLED:'true',OPERATIONS_BUDGET_ENABLED:'true'};
afterEach(()=>vi.unstubAllGlobals());
function harness(conflict=false){let folderCreated=false,bucketCreated=conflict;let setup={id,owner:actor,state:'prepared',budget_id:budget,drive_folder_id:'syntheticReservedFolder',parent_folder_id:'syntheticParent',bucket_verified:false};const calls:{path:string;method:string}[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const u=new URL(String(input)),body=init.body?JSON.parse(String(init.body)):{};calls.push({path:u.pathname,method:init.method??'GET'});expect(init.redirect).toBe('manual');
 if(u.pathname.endsWith('ar_acceptance_setup'))return Response.json(setup);
 if(u.pathname.endsWith('ar_operations_budget_current'))return Response.json({});
 if(u.pathname.endsWith('ar_drive_target_get'))return Response.json({folder_id:'syntheticParent'});
 if(u.pathname.endsWith('ar_acceptance_setup_record')){if(body.p_kind==='bucket')setup={...setup,bucket_verified:true};return Response.json(setup);}
 if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'ar@katathani.com'}});
 if(u.pathname.endsWith('/permissions'))return Response.json({permissions:[{type:'user',role:'owner',emailAddress:'ar@katathani.com'}]});
 if(u.pathname.endsWith('/syntheticParent'))return Response.json({id:'syntheticParent',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true},owners:[{emailAddress:'ar@katathani.com'}]});
 if(u.pathname.endsWith('/syntheticReservedFolder'))return folderCreated?Response.json({id:'syntheticReservedFolder',mimeType:'application/vnd.google-apps.folder',parents:['syntheticParent'],trashed:false,appProperties:{ar_acceptance:id,ar_owner:actor},capabilities:{canAddChildren:true},owners:[{emailAddress:'ar@katathani.com'}]}):new Response(null,{status:404});
 if(u.pathname==='/drive/v3/files'&&init.method==='POST'){expect(body.id).toBe('syntheticReservedFolder');expect(body.parents).toEqual(['syntheticParent']);folderCreated=true;return Response.json({id:body.id});}
 if(u.pathname.endsWith('ar_acceptance_bucket_info'))return Response.json({exists:bucketCreated,private:true});
 if(u.pathname==='/storage/v1/bucket'){expect(body.id).toBe('ar-acceptance-files');expect(body.public).toBe(false);bucketCreated=true;return Response.json({id:body.id});}
 if(u.pathname.endsWith('ar_acceptance_activate')){setup={...setup,state:'active'};return Response.json({id});}throw Error('Unexpected synthetic call '+u.pathname);
 });return calls;}
it('creates only the reserved folder/private test bucket and never duplicates them on replay',async()=>{const calls=harness();expect(await prepareAcceptance(env,actor,id)).toEqual({id,active:true});expect(await prepareAcceptance(env,actor,id)).toEqual({id,active:true});expect(calls.filter(c=>c.path==='/drive/v3/files')).toHaveLength(1);expect(calls.filter(c=>c.path==='/storage/v1/bucket')).toHaveLength(1);});
it('does not adopt an unrecorded bucket merely because the name matches',async()=>{const calls=harness(true);await expect(prepareAcceptance(env,actor,id)).rejects.toThrow('acceptance_bucket_conflict');expect(calls.some(c=>c.path==='/storage/v1/bucket')).toBe(false);expect(calls.some(c=>c.path.endsWith('ar_acceptance_activate'))).toBe(false);});
