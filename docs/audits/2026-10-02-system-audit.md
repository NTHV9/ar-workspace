# รายงานตรวจระบบ Katathani AR — 2 ตุลาคม 2026

**ตรวจอย่างเดียว: ไม่มีการแก้ source code, schema, สิทธิ์ผู้ใช้, การตั้งค่า หรือ deployment**

ตรวจ release `ec9f3e59d9d58487a46e0666924731437ca50fe3` บนเว็บจริง โดยใช้บัญชีผู้ดูแลเดิม ร่วมกับชุดทดสอบในสำเนา source ที่แยกไว้ หลักฐานลูกค้าจริงและข้อมูลปลายทางอีเมลทดสอบไม่รวมในรายงานนี้

## ข้อผิดพลาดที่ยืนยันได้

### F1 — P2: หน้าที่เปิดค้างไม่รับผลอัปเดตเบื้องหลังเมื่อไม่มีงานกำลังรัน

- **อาการ:** เปิด Aging/หน้าทำงานไว้หลังรอบก่อนเสร็จแล้ว เมื่อ server เผยแพร่ข้อมูลรอบใหม่ หน้าเดิมไม่มีการอ่าน publication ใหม่เอง ต้องโหลดข้อมูลใหม่/เปิดหน้าใหม่จึงเห็นผล
- **สาเหตุ:** `src/App.tsx:225` เริ่ม polling เฉพาะเมื่อ `refresh.running` เป็นจริง และหยุดที่บรรทัด 238 เมื่อเป็นเท็จ ไม่มีการตรวจ publication ขณะ idle
- **ผลกระทบ:** การอัปเดต OPERA ทุกห้านาทีไม่ได้หมายความว่าหน้าเดิมที่พนักงานเปิดทิ้งไว้จะเปลี่ยนตาม ผู้ใช้อาจทำงานกับภาพข้อมูลเก่า การสร้างเอกสารยังมีการตรวจยอดอีกครั้ง จึงไม่ได้พิสูจน์ว่ามี PDF ยอดผิดหลุดออกไป
- **การทำซ้ำ:** ล็อกอินใน browser test ด้วย source ที่ไม่มีงานรัน เปลี่ยน publication ฝั่ง API แล้วเดินเวลา 6 นาที จำนวนการอ่าน portfolio ยังคง 1 ครั้ง — assertion ว่าควรอ่านรอบใหม่ล้มเหลว
- **แนวทางเมื่ออนุมัติแก้:** ตรวจเฉพาะ metadata ขณะ idle/เมื่อกลับมาโฟกัส แล้วอ่านชุดข้อมูลใหม่เมื่อ publication เปลี่ยน โดยรักษา actor/region และข้อมูลที่กำลังกรอก

### F2 — P2: รอบ 07:00/19:00 อาจสูญเสียงานดึงประวัติและงานดูแลหลังเผยแพร่ เมื่อรวมกับงาน `open`

- **เงื่อนไข:** มี current refresh ของโรงแรมเดียวกันกำลังทำงานด้วย reason `open` ตอนรอบ `scheduled` เข้ามา
- **สาเหตุ:** `worker/refresh/backend.ts:53–55` ใช้ reason ของงานเดิม หลังรวมคิวยังคง `open`; `worker/refresh/post-publication.ts:12` คืนค่าทันทีถ้าไม่ใช่ `scheduled`
- **ผลกระทบ:** รอบนั้นอาจไม่เข้า `enqueue-financial-history` และงาน scheduled maintenance ข้อมูลคงค้างยังอัปเดตได้ แต่รายงานกิจกรรม/ประวัติอาจตามช้า ไม่ได้อ้างว่าเกิดกับทุกโรงแรมใน production
- **การทำซ้ำ:** เรียก `requestRefresh(..., 'scheduled')` ให้รวมกับงาน `open` ที่กำลังรัน แล้วส่ง payload ที่ได้เข้า post-publication จริง พบว่าไม่มีขั้นตอน `enqueue-financial-history` — regression ล้มเหลวตามอาการ
- **แนวทางเมื่ออนุมัติแก้:** เก็บความต้องการของรอบ scheduled แยกจาก reason ของงานที่ชนะการรวมคิว หรือ dispatch ประวัติแบบ idempotent แยกจาก current refresh

