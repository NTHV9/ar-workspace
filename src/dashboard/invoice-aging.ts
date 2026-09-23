import type {Account,RefreshState} from '../domain/portfolio';
import type {AgingInvoicesResponse} from '../../worker/dashboard/aging-model';
import type {Source} from './data';
import {agingBucketKey} from './aging-model';
import {agingCountFor} from './aging-invoice-data';

/** A display projection only. Never overwrite the published OPERA account or invoice.
 * Every range and the net must reconcile in cents and belong to the same publication.
 */
export function invoiceAgingAccounts(catalog:Account[],source:Source<AgingInvoicesResponse>,refresh:RefreshState|undefined,today:string):Account[]{
 return catalog.map(account=>{
  const unavailable=()=>({...account,agingBasis:'unavailable' as const,agingAccountCredits:undefined});
  if(!source.data||source.data.asOfDate!==today||!account.agingBuckets?.length)return unavailable();
  if(agingCountFor({members:[account]},'Total',undefined,source,refresh).state!=='ready')return unavailable();
  const saved=source.data.accounts.find(a=>a.hotel===account.hotel&&a.accountId===account.id);
  if(!saved?.complete||saved.unverified!==0||saved.buckets.length!==account.agingBuckets.length+1)return unavailable();
  const net=saved.buckets.find(b=>b.key===null);
  if(!net?.complete||net.amount===null||net.count===null||net.creditAmount===null)return unavailable();
  const cents=(v:string|number)=>Math.round(Number(v)*100);
  let accountCredits:NonNullable<Account['agingAccountCredits']>=[];
  if(cents(net.amount)!==cents(account.open)){
   // An account-level credit is not an invoice. Accept its explicit source buckets
   // only when there are no invoice credits to overlap and both ledgers reconcile.
   const nativeCredit=account.agingBuckets.reduce((n,b)=>n+cents(b.credit),0);
   const nativeDebit=account.agingBuckets.reduce((n,b)=>n+cents(b.debit),0);
   const nativeNet=account.agingBuckets.reduce((n,b)=>n+cents(b.amount),0);
   if(![nativeCredit,nativeDebit,nativeNet].every(Number.isSafeInteger)||cents(net.creditAmount)!==0||!account.agingBuckets.every(b=>[b.credit,b.debit,b.amount].every(Number.isFinite)&&b.credit>=0&&b.debit>=0&&cents(b.debit)-cents(b.credit)===cents(b.amount))||nativeDebit!==cents(net.amount)||nativeNet!==cents(account.open)||nativeCredit<=0||cents(net.amount)-nativeCredit!==cents(account.open))return unavailable();
   accountCredits=account.agingBuckets.filter(b=>b.credit>0).map(b=>({bucketKey:agingBucketKey(b),amount:b.credit}));
  }
  let total=0,credit=0,count=0;
  const buckets=[];
  for(const definition of account.agingBuckets){
   const cell=saved.buckets.find(b=>b.key===agingBucketKey(definition));
   if(!cell?.complete||cell.amount===null||cell.creditAmount===null||cell.count===null)return unavailable();
   const amount=cents(cell.amount),cr=cents(cell.creditAmount),debit=amount+cr;
   if(![amount,cr,debit].every(Number.isSafeInteger)||cr<0||debit<0)return unavailable();
   total+=amount;credit+=cr;count+=cell.count;
   buckets.push({...definition,amount:amount/100,debit:debit/100,credit:cr/100});
  }
  if(![total,credit,count].every(Number.isSafeInteger)||total!==cents(net.amount)||credit!==cents(net.creditAmount)||count!==net.count)return unavailable();
  const ledgerBuckets=buckets.map(b=>{const cr=accountCredits.find(c=>c.bucketKey===agingBucketKey(b))?.amount??0;return {...b,amount:(cents(b.amount)-cents(cr))/100,credit:(cents(b.credit)+cents(cr))/100};});
  return {...account,agingBasis:'invoices' as const,agingAccountCredits:accountCredits,agingBuckets:ledgerBuckets,over90:ledgerBuckets.filter(b=>b.start!==null&&b.start>90).reduce((n,b)=>n+cents(b.amount),0)/100};
 });
}
