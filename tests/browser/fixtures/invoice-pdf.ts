import {renderInvoice} from '../../../worker/invoice/render';
import {INVOICE_TEMPLATE_VERSION} from '../../../worker/invoice/types';
import type {InvoiceAssets,InvoiceModel,InvoicePosition} from '../../../worker/invoice/types';
export async function syntheticInvoice(count=3,voucher='VCH-001',invoiceId='A',compactHeader=false){
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(png),c=>c.charCodeAt(0))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const image=(height:number)=>({width:612,height,png,sha256}),positions:Record<string,InvoicePosition[]>={};
 const put=(key:string,x:number,top:number,right=x+20,size=8,bold=false)=>{positions[key]=[{x0:x,x1:right,top,bottom:top+size,size,fontname:bold?'Helvetica-Bold':'Helvetica'}];};
 put('ADDRESSEE_FULL_ADDRESS',34,130);put('CUSTOM_REFERENCE',475,130);
 ['ROOM_NUMBER','ARRIVAL_DATE_SHORT','DEPARTURE_DATE_SHORT','NO_OF_ADULTS','BILL_NUMBER_HEADER','CONFIRMATION_NO','CASHIER_NO'].forEach((key,i)=>put(key,475,(compactHeader?139.2:142)+i*(compactHeader?9.2:10)));put('SYSTEM_DATE',475,230);
 put('TAX1_NO',140,230);put('GUEST_COMPANY',140,242);put('FIRST_NAME',140,254);
 ['TRX_DATE_SHORT','DESCRIPTION','REFERENCE_DISPLAYED','DEBIT','CREDIT'].forEach((key,i)=>put(key,[38,91,275,470,555][i],285,[78,260,425,492,575][i]));
 put('TOTAL_DEBIT',470,310,492);put('TOTAL_CREDIT',555,310,575);
 ['xdofx:TOTAL_NET-TOTAL_NON_TAXABLE','VAT1_AMT','TOTAL_NON_TAXABLE','TOTAL_GROSS','BALANCE'].forEach((key,i)=>put(key,520,330+i*13,548,i>=3?11:8,i>=3));put('CASHIER_NAME',450,560,480,10);
 const assets:InvoiceAssets={hotel:'KAT',version:INVOICE_TEMPLATE_VERSION,headerText:[{text:':',x:466,top:130,size:8,bold:false},{text:':',x:466,top:182,size:8,bold:false},{text:'Voucher No.',x:384,top:130,size:8,bold:true},{text:'Folio No.',x:384,top:182,size:8,bold:true}],header:image(280),closing:image(94),signature:image(35),footer:image(105),fixedText:[{text:'INVOICE',x:384,top:110,size:12},...['DATE','DESCRIPTION','REFERENCE','DEBIT (THB)','CREDITS (THB)'].map((text,i)=>({text,x:[36,91,275,438,523][i],top:268,size:9}))],closingText:[{text:'Total',x:320,top:310,size:9,bold:true},...['Total Amount Before VAT 7%','Total VAT 7%','Total Non VAT Amount','Total Amount','Total Outstanding Balance'].map((text,i)=>({text,x:320,top:330+i*13,size:8,bold:true}))],layout:{positions,rowTop:285,closingTop:302,signatureTop:540,pageTop:220}};
 const gross=count*321000,vat=Math.round(gross*7/107);
 const model:InvoiceModel={hotel:'KAT',accountId:'synthetic',invoiceId,folio:'88001',voucher,address:['SYNTHETIC TRAVEL','Example Road'],company:'SYNTHETIC TRAVEL',guest:'Example Guest',taxId:'',room:'101',arrival:'01/09/26',departure:'04/09/26',adults:'2',children:'0',confirmation:'100001',cashierNo:'1',cashierName:'Synthetic Cashier',printDate:'21/09/26',printTime:'12:00',lines:Array.from({length:count},(_,i)=>({id:String(i+1),date:'01/09/26',description:'Accommodation charge',reference:String(900000001+i),debit:321000,credit:0})),debit:gross,credit:0,gross,taxableNet:gross-vat,nonTaxable:0,vat,outstanding:gross-100000};
 return renderInvoice(model,assets);
}
