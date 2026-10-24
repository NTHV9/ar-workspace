import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {startTrackerRevisionWatch} from '../src/reports/use-tracker-revision';
import {notifyRegisterChanged} from '../src/register/model';
vi.mock('../src/register/model',()=>({notifyRegisterChanged:vi.fn()}));
let documentTarget:EventTarget,windowTarget:EventTarget,visibility:string;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();visibility='visible';documentTarget=new EventTarget();windowTarget=new EventTarget();Object.defineProperty(documentTarget,'visibilityState',{get:()=>visibility});vi.stubGlobal('document',documentTarget);vi.stubGlobal('window',windowTarget);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const rows=(revision='1')=>({rows:[{region:'phuket',revision}]});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(token='first-token'){
 let event:()=>void=()=>{},status:(value:string)=>void=()=>{};
 const channel={on:vi.fn((_kind,_filter,callback)=>{event=callback;return channel;}),subscribe:vi.fn(callback=>{status=callback;return channel;})};
 const client={channel:vi.fn(()=>channel),removeChannel:vi.fn(async()=> 'ok')};
 const stop=startTrackerRevisionWatch(client as unknown as SupabaseClient,token);
 return {stop,client,channel,event:()=>event(),status:(value:string)=>status(value)};
}
it('subscribes to public revision hints and rechecks authorized revisions before notifying',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(rows())).mockResolvedValueOnce(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);
 const watch=setup();await flush();expect(watch.channel.on).toHaveBeenCalledWith('postgres_changes',{event:'*',schema:'public',table:'ar_tracker_publications'},expect.any(Function));
 watch.event();await flush();expect(fetcher).toHaveBeenLastCalledWith('/api/reports/tracker-revisions',expect.objectContaining({headers:{Authorization:'Bearer first-token'}}));expect(notifyRegisterChanged).toHaveBeenCalledTimes(2);watch.stop();expect(watch.client.removeChannel).toHaveBeenCalledTimes(1);
});
it('coalesces bursts, ignores unchanged or invalid rows, and rereads events during an in-flight check',async()=>{
 let complete:(response:Response)=>void=()=>{};
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(rows())).mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValueOnce(Response.json(rows('3'))).mockResolvedValueOnce(Response.json({rows:[{region:'unknown',revision:'4'}]})).mockResolvedValue(Response.json(rows('3')));vi.stubGlobal('fetch',fetcher);
 const watch=setup();await flush();watch.event();watch.event();watch.event();await flush();expect(fetcher).toHaveBeenCalledTimes(2);
 watch.event();complete(Response.json(rows('2')));await flush();expect(fetcher).toHaveBeenCalledTimes(3);expect(notifyRegisterChanged).toHaveBeenCalledTimes(3);
 watch.event();await flush();watch.event();await flush();expect(notifyRegisterChanged).toHaveBeenCalledTimes(3);watch.stop();
});
it('closes the subscribe/read race by reading again once subscribed',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(rows())).mockResolvedValue(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();watch.status('SUBSCRIBED');await flush();expect(fetcher).toHaveBeenCalledTimes(2);expect(notifyRegisterChanged).toHaveBeenCalledTimes(2);watch.stop();
});
it('pauses hidden reads and catches up on visibility and focus without waiting for a timer',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json(rows()));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();watch.status('SUBSCRIBED');await flush();fetcher.mockClear();visibility='hidden';watch.event();windowTarget.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(60000);expect(fetcher).not.toHaveBeenCalled();
 visibility='visible';documentTarget.dispatchEvent(new Event('visibilitychange'));await flush();expect(fetcher).toHaveBeenCalledTimes(1);windowTarget.dispatchEvent(new Event('focus'));await flush();expect(fetcher).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(5000);expect(fetcher).toHaveBeenCalledTimes(3);watch.stop();
});
it('discovers a changed authoritative revision within five seconds even while subscribed',async()=>{
 let revision='1';const fetcher=vi.fn(async()=>Response.json(rows(revision)));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();watch.status('SUBSCRIBED');await flush();fetcher.mockClear();vi.mocked(notifyRegisterChanged).mockClear();revision='2';
 await vi.advanceTimersByTimeAsync(4999);expect(fetcher).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(1);expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(5000);expect(fetcher).toHaveBeenCalledTimes(2);expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.stop();
});
it('keeps checking every five seconds before subscription and through channel failure and recovery',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json(rows()));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();fetcher.mockClear();await vi.advanceTimersByTimeAsync(5000);expect(fetcher).toHaveBeenCalledTimes(1);
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED','SUBSCRIBED']){watch.status(status);await flush();fetcher.mockClear();await vi.advanceTimersByTimeAsync(5000);expect(fetcher).toHaveBeenCalledTimes(1);}watch.stop();
});
it('coalesces timer ticks and realtime hints during a slow request into one follow-up read',async()=>{
 let complete:(response:Response)=>void=()=>{};const fetcher=vi.fn().mockResolvedValueOnce(Response.json(rows())).mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValue(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();await vi.advanceTimersByTimeAsync(5000);expect(fetcher).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(15000);watch.event();windowTarget.dispatchEvent(new Event('focus'));await flush();expect(fetcher).toHaveBeenCalledTimes(2);complete(Response.json(rows()));await flush();expect(fetcher).toHaveBeenCalledTimes(3);expect(notifyRegisterChanged).toHaveBeenCalledTimes(2);watch.stop();await vi.advanceTimersByTimeAsync(10000);expect(fetcher).toHaveBeenCalledTimes(3);
});
it('aborts old auth/access watchers and ignores late responses, channel events and timers',async()=>{
 let complete:(response:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValue(Response.json(rows('8')));vi.stubGlobal('fetch',fetcher);const old=setup();await flush();old.stop();expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);const next=setup('new-token');await flush();expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);vi.mocked(notifyRegisterChanged).mockClear();complete(Response.json(rows('9')));old.event();old.status('SUBSCRIBED');await flush();expect(fetcher).toHaveBeenCalledTimes(2);expect(notifyRegisterChanged).not.toHaveBeenCalled();next.stop();windowTarget.dispatchEvent(new Event('focus'));documentTarget.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(60000);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('refreshes a preexisting business snapshot when a hidden startup first becomes visible',async()=>{
 visibility='hidden';const fetcher=vi.fn().mockResolvedValue(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);const watch=setup();watch.status('SUBSCRIBED');watch.event();await vi.advanceTimersByTimeAsync(120000);expect(fetcher).not.toHaveBeenCalled();expect(notifyRegisterChanged).not.toHaveBeenCalled();visibility='visible';documentTarget.dispatchEvent(new Event('visibilitychange'));await flush();expect(fetcher).toHaveBeenCalledTimes(1);expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.status('SUBSCRIBED');await flush();expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.stop();
});
it('keeps the prior revision through forbidden, network and malformed checks',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(rows())).mockResolvedValueOnce(new Response(null,{status:403})).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(Response.json({rows:[{region:'phuket',revision:'2'},{region:'phuket',revision:'3'}]})).mockResolvedValueOnce(Response.json({rows:[{region:'phuket',revision:2}]})).mockResolvedValueOnce(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);vi.mocked(notifyRegisterChanged).mockClear();
 for(let i=0;i<4;i++){watch.event();await flush();expect(notifyRegisterChanged).not.toHaveBeenCalled();}
 watch.event();await flush();expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.stop();
});
it('rereads after subscription becomes ready during the initial baseline request',async()=>{
 let complete:(response:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValueOnce(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);const watch=setup();await flush();watch.status('SUBSCRIBED');watch.event();watch.event();complete(Response.json(rows()));await flush();expect(fetcher).toHaveBeenCalledTimes(2);expect(notifyRegisterChanged).toHaveBeenCalledTimes(2);watch.stop();
});
it('refreshes once if business data loaded before an import and the first revision read already includes it',async()=>{
 let complete:(response:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;})).mockResolvedValue(Response.json(rows('2')));vi.stubGlobal('fetch',fetcher);
 const businessSnapshot={revision:'1'},published={revision:'1'};vi.mocked(notifyRegisterChanged).mockImplementationOnce(()=>{businessSnapshot.revision=published.revision;});const watch=setup();await flush();published.revision='2';complete(Response.json(rows(published.revision)));await flush();expect(businessSnapshot.revision).toBe('2');expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.status('SUBSCRIBED');watch.event();await flush();await vi.advanceTimersByTimeAsync(60000);expect(notifyRegisterChanged).toHaveBeenCalledTimes(1);watch.stop();
});
