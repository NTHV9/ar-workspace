import type {Amount} from './model';

/** Entry amounts match numeric(18,2); never round an over-precise amount. */
export function parseAmount(value:unknown):Amount|null {
 if(value===null)return null;
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value))throw Error('remittance_amount_invalid');
 return satangToAmount(amountToSatang(value));
}
export function parseAmountInput(value:string):Amount|null {return value.trim()===''?null:parseAmount(value.trim());}

/** Saved OPERA amounts and aggregate totals may be signed or exceed entry limits. */
export function amountToSatang(value:string):bigint {
 if(!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))throw Error('remittance_amount_invalid');
 const negative=value.startsWith('-');const [whole,fraction='']=value.replace(/^-/,'').split('.');
 const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return negative?-amount:amount;
}
export function satangToAmount(value:bigint):Amount {
 const absolute=value<0n?-value:value;
 return `${value<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}
export function formatAmount(value:Amount|null):string {
 if(value===null)return 'Not specified';
 const normalized=satangToAmount(amountToSatang(value));
 const [whole,fraction]=normalized.replace(/^-/,'').split('.');
 return `${normalized.startsWith('-')?'-':''}฿${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction}`;
}