## ช่องว่างของการทดสอบ

### T1 — P2: Browser tests เก่าบางส่วนยังใช้ login/หน้า Portfolio ที่เลิกใช้แล้ว

- ตัวอย่าง `tests/browser/live-errors.spec.ts` ใช้ session ใน localStorage และตั้ง `googleEnabled:false`; `tests/browser/workspace-loading.spec.ts` บางกรณียังคาดหวังหัวข้อ `Receivables portfolio`
- ทดลองสามกรณีในสำเนาแยก พบล้มเหลวก่อนถึงพฤติกรรมที่ต้องการตรวจจริง ทั้งกรณี recovery จาก service error และการ reload ข้อมูล
- จัดเป็นปัญหาความครอบคลุม/ความน่าเชื่อถือของชุดทดสอบ **ไม่ใช่หลักฐานว่าหน้าจริงสามส่วนนี้เสีย** ชุด smoke ปัจจุบันยังผ่านทั้งหมด
- ควรย้าย fixture เก่าไป Google tab session และหน้าปัจจุบัน แล้วทวน test ที่ไม่ได้อยู่ใน CI smoke

## จุดปรับปรุงการใช้งาน

### U1 — P3: ภาพรวม Account ใน Aging ยังแบ่งหน้า 25 กลุ่ม

- ทดลอง Khao Lak พบ 85 matched accounts แต่แสดง 25 กลุ่ม และมีหน้า 1 จาก 4 พร้อม Previous/Next
- ข้อความด้านบนเขียน “every row available” ซึ่งชวนให้เข้าใจว่าอยู่หน้าเดียวทั้งหมด
- ตาราง Invoice ภายใน Account และ Dashboard ใช้การเลื่อนต่อเนื่องแล้ว ควรทำพฤติกรรมภาพรวม Account ให้สอดคล้องกันหรือปรับข้อความให้ตรงกับสิ่งที่แสดง

## สิ่งที่ตรวจผ่าน

| ส่วน | หลักฐาน/ผล |
|---|---|
| Health / deployment | source ตรงกับ release ที่ตรวจ, database verified, endpoint ตัวอย่าง 6 เส้นทางปฏิเสธ anonymous ด้วย 401 |
| Login | Google ด้วยบัญชีผู้ดูแลสำเร็จและเข้า Aging; แท็บใหม่ต้องล็อกอิน; reload แท็บเดิมคง login และพื้นที่ Khao Lak |
| Aging | เปิดทั้ง Phuket/Khao Lak; กราฟวงกลม TSK ใช้งานได้; ยอดรวมแยกโรงแรมในภาพรวม Phuket reconcile; จำนวนใบ Khao Lak รวมจากสี่โรงแรมตรงกับยอดรวม |
| Dashboard | เปิดรายงาน CFO และตัวกรองได้ ไม่มี alert/การล้นแนวนอนใน viewport ที่ตรวจ |
| Collections | เลือก Account/Invoice และเปิด Prepare documents ได้; default เป็น Statement and Invoices และ One combined PDF |
| Invoice Register | หน้าอ่านข้อมูลและคอลัมน์ครบ Guest อยู่ติด Account; การกรอก/บันทึกอัตโนมัติทดสอบด้วยข้อมูลสมมติ ไม่แก้รายการจริง |
| Account settings | อ่าน 412 Accounts; ค้นหาตัวอย่างลดเหลือ 6; sort Credit term เรียง 30,30 แล้วค่าที่ไม่ตั้ง; กรอง Not required เหลือสองรายการที่ตรงเงื่อนไข ไม่มีการกด Apply |
| Reports / Sheets | แสดงลิงก์ Phuket/Khao Lak ไป docs.google.com ในแท็บใหม่; ไม่แก้ไฟล์หรือสิทธิ์ Google |
| Remittances | เปิดรายการ/ตัวกรองและ empty state ได้; ไม่สร้างหรือแก้ remittance จริง |
| Templates / Storage | เปิดหน้าจริงได้ ไม่มี alert; ไม่เปลี่ยนแม่แบบ ปลายทาง Drive หรือค่าโควต้า |
| PDF จริง | สร้างหนึ่งชุดจากหนึ่ง Invoice ของ Phuket: Statement + Invoice พร้อมทั้งสองไฟล์ เปิด editor และ final preview ได้สองหน้า และส่งต่อไป Email preparation ได้ |
| Email จริง | ลายเซ็นตัวอย่าง 6 โรงแรม + อีเมล generic rich text พร้อม PDF สมมติ 1 ฉบับ ทั้ง 7 ถูกยืนยัน Sent โดยระบบ; ปุ่มส่งชุดเดิมซ้ำถูก disable |
| Browser console | ไม่พบ error/warn ในแท็บหลักที่ตรวจช่วงท้าย |

