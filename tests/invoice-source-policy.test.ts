import {expect,it} from 'vitest';
import {assertInvoiceWorkflowPolicy} from '../worker/documents/source-policy';

it.each(['pdfProbe','folioTypeProbe','invoiceContractJob','invoiceGuestProbe','invoiceLedgerProbe','invoiceTaxRulesProbe','invoiceRenderProbe','invoiceReadAudit','invoiceModelProbe'])('retires legacy %s before diagnostic work',flag=>{expect(()=>assertInvoiceWorkflowPolicy({[flag]:flag==='invoiceContractJob'?'existing-job':true})).toThrow('document_invoice_source_retired');});
it.each([{documentJob:true},{financialHistory:true},{historyAudit:true},{mailReconcile:true},{}])('preserves ordinary work %j',payload=>{expect(()=>assertInvoiceWorkflowPolicy(payload)).not.toThrow();});
it.each(['pdfProbe','invoiceGuestProbe','invoiceModelProbe'])('refuses %s even when combined with ordinary work and acceptance',flag=>{expect(()=>assertInvoiceWorkflowPolicy({documentJob:true,scheduledMaintenance:true,acceptanceId:'existing-fixture',[flag]:true})).toThrow('document_invoice_source_retired');});
