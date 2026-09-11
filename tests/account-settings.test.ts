import {expect,it} from 'vitest';
import {parseSettings} from '../worker/settings/validation';
const empty={to:[],cc:[],bcc:[]};
const sample={revision:0,billingRequired:null,creditTerm:null,billingRecipients:empty,collectionRecipients:empty};
it('keeps unconfigured and zero-day terms distinct',()=>{expect(parseSettings(sample).creditTerm).toBeNull();expect(parseSettings({...sample,creditTerm:0}).creditTerm).toBe(0);});
it('requires explicit recipient arrays without an OPERA fallback',()=>{expect(parseSettings(sample).billingRecipients).toEqual(empty);expect(()=>parseSettings({...sample,billingRecipients:{to:'someone@example.test'}})).toThrow();});
it('rejects email header injection and invalid terms',()=>{expect(()=>parseSettings({...sample,billingRecipients:{...empty,to:['a@example.test\r\nBcc: b@example.test']}})).toThrow();for(const creditTerm of [-1,1.5,'30'])expect(()=>parseSettings({...sample,creditTerm})).toThrow();});
it('normalizes surrounding recipient whitespace and rejects duplicates',()=>{expect(parseSettings({...sample,billingRecipients:{...empty,to:[' a@example.test ']}}).billingRecipients.to).toEqual(['a@example.test']);expect(()=>parseSettings({...sample,billingRecipients:{...empty,to:['a@example.test'],cc:['A@example.test']}})).toThrow();});
