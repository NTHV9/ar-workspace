export interface NativeInvoiceFullTotals {currency:'THB';gross:number;net:number;vat:number;nonTaxable:number}
export interface NativeNonVatInput {chargeGross:number;postedVAT:number;inferredNonVAT:number;candidates:{id:string;signedCents:number}[];fullTotals?:NativeInvoiceFullTotals}
const fail=():never=>{throw Error('document_invoice_native_nonvat_unverified');};
const cents=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):fail();
function sums(values:bigint[]):bigint[]{
 const result=[0n];for(const value of values){const length=result.length;for(let n=0;n<length;n++)result.push(result[n]+value);}return result;
}
function attainable(values:bigint[],target:bigint,total:bigint):boolean{
 // These two proofs need no search, regardless of the number of charges.
 if(target===0n||target===total)return true;
 const nonzero=values.filter(v=>v!==0n);if(nonzero.length>24)return false;
 const min=nonzero.filter(v=>v<0n).reduce((a,b)=>a+b,0n),max=nonzero.filter(v=>v>0n).reduce((a,b)=>a+b,0n);
 if(target<min||target>max)return false;
 // At most 4,096 sums per half. Keep signed charges separate: cancellation
 // does not erase the possibility that only one side was non-taxable.
 const middle=Math.floor(nonzero.length/2),left=new Set(sums(nonzero.slice(0,middle)));
 return sums(nonzero.slice(middle)).some(right=>left.has(target-right));
}
/** The caller must supply every fully scoped ambiguous direct Revenue charge,
 * and no other inferred NonVAT. Native totals own the aggregate; finding a
 * possible subset does not assign a tax classification to any individual row. */
export function qualifyNativeNonVat(input:NativeNonVatInput):{nonTaxable:number;taxableNet:number}{
 try{
  const gross=cents(input.chargeGross),vat=cents(input.postedVAT),inferred=cents(input.inferredNonVAT),totals=input.fullTotals??fail();
  if(totals.currency!=='THB')fail();
  const nativeGross=cents(totals.gross),nativeVAT=cents(totals.vat),net=cents(totals.net),nonTaxable=cents(totals.nonTaxable);
  if(nativeGross!==gross||nativeVAT!==vat||net+nativeVAT+nonTaxable!==nativeGross)fail();
  if(!Array.isArray(input.candidates)||!input.candidates.length||input.candidates.length>4000)fail();
  const ids=new Set<string>(),amounts=input.candidates.map(candidate=>{
   if(typeof candidate.id!=='string'||!candidate.id||candidate.id!==candidate.id.trim()||candidate.id.length>200||/[\u0000-\u001f\u007f]/.test(candidate.id)||ids.has(candidate.id))fail();
   ids.add(candidate.id);return cents(candidate.signedCents);
  });
  const total=amounts.reduce((a,b)=>a+b,0n);if(total!==inferred||!attainable(amounts,nonTaxable,total))fail();
  return {nonTaxable:totals.nonTaxable,taxableNet:totals.net};
 }catch{return fail();}
}
