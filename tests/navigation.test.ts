import {expect,it} from 'vitest';
import {hasAuthCallback,initialWorkspaceParams} from '../src/navigation';
it('opens bare entry and Google callbacks on Current Aging without retaining callback codes',()=>{
 for(const search of ['', 'code=synthetic-code', 'error=access_denied&error_description=Synthetic']){
  const original=new URLSearchParams(search),result=initialWorkspaceParams(original);
  expect(result.toString()).toBe('dashboard=1&dashboardView=aging');expect(original.toString()).toBe(search);
 }
 expect(hasAuthCallback(new URLSearchParams('code=synthetic-code'))).toBe(true);
 expect(hasAuthCallback(new URLSearchParams('portfolio=1'))).toBe(false);
});
it.each(['portfolio=1','region=khao-lak&hotel=TLKL','account=A&property=KAT','collections=1','usersAccess=1','reports=1','documentJob=synthetic&compose=1','recover=1','mode=review','dashboard=1&dashboardView=period'])('preserves explicit or legacy destinations: %s',search=>{
 expect(initialWorkspaceParams(new URLSearchParams(search)).toString()).toBe(search);
});
it('keeps recovery and document callbacks on their intended page while leaving SDK transport in the browser',()=>{
 for(const search of ['recover=1','documentJob=synthetic&compose=1'])expect(initialWorkspaceParams(new URLSearchParams(search+'&code=synthetic-code')).toString()).toBe(search);
 expect(initialWorkspaceParams(new URLSearchParams('financial=1')).get('dashboardDetail')).toBe('payments');
});
