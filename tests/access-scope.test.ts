import {expect,it} from 'vitest';
import {containsOutsideHotel,requestAccessIntent} from '../worker/access/scope';
const id='00000000-0000-4000-8000-000000000021';
const request=(path:string,method='GET',body?:unknown)=>new Request('https://app.test'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
it.each(['/api/portfolio','/api/collection-queue','/api/refresh','/api/dashboard/balances','/api/dashboard/aging-invoices','/api/remittances','/api/external-billing','/api/financial/status'])('binds regional reads independently of client UI: %s',async path=>{
 expect(await requestAccessIntent(request(path+'?region=khao-lak'))).toMatchObject({kind:'region',region:'khao-lak'});
 expect(await requestAccessIntent(request(path))).toMatchObject({kind:'region',region:'phuket'});
 await expect(requestAccessIntent(request(path+'?region=khao-lak&hotel=KAT'))).rejects.toThrow('access_forbidden');
 await expect(requestAccessIntent(request(path+'?region=phuket&region=khao-lak'))).rejects.toThrow();
});
it.each(['/api/operations/storage','/api/drive/status','/api/gmail/connect','/api/acceptance/create','/api/opera/probe','/api/mail-reconciliation','/api/email/test-send','/api/unknown-future-route'])('defaults to denial for global/unknown operations: %s',async path=>{
 await expect(requestAccessIntent(request(path,'POST',{}))).rejects.toThrow('access_forbidden');
});
it('takes every write scope from the same fields as the handler and preserves the body',async()=>{
 const r=request('/api/external-billing/confirm','POST',{input:{hotel:'TLKL',recordId:id}});
 expect(await requestAccessIntent(r)).toEqual({kind:'billing',ref:id,mail:false,hotel:'TLKL'});expect(await r.json()).toMatchObject({input:{hotel:'TLKL'}});
 expect(await requestAccessIntent(request('/api/remittances/'+id,'PUT',{hotel:'TSAN',revision:0}))).toMatchObject({kind:'remittance_save',ref:id,hotel:'TSAN'});
 expect(await requestAccessIntent(request('/api/refresh','POST',{region:'khao-lak',hotel:'All'}))).toEqual({kind:'region',region:'khao-lak'});
 await expect(requestAccessIntent(request('/api/refresh','POST',{region:'phuket',hotel:'TLKL'}))).rejects.toThrow();
});
it('resolves opaque document/file/draft/delivery IDs in SQL rather than trusting hotel query hints',async()=>{
 for(const [path,kind]of [[`/api/documents/${id}/exports/0?hotel=KAT`,'document'],[`/api/email/${id}/attachments/${id}?hotel=KAT`,'email'],[`/api/email/deliveries/${id}/check`,'delivery'],[`/api/remittances/${id}/files/${id}`,'remittance']])expect(await requestAccessIntent(request(path))).toMatchObject({kind,ref:id});
 expect(await requestAccessIntent(request('/api/email/open','POST',{jobId:id,hotel:'KAT'}))).toEqual({kind:'document',ref:id,mail:true});
});
it('denies policy/template mutations while allowing the current wording to be used',async()=>{
 expect(await requestAccessIntent(request('/api/collection-policy'))).toEqual({kind:'global'});
 await expect(requestAccessIntent(request('/api/collection-policy','PUT',{}))).rejects.toThrow();
 await expect(requestAccessIntent(request('/api/email/templates/'+id,'PUT',{}))).rejects.toThrow();
});
it('contains nested foreign hotel objects and hotel arrays without rejecting ordinary fields',()=>{
 expect(containsOutsideHotel({rows:[{hotel:'TLKL'}]},['KAT','TSK'])).toBe(true);
 expect(containsOutsideHotel({missingHotels:['TSAN']},['KAT','TSK'])).toBe(true);
 expect(containsOutsideHotel({rows:[{hotel:'KAT',name:'Synthetic'}],hotels:['KAT','TSK']},['KAT','TSK'])).toBe(false);
 expect(containsOutsideHotel({hotel:'All'},['KAT','TSK'])).toBe(true);
});
