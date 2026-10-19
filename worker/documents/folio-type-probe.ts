import {OperaError,type OperaReader} from '../opera/client';
import {asObject} from '../refresh/read-snapshot';

/** Configuration-only lookup. No invoice rendering, numbering, posting or email. */
export async function readFolioReportTypes(reader:Pick<OperaReader,'folioTypeName'>&Partial<Pick<OperaReader,'folioTypesConfig'>>,hotel:string){
 const results=[];
 for(const group of ['Guest','AccountsReceivables'] as const){
  try{
   const details=asObject(asObject(await reader.folioTypeName(group)).details),hotelMatches=details.hotelId===hotel;
   const name=(key:string)=>hotelMatches&&typeof details[key]==='string'&&details[key].length<=200?details[key]:undefined;
   results.push({group,status:'read',hotelMatches,folioTypeName:name('folioTypeName'),folioReportName:name('folioReportName'),language:name('folioLanguageCode')});
  }catch(error){results.push({group,status:'unavailable',code:error instanceof OperaError?error.code:'invalid_response',upstreamStatus:error instanceof OperaError?error.upstreamStatus:undefined});}
 }
 let configuration:unknown;
 if(reader.folioTypesConfig)try{const raw=asObject(await reader.folioTypesConfig());configuration={keys:Object.keys(raw),types:Array.isArray(raw.folioTypes)?raw.folioTypes.slice(0,100).map(asObject).map(r=>({hotelId:r.hotelId,code:r.code,aRFolio:r.aRFolio,folioReports:r.folioReports})):undefined};}catch(error){configuration=error instanceof OperaError?{code:error.code,status:error.upstreamStatus}:{code:'invalid_response'};}
 return {hotel,kind:'folio_report_configuration',results,configuration};
}
