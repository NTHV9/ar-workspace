import {thaiToday} from '../../src/domain/collection';

/** Product retirement is independent of old deployment flags. Preserve source
 * readers for Invoice/Folio generation, current balances and business evidence.
 */
export function retiredReportRequest(url:URL):boolean {
 const path=url.pathname,q=url.searchParams,today=thaiToday();
 if(path.startsWith('/api/financial/')||path.startsWith('/api/observations/'))return true;
 if(path==='/api/external-billing'&&(!q.get('hotel')||!q.get('account')))return true;
 if(['/api/reports/activity','/api/dashboard/invoice-entries','/api/dashboard/payment-invoices'].includes(path))return true;
 if(path==='/api/dashboard/management')return q.get('from')!==today||q.get('to')!==today;
 if(path==='/api/dashboard/balances'||path==='/api/dashboard/balance-accounts')return q.get('asOf')!==today;
 if(path==='/api/dashboard/hotel-overview')return q.get('segment')!=='balances'||q.get('from')!==today||q.get('to')!==today;
 return false;
}
