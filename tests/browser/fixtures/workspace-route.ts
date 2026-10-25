import {expect,type Page} from '@playwright/test';
import {seedTabSession,syntheticWorkspaceAccess,type SyntheticAuthUser} from './auth-session';
/** Current tab-scoped session + explicit backend staff contract, all synthetic. */
export async function currentWorkspaceSession(page:Page,user:SyntheticAuthUser,token='synthetic-token'){
 await seedTabSession(page,user,token);
 await page.route('**/api/access/me',r=>r.fulfill({json:syntheticWorkspaceAccess(user)}));
 await page.route('**/api/access/signature',r=>r.fulfill({json:{revision:1,enabled:false,signature:{staffId:user.id,name:'Synthetic Staff',title:'AR Officer',workplace:''}}}));
 await page.route('**/*',r=>{const url=new URL(r.request().url());return ['127.0.0.1','localhost','example.supabase.co'].includes(url.hostname)?r.fallback():r.abort('blockedbyclient');});
}
/** Enter a route through the same SPA transition used after sign-in. */
export async function openWorkspaceRoute(page:Page,url:string,_options?:unknown){
 await page.goto('/');await expect(page.getByRole('button',{name:'Aging',exact:true})).toBeVisible();
 const query=url.includes('?')?url.slice(url.indexOf('?')+1):'';
 if(query)await page.evaluate(q=>{history.pushState(null,'','/?'+q);dispatchEvent(new PopStateEvent('popstate'));},query);
}
