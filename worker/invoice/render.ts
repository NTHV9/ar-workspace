import {PDFDocument,StandardFonts,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import noto from '../statement/fonts/noto-thai';
import {INVOICE_TEMPLATE_VERSION,type InvoiceAssets,type InvoiceModel} from './types';

const fail=():never=>{throw Error('document_invoice_layout_invalid');};
const money=(cents:number)=>{if(!Number.isSafeInteger(cents))return fail();return(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
function words(n:number):string{
 const ones=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'],tens=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
 if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');if(n<1000)return ones[Math.floor(n/100)]+' HUNDRED'+(n%100?' '+words(n%100):'');
 for(const [v,label]of [[1e12,'TRILLION'],[1e9,'BILLION'],[1e6,'MILLION'],[1e3,'THOUSAND']] as const)if(n>=v)return words(Math.floor(n/v))+' '+label+(n%v?' '+words(n%v):'');return fail();
}
export function invoiceAmountWords(cents:number){if(!Number.isSafeInteger(cents)||cents<0)return fail();return words(Math.floor(cents/100))+' BAHT'+(cents%100?' AND '+words(cents%100)+' SATANG':' ONLY');}

export async function renderInvoice(model:InvoiceModel,assets:InvoiceAssets):Promise<Uint8Array>{
 if(assets.hotel!==model.hotel||assets.version!==INVOICE_TEMPLATE_VERSION||model.lines.length===0||model.lines.length>=4000||new Set(assets.fixedText.map(t=>t.text)).size!==6)fail();
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const latin=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),thai=await doc.embedFont(Uint8Array.from(atob(noto),c=>c.charCodeAt(0)),{subset:true});
 const latinChars=new Set(latin.getCharacterSet()),thaiChars=new Set(thai.getCharacterSet());
 const supported=(s:string,chars:Set<number>)=>[...s].every(c=>chars.has(c.codePointAt(0)!));
 const runs=(value:string,b=false):{text:string;font:PDFFont}[]=>{
  const result:{text:string;font:PDFFont}[]=[];
  for(const {segment}of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(value.normalize('NFC'))){const font=supported(segment,latinChars)?b?bold:latin:supported(segment,thaiChars)?thai:null;if(!font)throw Error('document_invoice_character_unsupported');const last=result.at(-1);if(last?.font===font)last.text+=segment;else result.push({text:segment,font});}return result;
 };
 const width=(s:string,size:number,b=false)=>runs(s,b).reduce((n,r)=>n+r.font.widthOfTextAtSize(r.text,size),0);
 const wrap=(s:string,max:number,size=8,b=false)=>{if(s.length>2000)fail();const lines:string[]=[];let line='';for(const {segment}of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(s.normalize('NFC'))){if(segment==='\n'){lines.push(line);line='';continue;}if(width(line+segment,size,b)>max){const space=line.lastIndexOf(' ');if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1);}else{if(!line)fail();lines.push(line);line='';}}line+=segment;}lines.push(line);return lines;};
 const entries=await Promise.all((['header','closing','signature','footer'] as const).map(async key=>{const a=assets[key];if(a.width!==612||!Number.isFinite(a.height)||a.height<1||a.height>400||a.png.length>2000000)fail();const bytes=Uint8Array.from(atob(a.png),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256)throw Error('document_invoice_template_invalid');return [key,await doc.embedPng(bytes)] as const;}));
 const images=Object.fromEntries(entries),p=assets.layout.positions,pos=(key:string)=>{const hit=p[key]?.[0];if(!hit||![hit.x0,hit.x1,hit.top,hit.size].every(Number.isFinite)||hit.x0<0||hit.x1>612||hit.top<0||hit.top>792||hit.size<5||hit.size>18)return fail();return hit;};
 const pages:PDFPage[]=[];let page!:PDFPage,y=0;
 const write=(s:string,x:number,top:number,size=8,b=false)=>{if(top<0||top+size>792)fail();for(const r of runs(s,b)){page.drawText(r.text,{x,y:792-top-size,size,font:r.font});x+=r.font.widthOfTextAtSize(r.text,size);}};
 const field=(name:string,value:string,offset=0,right=false,max=110)=>{if(!value)return;const q=pos(name);const b=/Bold/.test(q.fontname);if(width(value,q.size,b)>max)fail();write(value,right?q.x1-width(value,q.size,b):q.x0,q.top+offset,q.size,b);};
 const imageAt=(key:'header'|'closing'|'signature'|'footer',top:number)=>page.drawImage(images[key],{x:0,y:792-top-assets[key].height,width:612,height:assets[key].height});
 const add=()=>{if(pages.length>=100)fail();page=doc.addPage([612,792]);pages.push(page);imageAt('header',0);imageAt('footer',792-assets.footer.height);
  for(const fixed of assets.fixedText){if(!['INVOICE','DATE','DESCRIPTION','REFERENCE','DEBIT (THB)','CREDITS (THB)'].includes(fixed.text))fail();write(fixed.text,fixed.x,fixed.top,fixed.size,true);}
  const a=pos('ADDRESSEE_FULL_ADDRESS'),address=model.address.flatMap(s=>wrap(s,290,8));if(address.length>11)fail();address.forEach((s,i)=>write(s,a.x0,a.top+i*9.2));
  for(const [name,value]of [['BILL_NUMBER_HEADER',model.folio],['ROOM_NUMBER',model.room],['ARRIVAL_DATE_SHORT',model.arrival],['DEPARTURE_DATE_SHORT',model.departure],['CONFIRMATION_NO',model.confirmation],['CASHIER_NO',model.cashierNo]] as const)field(name,value);
  const voucherKey=p.EXTERNAL_REFERENCE?'EXTERNAL_REFERENCE':'CUSTOM_REFERENCE';const v=pos(voucherKey);if(width(model.voucher,8,true)>106)fail();write(model.voucher,v.x0,v.top,8,true);
  const guests=pos('NO_OF_ADULTS');write([model.adults,model.children].join(' / '),guests.x0,guests.top);
  const dt=pos('SYSTEM_DATE');write(model.printDate+' : '+model.printTime,dt.x0,dt.top);
  const guest=pos('FIRST_NAME'),company=pos('GUEST_COMPANY'),tax=pos('TAX1_NO');
  for(const [q,s] of [[guest,model.guest],[company,model.company],[tax,model.taxId]] as const){if(width(s,8)>430)fail();write(s,q.x0,q.top);}
  y=assets.layout.rowTop;
 };
 add();
 const dateX=pos('TRX_DATE_SHORT').x0,descX=pos('DESCRIPTION').x0,refX=pos('REFERENCE_DISPLAYED').x0,debitRight=pos('DEBIT').x1,creditRight=pos('CREDIT').x1;
 for(const line of model.lines){const cells=[wrap(line.date,descX-dateX-6),wrap(line.description,refX-descX-6),wrap(line.reference,debitRight-60-refX)],height=Math.max(...cells.map(c=>c.length))*10+2;
  if(height>350)fail();if(y+height>660)add();
  cells.forEach((lines,i)=>lines.forEach((s,j)=>write(s,[dateX,descX,refX][i],y+j*10)));
  for(const [n,right]of [[line.debit,debitRight],[line.credit,creditRight]])if(n){const s=money(n);if(width(s,8)>65)fail();write(s,right-width(s,8),y);}
  y+=height;
 }
 const amountLines=wrap('*** '+invoiceAmountWords(model.outstanding)+' ***',280,8,true),closingSpace=assets.closing.height+amountLines.length*10+70;
 if(y+closingSpace>672)add();
 const closingY=y+5;imageAt('closing',closingY);const offset=closingY-assets.layout.closingTop;
 for(const fixed of assets.closingText){if(!/^Total(?: |$)|^THB$/.test(fixed.text))fail();write(fixed.text,fixed.x,fixed.top+offset,fixed.size,fixed.bold);}
 for(const line of assets.bankText??[]){if(line.text.length>250||line.x<30||line.x>200)fail();let size=8;while(size>6.5&&width(line.text,size)>180)size-=.25;if(width(line.text,size)>180)fail();write(line.text,line.x,line.top+offset,size);}
 for(const [name,n]of [['TOTAL_DEBIT',model.debit],['TOTAL_CREDIT',model.credit],['TOTAL_GROSS',model.gross],['BALANCE',model.outstanding],['TOTAL_NON_TAXABLE',model.nonTaxable],['VAT1_AMT',model.vat],['xdofx:TOTAL_NET-TOTAL_NON_TAXABLE',model.taxableNet]] as const)field(name,money(n),offset,true,95);
 let wordsY=closingY+assets.closing.height+13;amountLines.forEach((s,i)=>write(s,575-width(s,8,true),wordsY+i*10,8,true));
 const signatureY=Math.max(wordsY+amountLines.length*10+32,Math.min(580,assets.layout.signatureTop));imageAt('signature',signatureY);
 const cashier=pos('CASHIER_NAME'),cashierLines=wrap(model.cashierName,215,9);if(cashierLines.length>2)fail();cashierLines.forEach((s,i)=>write(s,465-width(s,9)/2,signatureY+cashier.top-assets.layout.signatureTop+i*10,9));
 pages.forEach((p,i)=>{page=p;write(`${i+1} of ${pages.length}`,474.4,assets.layout.pageTop);});
 return doc.save();
}
