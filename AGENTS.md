# Katathani AR — กติกาของโครงการใหม่

## จุดเริ่มต้น

นี่คือ clean rebuild ตามที่เจ้าของสั่ง ไม่ใช่ migration/refactor ของแอปเดิม ก่อนทำงานอ่าน:
1. `README_START_HERE.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/DECISIONS_AND_OPEN_ITEMS.md`
4. `docs/DESIGN_HANDOFF.md`
5. `docs/INTEGRATION_VALIDATION.md`
6. `docs/ACCEPTANCE_CHECKLIST.md`
7. `docs/PROJECT_STATUS.md`

คำยืนยันล่าสุดของเจ้าของใช้แทนข้อกำหนดเก่าที่ขัดกัน แต่ไม่ยกเลิกข้อกำหนดความปลอดภัยระดับแพลตฟอร์มหรือองค์กร ห้ามคัดลอก AGENTS, workflows, schema, gates, source code หรือการตั้งค่าเดิมเข้ามาเป็นฐานใหม่ รายงานคำสั่งระดับ global/parent ที่ยังมีผลและข้อขัดกัน อย่าแก้ global configuration เองเงียบ ๆ

## การรับงานครั้งแรก

สำรวจโฟลเดอร์ใหม่และหลักฐานที่เข้าถึงได้เท่านั้น ยืนยันว่าภาพต้นแบบและคำอธิบาย Codex เดิมมีจริง ห้ามอ้างว่าเห็นไฟล์หรือแชทที่อ่านไม่ได้ รายงานความเข้าใจและแผนแบ่งงานให้เจ้าของตรวจ ก่อนเริ่มเขียนแอปหรือสร้าง/แก้ resource ภายนอก

โครงหลัก: Cloudflare + Supabase; React + Vite + TypeScript เป็นข้อเสนอทางเทคนิค ไม่ใช่เหตุผลให้เปลี่ยนดีไซน์ ไม่บังคับ Next.js; Backend ต้องใหม่ทั้งหมด

## ข้อกำหนดที่ห้ามตกหล่น

- แอปช่วยงาน AR; OPERA เป็นแหล่งข้อมูลเงิน ไม่แก้บัญชีใน OPERA อนุญาตผลจากการสร้าง/พิมพ์ Statement/Invoice/Folio ต่อเลขและประวัติการพิมพ์ตามขอบเขตที่ผู้ใช้อนุญาต
- THB เท่านั้น; Account ตัวตนแยก Hotel; group เพื่อ KAT/TSK/Total ไม่ใช่รวม ledger ข้ามโรงแรม
- Refresh 07:00 และ 19:00 เวลาไทย + manual + เปิดเว็บเมื่อข้อมูลเก่าตามเกณฑ์ที่ยืนยัน ไม่สร้างรอบซ้ำทุกแท็บ
- Billing-required: due = first actual billing date + credit term; Billing-not-required: due = OPERA base date + credit term
- Friendly, Follow 1, Follow 2, Follow 3, Final; เพิ่ม/ลด/เปลี่ยนข้อความได้ หลัง Final ยังไม่ศูนย์ต้องเห็น urgent บนเว็บ
- นับ current stage ล่าสุดต่อ Invoice ไม่สะสมซ้ำ นับ actual sent เท่านั้น ไม่ใช่ Draft
- Reply/Remittance ไม่ปิดหนี้; ยืนยันยอด Invoice เป็นศูนย์จึงเคลียร์ API error/ไม่พบรายการไม่ใช่ศูนย์
- PDF ต้นทางจาก OPERA ในเส้นทางปกติ; เก็บความสามารถสร้างเองเป็นทางสำรองที่ไม่ทำงานอัตโนมัติ
- เลือกเอกสารและจัดไฟล์ 3 แบบ; editor แก้ได้อิสระ; การแก้ไม่เปลี่ยนบัญชี/ยอดในฐานข้อมูล
- Design: เปิดภาพต้นแบบทั้ง 7 จริง คงไฟล์อ้างอิงเดิม ตรวจภาพเว็บจริงเทียบแบบ ไม่ยอมรับแค่ build ผ่าน
- อีเมล: Draft และ Send Now โดยคนเท่านั้น ไม่มี auto-send; ผู้รับของแต่ละ Account ตั้งเอง ไม่เอา OPERA email มา fallback
- Auth: Google และ email/password เริ่ม allowlist เฉพาะ ar@katathani.com ผูกเป็นผู้ใช้เดียว ตรวจที่ Backend และสิทธิ์ข้อมูล
- สถิติแยก Hotel/Account Type/Account จำนวนใบและยอด; กิจกรรมรายวันแยกจากงานคงค้าง

## ความปลอดภัยและหลักฐาน

ห้าม Secret, provider refresh token, service-role key, ค่าลับ, JSON/PDF ลูกค้าจริง และ test recipient แบบใช้ครั้งเดียวเข้า Git/Browser bundle/log ที่ติดตามใน repo ใช้ secret storage และ private data access; login session เป็นคนละสิ่งกับ provider credentials

ไม่ส่งอีเมล ไม่เปลี่ยน/ลบ cloud resource และไม่ลบไฟล์เดิมโดยอาศัยคำสั่งกว้าง ๆ ก่อนยืนยันปลายทางที่จำเป็น ผู้ใช้อนุญาตการทดสอบบริการจริงแล้ว แต่ต้องอ่าน test recipient แบบใช้ครั้งเดียวจากบริบทที่ได้รับอนุญาต ไม่ฝังในสเปกหรือค่าตั้งถาวร ไม่มีในชุดนี้

ใช้ Drive folder จริงที่ยืนยันแล้ว ติดตาม file IDs ของการทดสอบ ลบเฉพาะไฟล์ที่ทดสอบนั้นสร้าง ไม่ลบจากชื่ออย่างเดียว

ไม่เปิด arbitrary credentialed URL fetch; ตรวจปลายทาง/redirect และไม่ส่ง Authorization ข้าม host โดยอัตโนมัติ

เก็บการตรวจตัวตน Pagination, safe atomic update, Preview และ no-duplicate commands แม้ลด legacy gates ไม่มี paid add-on โดยไม่อนุมัติ Backup ใช้สิทธิ์ที่มีใน Supabase ไม่ซื้อ PITR เพิ่ม

## วิธีรายงาน

แยก proposed / implemented / tested / deployed / enabled ให้ชัด ตรวจบริการจริงก่อนอ้างผลจริง อัปเดต PROJECT_STATUS หลังงานที่มีสาระด้วยหลักฐานที่ไม่เปิดเผยข้อมูลลูกค้า ไม่ลบหรือแก้ baseline เพื่อทำให้ visual test ผ่านอย่างเดียว รักษาการทดสอบเชิงพฤติกรรมและภาพให้ตรงสเปกใหม่
