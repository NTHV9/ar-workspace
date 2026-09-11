import {renderStatement} from '../../../worker/statement/render';
export async function syntheticStatement(hotel='KAT',guest='Example, Christopher Longname'){
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(png),c=>c.charCodeAt(0))))].map(b=>b.toString(16).padStart(2,'0')).join('');const asset={width:612,height:1,png,sha256};
 const model={hotel,accountId:'synthetic',accountNo:'SYN001',address:['SYNTHETIC ROW TEST'],printDate:'11/09/26',rows:[{id:'A',date:'01/09/26',folio:'F001',guest,arrival:'01/09/26',departure:'02/09/26',voucher:'V001',debit:10000,credit:0,balance:10000},{id:'B',date:'03/09/26',folio:'F002',guest:'Sample, Michael',arrival:'03/09/26',departure:'04/09/26',voucher:'V002',debit:20000,credit:0,balance:20000}],total:30000,aging:['Up to 30','31 - 60','61 - 90','91 - 120','121 - 150','151 and Over'].map((label,i)=>({label,cents:i?0:30000}))};
 return renderStatement(model,{hotel,version:'rtf-20260909-v3',header:asset,closing:asset,footer:asset});
}
