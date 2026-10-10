import {expect,it} from 'vitest';
import {hasAuthCallback,initialWorkspaceParams} from '../src/navigation';
it('returns a jobless regional Gmail callback to Settings while retaining mailbox scope',()=>{
 const result=initialWorkspaceParams(new URLSearchParams('settings=1&region=khao-lak&gmail=connected'));
 expect(result.get('usersAccess')).toBe('1');expect(result.get('settings')).toBeNull();expect(result.get('region')).toBe('khao-lak');expect(result.get('gmail')).toBe('connected');
});
it('opens bare entry and Google callbacks on Current Aging without retaining callback codes',()=>{
 for(const search of ['', 'code=synthetic-code', 'error=access_denied&error_description=Synthetic']){
  const original=new URLSearchParams(search),result=initialWorkspaceParams(original);
  expect(result.toString()).toBe('dashboard=1&dashboardView=aging');expect(original.toString()).toBe(search);
 }
 expect(hasAuthCallback(new URLSearchParams('code=synthetic-code'))).toBe(true);
 expect(hasAuthCallback(new URLSearchParams('portfolio=1'))).toBe(false);
});
it.each(['portfolio=1','region=khao-lak&hotel=TLKL','account=A&property=KAT','collections=1','usersAccess=1','reports=1','documentJob=synthetic&compose=1','recover=1','mode=review','dashboard=1&dashboardView=period'])('preserves explicit or legacy destinations: %s',search=>{
 expect(initialWorkspaceParams(new URLSearchParams(search)).toString()).toBe(search);
});
it('opens Aging after login even when a callback carries a prior destination',()=>{
 for(const search of ['recover=1','documentJob=synthetic&compose=1'])expect(initialWorkspaceParams(new URLSearchParams(search+'&code=synthetic-code')).toString()).toBe('dashboard=1&dashboardView=aging');
 expect(initialWorkspaceParams(new URLSearchParams('financial=1')).get('dashboardDetail')).toBe('payments');
});
import {settingsAccountParams,settingsAccountReturn} from '../src/navigation';
it('Settings name links scope duplicate identities to permitted Hotel and region',()=>{
 const current=new URLSearchParams('usersAccess=1&settingsTab=accounts&region=phuket&account=stale&dashboard=1');
 const kat=settingsAccountParams(current,{hotel:'KAT',accountId:'same'},['phuket','khao-lak'])!,tlkl=settingsAccountParams(current,{hotel:'TLKL',accountId:'same'},['phuket','khao-lak'])!;
 expect(kat.get('property')).toBe('KAT');expect(tlkl.get('property')).toBe('TLKL');expect(tlkl.get('region')).toBe('khao-lak');expect(tlkl.get('accountSection')).toBe('Overview');expect(tlkl.has('usersAccess')).toBe(false);expect(tlkl.has('dashboard')).toBe(false);
 expect(settingsAccountParams(current,{hotel:'TLKL',accountId:'same'},['phuket'])).toBeNull();expect(settingsAccountParams(current,{hotel:'unknown',accountId:'same'},['phuket'])).toBeNull();expect(settingsAccountParams(current,{hotel:'KAT',accountId:''},['phuket'])).toBeNull();
 const back=settingsAccountReturn(tlkl);expect(back.get('usersAccess')).toBe('1');expect(back.get('settingsTab')).toBe('accounts');expect(back.get('region')).toBe('phuket');expect(back.has('account')).toBe(false);
});
import {reconcileAccountList,type AccountListContext} from '../src/settings/account-list-context';
it('restored Settings list targets are reconciled against fresh permitted accounts',()=>{
 const context:AccountListContext={mode:'accounts',hotels:['KAT','TLKL'],types:['OTA','Removed type'],query:'Travel',selected:[JSON.stringify(['KAT','same']),JSON.stringify(['TSK','removed']),JSON.stringify(['TLKL','same'])],sort:{key:'invoices',descending:true},defaultSort:{key:'hotel',descending:false},billingFilter:'required',statusFilter:'all',termFilter:'all',invoiceFilter:'with'};
 const value=reconcileAccountList(context,['KAT','TSK'],[{hotel:'KAT',accountId:'same',revision:9,name:'Changed name',type:'OTA',invoices:3,billingRequired:true,creditTerm:30,billingMethod:'email'}],['OTA']);
 expect(value.hotels).toEqual(['KAT']);expect(value.types).toEqual(['OTA']);expect(value.selected).toEqual([JSON.stringify(['KAT','same'])]);expect(value.query).toBe('Travel');expect(value.sort).toEqual(context.sort);expect(value).not.toHaveProperty('revision');expect(value).not.toHaveProperty('preview');
});
