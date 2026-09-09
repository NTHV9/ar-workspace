import {test,expect,type Page} from '@playwright/test';
import {starterTemplates,type EmailTemplate} from '../../src/email/templates';
async function setup(page:Page,unavailable=false){
 const user={id:'00000000-0000-4000-8000-000000000009',email:'ar@katathani.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-09T00:00:00Z'};
 const versions:EmailTemplate[]=[],calls:string[]=[];
 await page.addInitScript(u=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u})),user);
 await page.route('https://example.supabase.co/**',r=>r.fulfill({json:{user}}));
 await page.route('**/api/**',async r=>{const q=r.request(),url=new URL(q.url()),p=url.pathname;calls.push(q.method()+' '+p);
  if(p==='/api/config')return r.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'synthetic'}});
  if(p==='/api/refresh')return r.fulfill({json:{jobs:[],running:false,hotels:[]}});
  if(p==='/api/portfolio')return r.fulfill({json:{status:'connected',accounts:[],refresh:{running:false,hotels:[]}}});
  if(p.startsWith('/api/email/templates')){
   if(unavailable)return r.fulfill({status:503,json:{error:'template_unavailable'}});
   if(q.method()==='PUT'){const v=q.postDataJSON();const saved={...v.content,id:p.split('/').at(-1),revision:versions.length+1,updated_at:'2026-09-09T22:00:00Z'};versions.unshift(saved);return r.fulfill({json:saved});}
   return r.fulfill({json:{items:p==='/api/email/templates'?versions.slice(0,1):versions,nextOffset:null}});
  }
  return r.fulfill({status:501,json:{error:'unmocked'}});
 });return {calls,versions};
}
for(const width of [1440,1280,390])test(`template library ${width}: versions, editable old copy and no sends`,async({page})=>{
 const {calls,versions}=await setup(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto('/?templates=1');
 await expect(page.getByRole('heading',{name:'Email templates',exact:true})).toBeVisible();await expect(page.getByText('No saved templates yet.',{exact:false})).toBeVisible();
 await page.getByLabel('Template name',{exact:true}).fill('Synthetic billing template');await page.getByRole('button',{name:'Save template version',exact:true}).click();await expect(page.getByRole('status')).toContainText('Version 1 saved');
 await page.getByLabel('Template subject',{exact:true}).fill('Synthetic updated {{hotel}}');await page.getByRole('button',{name:'Save template version',exact:true}).click();await expect(page.getByRole('status')).toContainText('Version 2 saved');
 await page.getByRole('button',{name:'View version history',exact:true}).click();await page.getByRole('button',{name:'Use this version as a new draft',exact:true}).filter({hasNot:page.locator('[disabled]')}).last().click();
 await expect(page.getByLabel('Template subject',{exact:true})).toHaveValue(starterTemplates[0].subject);expect(versions).toHaveLength(2);
 await page.getByRole('button',{name:'Save template version',exact:true}).click();await expect(page.getByRole('status')).toContainText('Version 3 saved');
 await expect(page.getByRole('textbox',{name:'Template message',exact:true})).toBeVisible();expect(calls.some(c=>/gmail|\/send/.test(c))).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`evidence/email-templates-${width}.png`,fullPage:true});
});
test('template error retains message and never substitutes data',async({page})=>{const {calls}=await setup(page,true);await page.goto('/?templates=1');await expect(page.getByRole('alert')).toContainText('unavailable');await page.getByLabel('Template subject',{exact:true}).fill('Retain my edits');await page.getByRole('button',{name:'Save template version',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unavailable');await expect(page.getByLabel('Template subject',{exact:true})).toHaveValue('Retain my edits');expect(calls.some(c=>c.endsWith('/send'))).toBe(false);});
