import {describe,it,expect,vi,afterEach} from 'vitest';
import {parseSettingsPatch,parseBulkSelection} from '../src/settings/bulk-model';
import {bulkSettingsApi} from '../worker/settings/bulk-api';
import {requestAccessIntent} from '../worker/access/scope';
const selection={mode:'accounts',accounts:[{hotel:'KAT',accountId:'same-id',revision:1},{hotel:'TSK',accountId:'same-id',revision:2}],types:[],patch:{creditTerm:30}};
afterEach(()=>vi.unstubAllGlobals());
describe('bulk settings contract',()=>{
 it('keeps identities hotel scoped and only passes selected fields',()=>{
  expect(parseBulkSelection(selection).accounts).toHaveLength(2);expect(parseSettingsPatch({creditTerm:0})).toEqual({creditTerm:0});expect(parseSettingsPatch({billingRequired:null})).toEqual({billingRequired:null});
 });
 it.each([{creditTerm:-1},{creditTerm:1.5},{creditTerm:3651},{billingRequired:'false'},{billingPortal:'javascript:alert(1)'},{billingRecipients:{to:['bad'],cc:[],bcc:[]}},{other:1},{}])('rejects invalid patches %j',value=>expect(()=>parseSettingsPatch(value)).toThrow());
 it('rejects duplicate identity and account mode carrying hidden default groups',()=>{
  expect(()=>parseBulkSelection({...selection,accounts:[selection.accounts[0],selection.accounts[0]]})).toThrow();
  expect(()=>parseBulkSelection({...selection,types:[{hotel:'KAT',type:'OTA',revision:0}]})).toThrow();
 });
 it('allows a type default for a future group without existing accounts',()=>expect(parseBulkSelection({mode:'types',accounts:[],types:[{hotel:'TLKL',type:'OTA',revision:0}],patch:{creditTerm:14}}).types).toHaveLength(1));
 it('admits only the exact authenticated bulk routes',async()=>{
  expect(await requestAccessIntent(new Request('https://app.test/api/account-settings/bulk'))).toEqual({kind:'global'});
  await expect(requestAccessIntent(new Request('https://app.test/api/account-settings/bulk/delete',{method:'POST'}))).rejects.toThrow();
 });
 it('passes the authenticated actor to the SQL boundary and rejects cross-site writes',async()=>{
  const call=vi.fn<typeof fetch>(async()=>Response.json({saved:true}));vi.stubGlobal('fetch',call);
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:'actual-staff'};
  const body={...selection,commandId:'00000000-0000-4000-8000-000000000001'};
  let result=await bulkSettingsApi(new Request('https://app.test/api/account-settings/bulk/apply',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.test'},body:JSON.stringify(body)}),env,'actual-staff');
  expect(result.status).toBe(403);expect(call).not.toHaveBeenCalled();
  result=await bulkSettingsApi(new Request('https://app.test/api/account-settings/bulk/apply',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://app.test'},body:JSON.stringify(body)}),env,'actual-staff');
  expect(result.status).toBe(200);expect(JSON.parse(call.mock.calls[0][1]!.body as string)).toMatchObject({p_actor:'actual-staff',p_command:body.commandId,p_input:{patch:{creditTerm:30}}});
 });
});
