import {afterEach,expect,it,vi} from 'vitest';
import {trackerPickerConfig} from '../worker/tracker-sync/picker';
import {trackerApi} from '../worker/tracker-sync/api';
import {requestAccessIntent} from '../worker/access/scope';
import type {TrackerAdapter,TrackerEnv} from '../worker/tracker-sync/service';
vi.mock('../worker/drive/oauth',async importOriginal=>({...await importOriginal<typeof import('../worker/drive/oauth')>(),driveConfigured:()=>true,driveToken:vi.fn(async()=> 'synthetic-server-existing-grant')}));
vi.mock('../worker/drive/provider',async importOriginal=>({...await importOriginal<typeof import('../worker/drive/provider')>(),identity:vi.fn(async()=> 'ar@katathani.com')}));
const owner='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',phuket='synthetic_original_phuket_12345',khao='synthetic_original_khaolak_12345';
const env:TrackerEnv={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor,TRACKER_SYNC_ENABLED:'true',REPORT_SHEET_PHUKET_ID:phuket,REPORT_SHEET_KHAOLAK_ID:khao,GMAIL_CLIENT_ID:'123456-synthetic.apps.googleusercontent.com',GOOGLE_PICKER_BROWSER_KEY:'synthetic-browser-key',GOOGLE_PROJECT_NUMBER:'123456'};
afterEach(()=>vi.unstubAllGlobals());
function rpc(){const calls:Record<string,unknown>[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{expect(url).toBe(env.SUPABASE_URL+'/rest/v1/rpc/ar_tracker_status');calls.push(JSON.parse(String(init.body)));return Response.json({connected:false,revision:0});});return calls;}
it.each(['phuket','khao-lak'] as const)('returns only the private bound %s file and public Picker configuration after actor authorization',async region=>{
 const calls=rpc(),response=await trackerPickerConfig(new Request('https://app.test/api/reports/tracker-picker?region='+region),env,owner);
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');const body=await response.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Expected Picker configuration');expect(body).toMatchObject({fileId:region==='phuket'?phuket:khao,scope:'https://www.googleapis.com/auth/drive.file',accountEmail:'ar@katathani.com',projectNumber:'123456'});expect(JSON.stringify(body)).not.toContain('synthetic-server-existing-grant');expect(Object.keys(body)).not.toContain('SUPABASE_SECRET_KEY');expect(calls).toEqual([{p_actor:actor,p_region:region}]);
});
it('rejects arbitrary targets, extra query parameters and non-GET Picker requests',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const query of ['?region=phuket&fileId=untrusted','?region=phuket&url=https://untrusted.example','?region=phuket&region=khao-lak'])expect((await trackerPickerConfig(new Request('https://app.test/api/reports/tracker-picker'+query),env,owner)).status).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();await expect(requestAccessIntent(new Request('https://app.test/api/reports/tracker-picker?region=phuket',{method:'POST'}))).rejects.toThrow('access_forbidden');
 expect(await requestAccessIntent(new Request('https://app.test/api/reports/tracker-picker?region=khao-lak'))).toEqual({kind:'region',region:'khao-lak'});
});
it('rejects a picked file that no longer matches the backend binding before any workbook read',async()=>{
 rpc();const adapter:TrackerAdapter={read:vi.fn(),write:vi.fn()};const response=await trackerApi(new Request('https://app.test/api/reports/tracker?region=phuket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'connect',revision:0,selectedFileId:khao})}),env,owner,adapter);
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'tracker_target_conflict'});expect(adapter.read).not.toHaveBeenCalled();
});
