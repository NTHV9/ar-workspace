import type {ArOnlyInvoiceReader} from './ar-only-read';
import {record} from './model';
import {canonical} from './ar-tax';
import {readArOnlyBatch} from './ar-only-evidence-read';
import type {PosInterfaceEvidence} from './pos-receipt-service';
const fail=():never=>{throw Error('document_invoice_ar_only_posted_pos_fee_unverified');};
/** Complete property mappings around the caller's one financial source fence. */
export async function beginArOnlyPosInterfaceRead(reader:ArOnlyInvoiceReader,hotel:string):Promise<{finish:()=>Promise<PosInterfaceEvidence>}>{
 if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)fail();const discoveryBefore=structuredClone(await reader.invoicePosInterfaces!()),raw=record(discoveryBefore).hotelInterfaces;if(!Array.isArray(raw)||!raw.length||raw.length>20)fail();const logos=(raw as unknown[]).map(value=>{const d=record(value);if(d.hotelId!==hotel||d.interfaceType!=='Pos'||d.activeFlag!==true||typeof d.logo!=='string'||!d.logo)fail();return String(d.logo);});if(new Set(logos).size!==logos.length)fail();
 const before=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));let finished=false;
 return {finish:async()=>{if(finished)throw Error('document_source_changed');finished=true;const discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');const after=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));for(let n=0;n<before.length;n++)if(canonical(before[n])!==canonical(after[n]))throw Error('document_source_changed');return {hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:before[n],after:after[n]}))};}};
}
