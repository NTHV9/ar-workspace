import {makeReader} from '../opera/probe';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import type {InvoiceAssets} from '../invoice/types';
import type {StatementAssets} from '../statement/render';
/** Per attempt and hotel only. No account, balance, postings or PDF-byte cache. */
export function documentResources(env:RefreshEnv,hotel:string){
 let reader:ReturnType<typeof makeReader>|undefined;
 const invoices=new Map<string,Promise<InvoiceAssets|null>>(),statements=new Map<string,Promise<StatementAssets|null>>();
 return {
  reader:()=>reader??=makeReader(env,hotel),
  invoiceAssets:(version:string)=>{let assets=invoices.get(version);if(!assets){assets=backendRpc<InvoiceAssets|null>(env,'ar_invoice_template',{p_hotel:hotel,p_version:version});invoices.set(version,assets);}return assets;},
  statementAssets:(version:string)=>{let assets=statements.get(version);if(!assets){assets=backendRpc<StatementAssets|null>(env,'ar_statement_template',{p_hotel:hotel,p_version:version});statements.set(version,assets);}return assets;},
 };
}
export type DocumentResources=ReturnType<typeof documentResources>;
