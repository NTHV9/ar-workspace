import {expect,type Locator,type Page} from '@playwright/test';

async function inspect(root:Locator){
 return root.evaluate(element=>{
  const rgba=(color:string)=>{const n=color.match(/[\d.]+/g)?.map(Number)??[0,0,0];return [n[0],n[1],n[2],n[3]??1];};
  const over=(a:number[],b:number[])=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
  const backdrop=(el:Element|null):number[]=>{if(!el)return [255,255,255,1];return over(rgba(getComputedStyle(el).backgroundColor),backdrop(el.parentElement));};
  const luminance=(color:number[])=>color.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const button=element as HTMLButtonElement,style=getComputedStyle(button),parent=backdrop(button.parentElement),bg=over(rgba(style.backgroundColor),parent),fg=over(rgba(style.color),bg),opacity=Number(style.opacity);
  const visibleBg=over([...bg.slice(0,3),opacity],parent),visibleFg=over([...fg.slice(0,3),opacity],parent),l=[luminance(visibleBg),luminance(visibleFg)].sort((a,b)=>a-b);
  return {text:button.textContent?.trim()||button.getAttribute('aria-label'),disabled:button.matches(':disabled'),primary:button.matches('.primary-button,.pdf-primary'),color:style.color,background:style.backgroundColor,opacity,ratio:(l[1]+.05)/(l[0]+.05)};
 });
}
/** Visibility regression, including disabled appearance; not a whole-page WCAG audit. */
export async function assertButtonVisibility(page:Page,root:Locator){
 await expect(root).toBeVisible();
 await page.mouse.move(0,0);
 const buttons=root.locator('button');let checked=0;
 for(const button of await buttons.all()){
  if(!await button.isVisible()||!(await button.textContent())?.trim())continue;
  const normal=await inspect(button);expect(normal.ratio,JSON.stringify(normal)).toBeGreaterThanOrEqual(normal.disabled?1.5:normal.primary?4.5:3);checked++;
  if(normal.disabled){await button.hover();const disabledHover=await inspect(button);expect(disabledHover.ratio,JSON.stringify(disabledHover)).toBeGreaterThanOrEqual(1.5);await page.mouse.move(0,0);continue;}
  if(!normal.primary)continue;
  await button.hover();const hovered=await inspect(button);expect(hovered.ratio,JSON.stringify(hovered)).toBeGreaterThanOrEqual(4.5);
  await page.mouse.move(0,0);await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(button).toBeFocused();
  expect(await button.evaluate(el=>el.matches(':focus-visible'))).toBe(true);const focused=await inspect(button);expect(focused.ratio,JSON.stringify(focused)).toBeGreaterThanOrEqual(4.5);
 }
 expect(checked).toBeGreaterThan(0);
}
