import {posDisplayFixture} from './invoice-pos-display';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import type {InvoicePacket} from '../../worker/invoice/model';
import {money} from './invoice-packet';

export function selectedWrapperDisplayFixture(){
 const f=posDisplayFixture(),p:InvoicePacket=f.packet,selected=(p.postings as {invoicePostingsDetails:Record<string,unknown>[];trxCodesInfo:Record<string,unknown>[]}),wrapper=selected.invoicePostingsDetails.find(s=>s.transactionNo===10001)!,root=p.taxRows.find(e=>(e as {posting:{transactionNo:number}}).posting.transactionNo===10001) as {posting:Record<string,unknown>},day='2026-01-02',check='90001';
 Object.assign(wrapper,{checkNo:check,reference:'[NA Pkg. Trx] '+check,cashierInfo:{cashierId:8}});
 Object.assign(root.posting,{transactionCode:'ROOM',transactionDate:day,checkNo:check,reference:wrapper.reference,cashierInfo:{cashierId:8},folioWindowNo:1,postedAmount:money(3315),debitAmount:money(3315),transactionAmount:3315});
 for(const [n,code]of ['DINNER','LUNCH'].entries()){
  const id=80001+n,s={transactionNo:id,transactionCode:code,transactionDate:day,checkNo:check,reference:'[NA Pkgs. Example] ',cashierInfo:{cashierId:8},debitAmount:money(107),paidOut:false};selected.invoicePostingsDetails.push(s);selected.trxCodesInfo.push({hotelId:'KAT',transactionCode:code,description:'Package '+code});
  p.taxRows.push({posting:{...s,hotelId:'KAT',folioNo:88,folioWindowNo:1,guestInfo:{reservationId:{id:'777'}},transactionType:'Revenue',postedAmount:money(107),transactionAmount:107},postingBreakdown:{grossAmount:money(107),netAmount:money(100),taxes:[{transactionNo:id*10,referenceTransactionNo:id,transactionCode:'VAT',amount:money(7)}]}});
 }
 p.manifest.open!+=214;for(const key of ['amount','balance'])Reflect.set(p.invoice as object,key,money(p.manifest.open!));
 const members=[wrapper,...selected.invoicePostingsDetails.filter(s=>Number(s.transactionNo)>=80001)],header={transactionNo:80002,transactionDate:day,transactionCode:'ROOM',transactionDescription:'Package accommodation',reference:check,checkNo:check,cashierInfo:{cashierId:8},groupTypeInfo:{groupId:check,groupCount:3,groupDescription:'Package accommodation'}};
 f.page.windows[0].totalResults=2;f.page.windows[0].folios[0].folioNo=88;f.page.windows[0].folios[0].postings.push(header,...members.map(s=>({transactionNo:Number(s.transactionNo),transactionDate:String(s.transactionDate),transactionCode:String(s.transactionCode),reference:String(s.reference),checkNo:check,cashierInfo:{cashierId:8},groupTypeInfo:{subGroupId:check}})));
 const hotel=(value:unknown)=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(['hotel','hotelId'].includes(key)&&child==='KAT')Reflect.set(value,key,'TSAN');else hotel(child);}};hotel(p);hotel(f.page);hotel(f.proof);
 const rebind=()=>{p.arOnlyPosProof!.sourceBefore=structuredClone(arOnlyTaxSource(p));p.arOnlyPosProof!.sourceAfter=structuredClone(arOnlyTaxSource(p));f.proof.sourceBefore=structuredClone(arOnlyTaxSource(p));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(p));f.proof.contexts[0].before=[structuredClone(f.page)];f.proof.contexts[0].after=[structuredClone(f.page)];};rebind();return {...f,packet:p,wrapper,root,members,header,rebind};
}
