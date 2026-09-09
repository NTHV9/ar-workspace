# ผลงานรอบทำงานต่อโดยเจ้าของไม่ต้องอยู่หน้าคอม — 10 กันยายน 2026

ขอบเขตที่อนุมัติ: แม่แบบอีเมล/ตัวแก้ไขข้อความ, หน้าประวัติและสถิติจากหลักฐานส่งจริง, Laptop/Mobile และการทดสอบรวม ระบบส่วนอื่นที่ยังขาดข้อมูลธุรกิจหรือปลายทางไม่ได้ถูกอ้างว่าพร้อมครบ

## สิ่งที่ Implemented และ Enabled

### แม่แบบอีเมล

- เมนู Templates และปุ่ม Choose template ใน Email Composer มี Billing, Friendly, Follow-up 1, Follow-up 2, Follow-up 3 และ Final
- สร้างแม่แบบใหม่, แก้ชื่อ/Subject/ข้อความ/Purpose/Stage, บันทึกเวอร์ชัน, เปิดประวัติเวอร์ชัน และนำเวอร์ชันเก่ามาเป็นฉบับใหม่ได้
- Archive เป็นการซ่อนจากการใช้ในอนาคต ไม่ลบเวอร์ชันหรือข้อความที่เคยเตรียม/ส่ง
- รองรับตัวแปร account_name, hotel, invoice_count; แทนค่าลงข้อความที่กำลังแก้ ไม่เพิ่มผู้รับเอง
- Save template และ Save workspace draft เป็นคนละรายการ แม่แบบเปลี่ยนไม่แก้ข้อความย้อนหลัง/วันครบกำหนด/รอบทวง
- ทดสอบ UI จริงบันทึกและอ่านกลับแม่แบบเริ่มต้นทั้งหกใน Supabase สำเร็จ แต่ละรายการเป็น version 1 ไม่มีผู้รับหรือข้อมูลลูกค้าในข้อความเริ่มต้น เจ้าของควรตรวจถ้อยคำก่อนใช้กับลูกค้า

### Rich text

- ตัวหนา/เอียง/ขีดเส้นใต้, Bullet list, Quote, HTTPS/mailto link, Undo/Redo และมุมมอง plain text
- Paste เป็นข้อความ เพื่อไม่ดึงรูปติดตามหรือรัน HTML/script จาก Clipboard; เอกสาร/รูปเพิ่มผ่านไฟล์แนบตามเดิม
- เก็บข้อมูลจัดรูปแบบอย่างมีโครงสร้างและสร้างทั้ง MIME plain text กับ HTML; ตรวจทั้งสองส่วนก่อนบันทึกการส่งจริง
- จำกัดข้อความ 100,000 ตัวอักษร พร้อมขีดจำกัดจำนวน block/run/link และขนาด JSON ไม่เกิน 450,000 bytes; คำขอบันทึกไม่เกิน 1 MiB มีข้อความผิดพลาดแยกจากขนาดไฟล์แนบ
- แก้ปัญหาการกดโหมด Rich text ซ้ำล้างรูปแบบ, จังหวะ Ctrl+A → Ctrl+B ใช้ selection เก่า, stale abort error และขนาดข้อความภาษาไทยไม่สอดคล้องกับคำขอ/JSONB
- ใช้ browser-native editing ที่ทดสอบใน Edge; ยังไม่อ้างว่าทดสอบพฤติกรรมแก้ข้อความใน Safari/Firefox แล้ว ไม่มีเพิ่ม dependency หรือ backend อีกชุด

### Reports & Activity

