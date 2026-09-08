import {makeReader,type OperaEnv} from './probe';
import {asObject} from '../refresh/read-snapshot';
import {amountCents} from './normalize';
import {OperaError} from './client';
/** Read-only report metadata; never invokes a guessed rendering operation. */
export async function discoverStatementReport(env:OperaEnv,hotel:string,accountId:string){
 const reader=makeReader(env,hotel),account=asObject(asObject(await reader.account(accountId)).accountDetails);
 if(account.hotelId!==hotel||asObject(account.accountId).id!==accountId||!Array.isArray(account.invoices))throw new OperaError('invalid_response');
 const eligible=account.invoices.map(asObject).filter(i=>i.parentInvoiceNo==null&&amountCents(i.balance,'THB')>0);if(eligible.length<3)return {status:'insufficient_sample'};
 const ids=[String(eligible[0].transactionNo),String(eligible[2].transactionNo)],prepared=asObject(await reader.statementSelection(accountId,ids));
 if(!Array.isArray(prepared.aRStatements)||prepared.aRStatements.length!==1)throw new OperaError('invalid_response');const statement=asObject(prepared.aRStatements[0]);
 if(statement.hotelId!==hotel||asObject(statement.accountId).id!==accountId||!Array.isArray(statement.invoices)||statement.invoices.length!==2||statement.invoices.map(asObject).some(i=>!ids.includes(String(i.transactionNo))))throw new OperaError('invalid_response');
 const names=[...new Set([statement.statementName,statement.reportFileName].filter((v):v is string=>typeof v==='string'&&!!v))];
 const reports=[];
 for(const name of names){
  try{let result=asObject(await reader.reports(name)),group=result.reports?asObject(result.reports):{},rows=Array.isArray(group.reports)?group.reports.map(asObject):[];let query='published_exact_name';
   if(!rows.length){result=asObject(await reader.allReports(name));group=result.reports?asObject(result.reports):{};rows=Array.isArray(group.reports)?group.reports.map(asObject):[];query='all_exact_name';}
   if(!rows.length){result=asObject(await reader.allReports('statement'));group=result.reports?asObject(result.reports):{};rows=Array.isArray(group.reports)?group.reports.map(asObject):[];query='all_statement_names';}
   const exact=rows.filter(r=>typeof r.reportName==='string'&&r.reportName.replace(/\.rtf$/i,'').toLowerCase()===name.replace(/\.rtf$/i,'').toLowerCase()&&(r.hotel==null||r.hotel===''||r.hotel===hotel));
   const details=[];
   for(const row of exact){if(!row.moduleId)continue;const module=asObject(row.moduleId);if(typeof module.id!=='string')continue;
    const params=asObject(await reader.reportParameters(module.id,typeof module.idContext==='string'?module.idContext:'OPERA',typeof module.type==='string'?module.type:'ModuleId'));
    details.push({reportName:row.reportName,hasParameters:row.hasParameters,formToRun:row.formToRun,procedureRequired:row.procedureRequired,parameters:Array.isArray(params.reportParameters)?params.reportParameters.map(asObject).map(p=>({name:p.name,label:p.label,dataType:p.dataType})):[],linkRelations:Array.isArray(params.links)?params.links.map(asObject).map(l=>l.rel):[]});
   }
   reports.push({name,query,returned:rows.length,hasMore:group.hasMore===true,candidateReportNames:rows.map(r=>r.reportName),exactMatches:exact.length,details,linkRelations:Array.isArray(result.links)?result.links.map(asObject).map(l=>l.rel):[]});
  }catch(e){reports.push({name,error:e instanceof OperaError?e.code:'invalid_response',upstreamStatus:e instanceof OperaError?e.upstreamStatus:undefined});}
 }
 return {status:'metadata_read',hotel,statementType:statement.type,descriptorNames:names,reports,nativePdfTransportVerified:false};
}
