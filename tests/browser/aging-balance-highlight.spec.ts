import {test,expect,type Locator,type Page} from '@playwright/test';
import type {Account} from '../../src/domain/portfolio';
import {setupDashboard} from './fixtures/dashboard-period';
import {currentAgingVisualAccounts} from './fixtures/current-aging';

const coral='rgb(255, 237, 232)';
const aged=/\bhas-aged-balance\b/;
const ranges=['0–30','31–60','61–90','91–120','121–150','151+'];
function extra(hotel:'KAT'|'TSK',type:string,values:number[],verified=true):Account{
 const source=currentAgingVisualAccounts[0],id=`highlight-${type.toLowerCase().replaceAll(' ','-')}-${hotel}`;
 return {...source,hotel,id,name:`${type} · Synthetic`,account_no:`SYN-HIGHLIGHT-${type}`,type,open:values.reduce((sum,n)=>sum+n,0),verification_state:verified?'verified':'missing',agingBuckets:source.agingBuckets!.map((b,index)=>({...b,amount:values[index],debit:Math.max(0,values[index]),credit:Math.min(0,values[index])}))};
}
const accounts=[...currentAgingVisualAccounts,
 extra('KAT','Coverage gap',[0,0,0,0,0,120]),extra('TSK','Coverage gap',[0,0,0,0,0,80],false),
 extra('KAT','Credit offset',[0,0,0,75,0,0]),extra('TSK','Credit offset',[0,0,0,-75,0,0]),
];
const value=(table:Locator,name:string,hotel:string,range:string)=>table.getByRole('button',{name:`${name} · ${hotel} · ${range}`,exact:true});
const cell=(button:Locator)=>button.locator('..');
async function highlighted(button:Locator){
 await expect(cell(button)).toHaveClass(aged);
 await expect(cell(button)).toHaveCSS('background-color',coral);
 await expect(button.locator('strong')).toHaveCSS('color','rgb(143, 56, 45)');
}
async function notHighlighted(button:Locator){await expect(cell(button)).not.toHaveClass(aged);}
async function readable(button:Locator){
 const ratios=await button.evaluate(element=>{
  const color=(text:string)=>{const parts=text.match(/[\d.]+/g);return parts?parts.map(Number):[];};
  const luminance=(rgb:number[])=>rgb.slice(0,3).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const own=color(getComputedStyle(element).backgroundColor),background=own.length<4||own[3]!==0?own:color(getComputedStyle(element.parentElement!).backgroundColor),bg=luminance(background);
  return [...element.querySelectorAll('strong,small')].map(node=>{const fg=luminance(color(getComputedStyle(node).color));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
 });
 expect(ratios.length).toBeGreaterThan(0);
 expect(Math.min(...ratios),'amount and percentage remain readable').toBeGreaterThanOrEqual(4.5);
}
async function fits(page:Page,table:Locator){
 for(const range of ranges)await expect(table).toContainText(range);
 expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'all aging ranges fit the comparison').toBe(true);
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'dashboard has no horizontal overflow').toBe(true);
}

