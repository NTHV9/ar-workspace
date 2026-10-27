import {expect,it} from 'vitest';
import {rememberExitReturn,consumeExitReturn} from '../src/preparation/exit-return';
const actor='00000000-0000-4000-8000-000000000001',id='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000002';
function storage():Storage{const map=new Map<string,string>([['ar-google-tab-v1','ar-google-tab-v1-'+actor],['ar-google-tab-v1-'+actor,JSON.stringify({user:{id:actor}})]]);return {get length(){return map.size;},clear:()=>map.clear(),key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);}};}
it('matching document reload returns Collections with region/hotel and never restores compose',()=>{
 const s=storage(),params=new URLSearchParams('region=khao-lak&hotel=TSAN&documentJob='+id+'&compose=1');
 expect(rememberExitReturn(s,actor,params,false)).toBe(true);const next=consumeExitReturn(s,params);
 expect(next.get('collections')).toBe('1');expect(next.get('region')).toBe('khao-lak');expect(next.get('hotel')).toBe('TSAN');expect(next.has('documentJob')).toBe(false);expect(next.has('compose')).toBe(false);expect(params.get('documentJob')).toBe(id);
 expect(consumeExitReturn(s,params).get('documentJob')).toBe(id);
});
it('matching batch reload removes only its own resume record and matching active pointer',()=>{
 const s=storage(),p=new URLSearchParams('collectionBatch='+id+'&region=phuket&hotel=KAT'),key='ar-account-batch:'+actor+':'+id,otherKey='ar-account-batch:'+actor+':'+other;
 s.setItem(key,'synthetic');s.setItem(otherKey,'keep');s.setItem('ar-account-batch-active:'+actor+':phuket',id);s.setItem('ar-preparation-exit-v1:unrelated','keep');
 rememberExitReturn(s,actor,p,false);expect(consumeExitReturn(s,p).get('collections')).toBe('1');expect(s.getItem(key)).toBeNull();expect(s.getItem(otherKey)).toBe('keep');expect(s.getItem('ar-preparation-exit-v1:unrelated')).toBe('keep');expect(s.getItem('ar-account-batch-active:'+actor+':phuket')).toBeNull();
});
it('pending single create returns to Collections only for its exact hotel/account',()=>{
 const s=storage(),p=new URLSearchParams('account=synthetic&property=KAT&hotel=KAT');expect(rememberExitReturn(s,actor,p,false)).toBe(false);expect(rememberExitReturn(s,actor,p,true)).toBe(true);expect(consumeExitReturn(s,p).get('collections')).toBe('1');
 rememberExitReturn(s,actor,p,true);expect(consumeExitReturn(s,new URLSearchParams('account=other&property=KAT')).get('account')).toBe('other');
});
it('unrelated scopes, a different tab and auth callbacks do not redirect or remove batch state',()=>{
 const s=storage(),p=new URLSearchParams('collectionBatch='+id),key='ar-account-batch:'+actor+':'+id;s.setItem(key,'keep');
 rememberExitReturn(s,actor,p,false);expect(consumeExitReturn(s,new URLSearchParams('collectionBatch='+other)).get('collectionBatch')).toBe(other);expect(s.getItem(key)).toBe('keep');
 rememberExitReturn(s,actor,p,false);s.setItem('ar-google-tab-v1','ar-google-tab-v1-'+other);expect(consumeExitReturn(s,p).get('collectionBatch')).toBe(id);expect(s.getItem(key)).toBe('keep');
 rememberExitReturn(s,actor,p,false);expect(consumeExitReturn(s,new URLSearchParams('code=synthetic&collectionBatch='+id)).get('code')).toBe('synthetic');expect(s.getItem(key)).toBe('keep');
});
it('corrupt metadata and unavailable storage cannot invent a route or cleanup authority',()=>{
 const s=storage(),p=new URLSearchParams('documentJob='+id);for(const raw of ['{','{}','null','x'.repeat(4096)]){s.setItem('ar-preparation-return-v1',raw);expect(consumeExitReturn(s,p).get('documentJob')).toBe(id);}
 expect(rememberExitReturn(s,'invalid',p,false)).toBe(false);s.setItem=()=>{throw Error('quota');};expect(rememberExitReturn(s,actor,p,false)).toBe(false);expect(s.getItem('ar-preparation-exit-v1:'+id)).toBeNull();
});

it('a marker for a different signed-in actor cannot redirect or clear the old batch',()=>{
 const s=storage(),p=new URLSearchParams('collectionBatch='+id),key='ar-account-batch:'+actor+':'+id;s.setItem(key,'keep');rememberExitReturn(s,actor,p,false);s.setItem('ar-google-tab-v1-'+actor,JSON.stringify({user:{id:other}}));expect(consumeExitReturn(s,p).get('collectionBatch')).toBe(id);expect(s.getItem(key)).toBe('keep');
});
