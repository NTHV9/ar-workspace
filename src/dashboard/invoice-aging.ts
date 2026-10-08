import {validSourceBucket,type Account,type RefreshState} from '../domain/portfolio';
import type {AgingInvoicesResponse} from '../../worker/dashboard/aging-model';
import type {Source} from './data';
import {agingBucketKey} from './aging-model';
import {agingCountFor} from './aging-invoice-data';

/** A display projection only. Never overwrite the published OPERA account or invoice.
 * Every range and the net must reconcile in cents and belong to the same publication.
 */
export function invoiceAgingAccounts(catalog:Account[],source:Source<AgingInvoicesResponse>,refresh:RefreshState|undefined,today:string):Account[]{
 return catalog.map(account=>{
  const cents=(v:string|number)=>Math.round(Number(v)*100);
  const exactCents=(v:number)=>Number.isFinite(v)&&Number.isSafeInteger(cents(v))&&Math.abs(v*100-cents(v))<=1e-6;
  const native=account.agingBuckets;
  const financiallyVerified=(account.verification_state==='verified'||account.verification_state==='cleared'&&account.open===0)&&!!native?.length&&native.every(b=>validSourceBucket(b)&&[b.amount,b.debit,b.credit].every(exactCents)&&b.credit>=0&&cents(b.debit)-cents(b.credit)===cents(b.amount))&&new Set(native.map(agingBucketKey)).size===native.length&&exactCents(account.open)&&native.reduce((n,b)=>n+cents(b.amount),0)===cents(account.open);
  const unavailable=(credits?:Account['agingAccountCredits'],_membership?:Account['membership'])=>({...account,agingBasis:financiallyVerified?'source' as const:'unavailable' as const,membership:{contract:'opera_reconciled_v1' as const,state:'unavailable' as const,offsetDays:null},agingAccountCredits:financiallyVerified?credits:undefined});
  if(!source.data||source.data.asOfDate!==today||!account.agingBuckets?.length)return unavailable();
  if(agingCountFor({members:[account]},'Total',undefined,source,refresh).state!=='ready')return unavailable();
  const saved=source.data.accounts.find(a=>a.hotel===account.hotel&&a.accountId===account.id);
  if(!saved||saved.unverified!==0)return unavailable();
  const net=saved.buckets.find(b=>b.key===null);
  if(!net?.complete||net.amount===null||net.count===null||net.creditAmount===null)return unavailable();
  let accountCredits:NonNullable<Account['agingAccountCredits']>=[];
  if(cents(net.amount)!==cents(account.open)){
   // An account-level credit is not an invoice. Accept its explicit source buckets
   // only when there are no invoice credits to overlap and both ledgers reconcile.
   const nativeCredit=account.agingBuckets.reduce((n,b)=>n+cents(b.credit),0);
   const nativeDebit=account.agingBuckets.reduce((n,b)=>n+cents(b.debit),0);
   const nativeNet=account.agingBuckets.reduce((n,b)=>n+cents(b.amount),0);
   if(![nativeCredit,nativeDebit,nativeNet].every(Number.isSafeInteger)||cents(net.creditAmount)!==0||!account.agingBuckets.every(b=>[b.credit,b.debit,b.amount].every(Number.isFinite)&&b.credit>=0&&cents(b.debit)-cents(b.credit)===cents(b.amount))||nativeDebit!==cents(net.amount)||nativeNet!==cents(account.open)||nativeCredit<=0||cents(net.amount)-nativeCredit!==cents(account.open))return unavailable();
   accountCredits=account.agingBuckets.filter(b=>b.credit>0).map(b=>({bucketKey:agingBucketKey(b),amount:b.credit}));
  }
  if(saved.membership?.contract!=='opera_reconciled_v1'||saved.membership.state!=='resolved'||![0,-1].includes(saved.membership.offsetDays as number)||!saved.complete||saved.buckets.length!==account.agingBuckets.length+1)return unavailable(accountCredits,saved.membership);
  let total=0,credit=0,count=0;
  const buckets=[];
  for(const definition of account.agingBuckets){
   const cell=saved.buckets.find(b=>b.key===agingBucketKey(definition));
   if(!cell?.complete||cell.amount===null||cell.creditAmount===null||cell.count===null)return unavailable();
   const amount=cents(cell.amount),cr=cents(cell.creditAmount),debit=amount+cr;
   if(![amount,cr,debit].every(Number.isSafeInteger)||cr<0||debit<0)return unavailable();
   total+=amount;credit+=cr;count+=cell.count;
   const accountCredit=accountCredits.find(c=>c.bucketKey===agingBucketKey(definition))?.amount??0;
   buckets.push({...definition,amount:(amount-cents(accountCredit))/100,debit:amount/100,credit:accountCredit});
  }
  if(![total,credit,count].every(Number.isSafeInteger)||total!==cents(net.amount)||credit!==cents(net.creditAmount)||count!==net.count)return unavailable();
  const ledgerBuckets=buckets;
  if(ledgerBuckets.some((b,i)=>['amount','debit','credit'].some(key=>cents(b[key as 'amount'])!==cents(account.agingBuckets![i][key as 'amount']))))return unavailable();
  return {...account,membership:saved.membership,agingBasis:'invoices' as const,agingAccountCredits:accountCredits,agingBuckets:ledgerBuckets,over90:ledgerBuckets.filter(b=>b.start!==null&&b.start>90).reduce((n,b)=>n+cents(b.amount),0)/100};
 });
}
