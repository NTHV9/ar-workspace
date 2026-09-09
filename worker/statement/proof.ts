import {PDFDocument} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontBase64 from './fonts/noto-thai';
/** Fixed synthetic diagnostic only. No caller-controlled report data or provider access. */
export async function rendererProof():Promise<Uint8Array> {
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(Uint8Array.from(atob(fontBase64),c=>c.charCodeAt(0)),{subset:true});
 const page=doc.addPage([612,792]);
 const lines=['Statement renderer - synthetic font proof','ทดสอบภาษาไทย: บริษัท ตัวอย่าง จำกัด','ผู้เข้าพัก: น้ำฝน เกื้อกูล / กิ กี กึ กื กุ กู ก่ ก้ ก๊ ก๋','Invoice 88001 | Voucher VCH-000001','ยอดเงิน 21,600.00 THB / ชำระแล้ว 1,250.00','คงเหลือ 20,350.00 THB','English: Alexandra Montgomery-Wellington'];
 lines.forEach((line,i)=>page.drawText(line,{x:36,y:740-i*36,font,size:i===0?15:12}));
 return doc.save();
}
