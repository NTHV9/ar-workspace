import {test,expect} from '@playwright/test';

for(const flow of ['single','separate','combined'])for(const width of [1440,1280,390])test(`${flow} result layout and manual return at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});
 const external:string[]=[];await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`/tests/browser/email-send-result/harness.html?flow=${flow}`);
 const heading=page.getByRole('heading',{name:flow==='separate'?'Email results':'Email sent',exact:true});
 if(flow==='separate')await expect(heading.last()).toBeVisible();else await expect(heading).toBeVisible();
 await expect(page.locator('.email-send-result h2')).toBeFocused();await page.locator('.email-send-result h2').press('Tab');
 const back=page.getByRole('button',{name:'Back to Collections',exact:true});await expect(back).toBeFocused();await expect(back).toBeEnabled();await expect(back).toBeInViewport();
 await expect(page.getByRole('textbox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Send now',exact:true})).toHaveCount(0);await expect(page.getByText('Back requested',{exact:true})).toHaveCount(0);
 for(const detail of await page.locator('.email-send-result details').all())await detail.locator('summary').click();
 await page.locator(flow==='single'?'.email-workspace':'.batch-content').evaluate(el=>{el.scrollTop=0;});
 await expect(page.locator('.email-send-result h2')).toBeInViewport();await expect(back).toBeInViewport();
 const fit=await page.evaluate(()=>({document:document.documentElement.scrollWidth<=innerWidth+1,result:[...document.querySelectorAll<HTMLElement>('.email-send-result')].every(el=>el.scrollWidth<=el.clientWidth+1)}));
 expect(fit).toEqual({document:true,result:true});await page.screenshot({path:`.superpowers/sdd/2026-10-26-email-send-summary/visual/${flow}-${width}.png`,fullPage:true});
 await back.click();await expect(page.getByText('Back requested',{exact:true})).toBeVisible();expect(external).toEqual([]);
});
