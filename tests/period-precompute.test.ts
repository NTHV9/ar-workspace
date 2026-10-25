import {afterEach,expect,it,vi} from 'vitest';
import {warmPeriodSummaries} from '../worker/dashboard/precompute';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it.each(['phuket','khao-lak'] as const)('retired %s summary warming neither plans nor writes historical report caches',async region=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect(await warmPeriodSummaries(env,region)).toEqual({planned:0,completed:0,failed:0});expect(fetcher).not.toHaveBeenCalled();
});
