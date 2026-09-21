import {describe,it,expect} from 'vitest';
import {invoiceModel} from '../worker/invoice/model';
import {invoiceAmountWords} from '../worker/invoice/render';

import {packet,money} from './fixtures/invoice-packet';
const now=new Date('2026-09-21T10:00:00Z');
describe('workspace invoice financial model',()=>{
 it('uses AR outstanding, printed check references and actual VAT excluding service charge',()=>{
  const p=packet(14),m=invoiceModel(p,now);expect(m.gross).toBe(4641000);expect(m.vat).toBe(303617);expect(m.taxableNet).toBe(4337383);expect(m.nonTaxable).toBe(0);expect(m.outstanding).toBe(m.gross);
  expect(m.lines).toHaveLength(14);expect(m.lines[0].reference).toBe('PRINTED-1');expect(m.printDate).toBe('21/09/26');expect(m.printTime).toBe('17:00');
 });
 it('keeps a partial payment out of gross/tax and uses the smaller current AR balance',()=>{
  const p=packet();p.manifest.open-=500;p.invoice.balance=money(p.manifest.open);const m=invoiceModel(p,now);expect(m.gross).toBe(663000);expect(m.outstanding).toBe(613000);expect(m.vat).toBe(43374);
 });
 it('does not add settlement or another invoice tax components into the footer',()=>{
  const p=packet(),extra=structuredClone(p.taxRows.at(-1)!);extra.posting.transactionNo=70000;if(!('referencePackageTransactionNo' in extra.posting))throw Error('Fixture');extra.posting.referencePackageTransactionNo=80000;p.taxRows.push(extra);
  expect(invoiceModel(p,now).gross).toBe(663000);expect(invoiceModel(p,now).vat).toBe(43374);
 });
 it.each(['hotel','folio','reservation'] as const)('rejects %s mismatch in a linked component',kind=>{
  const p=packet();const part=p.taxRows.at(-1)!;if(kind==='hotel')part.posting.hotelId='WAKL';if(kind==='folio')part.posting.folioNo=89;if(kind==='reservation')part.posting.guestInfo.reservationId.id='888';expect(()=>invoiceModel(p,now)).toThrow('tax_scope_invalid');
 });
 it('rejects a wrapper with a missing component instead of inventing VAT',()=>{const p=packet();p.taxRows.pop();expect(()=>invoiceModel(p,now)).toThrow('tax_reconciliation_failed');});
 it('rejects missing and duplicated tax coverage',()=>{const p=packet();p.taxRows=[];expect(()=>invoiceModel(p,now)).toThrow('tax_coverage_missing');const q=packet();q.taxRows.push(q.taxRows[0]);expect(()=>invoiceModel(q,now)).toThrow('tax_duplicate');});
 it('rejects unknown taxes and a changed tax rate rather than labelling them VAT 7%',()=>{const p=packet();p.taxCodes[0].description='Local tourism tax';expect(()=>invoiceModel(p,now)).toThrow('tax_code_unsupported');const q=packet();const last=q.taxRows.at(-1)!;('postingBreakdown' in last?last.postingBreakdown:undefined)!.taxes[1].amount=money(50);expect(()=>invoiceModel(q,now)).toThrow('tax_reconciliation_failed');});
 it('rejects a stale AR balance or incomplete line total',()=>{const p=packet();p.invoice.balance.amount-=1;expect(()=>invoiceModel(p,now)).toThrow('document_source_changed');const q=packet();q.postings.invoicePostingsDetails.pop();expect(()=>invoiceModel(q,now)).toThrow('document_source_changed');});
 it('rejects duplicate AR postings and a foreign currency',()=>{const p=packet();p.postings.invoicePostingsDetails.push(p.postings.invoicePostingsDetails[0]);expect(()=>invoiceModel(p,now)).toThrow('posting_duplicate');const q=packet();q.invoice.balance.currencyCode='USD';expect(()=>invoiceModel(q,now)).toThrow();});
 it('requires complete source dates',()=>{const p=packet();p.reservation.roomStay.arrivalDate='2026-02-30';expect(()=>invoiceModel(p,now)).toThrow('date_invalid');});
 it('supports explicit non-taxable breakdowns without replacing missing taxes with zero',()=>{const p=packet(1);for(const row of p.taxRows)if('postingBreakdown' in row){row.postingBreakdown.netAmount=row.postingBreakdown.grossAmount;row.postingBreakdown.taxes=[];}const m=invoiceModel(p,now);expect(m.nonTaxable).toBe(331500);expect(m.vat).toBe(0);expect(m.taxableNet).toBe(0);});
 it('does not duplicate the currency suffix and spells satang independently',()=>{expect(invoiceAmountWords(963000)).toBe('NINE THOUSAND SIX HUNDRED THIRTY BAHT ONLY');expect(invoiceAmountWords(963051)).toBe('NINE THOUSAND SIX HUNDRED THIRTY BAHT AND FIFTY ONE SATANG');});
 it.each([true,false])('uses the RTF first-name/surname order only for the invoice guest profile (%s)',matches=>{const p=packet(),input={...p,invoice:{...p.invoice,guestProfileId:{id:'321'}},reservation:{...p.reservation,reservationGuest:{id:matches?'321':'999',givenName:'First',surname:'Last'}}};expect(invoiceModel(input,now).guest).toBe(matches?'First Last':'Example Guest');});
 it('uses the custom-reference RTF binding for other hotels and never invents a voucher from a confirmation ID',()=>{const p=packet(),other=JSON.parse(JSON.stringify(p).replaceAll('KAT','WAKL'));expect(invoiceModel({...other,customReference:'CUSTOM-123'},now).voucher).toBe('CUSTOM-123');expect(invoiceModel(other,now).voucher).toBe('');expect(invoiceModel({...p,customReference:'CUSTOM-123'},now).voucher).toBe('VOUCHER-1');});
});
