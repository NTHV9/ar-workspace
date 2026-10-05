import {test,expect} from '@playwright/test';
import {auditWorkspace,auditLogin,auditRoute} from './fixtures/audit-workspace';

const links=[{region:'phuket',url:'https://docs.google.com/spreadsheets/d/synthetic_phuket_sheet_12345/edit'},{region:'khao-lak',url:'https://docs.google.com/spreadsheets/d/synthetic_khaolak_sheet_12345/edit'}];
test.beforeEach(async({page})=>{await page.route('**/api/reports/tracker?*',r=>r.fulfill({json:{connected:false,enabled:false,available:false,revision:0,lastCheckedAt:null,pending:0,conflictCount:0,conflicts:[]}}));});
for(const width of [1280,390])test(`Reports Google Sheets ${width}: separate manual files open in a new tab`,async({page,context})=>{
 await page.setViewportSize({width,height:800});const {writes}=await auditWorkspace(page);const linkRequests:string[]=[];
 await page.route('**/api/reports/sheets',r=>{linkRequests.push(r.request().method());return r.fulfill({json:{rows:links}});});
 await context.route('https://docs.google.com/spreadsheets/d/synthetic_*/edit',r=>r.fulfill({contentType:'text/html',body:'<title>Synthetic spreadsheet destination</title><p>Synthetic test destination</p>'}));
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=sheets');
 const nav=page.getByRole('navigation',{name:'Reports views'}),section=page.getByRole('region',{name:'Google Sheets'});
 await expect(nav.getByRole('button',{name:'Google Sheets',exact:true})).toHaveAttribute('aria-pressed','true');await expect(nav.getByRole('button',{name:'Invoice Register',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(section).toContainText('OPERA remains the source for invoice balances.');await expect(section.getByRole('link')).toHaveCount(2);await expect(section.locator('iframe')).toHaveCount(0);
 for(const [index,label] of ['Phuket','Khao Lak'].entries()){
  const link=section.getByRole('link',{name:`Open ${label} Google Sheet (opens in a new tab)`});await expect(link).toHaveAttribute('href',links[index].url);await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toHaveAttribute('target','_blank');
  const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;await expect(popup).toHaveURL(links[index].url);await expect(popup).toHaveTitle('Synthetic spreadsheet destination');await popup.close();await expect(page).toHaveURL(/reportsTab=sheets/);
 }
 expect(writes.filter(w=>/invoice-register|reports\/sheets|email|documents|remittances/.test(w.path))).toHaveLength(0);expect(linkRequests).toEqual(['GET']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.tmp/report-sheet-links/reports-${width}.png`,fullPage:false});
 await nav.getByRole('button',{name:'Invoice Register',exact:true}).click();await expect(nav.getByRole('button',{name:'Invoice Register',exact:true})).toHaveAttribute('aria-pressed','true');await expect(section).toHaveCount(0);
});

test('sheet links recover from a read error and show only the returned regional file',async({page})=>{
 await auditWorkspace(page);let failed=true;
 await page.route('**/api/reports/sheets',r=>failed?r.fulfill({status:503,json:{error:'synthetic_unavailable'}}):r.fulfill({json:{rows:[links[1]]}}));
 await auditLogin(page);await auditRoute(page,'reports=1&reportsTab=sheets');await expect(page.getByRole('alert')).toContainText('Google Sheets links could not be loaded.');failed=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
 const section=page.getByRole('region',{name:'Google Sheets'});await expect(section.getByRole('link')).toHaveCount(1);await expect(section.getByRole('heading',{name:'Khao Lak',exact:true})).toBeVisible();await expect(section.getByRole('heading',{name:'Phuket',exact:true})).toHaveCount(0);
});
