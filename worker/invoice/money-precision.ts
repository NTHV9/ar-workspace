const fail=(stage:string):never=>{throw Error('document_invoice_'+stage);};
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('data_invalid');return v as Record<string,unknown>;};
export const UNIT=1000000000000n,CENT=UNIT/100n;
export function precise(v:unknown):bigint{
 const a=record(v);if(a.currencyCode!=='THB'||typeof a.amount!=='number'||!Number.isFinite(a.amount))return fail('currency_invalid');
 const m=String(a.amount).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);if(!m)return fail('amount_invalid');
 const frac=m[3]??'',shift=12+Number(m[4]??0)-frac.length;if(Math.abs(shift)>50)return fail('amount_invalid');let n=BigInt(m[2]+frac);n=shift>=0?n*10n**BigInt(shift):n/10n**BigInt(-shift);return m[1]?-n:n;
}
export const abs=(n:bigint)=>n<0n?-n:n;
export const rounded=(units:bigint)=>{const n=Number((abs(units)+CENT/2n)/CENT)*(units<0n?-1:1);if(!Number.isSafeInteger(n))return fail('amount_invalid');return n;};
