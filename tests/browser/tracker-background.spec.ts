import {test,expect,type Page} from '@playwright/test';
import {setupDepth} from './fixtures/ui-depth';
declare global {interface Window {auditHidden:boolean;auditRevisionChanges:number}}
async function pollingPage(page:Page){
 await page.clock.install();await setupDepth(page);
 await page.addInitScript(()=>{const synthetic=localStorage.getItem('sb-example-auth-token'),set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){set.call(this,key,value);if(this===sessionStorage&&key==='ar-google-tab-v1'&&synthetic)set.call(this,value,synthetic);};window.auditHidden=false;Object.defineProperty(document,'visibilityState',{get:()=>window.auditHidden?'hidden':'visible'});window.auditRevisionChanges=0;addEventListener('ar-invoice-changed',()=>{window.auditRevisionChanges++;});});
 let calls=0,revision='1';await page.route('**/api/reports/tracker-revisions',route=>{calls++;return route.fulfill({json:{rows:[{region:'phuket',revision}]}});});await page.goto('/?dashboard=1&dashboardView=aging');await expect.poll(()=>calls).toBe(1);await page.waitForTimeout(100);return {calls:()=>calls,revision:(next:string)=>{revision=next;}};
}
test('tracker revisions pause in a hidden tab and catch up once when visible',async({page})=>{
 const poll=await pollingPage(page);
 await page.evaluate(()=>{window.auditHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(60000);await page.waitForTimeout(100);expect(poll.calls()).toBe(1);
 poll.revision('2');await page.evaluate(()=>{window.auditHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(poll.calls).toBe(2);await expect.poll(()=>page.evaluate(()=>window.auditRevisionChanges)).toBe(1);
});
test('revision changes notify another tab once and retain legacy broadcasts',async({page})=>{
 const source=await pollingPage(page),observer=await page.context().newPage();await pollingPage(observer);
 source.revision('2');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(source.calls).toBe(2);await expect.poll(()=>page.evaluate(()=>window.auditRevisionChanges)).toBe(1);await expect.poll(()=>observer.evaluate(()=>window.auditRevisionChanges)).toBe(1);
 await page.evaluate(()=>{const channel=new BroadcastChannel('ar-invoice-changes');channel.postMessage('changed');channel.close();});await expect.poll(()=>page.evaluate(()=>window.auditRevisionChanges)).toBe(2);await expect.poll(()=>observer.evaluate(()=>window.auditRevisionChanges)).toBe(2);await observer.close();
});
