import {thaiToday} from '../../src/domain/collection';
import {financialFilters} from '../financial/api';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {isHotelId} from '../../src/domain/hotels';
import {hotelBelongsToRegion,regionalHotelScope,resultMatchesHotelScope} from '../hotels';

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
/** Read the same saved invoice ledger as Portfolio, scoped by its OPERA Bill Date. */
export async function dashboardInvoiceEntriesApi(request:Request,env:RefreshEnv,actor:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const url=new URL(request.url),scope=financialFilters(url),regional=regionalHotelScope(url.searchParams,scope.p_account);
  if(!scope.p_from||!scope.p_to||scope.p_to>thaiToday())throw Error('financial_invalid');
  const result=await backendRpc<unknown>(env,'ar_dashboard_invoice_entries',{p_actor:actor,...scope});
  if(object(result)&&result.error==='dashboard_forbidden')return json({error:'dashboard_forbidden'},403);
  if(object(result)&&result.error==='dashboard_invalid')throw Error('financial_invalid');
  if(!object(result)||result.view!=='invoice_entries'||result.source!=='portfolio'||!Array.isArray(result.rows)||result.rows.length>scope.p_limit||!Number.isSafeInteger(result.total)||Number(result.total)<0||!object(result.summary)||!Number.isSafeInteger(result.summary.invoiceCount)||Number(result.summary.invoiceCount)<0||!object(result.coverage)||typeof result.coverage.complete!=='boolean'||result.coverage.from!==scope.p_from||result.coverage.to!==scope.p_to||!resultMatchesHotelScope(result,regional.region,regional.hotel))throw Error('dashboard_unavailable');
  const identities=new Set<string>();
  for(const row of result.rows){
   if(!object(row)||!isHotelId(row.hotel)||!hotelBelongsToRegion(row.hotel,regional.region)||typeof row.accountId!=='string'||typeof row.transactionId!=='string'||typeof row.transactionDate!=='string'||row.transactionDate<scope.p_from||row.transactionDate>scope.p_to||regional.hotel&&row.hotel!==regional.hotel||scope.p_account&&row.accountId!==scope.p_account)throw Error('dashboard_unavailable');
   const key=JSON.stringify([row.hotel,row.accountId,row.transactionId]);if(identities.has(key))throw Error('dashboard_unavailable');identities.add(key);
  }
  return json(result);
 }catch(error){const invalid=error instanceof Error&&error.message==='financial_invalid';return json({error:invalid?'dashboard_invalid':'dashboard_unavailable'},invalid?400:503);}
}
