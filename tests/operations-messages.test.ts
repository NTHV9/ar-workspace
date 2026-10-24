import {expect,it} from 'vitest';
import {operationMessages} from '../worker/operations/messages';
it('explains an unverified exact-invoice tax breakdown without exposing an internal error code',()=>{
 expect(operationMessages.document_invoice_direct_zero_tax_unverified).toBe('Tax details could not be verified for this exact invoice. Use the invoice printed from OPERA for this item.');
});
