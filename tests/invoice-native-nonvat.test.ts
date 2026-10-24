import {expect,it} from 'vitest';
import {qualifyNativeNonVat,type NativeNonVatInput} from '../worker/invoice/native-nonvat';
function fixture(nonTaxable=0):NativeNonVatInput{return {chargeGross:10700,postedVAT:700,inferredNonVAT:3000,candidates:[{id:'charge-a',signedCents:1000},{id:'charge-b',signedCents:2000}],fullTotals:{currency:'THB',gross:10700,net:10000-nonTaxable,vat:700,nonTaxable}};}
it.each([0,1000,2000,3000])('uses actual native aggregate only when whole charges can explain it (%s)',nonTaxable=>{
 expect(qualifyNativeNonVat(fixture(nonTaxable))).toEqual({nonTaxable,taxableNet:10000-nonTaxable});
});
it('refuses a partial amount inside the signed range that no whole charge explains',()=>{expect(()=>qualifyNativeNonVat(fixture(500))).toThrow('document_invoice_native_nonvat_unverified');});
it.each([-300,0,700,1000,1700,2000,2700,3000])('preserves signed whole-charge possibilities without cancelling candidates (%s)',nonTaxable=>{
 const p=fixture(nonTaxable);p.candidates.push({id:'credit',signedCents:-300});p.inferredNonVAT=2700;
 expect(qualifyNativeNonVat(p)).toEqual({nonTaxable,taxableNet:10000-nonTaxable});
});
it('does not collapse opposite signed charges before testing attainable subsets',()=>{
 const p=fixture(1000);p.candidates=[{id:'debit',signedCents:1000},{id:'credit',signedCents:-1000}];p.inferredNonVAT=0;
 expect(qualifyNativeNonVat(p)).toEqual({nonTaxable:1000,taxableNet:9000});
});
it.each(['missing','currency','gross','vat','arithmetic','inferred','duplicate','missing-id','fractional-candidate','nan','unsafe','fractional-total','zero-candidates'] as const)('refuses insufficient or inconsistent native qualification (%s)',kind=>{
 const p=fixture(2000);
 if(kind==='missing')delete p.fullTotals;
 if(kind==='currency')Object.assign(p.fullTotals!,{currency:'USD'});
 if(kind==='gross'){p.fullTotals!.gross++;p.fullTotals!.net++;}
 if(kind==='vat'){p.fullTotals!.vat++;p.fullTotals!.net--;}
 if(kind==='arithmetic')p.fullTotals!.net++;
 if(kind==='inferred')p.inferredNonVAT++;
 if(kind==='duplicate')p.candidates[1].id=p.candidates[0].id;
 if(kind==='missing-id')Object.assign(p.candidates[0],{id:undefined});
 if(kind==='fractional-candidate')p.candidates[0].signedCents=.5;
 if(kind==='nan')p.postedVAT=NaN;
 if(kind==='unsafe')p.chargeGross=Number.MAX_SAFE_INTEGER+1;
 if(kind==='fractional-total')p.fullTotals!.net+=.5;
 if(kind==='zero-candidates'){p.candidates=[];p.inferredNonVAT=0;}
 expect(()=>qualifyNativeNonVat(p)).toThrow('document_invoice_native_nonvat_unverified');
});
it('finds a subset requiring both halves of the maximum bounded search',()=>{
 const p=fixture();p.candidates=Array.from({length:24},(_,n)=>({id:'charge-'+n,signedCents:2**n}));p.inferredNonVAT=16777215;p.chargeGross=100000000;
 p.fullTotals={currency:'THB',gross:100000000,vat:700,nonTaxable:8388609,net:91610691};
 expect(qualifyNativeNonVat(p)).toEqual({nonTaxable:8388609,taxableNet:91610691});
});
it('refuses a nontrivial search exceeding twenty-four nonzero charges',()=>{
 const p=fixture(1);p.candidates=Array.from({length:25},(_,n)=>({id:'charge-'+n,signedCents:n+1}));p.inferredNonVAT=325;
 expect(()=>qualifyNativeNonVat(p)).toThrow('document_invoice_native_nonvat_unverified');
});
it.each([0,325])('allows an exact zero or full-sum proof without exponential search (%s)',nonTaxable=>{
 const p=fixture(nonTaxable);p.candidates=Array.from({length:25},(_,n)=>({id:'charge-'+n,signedCents:n+1}));p.inferredNonVAT=325;
 expect(qualifyNativeNonVat(p).nonTaxable).toBe(nonTaxable);
});
it('still rejects duplicate zero-valued charge identities on the fast path',()=>{
 const p=fixture();p.candidates.push({id:'charge-a',signedCents:0});expect(()=>qualifyNativeNonVat(p)).toThrow('document_invoice_native_nonvat_unverified');
});
it('never creates an attainable satang through unsafe intermediate subset rounding',()=>{
 const p=fixture(1),maximum=Number.MAX_SAFE_INTEGER;p.candidates=[{id:'credit',signedCents:-maximum},{id:'debit',signedCents:maximum},{id:'small',signedCents:2}];p.inferredNonVAT=2;
 // A Number-based right-half sum MAX_SAFE_INTEGER + 2 rounds down, falsely
 // making one satang attainable after cancellation with the negative charge.
 expect(()=>qualifyNativeNonVat(p)).toThrow('document_invoice_native_nonvat_unverified');
});
it('checks footer arithmetic exactly when safe individual amounts cancel an unsafe intermediate sum',()=>{
 const maximum=Number.MAX_SAFE_INTEGER,p:NativeNonVatInput={chargeGross:2,postedVAT:2,inferredNonVAT:-maximum,candidates:[{id:'credit',signedCents:-maximum}],fullTotals:{currency:'THB',gross:2,net:maximum,vat:2,nonTaxable:-maximum}};
 expect(qualifyNativeNonVat(p)).toEqual({nonTaxable:-maximum,taxableNet:maximum});
});
