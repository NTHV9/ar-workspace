import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
for(const width of [1440,390])test(`Dashboard invoice number opens the exact invoice at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const fixture=await setupDashboard(page,{tabSession:true});
 const path='/?dashboard=1&dashboardView=period&hotel=TSK&dashboardDetail=balance&dashboardMetric=open&dashboardDetailHotel=TSK&dashboardDetailAccount=tsk-azure';
 await page.goto(path);
 const panel=page.getByRole('region',{name:'Dashboard invoice details',exact:true});
 await panel.getByRole('button',{name:'Open Invoice INV-tsk-old',exact:true}).click();
 await expect(page).toHaveURL(/focusInvoice=tsk-old/);
 await expect(page).toHaveURL(/property=TSK/);
 const details=page.getByRole(width<1000?'dialog':'complementary',{name:'Invoice details',exact:true});
 await expect(details).toBeVisible();await expect(details).toContainText('INV-tsk-old');
 if(width<1000)await page.keyboard.press('Escape');
 await page.locator('.account-page .breadcrumb').click();
 await expect(panel.getByRole('button',{name:'Open Invoice INV-tsk-old',exact:true})).toBeVisible();
 expect(new URL(page.url()).searchParams.get('focusInvoice')).toBeNull();
 expect(fixture.errors).toEqual([]);
});
