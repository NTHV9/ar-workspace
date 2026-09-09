import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage,type PDFImage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import noto from './fonts/noto-thai';
import type {StatementModel} from './model';
export interface StatementAssets {hotel:string;version:string;header:ImageAsset;closing:ImageAsset;footer:ImageAsset}
interface ImageAsset {width:number;height:number;png:string;sha256:string}
const fail=():never=>{throw Error('document_statement_layout_invalid');};
const money=(n:number)=>{if(!Number.isSafeInteger(n))return fail();return (n/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
export async function renderStatement(model:StatementModel,assets:StatementAssets):Promise<Uint8Array> {
 if(assets.hotel!==model.hotel||assets.version!=='rtf-20260909-v3'||!model.rows.length||model.rows.length>500)fail();
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const latin=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),thai=await doc.embedFont(Uint8Array.from(atob(noto),c=>c.charCodeAt(0)),{subset:true});
 const charset=new Set(thai.getCharacterSet());const font=(s:string,b=false):PDFFont=>{if(/[^\x20-\x7e]/.test(s)){if([...s].some(c=>!charset.has(c.codePointAt(0)!)))throw Error('document_statement_character_unsupported');return thai;}return b?bold:latin;};
 // Standard PDF text placement has no pair-kerning adjustments; center by glyph advances.
 const voucherWidth=(s:string,b=false)=>{const f=font(s,b);return f===thai?f.widthOfTextAtSize(s,8):[...s].reduce((n,c)=>n+f.widthOfTextAtSize(c,8),0);};
 const images:PDFImage[]=[];for(const asset of [assets.header,assets.closing,assets.footer]){
  if(asset.width!==612||asset.height<1||asset.height>400||asset.png.length>2000000)fail();
  const bytes=Uint8Array.from(atob(asset.png),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==asset.sha256)throw Error('document_statement_template_invalid');
  images.push(await doc.embedPng(bytes));
 }
 const edges=[32,82,128,231,277,328,410,464,519,580],pages:PDFPage[]=[];let page!:PDFPage,y=0;
 const write=(s:string,x:number,top:number,size=8,b=false)=>{if(s)page.drawText(s,{x,y:792-top-size,size,font:font(s,b)});};
 const wrap=(s:string,width:number,size=8):string[]=>{
  if(s.length>1000)fail();const parts=[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(s)].map(x=>x.segment);const lines:string[]=[];let line='';
  for(const ch of parts){if(font(line+ch).widthOfTextAtSize(line+ch,size)>width){if(!line)fail();const space=line.lastIndexOf(' ');if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1);}else{lines.push(line);line='';}}line+=ch;}
  lines.push(line);if(lines.length>12)fail();return lines;
 };
 const address=model.address.flatMap(s=>wrap(s,300,9));if(address.length>12)fail();
 const rectangle=(x:number,top:number,width:number,height:number,gray?:number)=>page.drawRectangle({x,y:792-top-height,width,height,borderColor:rgb(0,0,0),borderWidth:.5,...(gray===undefined?{}:{color:rgb(gray,gray,gray)})});
 const add=(table:boolean)=>{if(pages.length>=50)fail();page=doc.addPage([612,792]);pages.push(page);page.drawImage(images[0],{x:0,y:672,width:612,height:120});page.drawImage(images[2],{x:0,y:0,width:612,height:77});address.forEach((s,i)=>write(s,36,130+i*10,9,true));write('A/R Account No.',408,130,9);write(model.accountNo,531,130,9);write('Print Date',434,143,9);write(model.printDate,531,143,9);write('Page No.',437,156,9);y=Math.max(188,133+address.length*10);
  if(table){rectangle(32,y,548,26,.85);['Date','Folio','Description','Arrival','Departure','Voucher','Debit','Credit','Balance'].forEach((s,i)=>write(s,i>=6?edges[i+1]-4-bold.widthOfTextAtSize(s,8):i===5?(edges[i]+edges[i+1]-voucherWidth(s,true))/2:edges[i]+4,y+8,8,true));y+=30;}
 };
 add(true);
 for(const r of model.rows){const values=[r.date,r.folio,r.guest,r.arrival,r.departure,r.voucher.trim(),money(r.debit),r.credit?money(r.credit):'',money(r.balance)];const cells=values.map((s,i)=>wrap(s,edges[i+1]-edges[i]-8));if(cells.slice(6).some(c=>c.length!==1))fail();const h=Math.max(...cells.map(c=>c.length))*10+4;if(y+h>705)add(true);if(y+h>705)fail();cells.forEach((lines,i)=>lines.forEach((s,j)=>write(s,i>=6?edges[i+1]-4-font(s).widthOfTextAtSize(s,8):i===5?(edges[i]+edges[i+1]-voucherWidth(s))/2:edges[i]+4,y+j*10)));y+=h;}
 if(y+27>705)add(true);rectangle(32,y,548,26,.85);write('Balance Due',400,y+8,8,true);const total=money(model.total)+' (THB)';if(bold.widthOfTextAtSize(total,8)>120)fail();write(total,576-bold.widthOfTextAtSize(total,8),y+8,8,true);y+=40;
 const closingHeight=60+assets.closing.height;if(y+closingHeight>705)add(false);if(y+closingHeight>705)fail();write('Aging Summary:',36,y,9,true);const tableY=y+14;for(let i=0;i<6;i++){const x=32+i*548/6;rectangle(x,tableY,548/6,17,.85);rectangle(x,tableY+17,548/6,17);const label=model.aging[i].label,value=money(model.aging[i].cents);if(font(label,true).widthOfTextAtSize(label,8)>548/6-4||font(value).widthOfTextAtSize(value,8)>548/6-4)fail();write(label,x+(548/6-font(label,true).widthOfTextAtSize(label,8))/2,tableY+4,8,true);write(value,x+(548/6-font(value).widthOfTextAtSize(value,8))/2,tableY+21);}
 page.drawImage(images[1],{x:0,y:792-y-60-assets.closing.height,width:612,height:assets.closing.height});pages.forEach((p,i)=>{page=p;write(`Page ${i+1} of ${pages.length}`,528,156,9);});return doc.save();
}
