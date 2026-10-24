import {describe,it,expect} from 'vitest';
import {defaultSelfCc,initialEmailRecipients} from '../src/email/default-recipients';
import {HOTEL_IDS} from '../src/domain/hotels';
import {parseRecipients,type Recipients} from '../worker/settings/validation';

const recipients=():Recipients=>({to:['customer@example.test'],cc:['colleague@example.test'],bcc:['archive@example.test']});
const draft=(extra:Record<string,unknown>={})=>({hotel:'KAT',revision:0,package_changed:false,recipients:recipients(),...extra});

describe('regional self CC defaults',()=>{
 for(const hotel of HOTEL_IDS)it(`uses the hotel's sending mailbox for ${hotel}`,()=>{
  const source=recipients(),expected=['KAT','TSK'].includes(hotel)?'ar@katathani.com':'ar@thesandskhaolak.com';
  const result=defaultSelfCc(hotel,source);
  expect(result).toEqual({...source,cc:['colleague@example.test',expected]});
  expect(parseRecipients(result)).toEqual(result);
  expect(source).toEqual(recipients());
  expect(defaultSelfCc(hotel,result)).toBe(result);
 });
 for(const field of ['to','cc','bcc'] as const)it(`keeps one required CC when self already appears in ${field}`,()=>{
  const source={...recipients(),[field]:[' AR@KATATHANI.COM ']};
  const result=defaultSelfCc('KAT',source);
  expect(result.cc.filter(s=>s==='ar@katathani.com')).toHaveLength(1);
  expect([...result.to,...result.cc,...result.bcc].filter(s=>s.trim().toLowerCase()==='ar@katathani.com')).toHaveLength(1);
  expect(parseRecipients(result)).toEqual(result);
  expect(source[field]).toEqual([' AR@KATATHANI.COM ']);
 });
 it('fails closed for an unknown hotel instead of falling back to another region',()=>{
  expect(()=>defaultSelfCc('UNKNOWN',recipients())).toThrow('email_invalid');
 });
 it('includes required CC for both new and saved editable workspaces',()=>{
  const source=draft();expect(initialEmailRecipients(source).cc).toContain('ar@katathani.com');
  const removed={...source,revision:1,recipients:{to:source.recipients.to,cc:[],bcc:[]}};
  expect(initialEmailRecipients(removed)).toEqual({...removed.recipients,cc:['ar@katathani.com']});
 });
 for(const extra of [{gmail_handoff:'created'},{gmail_handoff:'awaiting_evidence'},{delivery:{state:'sent'}},{package_changed:true},{document_closed_at:'2026-10-25T00:00:00Z'}])it(`preserves existing/blocked preparation ${JSON.stringify(extra)}`,()=>{
  const source=draft(extra);expect(initialEmailRecipients(source)).toBe(source.recipients);
 });
});
