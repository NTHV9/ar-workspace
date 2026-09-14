import {afterEach,expect,it,vi} from 'vitest';
import {backendRpc} from '../worker/refresh/backend';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('retains bounded financial error codes without retaining source response details',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({message:'financial_payment_observation_conflict',details:'private source data'},{status:400}));
 await expect(backendRpc(env,'ar_financial_publish',{})).rejects.toThrow(/^financial_payment_observation_conflict$/);
});
it.each(['private source data','financial_error private value','financial_invoice_12345','financial_'+ 'a'.repeat(81)])('hides non-code database messages: %s',async message=>{
 vi.stubGlobal('fetch',async()=>Response.json({message},{status:400}));
 await expect(backendRpc(env,'ar_financial_publish',{})).rejects.toMatchObject({stage:'database_ar_financial_publish'});
});
it('does not forward financial-looking messages from unrelated RPCs',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({message:'financial_payment_observation_conflict'},{status:400}));
 await expect(backendRpc(env,'ar_document_save',{})).rejects.toMatchObject({stage:'database_ar_document_save'});
});
