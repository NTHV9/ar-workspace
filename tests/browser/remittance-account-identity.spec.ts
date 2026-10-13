import {test,expect} from '@playwright/test';
import {auditWorkspace,auditLogin,auditRoute} from './fixtures/audit-workspace';
const accounts=[['one','100'],['two','200'],['dup-a','300'],['dup-b','300'],['blank-a',''],['blank-b',null]].map(([accountId,accountNo])=>({hotel:'TLKL',accountId:accountId!,name:'Synthetic Same Travel',type:'Agent',accountNo,verified:true}));
const value=(a:typeof accounts[number])=>JSON.stringify([a.hotel,a.accountId]);
const label=(a:typeof accounts[number])=>`TLKL · Synthetic Same Travel · ${a.accountNo||'ID '+a.accountId}${a.accountNo==='300'?' · ID '+a.accountId:''}`;
for(const width of [1440,390])test(`same-hotel Remittance account labels retain exact selections ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const controls=await auditWorkspace(page),reads:{path:string;account:string|null}[]=[];
 await page.route('**/api/remittances/options*',r=>r.fulfill({json:{accounts,config:{maxFileBytes:10485760,maxFiles:50,maxTotalFileBytes:104857600}}}));
 await page.route('**/api/**',r=>{const u=new URL(r.request().url());if(!u.pathname.startsWith('/api/remittances'))return r.fallback();reads.push({path:u.pathname,account:u.searchParams.get('accountId')});if(u.pathname==='/api/remittances/options')return r.fallback();return r.fulfill({json:u.pathname.endsWith('/invoices')?{rows:[],total:0}:{rows:[],total:0,summary:{documents:0,invoices:0,reportedAmount:'0.00',knownReportedAmount:'0.00',unspecifiedAmounts:0,linkedOpen:'0.00',knownLinkedOpen:'0.00',unverifiedInvoices:0}}});});
 await auditLogin(page);await auditRoute(page,'remittances=1&region=khao-lak');const filter=page.getByLabel('Remittance account filter',{exact:true});await expect(filter.locator('option')).toHaveCount(7);
 for(const a of accounts){await expect(filter.locator('option').filter({hasText:label(a)})).toHaveCount(1);await filter.selectOption(value(a));await expect.poll(()=>reads.filter(r=>r.path==='/api/remittances').at(-1)?.account).toBe(a.accountId);await expect(filter).toHaveValue(value(a));}
 await page.getByRole('button',{name:'Record remittance',exact:true}).click();const editor=page.getByLabel('Remittance account',{exact:true});await expect(editor.locator('option')).toHaveCount(7);
 for(const a of accounts){await expect(editor.locator('option').filter({hasText:label(a)})).toHaveCount(1);await editor.selectOption(value(a));await expect.poll(()=>reads.filter(r=>r.path.endsWith('/invoices')).at(-1)?.account).toBe(a.accountId);await expect(editor).toHaveValue(value(a));}
 expect(await editor.evaluate(e=>e.getBoundingClientRect().right)).toBeLessThanOrEqual(width-14);await page.screenshot({path:`.tmp/employee-audit-20261013/captures/remittance-account-identity-${width}.png`});expect(controls.writes.filter(w=>w.path.startsWith('/api/remittances'))).toEqual([]);
});


