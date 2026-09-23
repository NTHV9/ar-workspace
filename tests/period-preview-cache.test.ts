import {expect,it} from 'vitest';
import {clearPeriodPreview,readPeriodPreview,savePeriodPreview} from '../src/dashboard/period-preview-cache';
import {initialOverview} from '../src/dashboard/progressive-overview';
class MemoryStorage implements Storage {
 private data=new Map<string,string>();get length(){return this.data.size;}clear(){this.data.clear();}getItem(k:string){return this.data.get(k)??null;}key(i:number){return [...this.data.keys()][i]??null;}removeItem(k:string){this.data.delete(k);}setItem(k:string,v:string){this.data.set(k,v);}
}
it('binds previews to exact grant, request, date, region and a two-minute lifetime',()=>{
 const storage=new MemoryStorage(),value=initialOverview('2026-09-01','2026-09-23','phuket');
 savePeriodPreview(storage,'tab-user-grant','path',value,1000);
 expect(readPeriodPreview(storage,'tab-user-grant','path',value.from,value.to,'phuket',1001)?.hotels.map(h=>h.hotel)).toEqual(['KAT','TSK']);
 for(const [scope,path,from,to,region,now] of [['other-user','path',value.from,value.to,'phuket',1001],['tab-user-grant','other-path',value.from,value.to,'phuket',1001],['tab-user-grant','path','2026-08-01',value.to,'phuket',1001],['tab-user-grant','path',value.from,value.to,'khao-lak',1001],['tab-user-grant','path',value.from,value.to,'phuket',121000]] as const){expect(readPeriodPreview(storage,scope,path,from,to,region,now)).toBeUndefined();}
 clearPeriodPreview(storage);expect(storage.length).toBe(0);
});
it('bounds saved entries and ignores corrupt or disabled storage',()=>{
 const storage=new MemoryStorage(),value=initialOverview('2026-09-01','2026-09-23','phuket');
 for(let i=0;i<12;i++)savePeriodPreview(storage,'scope','path'+i,value,1000);
 expect(JSON.parse(storage.getItem('ar-period-preview-v1')!).length).toBe(8);
 storage.setItem('ar-period-preview-v1','{invalid');expect(readPeriodPreview(storage,'scope','path',value.from,value.to,'phuket',1001)).toBeUndefined();
 storage.setItem=()=>{throw Error('quota');};expect(()=>savePeriodPreview(storage,'scope','path',value)).not.toThrow();
});
