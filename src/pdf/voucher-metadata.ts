import {PDFName,PDFHexString,type PDFPage} from 'pdf-lib';
export interface VoucherField {align?:'left'|'center';hotel:string;accountId:string;invoiceId:string;text:string;x:number;y:number;width:number;height:number;fontSize:number;bold:boolean}
const name=PDFName.of('ARVoucherFields');
export const voucherKey=(f:VoucherField)=>JSON.stringify([f.hotel,f.accountId,f.invoiceId]);
export function readVoucherFields(page:PDFPage):VoucherField[]{
 const raw=page.node.get(name);if(!raw)return [];
 try{
  if(!(raw instanceof PDFHexString))throw Error();
  const values:unknown=JSON.parse(raw.decodeText());if(!Array.isArray(values)||values.length>500)throw Error();
  const seen=new Set<string>();
  return values.map(f=>{
   if(!f||typeof f!=='object'||!['hotel','accountId','invoiceId'].every(k=>typeof f[k]==='string'&&f[k].length>0&&f[k].length<=200)||typeof f.text!=='string'||f.text.length>1000||typeof f.bold!=='boolean'||f.align!==undefined&&!['left','center'].includes(f.align)||!['x','y','width','height','fontSize'].every(k=>typeof f[k]==='number'&&Number.isFinite(f[k]))||f.x<0||f.y<0||f.width<=0||f.height<=0||f.fontSize<5||f.fontSize>18||f.x+f.width>page.getWidth()||f.y+f.height>page.getHeight()||seen.has(voucherKey(f)))throw Error();
   seen.add(voucherKey(f));return {hotel:f.hotel,accountId:f.accountId,invoiceId:f.invoiceId,text:f.text,x:f.x,y:f.y,width:f.width,height:f.height,fontSize:f.fontSize,bold:f.bold,...(f.align?{align:f.align}:{})} as VoucherField;
  });
 }catch{throw Error('Voucher fields do not match this document.');}
}
export function addVoucherField(page:PDFPage,field:VoucherField){page.node.set(name,PDFHexString.fromText(JSON.stringify([...readVoucherFields(page),field])));}
