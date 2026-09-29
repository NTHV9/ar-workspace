import {REGION_IDS,regionLabel,type RegionId} from '../../src/domain/hotels';

export interface ReportSheetLinksEnv {
 REPORT_SHEET_PHUKET_ID?:string;
 REPORT_SHEET_KHAOLAK_ID?:string;
}

/** File IDs stay in deployment configuration. This handler never reads or writes a spreadsheet. */
export function reportSheetLinks(request:Request,env:ReportSheetLinksEnv,regions:readonly RegionId[]){
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(new URL(request.url).search)return json({error:'reports_invalid'},400);
 return json({rows:REGION_IDS.filter(region=>regions.includes(region)).map(region=>{
  const id=region==='phuket'?env.REPORT_SHEET_PHUKET_ID:env.REPORT_SHEET_KHAOLAK_ID;
  return {region,label:regionLabel(region),url:id&&/^[A-Za-z0-9_-]{20,200}$/.test(id)?`https://docs.google.com/spreadsheets/d/${id}/edit`:null};
 })});
}
