import {afterEach,expect,it,vi} from 'vitest';
import {isBalanceOnlyAccountType} from '../src/domain/account-policy';
import {requireRegionalDelivery} from '../worker/email/regional-delivery';
import {createDocumentJob} from '../worker/documents/jobs';
afterEach(()=>vi.unstubAllGlobals());
it('uses only the exact DRF type',()=>{
 for(const type of ['DRF'])expect(isBalanceOnlyAccountType(type)).toBe(true);
 for(const type of ['drf',' DRF','CON','CCR','EMP','NMK','REN',null,undefined,{}])expect(isBalanceOnlyAccountType(type)).toBe(false);
});
it('refuses server-held DRF before any provider or storage read',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo|URL)=>Response.json({error:'account_balance_only'}));vi.stubGlobal('fetch',fetcher);
 await expect(requireRegionalDelivery({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic'}, {id:'draft',hotel:'KAT',owner:'owner'})).rejects.toThrow('account_balance_only');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain('/ar_email_business_preflight');
});
it('returns the DRF document guard without dispatching a workflow',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'account_balance_only'})));const create=vi.fn();
 await expect(createDocumentJob({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic',AR_DOCUMENTS:{create,get:vi.fn()}},'owner',{commandKey:'synthetic',hotel:'KAT',accountId:'DRF',ids:['one'],content:'statement',layout:'combined',purpose:'billing'})).rejects.toThrow('account_balance_only');
 expect(create).not.toHaveBeenCalled();
});