for(const width of [1440,1280,390])test(`positive aging balances above 90 days stay highlighted and drillable at ${width}`,async({page})=>{
 test.setTimeout(60000);
 const controls=await setupDashboard(page),writes:string[]=[],accountReads:string[]=[],openRefreshes:unknown[]=[];
 await page.route('**/api/**',route=>{
  const request=route.request();
  if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/refresh'){
   const body=request.postDataJSON();
   if(body?.reason==='open'&&body?.hotel==='All'){
    // The app checks freshness once on opening; the fixture returns no refresh jobs.
    openRefreshes.push(body);return route.fallback();
   }
  }
  if(request.method()!=='GET'){writes.push(`${request.method()} ${new URL(request.url()).pathname}`);return route.fulfill({status:405,json:{error:'synthetic_read_only'}});}
  if(new URL(request.url()).pathname.startsWith('/api/accounts/'))accountReads.push(new URL(request.url()).pathname);
  return route.fallback();
 });
 await page.route('**/api/portfolio',route=>{
  if(route.request().method()!=='GET'){writes.push('non-GET synthetic portfolio');return route.fulfill({status:405});}
  return route.fulfill({json:{status:'connected',accounts,refresh:{running:false,hotels:['KAT','TSK'].map(hotel=>({hotel,status:'succeeded',last_success_at:'2026-09-12T02:59:00Z'}))}}});
 });
 await page.route('**/api/accounts/TSK/visual-azure-tsk',route=>{
  accountReads.push('/api/accounts/TSK/visual-azure-tsk');
  if(route.request().method()!=='GET'){writes.push('non-GET synthetic account');return route.fulfill({status:405});}
  return route.fulfill({json:{invoices:[{hotel:'TSK',account_id:'visual-azure-tsk',id:'highlight-tsk-old',invoice_no:'SYN-HIGHLIGHT-TSK-151',folio_no:'SYN-FOLIO',guest:'Synthetic guest',transaction_date:'2026-04-01',open:404000,original:404000,age:164,collection_role:'standalone',verification_state:'verified'}]}});
 });
 await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});
 await page.goto('/?dashboard=1&dashboardView=aging');
 const table=page.getByRole('table',{name:'Current source aging comparison'});
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(4);
 if(width>1050){
  await expect(table.locator('thead th').last()).toContainText('Net open');
  await expect(table.locator('tbody').first().locator('.aging-row-hotel')).toHaveText(['KAT','TSK','Total']);
 }else{
  await expect(table.locator('thead .aging-property-label')).toHaveText(['KAT','TSK','Total']);
  await expect(table.locator('tbody').first().locator('tr').last().locator('th')).toHaveText('Net open');
 }

 for(const hotel of ['KAT','TSK','Total'])for(const range of ranges.slice(3))await highlighted(value(table,'Agent',hotel,range));
 for(const hotel of ['KAT','TSK','Total'])for(const range of ranges.slice(0,3))await notHighlighted(value(table,'Agent',hotel,range));
 await expect(table.locator('td.has-aged-balance .aging-net-value')).toHaveCount(0);
 await notHighlighted(value(table,'Corporate','KAT','121–150'));
 await expect(value(table,'Corporate','KAT','121–150').locator('strong')).toHaveText('-7,000.00');
 await expect(value(table,'Corporate','TSK','151+')).toBeDisabled();
 await notHighlighted(value(table,'Corporate','TSK','151+'));
 await highlighted(value(table,'Coverage gap','KAT','151+'));
 for(const hotel of ['TSK','Total']){
  await notHighlighted(value(table,'Coverage gap',hotel,'151+'));
  await expect(value(table,'Coverage gap',hotel,'151+')).toHaveText('—Unverified');
 }
 await highlighted(value(table,'Credit offset','KAT','91–120'));
 await notHighlighted(value(table,'Credit offset','TSK','91–120'));
 await notHighlighted(value(table,'Credit offset','Total','91–120'));
 await expect(value(table,'Credit offset','Total','91–120').locator('strong')).toHaveText('0.00');
 await fits(page,table);

 await page.getByRole('button',{name:'Compare 91–120 days',exact:true}).click();
 const selected=value(table,'Agent','Total','91–120');
 await highlighted(selected);
 await readable(selected);
 await expect(selected.locator('small')).toHaveCSS('color','rgb(135, 80, 71)');
 await selected.hover();await expect(cell(selected)).toHaveClass(aged);await expect(cell(selected)).toHaveCSS('background-color',coral);await readable(selected);
 await page.keyboard.press('Tab');await selected.focus();await expect(selected).toBeFocused();
 await expect(selected).toHaveCSS('outline-style','solid');await readable(selected);

 await table.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(2);
 for(const hotel of ['KAT','TSK','Total'])for(const range of ranges.slice(3))await highlighted(value(table,'Azure Travel · Synthetic',hotel,range));
 await notHighlighted(value(table,'Birch · Synthetic','KAT','121–150'));
 await notHighlighted(value(table,'Birch · Synthetic','TSK','91–120'));
 await highlighted(value(table,'Birch · Synthetic','Total','91–120'));
 await highlighted(value(table,'Birch · Synthetic','Total','121–150'));
 await notHighlighted(value(table,'Birch · Synthetic','KAT','31–60'));
 await fits(page,table);
 await page.locator('.aging-comparison-frame').scrollIntoViewIfNeeded();
 // Account names label the clipped artifact as synthetic; the fixed test badge would cover a value.
 await page.getByLabel('Synthetic test data',{exact:true}).evaluate(element=>element.style.visibility='hidden');
 await page.locator('.aging-comparison-frame').screenshot({path:`evidence/aging-column-order-${width}.png`,animations:'disabled'});

 await value(table,'Azure Travel · Synthetic','TSK','151+').click();
 await page.mouse.move(0,0);
 await expect(page.getByLabel('Invoice hotel',{exact:true})).toHaveValue('TSK');
 await expect(page.getByLabel('Invoice aging bucket',{exact:true})).toHaveValue('["151+",151,null,5]');
 await expect(page.getByRole('table',{name:'Current aging invoices'})).toContainText('SYN-HIGHLIGHT-TSK-151');
 // React StrictMode may repeat read effects locally; every read must remain in the chosen hotel/account.
 expect([...new Set(accountReads)]).toEqual(['/api/accounts/TSK/visual-azure-tsk']);
 await highlighted(value(table,'Azure Travel · Synthetic','TSK','151+'));
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(2);
 await fits(page,table);
 expect(writes).toEqual([]);expect(openRefreshes).toEqual([{hotel:'All',reason:'open'}]);
 expect(controls.errors).toEqual([]);expect(controls.unexpected).toEqual([]);
});
