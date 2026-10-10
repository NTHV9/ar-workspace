import {normalizedDashboardParams} from './dashboard/links';
import {isHotelId,hotelRegion} from './domain/hotels';

const callbackKeys=['code','error','error_code','error_description'];
export const hasAuthCallback=(params:URLSearchParams)=>callbackKeys.some(key=>params.has(key));

/** Entry and successful Google sign-in open Aging; in-session bookmarks retain their destination. */
export function initialWorkspaceParams(input:URLSearchParams){
 const params=normalizedDashboardParams(input.has('code')?new URLSearchParams():input);
 if(params.get('settings')==='1'){params.delete('settings');params.set('usersAccess','1');}
 if([...params.keys()].every(key=>callbackKeys.includes(key))){
  params.set('dashboard','1');params.set('dashboardView','aging');
 }
 // The Auth SDK reads the untouched browser URL. Do not carry its one-time code into navigation.
 for(const key of callbackKeys)params.delete(key);
 return params;
}

/** Only application routes are intercepted; files, downloads and external links stay native. */
export function internalWorkspaceParams(href:string,origin:string,current:URLSearchParams){
 if(href.startsWith('#'))return null;
 let url:URL;try{url=new URL(href,origin);}catch{return null;}
 if(url.origin!==origin||url.username||url.password||url.pathname!=='/'||url.hash||hasAuthCallback(url.searchParams))return null;
 const next=new URLSearchParams(url.search);
 const destinationHotel=next.get('property')??next.get('hotel');
 if(!next.has('region')&&isHotelId(destinationHotel))next.set('region',hotelRegion(destinationHotel));
 if(!next.has('hotel')&&isHotelId(next.get('property')))next.set('hotel',next.get('property')!);
 for(const key of ['region','hotel'])if(!next.has(key)&&current.has(key))next.set(key,current.get(key)!);
 if(!url.search){next.set('dashboard','1');next.set('dashboardView','aging');}
 return initialWorkspaceParams(next);
}
/** Settings account links always carry an exact hotel/account identity and allowed region. */
export function settingsAccountParams(current:URLSearchParams,target:{hotel:string;accountId:string},allowedRegions:readonly string[]){
 if(!isHotelId(target.hotel)||!target.accountId||!allowedRegions.includes(hotelRegion(target.hotel)))return null;
 const next=new URLSearchParams();next.set('region',hotelRegion(target.hotel));next.set('hotel',target.hotel);next.set('property',target.hotel);next.set('account',target.accountId);next.set('accountSection','Overview');next.set('fromSettings','accounts');next.set('settingsRegion',current.get('region')??'phuket');return next;
}
export function settingsAccountReturn(current:URLSearchParams){
 const next=new URLSearchParams();next.set('region',current.get('settingsRegion')??current.get('region')??'phuket');next.set('usersAccess','1');next.set('settingsTab','accounts');return next;
}
