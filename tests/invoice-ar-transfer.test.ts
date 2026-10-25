import {expect,it} from 'vitest';
import {verifyArTransfer,revalidateArTransfer,type ArTransferInput} from '../worker/invoice/ar-transfer';

const money=(amount:number)=>({amount,currencyCode:'THB'});
function fixture():ArTransferInput{
 const identity={hotelId:'KAT',invoiceNo:99,folioNo:88,folioDate:'2026-01-16',transactionDate:'2026-01-16',reservationId:{type:'Reservation',id:'777'},internalFolioWindowID:'456',compressed:false};
 const current={...identity,transactionNo:900,amount:money(107),balance:money(80),transferredIn:true,transferredOut:false};
 const positive={...identity,transactionNo:101,amount:money(107),balance:money(0),transferredIn:false,transferredOut:true};
 const negative={...positive,transactionNo:202,amount:money(-107)};
 const rows=[{transactionNo:11,transactionCode:'BASE',transactionDate:'2026-01-16',debitAmount:money(100),checkNo:'SYN-CHECK',reference:'SYN REF',remark:'SYN REMARK'},{transactionNo:31,transactionCode:'VAT',transactionDate:'2026-01-16',debitAmount:money(7)}];
 const source={hotelId:'KAT',accountId:{type:'AccountId',id:'100'},accountNo:'SYN-SOURCE'};
 return {manifest:{id:'900',hotel:'KAT',account_id:'200',invoice_no:'99',folio_no:'88',reservation_id:'777',folio_date:'2026-01-16',open:80,collection_role:'standalone'},account:{hotelId:'KAT',accountId:{type:'AccountId',id:'200'},accountNo:'SYN-DEST',invoices:[current]},invoice:structuredClone(current),postings:{invoicePostingsDetails:rows},postedRows:rows.map(r=>({...r,folioNo:88,aRInfo:{accountNumber:'SYN-SOURCE',invoiceNo:99}})),sourceAccounts:{accountsDetails:[source],offset:20,limit:20,totalPages:1,totalResults:1,hasMore:false},sourceHistory:{details:[{...source,invoices:[negative,positive]}],offset:20,limit:20,totalPages:1,totalResults:2,hasMore:false},sourcePostings:{request:{hotel:'KAT',accountId:'100',transactionId:'101',invoiceNo:'99',folioNo:'88',internalFolioWindowId:'456'},response:{invoicePostingsDetails:structuredClone(rows)}}};
}
const mutable=(value:unknown)=>value as Record<string,any>;
it('qualifies only the exact complete closed pair and all selected source postings',()=>{
 const input=fixture(),evidence=verifyArTransfer(input);
 expect(evidence).toMatchObject({version:1,hotel:'KAT',destinationAccountId:'200',destinationAccountNumber:'SYN-DEST',currentInvoiceId:'900',sourceAccountId:'100',sourceAccountNumber:'SYN-SOURCE',positiveInvoiceId:'101',offsetInvoiceId:'202',grossCents:10700,balanceCents:8000,postingIds:['11','31']});
 expect(evidence.proof).toEqual(input);expect(evidence.proof).not.toBe(input);
 expect(revalidateArTransfer(evidence,structuredClone(input))).toMatchObject({positiveInvoiceId:'101'});
});
it('matches by exact identities without depending on row order, names, or adjacent IDs',()=>{
 const input=fixture();mutable(input.sourcePostings.response).invoicePostingsDetails.reverse();mutable(input.sourceHistory).details[0].invoices.reverse();mutable(input.sourceAccounts).accountsDetails[0].accountName='DIFFERENT LABEL';
 expect(verifyArTransfer(input).postingIds).toEqual(['11','31']);
});
it.each(['missing-source-number','missing-destination-number','no-transfer','outgoing-destination','compressed','parent','ambiguous-current','missing-current','current-amount','current-balance','current-window','current-reservation','missing-manifest-id','two-sources','unselected-detail','detail-code','detail-amount','same-account','source-hotel','ambiguous-source','source-more','source-count','history-more','history-count','history-offset','history-account','history-number','extra-history','history-invoice','history-folio','history-date','history-reservation','history-window','history-flags','history-balance','history-amount','history-currency','history-duplicate','history-current-id','wrong-source-request','wrong-positive-request','wrong-window-request','postings-ids','postings-code','postings-date','postings-debit','postings-credit','postings-check','postings-ref','postings-remark','postings-currency','postings-duplicate','postings-empty'] as const)('refuses unproven transfer evidence (%s)',kind=>{
 const p=fixture(),a=mutable(p.account),current=a.invoices[0],source=mutable(p.sourceAccounts),history=mutable(p.sourceHistory),h=history.details[0],positive=h.invoices[1],sourceRows=mutable(p.sourcePostings.response).invoicePostingsDetails;
 if(kind==='missing-source-number')for(const row of p.postedRows as any[])delete row.aRInfo.accountNumber;
 if(kind==='missing-destination-number')delete a.accountNo;
 if(kind==='no-transfer')current.transferredIn=false;
 if(kind==='outgoing-destination')current.transferredOut=true;
 if(kind==='compressed')current.compressed=true;
 if(kind==='parent')current.parentInvoiceNo=1;
 if(kind==='ambiguous-current')a.invoices.push(structuredClone(current));
 if(kind==='missing-current')a.invoices=[];
 if(kind==='current-amount')mutable(p.invoice).amount=money(108);
 if(kind==='current-balance')current.balance=money(81);
 if(kind==='current-window')mutable(p.invoice).internalFolioWindowID='other';
 if(kind==='current-reservation')delete current.reservationId;
 if(kind==='missing-manifest-id')p.manifest.reservation_id=null;
 if(kind==='two-sources')mutable(p.postedRows[1]).aRInfo.accountNumber='OTHER';
 if(kind==='unselected-detail')mutable(p.postedRows[0]).transactionNo=7777;
 if(kind==='detail-code')mutable(p.postedRows[0]).transactionCode='OTHER';
 if(kind==='detail-amount')mutable(p.postedRows[0]).debitAmount=money(101);
 if(kind==='same-account')source.accountsDetails[0].accountId.id='200';
 if(kind==='source-hotel')source.accountsDetails[0].hotelId='TSK';
 if(kind==='ambiguous-source')source.accountsDetails.push(structuredClone(source.accountsDetails[0]));
 if(kind==='source-more')source.hasMore=true;
 if(kind==='source-count')source.totalResults=2;
 if(kind==='history-more')history.hasMore=true;
 if(kind==='history-count')history.totalResults=3;
 if(kind==='history-offset')history.offset=40;
 if(kind==='history-account')h.accountId.id='OTHER';
 if(kind==='history-number')h.accountNo='OTHER';
 if(kind==='extra-history')h.invoices.push({...positive,transactionNo:303});
 if(kind==='history-invoice')positive.invoiceNo=100;
 if(kind==='history-folio')positive.folioNo=89;
 if(kind==='history-date')positive.transactionDate='2026-01-17';
 if(kind==='history-reservation')positive.reservationId={type:'Reservation',id:'OTHER'};
 if(kind==='history-window')positive.internalFolioWindowID='OTHER';
 if(kind==='history-flags')positive.transferredIn=true;
 if(kind==='history-balance')positive.balance=money(1);
 if(kind==='history-amount')positive.amount=money(106);
 if(kind==='history-currency')positive.amount.currencyCode='USD';
 if(kind==='history-duplicate')positive.transactionNo=h.invoices[0].transactionNo;
 if(kind==='history-current-id')positive.transactionNo=900;
 if(kind==='wrong-source-request')p.sourcePostings.request.accountId='200';
 if(kind==='wrong-positive-request')p.sourcePostings.request.transactionId='202';
 if(kind==='wrong-window-request')p.sourcePostings.request.internalFolioWindowId='OTHER';
 if(kind==='postings-ids')sourceRows[1].transactionNo=32;
 if(kind==='postings-code')sourceRows[1].transactionCode='OTHER';
 if(kind==='postings-date')sourceRows[1].transactionDate='2026-01-17';
 if(kind==='postings-debit')sourceRows[1].debitAmount=money(8);
 if(kind==='postings-credit')sourceRows[1].creditAmount=money(1);
 if(kind==='postings-check')sourceRows[0].checkNo='OTHER';
 if(kind==='postings-ref')sourceRows[0].reference='OTHER';
 if(kind==='postings-remark')sourceRows[0].remark='OTHER';
 if(kind==='postings-currency')sourceRows[0].debitAmount.currencyCode='USD';
 if(kind==='postings-duplicate')sourceRows.push(structuredClone(sourceRows[0]));
 if(kind==='postings-empty')sourceRows.length=0;
 expect(()=>verifyArTransfer(p)).toThrow('document_invoice_ar_transfer_unverified');
});
it('rejects changed complete source evidence even when the fresh snapshot independently qualifies',()=>{
 const p=fixture(),e=verifyArTransfer(p),fresh=structuredClone(p);mutable(fresh.sourceHistory).details[0].invoices[0].transactionNo=203;
 expect(verifyArTransfer(fresh).offsetInvoiceId).toBe('203');expect(()=>revalidateArTransfer(e,fresh)).toThrow('document_invoice_ar_transfer_unverified');
});
it('rechecks retained proof and rejects forged normalized evidence',()=>{
 const p=fixture(),e=verifyArTransfer(p);e.sourceAccountId='999';expect(()=>revalidateArTransfer(e,p)).toThrow('document_invoice_ar_transfer_unverified');
 const other=verifyArTransfer(p);mutable(other.proof.sourceHistory).details[0].invoices[0].balance=money(1);expect(()=>revalidateArTransfer(other,p)).toThrow('document_invoice_ar_transfer_unverified');
});
it.each(['deferredTax','postedAmount','subPostings'])('rejects a changed posted tax fact even if account-transfer provenance still qualifies (%s)',field=>{
 const input=fixture(),evidence=verifyArTransfer(input),fresh=structuredClone(input),row=mutable(fresh.postedRows[0]);
 if(field==='deferredTax')row.deferredTax=true;
 if(field==='postedAmount')row.postedAmount=money(99);
 if(field==='subPostings')row.subPostings=[{transactionNo:333}];
 expect(verifyArTransfer(fresh).positiveInvoiceId).toBe(evidence.positiveInvoiceId);expect(()=>revalidateArTransfer(evidence,fresh)).toThrow('document_invoice_ar_transfer_unverified');
});

it.each(['invoiceNo','folioNo'])('requires exact invoice and folio scope on every AR detail row (%s)',field=>{
 const input=fixture(),row=mutable(input.postedRows[0]);if(field==='invoiceNo')delete row.aRInfo.invoiceNo;else delete row.folioNo;
 expect(()=>verifyArTransfer(input)).toThrow('document_invoice_ar_transfer_unverified');
});
it.each(['invoiceNo','folioNo','guestInfo','hotelId','folioWindowNo','referenceTransactionNo'])('refuses removal of an originally present posting scope fact (%s)',field=>{
 const input=fixture(),row=mutable(input.postedRows[0]);
 Object.assign(row,{hotelId:'KAT',folioWindowNo:1,guestInfo:{reservationId:{id:'777',type:'Reservation'}},referenceTransactionNo:44});
 const evidence=verifyArTransfer(input),fresh=structuredClone(input),changed=mutable(fresh.postedRows[0]);if(field==='invoiceNo')delete changed.aRInfo.invoiceNo;else delete changed[field];
 expect(()=>revalidateArTransfer(evidence,fresh)).toThrow('document_invoice_ar_transfer_unverified');
});