- แยก Current receivables และ Verified sent activity
- Current ใช้บิลบวก parent/standalone; แสดง latest verified stage, Required-but-not-billed และ Final ที่ยังค้าง แยกยอดบัญชี OPERA ซึ่งอาจมีเครดิต
- Activity ใช้เวลา Gmail ส่งจริงในวันปฏิทินไทย และยอดต่อ Invoice จาก snapshot ของข้อความนั้น; ไม่ใช้ยอดปัจจุบันแทนยอดในอดีต
- First billing / Rebilling / Friendly / Follow-up / Final แยกกัน ไม่ให้อีเมล Billing ภายหลังกลบ Final ที่ยังไม่จ่าย
- Filter Hotel, Account Type, Account, Stage/Activity, ช่วงวัน; มี pagination พร้อมยอดรวมทุกแถวและเปิดประวัติราย Invoice ทุกวันได้
- เปิด Account แล้วกลับมา รักษามุมรายงาน ตัวกรอง ช่วงวันและหน้าเดิม โดยเก็บเฉพาะบริบทใน memory ที่แยกตามผู้ใช้ ไม่เก็บแถวการเงินไว้เป็นข้อมูลถาวร
- Draft, diagnostic test และการแก้ประวัติเองไม่เพิ่ม actual-send statistics; การเคลียร์ยอดภายหลังไม่ทำให้ประวัติส่งหาย
- Account type เก่าที่ไม่เคยบันทึกแสดง Not recorded และบอกว่า account type ของ event ถูกเก็บเมื่อยืนยันหลักฐานส่ง ไม่เดาจากค่าปัจจุบันย้อนหลัง
- ยังไม่แสดง Daily arrivals/Cash received/Payment allocation/Remittance เป็นยอดที่สมบูรณ์ เพราะยังไม่มี source history/mapping และคำนิยามครบ

### Laptop / Mobile

- คง Comparative Matrix KAT/TSK/Total และทุก Account/Account Type; ใช้การเลื่อนตารางที่เข้าถึงด้วยคีย์บอร์ด ไม่ตัดคอลัมน์หรือตัด Top N
- ปรับพื้นที่กด ความอ่านง่าย และข้อมูลความสดบนจอแคบ
- ตัวเลือก Hotel และแผง Invoice/Collection เป็น dialog ที่จัด focus, Escape, คืน focus และเปิดตัวเลือกเอกสารซ้อนได้โดยไม่สูญเสีย scope
- ตรวจ 1440×900, 1280×800 และ 390×844 ด้วยข้อมูลสมมติคงที่ ไฟล์ภาพอ้างอิงทั้งเจ็ดคงเดิม

## Tested จริง

| การตรวจ | ผล |
|---|---|
| Typecheck / Vite build | ผ่าน |
| Unit tests | 260 ผ่าน |
| Browser ชุด Cloudflare | 57 กรณีผ่าน บน assets ที่ Deploy จริง; รอบรวมสุดท้ายผ่าน 55 และ timeout 2 กรณีซึ่งตรวจซ้ำด้วย trace ผ่าน 4/4 |
| Editor harness | 23 ผ่านใน Local Edge; รวม browser cases 80 ข้อ |
| Template/Report SQL rollback | ผ่านบน Supabase จริง โดยไม่เหลือข้อมูลสมมติในธุรกิจ |
| Public health | HTTP 200 และ Supabase database_verified; OPERA connected จากรอบอ่านที่ยืนยันแล้ว |
| Anonymous templates/reports | HTTP 401; RPC เขียนไม่เปิดให้ authenticated/anon และตารางแม่แบบไม่เปิดให้อ่านแบบ anonymous |
| Backend/Browser → Supabase | หน้า Templates save/read และ Reports current/activity ผ่านจริง |
| Supabase security advisor | ไม่พบ Warning/Error; มี INFO 7 รายการของ private tables ที่ตั้ง deny-by-default ไว้เดิม |
| ตรวจ Git | Public repo เดิม, ไม่มี secret/ผู้รับทดสอบ/ไฟล์ลูกค้าจริงใน staged changes |

Browser ที่ใช้ API สมมติพิสูจน์การแสดงผลและพฤติกรรม ไม่ใช่หลักฐานการส่ง Gmail จริง ส่วนการส่งจริงใช้ diagnostic ด้านล่างแยกต่างหาก รอบรวมที่ชี้ Cloudflare tests ไป Vite ครั้งแรกมี 5 กรณีล้มเหลวจากไม่มี Worker API/ตรวจโดเมน เมื่อรันกับปลายทาง Cloudflare ที่ถูกต้องผ่านครบ 56 กรณีบน source แรก หลังเพิ่มกรณี Back-to-reports รอบสุดท้ายผ่าน 55/57 และเกิด timeout ใน Account Settings/Document creation; ตรวจเฉพาะสองกรณีซ้ำอย่างละสองรอบพร้อม trace ผ่าน 4/4 โดยไม่เพิ่ม timeout หรือแก้ assertion ยังไม่ฟันธงต้นเหตุ timeout สองครั้งนั้น ไม่มีการแก้ภาพอ้างอิงเพื่อให้ผ่าน