## ชุดทดสอบอัตโนมัติ

- Unit: **1,566 / 1,566 ผ่าน**
- Browser smoke: **154 / 154 ผ่าน**
- PDF/rich-message editor เพิ่มเติม (ตัดกลุ่มที่ smoke ทดสอบแล้ว): **78 / 78 ผ่าน**
- TypeScript แบบ fresh check: ผ่าน
- Database schema replay ใน PostgreSQL ที่สร้างแยกบน loopback: **93 migrations / 46 fixtures ผ่าน**; หยุด server แล้ว; ไม่มี provider request หรือการ export ข้อมูลจริง
- Reproduction ที่เพิ่มในสำเนาชั่วคราว: **2 กรณีล้มเหลวตาม F1/F2** เพื่อยืนยันบั๊ก ไม่ได้เพิ่มเข้า source ที่ใช้งานจริง
- ตัวอย่าง legacy browser tests: **3 กรณีล้มเหลวตาม T1** ไม่แก้ fixture หรือ source จริงเพื่อทำให้ผ่าน

## ขอบเขตและรายการที่คงไว้

- ไม่ได้ล็อกอินเป็นพนักงานส่วนตัวแต่ละคน การแบ่งสิทธิ์/ปฏิเสธข้ามพื้นที่ตรวจผ่าน unit/SQL/browser fixture และ anonymous boundary; live session ใช้บัญชีผู้ดูแล
- ไม่ได้แก้ settings, manual invoice data, ยอด OPERA, ประวัติวางบิล/ทวงหนี้ หรือบันทึก remittance จริง
- ไม่มีอีเมลลูกค้าจริงถูกส่ง และไม่มี Gmail draft จริงถูกสร้าง การส่งทั้งเจ็ดใช้ test mode ไปยังปลายทางครั้งเดียวที่เจ้าของอนุญาต
- คงชุด PDF ที่สร้างเพื่อทดสอบหนึ่งชุด รวม reviewed export และ local email preparation ไว้ ไม่ลบทิ้งระหว่าง audit; exact job reference อยู่ในหลักฐาน private
- การอ่าน workflow metadata ด้วย Cloudflare CLI ถูกปฏิเสธด้วย authentication error จึงไม่อ้างเวลาสร้าง PDF ที่แม่นยำหรือผลตรวจ control-plane ทุก job จาก CLI ในรอบนี้
- ผลนี้ครอบคลุมเส้นทางที่ระบุ ไม่ใช่การเทียบ PDF/ยอดกับ OPERA ต้นฉบับทุก Invoice หรือการทดสอบ production restore

หลักฐาน raw/test logs และ reproduction อยู่ใน `.tmp/system-audit-20261002/` (ไม่เข้า Git) รายงานนี้ไม่มี test recipient, secret หรือ PDF/JSON ลูกค้าจริง

## Authorized correction follow-up

The owner subsequently authorized fixes. F1/F2/U1 are implemented locally and T1 reported suites now use current authentication/navigation. Fresh typecheck, production build, 1,570 unit tests and 14 browser regressions pass. Source `32a318f802867cbb0c9ceb6d032122f7e06301ce` deployed as Worker `6cc6e277-b3b0-44de-bf76-deff3339df02`; public source/database health and six unauthenticated boundaries pass. Signed-in live visual verification awaits the owner completing Google sign-in.
