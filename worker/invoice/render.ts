import {addVoucherField} from '../../src/pdf/voucher-metadata';
import {PDFDocument,StandardFonts,rgb,pushGraphicsState,popGraphicsState,rectangle,clip,endPath,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import noto from '../statement/fonts/noto-thai';
import {supportedInvoiceTemplate,type InvoiceAssets,type InvoiceModel} from './types';

const fail=():never=>{throw Error('document_invoice_layout_invalid');};
// Tabs are display whitespace, not printable font glyphs. Keep identifiers and source records untouched.
const printable=(value:string)=>value.normalize('NFC').replace(/\t/g,' ');
const money=(cents:number)=>{if(!Number.isSafeInteger(cents))return fail();return(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
function words(n:number):string{
 const ones=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'],tens=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
 if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');if(n<1000)return ones[Math.floor(n/100)]+' HUNDRED'+(n%100?' '+words(n%100):'');
 for(const [v,label]of [[1e12,'TRILLION'],[1e9,'BILLION'],[1e6,'MILLION'],[1e3,'THOUSAND']] as const)if(n>=v)return words(Math.floor(n/v))+' '+label+(n%v?' '+words(n%v):'');return fail();
}
export function invoiceAmountWords(cents:number){if(!Number.isSafeInteger(cents)||cents<0)return fail();return words(Math.floor(cents/100))+' BAHT'+(cents%100?' AND '+words(cents%100)+' SATANG':' ONLY');}

export async function renderInvoice(model:InvoiceModel,assets:InvoiceAssets):Promise<Uint8Array>{
 if(assets.hotel!==model.hotel||!supportedInvoiceTemplate(assets.version)||model.lines.length===0||model.lines.length>=4000||new Set(assets.fixedText.map(t=>t.text)).size!==6)fail();
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const latin=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),thai=await doc.embedFont(Uint8Array.from(atob(noto),c=>c.charCodeAt(0)),{subset:true});
 const latinChars=new Set(latin.getCharacterSet()),thaiChars=new Set(thai.getCharacterSet());
 const supported=(s:string,chars:Set<number>)=>[...s].every(c=>chars.has(c.codePointAt(0)!));
 const runs=(value:string,b=false):{text:string;font:PDFFont}[]=>{
  const result:{text:string;font:PDFFont}[]=[];
  for(const {segment}of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(printable(value))){const font=supported(segment,latinChars)?b?bold:latin:supported(segment,thaiChars)?thai:null;if(!font)throw Error('document_invoice_character_unsupported');const last=result.at(-1);if(last?.font===font)last.text+=segment;else result.push({text:segment,font});}return result;
 };
 const width=(s:string,size:number,b=false)=>runs(s,b).reduce((n,r)=>n+r.font.widthOfTextAtSize(r.text,size),0);
 const wrap=(s:string,max:number,size=8,b=false)=>{if(s.length>2000)fail();const lines:string[]=[];let line='';for(const {segment}of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(printable(s))){if(segment==='\n'){lines.push(line);line='';continue;}if(width(line+segment,size,b)>max){const space=line.lastIndexOf(' ');if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1);}else{if(!line)fail();lines.push(line);line='';}}line+=segment;}lines.push(line);return lines;};
 const entries=await Promise.all((['header','closing','signature','footer'] as const).map(async key=>{const a=assets[key];if(a.width!==612||!Number.isFinite(a.height)||a.height<1||a.height>400||a.png.length>2000000)fail();const bytes=Uint8Array.from(atob(a.png),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256)throw Error('document_invoice_template_invalid');return [key,await doc.embedPng(bytes)] as const;}));
 const images=Object.fromEntries(entries),p=assets.layout.positions,pos=(key:string)=>{const hit=p[key]?.[0];if(!hit||![hit.x0,hit.x1,hit.top,hit.size].every(Number.isFinite)||hit.x0<0||hit.x1>612||hit.top<0||hit.top>792||hit.size<5||hit.size>18)return fail();return hit;};
 const voucher=printable(model.voucher);
 const voucherKey=p.EXTERNAL_REFERENCE?'EXTERNAL_REFERENCE':'CUSTOM_REFERENCE',v=pos(voucherKey),voucherBox=Math.min(132,605-v.x0);
 let voucherSize=8;
 if(!voucher.includes('\n'))while(voucherSize>6&&width(voucher,voucherSize,true)>voucherBox-6)voucherSize-=.25;
 const multiline=voucher.includes('\n')||width(voucher,voucherSize,true)>voucherBox-6;
 if(multiline)voucherSize=8;
 const voucherLines=multiline?wrap(voucher,voucherBox-6,voucherSize,true):[voucher];
 const headerShift=(voucherLines.length-1)*10;
 const headingTop=Math.min(...assets.fixedText.filter(f=>f.text!=='INVOICE').map(f=>f.top));
 const leftFields=[['TAX1_NO',model.taxId],['GUEST_COMPANY',model.company],['FIRST_NAME',model.guest]].map(([key,value])=>({x:pos(key).x0,top:pos(key).top,width:width(value,8),height:8}));
 const rightLeft=Math.min(384,...(assets.headerText??[]).filter(t=>t.x>=380).map(t=>t.x));
 const tops=[...['BILL_NUMBER_HEADER','ROOM_NUMBER','ARRIVAL_DATE_SHORT','DEPARTURE_DATE_SHORT','CONFIRMATION_NO','CASHIER_NO','NO_OF_ADULTS','SYSTEM_DATE'].map(k=>pos(k).top),assets.layout.pageTop,...(assets.headerText??[]).filter(t=>t.x>=380&&t.top>v.top+.5).map(t=>t.top)].sort((a,b)=>a-b);
 const offsets:{top:number;offset:number}[]=[];let carry=headerShift;
 for(const top of tops){if(offsets.some(r=>Math.abs(r.top-top)<3))continue;let placed=top+carry;
  for(const left of [...leftFields].sort((a,b)=>a.top-b.top))if(left.x+left.width>rightLeft-2&&placed<left.top+left.height+2&&placed+9>left.top-2)placed=left.top+left.height+3;
  carry=Math.max(carry,placed-top);offsets.push({top,offset:carry});
 }
 const rightOffset=(top:number)=>offsets.find(r=>Math.abs(r.top-top)<3)?.offset??headerShift;
 const rightBottom=Math.max(...tops.map(top=>top+rightOffset(top)+9));
 const tableShift=Math.max(0,rightBottom+6-headingTop),rowTop=assets.layout.rowTop+tableShift;
 const headerCut=headingTop-4;
 if(headerCut<=v.top||headerCut>=assets.header.height||voucher.length>1000)fail();
 const cashier=pos('CASHIER_NAME'),cashierLines=wrap(model.cashierName,215,9),cashierOffset=cashier.top-assets.layout.signatureTop;
 // Continuation pages retain the source signature position. The final signature
 // may move below the totals, but neither the image nor cashier may reach the footer.
 const signatureHeight=Math.max(assets.signature.height,cashierOffset+(cashierLines.length-1)*10+9),footerTop=792-assets.footer.height,signatureLimit=footerTop-signatureHeight-8;
 const rowLimit=Math.min(660,assets.layout.signatureTop-8);
 if(cashierLines.length>2||cashierOffset<0||!Number.isFinite(assets.layout.signatureTop)||assets.layout.signatureTop>signatureLimit||rowLimit<=rowTop)fail();
 const pages:PDFPage[]=[];let page!:PDFPage,y=0;
 const write=(s:string,x:number,top:number,size=8,b=false)=>{if(top<0||top+size>792)fail();for(const r of runs(s,b)){page.drawText(r.text,{x,y:792-top-size,size,font:r.font});x+=r.font.widthOfTextAtSize(r.text,size);}};
 const field=(name:string,value:string,offset=0,right=false,max=110)=>{if(!value)return;const q=pos(name);const b=/Bold/.test(q.fontname);if(width(value,q.size,b)>max)fail();write(value,right?q.x1-width(value,q.size,b):q.x0,q.top+offset,q.size,b);};
 const imageAt=(key:'header'|'closing'|'signature'|'footer',top:number)=>page.drawImage(images[key],{x:0,y:792-top-assets[key].height,width:612,height:assets[key].height});
 const add=()=>{if(pages.length>=100)fail();page=doc.addPage([612,792]);pages.push(page);
  if(tableShift){
   // Split the existing letterhead at the table heading block so rules and
   // backgrounds move with the table; left-hand identity fields stay in place.
   page.pushOperators(pushGraphicsState(),rectangle(0,792-headerCut,612,headerCut),clip(),endPath());imageAt('header',0);page.pushOperators(popGraphicsState());
   page.pushOperators(pushGraphicsState(),rectangle(0,792-assets.header.height-tableShift,612,assets.header.height-headerCut),clip(),endPath());imageAt('header',tableShift);page.pushOperators(popGraphicsState());
  }else imageAt('header',0);
  imageAt('footer',792-assets.footer.height);
  for(const fixed of assets.fixedText){if(!['INVOICE','DATE','DESCRIPTION','REFERENCE','DEBIT (THB)','CREDITS (THB)'].includes(fixed.text))fail();write(fixed.text,fixed.x,fixed.top+(fixed.text==='INVOICE'?0:tableShift),fixed.size,true);}
  for(const label of assets.headerText??[]){if(label.text.length>80)fail();write(label.text,label.x,label.top+(label.x>=380&&label.top>v.top+.5?rightOffset(label.top):0),label.size,label.bold);}
  const a=pos('ADDRESSEE_FULL_ADDRESS'),address=model.address.flatMap(s=>wrap(s,290,8));if(address.length>11)fail();address.forEach((s,i)=>write(s,a.x0,a.top+i*9.2));
  for(const [name,value]of [['BILL_NUMBER_HEADER',model.folio],['ROOM_NUMBER',model.room],['ARRIVAL_DATE_SHORT',model.arrival],['DEPARTURE_DATE_SHORT',model.departure],['CONFIRMATION_NO',model.confirmation],['CASHIER_NO',model.cashierNo]] as const)field(name,value,rightOffset(pos(name).top));
  voucherLines.forEach((line,index)=>write(line,v.x0,v.top+index*10,voucherSize,true));
  addVoucherField(page,{hotel:model.hotel,accountId:model.accountId,invoiceId:model.invoiceId,align:'left',text:voucher,x:v.x0-3,y:v.top-.5,width:voucherBox,height:12+headerShift,fontSize:voucherSize,bold:true});
  const guests=pos('NO_OF_ADULTS');write([model.adults,model.children].join(' / '),guests.x0,guests.top+rightOffset(guests.top));
  const dt=pos('SYSTEM_DATE');write(model.printDate+' : '+model.printTime,dt.x0,dt.top+rightOffset(dt.top));
  const guest=pos('FIRST_NAME'),company=pos('GUEST_COMPANY'),tax=pos('TAX1_NO');
  for(const [q,s] of [[guest,model.guest],[company,model.company],[tax,model.taxId]] as const){if(width(s,8)>430)fail();write(s,q.x0,q.top);}
  const headings=assets.fixedText.filter(f=>f.text!=='INVOICE'),bottom=Math.max(...headings.map(f=>f.top+tableShift+f.size));const rule=Math.min(rowTop-2,bottom+3);if(rule<=bottom)fail();page.drawLine({start:{x:Math.min(...headings.map(f=>f.x))-5,y:792-rule},end:{x:pos('CREDIT').x1+4,y:792-rule},thickness:.5,color:rgb(0,0,0)});
  y=rowTop;
 };
 add();
 const dateX=pos('TRX_DATE_SHORT').x0,descX=pos('DESCRIPTION').x0,refX=pos('REFERENCE_DISPLAYED').x0,debitRight=pos('DEBIT').x1,creditRight=pos('CREDIT').x1;
 for(const line of model.lines){const cells=[wrap(line.date,descX-dateX-6),wrap(line.description,refX-descX-6),wrap(line.reference,debitRight-60-refX)],height=Math.max(...cells.map(c=>c.length))*10+2;
  if(height>350||height>rowLimit-rowTop)fail();if(y+height>rowLimit)add();
  cells.forEach((lines,i)=>lines.forEach((s,j)=>write(s,[dateX,descX,refX][i],y+j*10)));
  for(const [n,right]of [[line.debit,debitRight],[line.credit,creditRight]])if(n){const s=money(n);if(width(s,8)>65)fail();write(s,right-width(s,8),y);}
  y+=height;
 }
 const amountLines=wrap('*** '+invoiceAmountWords(model.outstanding)+' ***',280,8,true),closingSpace=5+assets.closing.height+13+amountLines.length*10+32;
 if(y+closingSpace>signatureLimit)add();if(y+closingSpace>signatureLimit)fail();
 const closingY=y+5;imageAt('closing',closingY);const offset=closingY-assets.layout.closingTop;
 for(const fixed of assets.closingText){if(!/^Total(?: |$)|^THB$/.test(fixed.text))fail();write(fixed.text,fixed.x,fixed.top+offset,fixed.size,fixed.bold);}
 for(const line of assets.bankText??[]){if(line.text.length>250||line.x<30||line.x>200)fail();let size=8;while(size>6.5&&width(line.text,size)>180)size-=.25;if(width(line.text,size)>180)fail();write(line.text,line.x,line.top+offset,size);}
 for(const [name,n]of [['TOTAL_DEBIT',model.debit],['TOTAL_CREDIT',model.credit],['TOTAL_GROSS',model.gross],['BALANCE',model.outstanding],['TOTAL_NON_TAXABLE',model.nonTaxable],['VAT1_AMT',model.vat],['xdofx:TOTAL_NET-TOTAL_NON_TAXABLE',model.taxableNet]] as const)field(name,money(n),offset,true,95);
 const wordsY=closingY+assets.closing.height+13;amountLines.forEach((s,i)=>write(s,575-width(s,8,true),wordsY+i*10,8,true));
 const finalSignatureTop=Math.max(wordsY+amountLines.length*10+32,assets.layout.signatureTop);
 pages.forEach((p,i)=>{page=p;const signatureY=i===pages.length-1?finalSignatureTop:assets.layout.signatureTop;imageAt('signature',signatureY);cashierLines.forEach((s,j)=>write(s,465-width(s,9)/2,signatureY+cashierOffset+j*10,9));write(`${i+1} of ${pages.length}`,474.4,assets.layout.pageTop+rightOffset(assets.layout.pageTop));});
 return doc.save();
}
