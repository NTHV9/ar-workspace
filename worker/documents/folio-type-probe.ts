import {OperaError,type OperaReader} from '../opera/client';
import {asObject} from '../refresh/read-snapshot';

/** Configuration-only lookup. No invoice rendering, numbering, posting or email. */
export async function readFolioReportTypes(reader:Pick<OperaReader,'folioTypeName'>,hotel:string){
 const results=[];
 for(const group of ['Guest','AccountsReceivables'] as const){
  try{
   const details=asObject(asObject(await reader.folioTypeName(group)).details),hotelMatches=details.hotelId===hotel;
   const name=(key:string)=>hotelMatches&&typeof details[key]==='string'&&details[key].length<=200?details[key]:undefined;
   results.push({group,status:'read',hotelMatches,folioTypeName:name('folioTypeName'),folioReportName:name('folioReportName'),language:name('folioLanguageCode')});
  }catch(error){results.push({group,status:'unavailable',code:error instanceof OperaError?error.code:'invalid_response',upstreamStatus:error instanceof OperaError?error.upstreamStatus:undefined});}
 }
 return {hotel,kind:'folio_report_configuration',results};
}
