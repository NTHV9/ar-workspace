import {record} from '../../worker/invoice/model';
import {arOnlyTaxSource} from '../../worker/invoice/current-ar-tax';
import {currentPacket} from './invoice-current-ar-tax';
import {money} from './invoice-packet';
import type {ArTransferInput} from '../../worker/invoice/ar-transfer';
/** Synthetic same-hotel full-transfer lineage with one unposted AR root and
 * independently posted wrapper VAT. No generated tax IDs are fabricated. */
export function transferProjectionPacket(amount=-100){
 const original=currentPacket(amount),{currentArTaxProof:unused,arSimulations:simulations,...base}=original;
 const current={...base.invoice,transactionDate:'2026-01-15',reservationId:{id:'777',type:'Reservation'},internalFolioWindowID:'456',balance:money(3000),transferredIn:true,transferredOut:false,compressed:false};
 const p={...base,manifest:{...base.manifest,open:3000},account:{...base.account,accountId:{id:'101',type:'AccountId'},accountNo:'SYN-DEST',invoices:[current]},invoice:current};
 for(const d of p.postings.trxCodesInfo)if(d.transactionCode==='AR-ADJUSTMENT')Reflect.set(d,'transactionGroup','RM');
 for(const root of p.arDetails[0].response.transactions)root.aRInfo.accountNumber='SYN-SOURCE';
 const source={hotelId:'KAT',accountId:{id:'202',type:'AccountId'},accountNo:'SYN-SOURCE'},positive={...current,transactionNo:700,amount:money(3315+amount),balance:money(0),transferredIn:false,transferredOut:true},negative={...positive,transactionNo:701,amount:money(-3315-amount)};
 const lineage:ArTransferInput={manifest:p.manifest,account:p.account,invoice:p.invoice,postings:p.postings,postedRows:structuredClone(p.arDetails[0].response.transactions),sourceAccounts:{accountsDetails:[source],offset:20,limit:20,totalResults:1,hasMore:false},sourceHistory:{details:[{...source,invoices:[negative,positive]}],offset:20,limit:20,totalResults:2,hasMore:false},sourcePostings:{request:{hotel:'KAT',accountId:'202',transactionId:'700',invoiceNo:'99',folioNo:'88',internalFolioWindowId:'456'},response:structuredClone(p.postings)}};
 const component={kind:'transferred-current-ar-rules-vat7' as const,lineageBefore:lineage,lineageAfter:structuredClone(lineage),roots:simulations.map(e=>({...e,calculationAfter:structuredClone(e.calculation)}))};
 const proof={version:3 as const,kind:'ar-only-source-claims' as const,sourceBefore:structuredClone(arOnlyTaxSource(p)),sourceAfter:structuredClone(arOnlyTaxSource(p)),components:[component]};Reflect.set(p,'arOnlySourceClaimsProof',proof);
 return {p,simulations,lineage,lineageAfter:component.lineageAfter,component,proof};
}

export function transferProjectionTwoRoots(){const f=transferProjectionPacket(-0.1),selected=structuredClone(f.p.postings.invoicePostingsDetails[1]),root=structuredClone(f.p.arDetails[0].response.transactions[0]);selected.transactionNo=root.transactionNo=60002;f.p.postings.invoicePostingsDetails.push(selected);f.p.arDetails[0].ids.push('60002');f.p.arDetails[0].response.transactions.push(root);f.p.invoice.amount=money(3314.8);f.lineage.invoice=f.p.invoice;f.lineage.postedRows=structuredClone(f.p.arDetails[0].response.transactions);f.lineage.sourcePostings.response=structuredClone(f.p.postings);const history=record(f.lineage.sourceHistory).details;if(!Array.isArray(history))throw Error('fixture');const invoices=record(history[0]).invoices;if(!Array.isArray(invoices))throw Error('fixture');record(invoices[0]).amount=money(-3314.8);record(invoices[1]).amount=money(3314.8);f.component.lineageAfter=structuredClone(f.lineage);f.component.roots.push({...structuredClone(f.component.roots[0]),postingId:'60002'});f.proof.sourceBefore=structuredClone(arOnlyTaxSource(f.p));f.proof.sourceAfter=structuredClone(arOnlyTaxSource(f.p));return f;}
