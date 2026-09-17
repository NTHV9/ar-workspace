import {afterEach,expect,it,vi} from 'vitest';
import {requireRegionalDelivery} from '../worker/email/regional-delivery';
import {createGmailDraft} from '../worker/email/gmail-draft';
import {deliverMessage} from '../worker/email/delivery';
const id='00000000-0000-4000-8000-000000000021',owner='00000000-0000-4000-8000-000000000022';
afterEach(()=>vi.unstubAllGlobals());
it.each(['TLKL','WAKL','TLFO','TSAN','UNKNOWN'])('rejects %s before any provider or database call in the mailbox guard',async hotel=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(requireRegionalDelivery({}, {id,hotel})).rejects.toThrow('email_region_disabled');expect(fetcher).not.toHaveBeenCalled();
});
it.each(['KAT','TSK'])('keeps the approved Phuket mailbox usable for %s',async hotel=>{await expect(requireRegionalDelivery({}, {id,hotel})).resolves.toBeUndefined();});
it.each(['send','draft'] as const)('blocks Khao Lak %s through the real delivery path with no Gmail write',async mode=>{
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>{const path=String(input);if(path.includes('ar_gmail_connection_get'))return Response.json({scope:'https://www.googleapis.com/auth/gmail.readonly'});if(path.includes('ar_mail_for_draft'))return Response.json(null);if(path.includes('ar_email_get'))return Response.json({id,hotel:'TLKL',revision:1,package_changed:false});throw Error('Unexpected provider call');});vi.stubGlobal('fetch',fetcher);
 await expect(deliverMessage({SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic'},owner,id,1,mode,null)).rejects.toThrow('email_region_disabled');expect(fetcher.mock.calls.every(([url])=>!String(url).includes('googleapis.com'))).toBe(true);
});
it('blocks the retained Gmail draft helper as well',async()=>{
 const fetcher=vi.fn(async()=>Response.json({id,hotel:'TLKL',revision:1,package_changed:false,recipients:{to:[],cc:[],bcc:[]}}));vi.stubGlobal('fetch',fetcher);
 await expect(createGmailDraft({SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic'},owner,id,1)).rejects.toThrow('email_region_disabled');expect(fetcher).toHaveBeenCalledTimes(1);
});