## การส่ง Rich text ผ่าน Gmail จริง

- เจ้าของอนุญาตผู้รับทดสอบครั้งเดียวในแชท ไม่เก็บชื่อผู้รับในเอกสาร/โค้ด/ค่าตั้ง
- ส่งโดยคลิกจากเว็บ Cloudflare → Worker → Gmail เวลา **04:19:49 ICT วันที่ 10 กันยายน 2026**
- ทดสอบส่งด้วย source 39ae325 (โค้ดอีเมลเดียวกับ source ล่าสุด 125e366 ซึ่งเพิ่มเฉพาะการรักษาบริบทรายงาน)
- ผล verified SENT; ตรวจผู้รับด้วย digest, ตัวตนข้อความ, plain text, HTML และ hash ของไฟล์ PDF สมมติ 1 ไฟล์
- ไม่รวม PDF ลูกค้าในชุดทดสอบ ไม่บันทึก Billing/Collection event และไม่แก้ประวัติบิล
- หลังตรวจ: business events 0, history dates/stages ที่กำหนด 0, recipient defaults 0, active supplemental files 0; diagnostic sent ทั้งหมด 3 (เพิ่ม 1 ครั้งในรอบนี้)
- ช่องผู้รับทดสอบถูกล้างหลังส่ง ไม่ถือการหายไปของ Draft เป็นหลักฐานส่ง

## Deployed

- GitHub: NTHV9/ar-workspace (Public), branch codex/opera-refresh
- Source commit: 125e366d46ef84ea61427c51694e524a0a6f5060
- URL: https://ar-workspace.ar-c82.workers.dev
- Worker deployment: 08d9cbb89be6446f9ed8384b88d353e3
- Workflow version: 0e5acf8c-d5ee-4ad7-85ad-a02a32b590dc; concurrency 2
- Supabase ar-workspace: jmyvpurzmoiecpydjrci
- Applied migrations: 20260909205357_ar_email_templates_rich, 20260909205630_ar_activity_reports, 20260909210914_ar_sent_evidence_immutability
- รักษา runtime Secret bindings และ cron เดิม ไม่อ่านค่าลับออกมา ไม่เปลี่ยนบริการ AR DB เดิม ไม่มี paid add-on

## ภาพตรวจ

- Portfolio / Account Detail: evidence/portfolio-1440.png และ evidence/account-1440.png ขนาดจริง 1440×900
- Email Rich: evidence/email-rich-composer-1440.png ขนาดจริง 1440×900
- Templates: evidence/email-templates-{1440,1280,390}.png
- Reports: evidence/reports-{1440,1280,390}.png และ reports-current-{1440,1280,390}.png
- Responsive: evidence/responsive-*.png และ rich-message-editor-{1280,390}.png
- ภาพ Templates/Reports หลายรูปเป็น full-page ที่ viewport ตามชื่อ เพื่อเห็นเนื้อหาด้านล่างครบ ทุกภาพใน Git เป็นข้อมูลสมมติ

## เรื่องที่ต้องใช้ข้อมูล/การตรวจจากเจ้าของ และงานนอกชุดนี้

- Billing Required/Not Required, Credit Term และผู้รับ Billing/Collection รายบัญชีจริง; วันวางบิล/รอบเก่าที่ต้องแก้เอง
- ตรวจถ้อยคำแม่แบบและหน้าตาที่เพิ่มก่อนใช้ส่งหาลูกค้าจริง
- Drive/Shared Drive folder จริงและระยะเวลาเก็บไฟล์ ก่อนเริ่มจัดเก็บ/ล้างถาวร
- คำนิยาม cash vs allocated payment, reversal/unallocated receipt, reopen policy และการจับคู่ remittance
- Existing Gmail thread selection, reply/remittance workflow, complete payment/daily-arrival statistics ยังเป็นงานต่อ ไม่ถูกนับว่าพร้อมใช้งานครบ
- Native OPERA Statement transport ยังไม่ยืนยัน; ใช้ทางเลือก Generate in AR Workspace ที่เจ้าของอนุมัติอย่างชัดเจนต่อไป ไม่มี automatic fallback
- ไฟล์แนบยังรองรับ static PDF/PNG/JPEG; XLSX/DOCX/archives/interactive PDF และ antivirus guarantee ไม่ได้เพิ่มในรอบนี้
