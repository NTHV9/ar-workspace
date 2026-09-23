import {sendSignatureDiagnostic} from '../worker/email/delivery';
import {afterEach,expect,it,vi} from 'vitest';
import {parseSignature,signatureHtml,signatureText} from '../src/email/signature';
import {plainMessage,parseRichMessage,richHtml,richText} from '../src/email/rich-message';
import {buildMime} from '../worker/email/mime';
import {parseTemplate,starterTemplates} from '../src/email/templates';
import {accessApi} from '../worker/access/api';
import {emailApi} from '../worker/email/api';
import {verifySentEvidence} from '../worker/email/sent-evidence';
import {url64,hash} from '../worker/email/crypto';
import {signatureLogoFile} from '../worker/email/signature-logo';
import {HOTEL_IDS,hotelName} from '../src/domain/hotels';
import {signatureWorkplace} from '../src/email/signature';
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const signature={staffId:actor,name:'Synthetic Staff',title:'AR Officer',workplace:'Synthetic hotel'};
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('keeps personal signature separate from editable body and captures both MIME representations once',()=>{
 const richBody=parseRichMessage({...plainMessage('Dear customer,\nPlease review.'),signature}),body=richText(richBody);
 const raw=new TextDecoder().decode(buildMime({revision:1,purpose:'billing',recipients:{to:['recipient@example.invalid'],cc:[],bcc:[]},subject:'Synthetic',body,richBody},[],'<00000000-0000-4000-8000-000000000003@ar-workspace.ar-c82.workers.dev>'));
 const parts=[...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)].map(m=>Buffer.from(m[1].replace(/\s/g,''),'base64').toString('utf8'));
 expect(parts.slice(0,2)).toEqual([body,richHtml(richBody)]);expect(parts).toHaveLength(3);expect(raw).toContain('Content-ID: <katathani-signature-logo>');expect(body.split(signature.name)).toHaveLength(2);
 expect(richBody.blocks).toEqual(plainMessage('Dear customer,\nPlease review.').blocks);
 expect(signatureHtml(signature)).toContain('cid:katathani-signature-logo');expect(signatureHtml(signature).indexOf('<img')).toBeLessThan(signatureHtml(signature).indexOf('Synthetic Staff'));expect(signatureText(signature)).toContain('AR Officer');
});
it('escapes staff fields and rejects hidden images, foreign fields and shared-template signatures',()=>{
 expect(signatureHtml({...signature,name:'<img src=x onerror=alert(1)>'})).toContain('&lt;img');
 for(const patch of [{title:'x\ny'},{staffId:'bad'},{workplace:'x'.repeat(201)},{html:'<script>'},{banner:true}])expect(()=>parseSignature({...signature,...patch})).toThrow();
 expect(()=>parseTemplate({...starterTemplates[0],richBody:{...starterTemplates[0].richBody,signature}})).toThrow('template_invalid');
});
it('requires the exact signature in sent evidence and never treats a changed signature as verified',async()=>{
 const richBody={...plainMessage('Synthetic body'),signature},body=richText(richBody),messageId='<00000000-0000-4000-8000-000000000003@ar-workspace.ar-c82.workers.dev>';
 const logo=signatureLogoFile();const expected={messageId,subject:'Synthetic',body,richBody,files:[{name:logo.name,byte_count:logo.bytes.length,sha256:await hash(logo.bytes),inlineId:logo.inlineId}],recipients:{to:['recipient@example.invalid'],cc:[],bcc:[]}};
 const message={id:'synthetic',labelIds:['SENT'],internalDate:String(Date.now()-1000),payload:{headers:[{name:'Message-ID',value:messageId},{name:'From',value:'ar@katathani.com'},{name:'To',value:'recipient@example.invalid'},{name:'Subject',value:'Synthetic'}],parts:[{mimeType:'image/png',filename:logo.name,headers:[{name:'Content-ID',value:'<'+logo.inlineId+'>'}],body:{size:logo.bytes.length,data:url64(logo.bytes)}},{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(body))}},{mimeType:'text/html',body:{data:url64(new TextEncoder().encode(richHtml(richBody)))}}]}};
 expect(await verifySentEvidence(message,expected,async()=>new Uint8Array())).toMatchObject({status:'verified'});
 message.payload.parts[2].body.data=url64(new TextEncoder().encode(richHtml({...richBody,signature:{...signature,name:'Different person'}})));
 expect(await verifySentEvidence(message,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required',reason:'message_html'});
});
it('uses the authenticated staff ID for self-service and rejects another user or cross-origin updates',async()=>{
 const f=vi.fn(async()=>Response.json({revision:1,enabled:true,signature}));vi.stubGlobal('fetch',f);
 const request=(sig=signature,origin='https://app.test')=>new Request('https://app.test/api/access/signature',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:0,enabled:true,signature:sig})});
 expect((await accessApi(request(),env,actor,'staff@example.invalid')).status).toBe(200);
 expect((await accessApi(request({...signature,staffId:other}),env,actor,'staff@example.invalid')).status).toBe(403);
 expect((await accessApi(request(signature,'https://other.test'),env,actor,'staff@example.invalid')).status).toBe(403);expect(f).toHaveBeenCalledTimes(1);
});
it('cannot save an email with another staff member’s signature',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);const richBody={...plainMessage('Synthetic'),signature:{...signature,staffId:other}};
 const r=await emailApi(new Request('https://app.test/api/email/'+other,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:1,purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic',body:richText(richBody),richBody})}),{...env,REQUEST_ACTOR:actor},actor);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'email_signature_changed'});expect(f).not.toHaveBeenCalled();
});

it('resolves the signature workplace from each hotel, never the region or a staff-entered fallback',()=>{
 for(const hotel of HOTEL_IDS)expect(signatureWorkplace(hotel)).toBe(hotelName(hotel));
 expect(signatureWorkplace('KAT')).not.toBe(signatureWorkplace('TSK'));
 expect(()=>signatureWorkplace('Unknown')).toThrow('signature_hotel_unavailable');
});

it('signature diagnostics replay an existing delivery and reject changing its recipient or hotel',async()=>{
 const recipient='synthetic-preview@example.invalid',recipientHash=await hash(new TextEncoder().encode(JSON.stringify({to:[recipient],cc:[],bcc:[]})));
 const f=vi.fn(async()=>Response.json({id:other,mode:'test',state:'sent',stage:null,snapshot:{expected:{recipientHash,signatureHotel:'KAT'}}}));vi.stubGlobal('fetch',f);
 expect(await sendSignatureDiagnostic(env,actor,other,recipient,'KAT')).toMatchObject({state:'sent',recorded:false});expect(f).toHaveBeenCalledTimes(1);
 await expect(sendSignatureDiagnostic(env,actor,other,recipient,'TSK')).rejects.toThrow('email_test_command_conflict');
 await expect(sendSignatureDiagnostic(env,actor,other,'different@example.invalid','KAT')).rejects.toThrow('email_test_command_conflict');
 await expect(sendSignatureDiagnostic(env,actor,other,recipient,'Unknown')).rejects.toThrow('email_invalid');
 expect(f).toHaveBeenCalledTimes(3);
});
