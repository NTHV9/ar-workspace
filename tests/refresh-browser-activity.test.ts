import {afterEach,expect,it,vi} from 'vitest';
import {startRefreshActivity} from '../src/refresh/activity';
let stop:(()=>void)|undefined;
afterEach(()=>{stop?.();stop=undefined;vi.unstubAllGlobals();vi.useRealTimers();});
function setup(){
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
 const doc=Object.assign(new EventTarget(),{visibilityState:'visible'}),win=new EventTarget(),calls:Request[]=[];const wakes=vi.fn();
 vi.stubGlobal('document',doc);vi.stubGlobal('window',win);
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(new Request(new URL(String(input),'https://app.test'),init));return Response.json({active:true});});
 const activity={lastUsed:Date.now()};stop=startRefreshActivity('phuket','synthetic',wakes,activity);
 return {doc,win,calls,wakes,activity};
}
it('marks visible use without waiting for OPERA, once per minute, with server-owned scope',async()=>{
 const h=setup();await vi.advanceTimersByTimeAsync(0);expect(h.calls).toHaveLength(1);expect(await h.calls[0].json()).toEqual({region:'phuket'});expect(h.calls[0].headers.get('Authorization')).toBe('Bearer synthetic');
 for(let n=0;n<10;n++)h.doc.dispatchEvent(new Event('pointerdown'));
 await vi.advanceTimersByTimeAsync(59000);expect(h.calls).toHaveLength(1);await vi.advanceTimersByTimeAsync(1000);expect(h.calls).toHaveLength(2);expect(h.wakes).not.toHaveBeenCalled();
});
it('stops while hidden, wakes stale data once on return and cleans up listeners/timers',async()=>{
 const h=setup();await vi.advanceTimersByTimeAsync(0);h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(12*60000);expect(h.calls).toHaveLength(1);
 h.doc.visibilityState='visible';h.doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(h.calls).toHaveLength(2);expect(h.wakes).toHaveBeenCalledTimes(1);
 h.win.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(0);expect(h.wakes).toHaveBeenCalledTimes(1);
 stop!();await vi.advanceTimersByTimeAsync(120000);h.doc.dispatchEvent(new Event('keydown'));expect(h.calls).toHaveLength(2);
});
it('does not keep an abandoned visible tab active and resumes on actual input',async()=>{
 const h=setup();await vi.advanceTimersByTimeAsync(11*60000);const idleCount=h.calls.length;
 await vi.advanceTimersByTimeAsync(30*60000);expect(h.calls).toHaveLength(idleCount);
 h.doc.dispatchEvent(new Event('keydown'));await vi.advanceTimersByTimeAsync(0);expect(h.calls.length).toBe(idleCount+1);expect(h.wakes).toHaveBeenCalledTimes(1);
});
it('an outstanding heartbeat does not overlap repeated input and aborts on teardown',async()=>{
 vi.useFakeTimers();const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());let signal:AbortSignal|undefined,calls=0;
 vi.stubGlobal('fetch',(_input:unknown,init:RequestInit)=>{calls++;signal=init.signal as AbortSignal;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('aborted'))));});
 stop=startRefreshActivity('khao-lak','synthetic',()=>{});await vi.advanceTimersByTimeAsync(1000);doc.dispatchEvent(new Event('keydown'));expect(calls).toBe(1);stop();await Promise.resolve();expect(signal!.aborted).toBe(true);
});
it('token renewal does not reactivate an abandoned visible tab',async()=>{
 const h=setup();await vi.advanceTimersByTimeAsync(0);stop!();await vi.advanceTimersByTimeAsync(20*60000);
 stop=startRefreshActivity('phuket','renewed',h.wakes,h.activity);await vi.advanceTimersByTimeAsync(0);expect(h.calls).toHaveLength(1);
 h.doc.dispatchEvent(new Event('keydown'));await vi.advanceTimersByTimeAsync(0);expect(h.calls).toHaveLength(2);
});
it('a hung activity request expires and can be tried again at the next interval',async()=>{
 vi.useFakeTimers();const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());const signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',(_input:unknown,init:RequestInit)=>{const signal=init.signal as AbortSignal;signals.push(signal);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));});
 stop=startRefreshActivity('phuket','synthetic',()=>{});await vi.advanceTimersByTimeAsync(20001);expect(signals[0].aborted).toBe(true);
 await vi.advanceTimersByTimeAsync(40000);expect(signals).toHaveLength(2);
});
