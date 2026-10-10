import type {HotelId} from '../domain/hotels';
import type {AccountSortKey} from './account-list';
import type {SettingsAccount} from './bulk-model';
export interface AccountListContext {mode:'accounts'|'types';hotels:HotelId[];types:string[];query:string;selected:string[];sort:{key:AccountSortKey;descending:boolean};defaultSort:{key:'hotel'|'type'|'fields';descending:boolean};billingFilter:string;statusFilter:string;termFilter:string;invoiceFilter:string}
/** View state only: no edit values, revisions, previews or pending commands survive navigation. */
export function reconcileAccountList(context:AccountListContext,allowed:HotelId[],rows:SettingsAccount[],types:string[]){
 const identities=new Set(rows.filter(r=>allowed.includes(r.hotel)).map(r=>JSON.stringify([r.hotel,r.accountId])));
 return {...context,hotels:context.hotels.filter(h=>allowed.includes(h)),types:context.types.filter(t=>types.includes(t)),selected:context.selected.filter(id=>identities.has(id))};
}
