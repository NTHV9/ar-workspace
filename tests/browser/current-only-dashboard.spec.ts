import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
import {syntheticManagement} from '../fixtures/management-dashboard';

for(const width of [1440,390])test(`current dashboard at ${width} keeps billing, age, stages and invoice detail without period report reads`,async({page})=>{
 await page.setViewportSize({width,height:900});const fixture=await setupDashboard(page,{tabSession:true});
 await page.route('**/api/dashboard/management?*',route=>{const q=new URL(route.request().url()).searchParams;return route.fulfill({json:{...syntheticManagement('phuket',q.get('from')!,q.get('to')!),mode:'current'}});});
 await page.goto('/?dashboard=1&dashboardFrom=2020-01-01&dashboardTo=2020-01-31&dashboardDetail=payments');
 const management=page.getByRole('region',{name:'Management summary',exact:true});
 await expect(management.getByRole('button',{name:'View outstanding',exact:true})).toContainText('2,000.00');
 await expect(page.getByRole('region',{name:'Outstanding billing progress',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Hotel aging chart',exact:true})).toBeVisible();
 await expect(page.locator('input[type=date]')).toHaveCount(0);await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toHaveCount(0);
 await page.locator('.management-exact-figures>summary').click();await expect(page.getByRole('region',{name:'Hotel aging summary',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Period invoice billing summary',exact:true})).toHaveCount(0);
 await page.locator('.management-more>summary').click();
 await expect(page.getByRole('region',{name:'Current follow-up stages',exact:true})).toContainText('Final');
 await page.getByRole('button',{name:'View not yet billed',exact:true}).click();
 const detail=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(detail).toContainText('Azure Travel');
 await detail.getByRole('button',{name:'Open Azure Travel · Synthetic · KAT · Account SYN-A',exact:true}).click();
 await expect(detail).toContainText('INV-kat-parent');await expect(detail).toContainText('Not billed');
 for(const call of fixture.calls.filter(c=>c.path==='/api/dashboard/management')){expect(call.query.get('from')).toBe('2026-09-12');expect(call.query.get('to')).toBe('2026-09-12');}
 for(const call of fixture.calls.filter(c=>c.path==='/api/dashboard/hotel-overview'))expect(call.query.get('segment')).toBe('balances');
 expect(fixture.calls.filter(c=>c.path.startsWith('/api/financial/')||['/api/reports/activity','/api/external-billing','/api/dashboard/invoice-entries','/api/dashboard/payment-invoices'].includes(c.path))).toEqual([]);
 expect(fixture.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await page.screenshot({path:`.tmp/current-only-reports/dashboard-top-${width}.png`});
 await page.screenshot({path:`.tmp/current-only-reports/dashboard-${width}.png`,fullPage:true});
});

test('Aging remains available and legacy Reports tabs fall back to Sheets',async({page})=>{
 const fixture=await setupDashboard(page,{tabSession:true});
 await page.route('**/api/reports/sheets',route=>route.fulfill({json:{rows:[]}}));
 await page.route('**/api/reports/tracker?*',route=>route.fulfill({json:{connected:false,enabled:false,available:false,revision:0,lastCheckedAt:null,pending:0,conflictCount:0,conflicts:[]}}));
 await page.goto('/?dashboard=1&dashboardView=aging');await expect(page.getByRole('heading',{name:'Aging',exact:true})).toBeVisible();
 await expect.poll(()=>fixture.calls.filter(c=>c.path==='/api/dashboard/aging-invoices').length).toBeGreaterThan(0);
 for(const query of ['financial=1','observations=1']){await page.goto('/?'+query);await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toHaveCount(0);await expect(page.locator('input[type=date]')).toHaveCount(0);}
 await page.goto('/?reports=1&reportsTab=external&externalBilling=1');
 await expect(page.getByRole('region',{name:'Google Sheets',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'External billing activity',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Invoice Register',exact:true})).toBeVisible();
 expect(fixture.calls.filter(c=>c.path==='/api/external-billing'||c.path.startsWith('/api/financial/')||c.path.startsWith('/api/observations/'))).toEqual([]);expect(fixture.errors).toEqual([]);
});
