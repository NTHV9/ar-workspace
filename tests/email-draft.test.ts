import {expect,it} from 'vitest';
import {parseEmailDraft} from '../worker/email/validation';
const empty={to:[],cc:[],bcc:[]};
it('allows an incomplete workspace draft without inventing recipients',()=>{expect(parseEmailDraft({revision:0,purpose:'billing',recipients:empty,subject:'',body:''}).recipients).toEqual(empty);});
it('rejects header injection, invalid scope and stale-shaped inputs',()=>{for(const patch of [{subject:'hello\r\nBcc: x@example.test'},{purpose:'other'},{revision:-1}])expect(()=>parseEmailDraft({revision:0,purpose:'billing',recipients:empty,subject:'Hello',body:'Example',...patch})).toThrow();});
