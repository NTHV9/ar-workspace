# สเปกผลิตภัณฑ์ฉบับส่งต่อ — Katathani AR Clean Rebuild

> ใช้ร่วมกับคำยืนยันล่าสุดใน DECISIONS_AND_OPEN_ITEMS.md. ข้อความ handoff เรื่อง native Statement/renderer สำรองถูกแทนแล้ว: Statement ใช้ renderer ของระบบเท่านั้น ส่วน Invoice/Folio ใช้ OPERA API. ผลพัฒนาและขอบเขตที่ทดสอบจริงอยู่ใน FINAL_ACCEPTANCE_20260911.md

เวอร์ชัน handoff: 2026-09-08 / 1.0
ฐาน: ข้อตกลงล่าสุดในบทสนทนา ChatGPT ที่ผู้ใช้ต้องการนำไปทำต่อใน Codex
สถานะ: สรุปข้อกำหนด ไม่ใช่คำรับรองว่าพัฒนา/เชื่อมต่อ/Deploy แล้ว

**คำยืนยันแทนข้อเก่า 10 กันยายน 2026:** Statement ใช้ renderer ระบบเราเท่านั้น ส่วน Invoice/Folio ใช้ OPERA API. แสดง OPERA receipts และ invoice applications แยกกันตามหลักฐานวันที่จริง. บิล verified-zero ที่กลับมาค้างคงประวัติและขึ้น Needs review. ไฟล์ Supabase/Drive เก็บหนึ่งเดือนหลังงานเสร็จและคุมไม่ให้เกินโควต้า/เพิ่มค่าใช้จ่าย; เกณฑ์ลบที่ต้องยืนยันและสถานะเปิดใช้ดู [DECISIONS_AND_OPEN_ITEMS](DECISIONS_AND_OPEN_ITEMS.md). ข้อความ native Statement เป็นหลัก/renderer เป็น fallback ด้านล่างเป็นข้อกำหนด handoff เดิมที่ถูกแทนแล้ว.

## 1. เป้าหมายและหลักการ

สร้างระบบใหม่ทั้งหมดสำหรับงานวางบิลและติดตามลูกหนี้ของทีม AR ใช้ข้อมูลเงินและเอกสารต้นทางจาก OPERA ระบบของเราเก็บกฎงาน สถานะการส่งจริง ผู้รับที่ตั้งเอง และสถิติที่จำเป็น

เจ้าของไม่พอใจโครงและหน้าตาแอปเดิม จึงไม่ต้องนำโค้ด Frontend/Backend/schema/migrations/workflows/tests เก่ามา reuse เป็นฐานใหม่ ใช้เพียงข้อกำหนดล่าสุด หลักฐาน API เอกสารต้นฉบับและดีไซน์ที่อนุมัติเป็น reference ใช้ไลบรารีมาตรฐานที่เหมาะสมได้ ไม่จำเป็นต้องเขียน auth/PDF engine ทุกอย่างเอง

แอปใหม่ไม่พึ่งแอปเก่าในการรัน ไม่ reset/lบของเก่าเพื่อเริ่มใหม่ และไม่ import business state เก่าโดยอัตโนมัติ

## 2. Platform และทรัพยากร

### ข้อตกลง

- ใช้ Cloudflare และ Supabase แทน Google Cloud Hosting/Cloud SQL/Cloud Scheduler ของเดิม
- ผู้ใช้แจ้งว่ามี Cloudflare plan $5 และ Supabase Pro $25 อยู่แล้ว ไม่เพิ่ม paid add-on หรือ project เสียเงินเพิ่มโดยเงียบ ๆ
- OHIP API calls ไม่ใช่ข้อกังวลค่าใช้จ่ายของผู้ใช้ เน้นลด CPU/RAM/DB writes/storage/งานซ้ำฝั่งเว็บ
- ยังใช้ Gmail และ Google Shared Drive รวมถึง Google OAuth/API ที่จำเป็น การเลิก Google Cloud Hosting ไม่ใช่เลิก Gmail/Drive
- ทดสอบ integration หลักบน Cloudflare และ Supabase จริง ไม่รอให้ทุกอย่างสมบูรณ์บน local ก่อน

### ข้อเสนอทางเทคนิคที่ต้องยืนยันในแผน

React + Vite + TypeScript สำหรับ Frontend, Cloudflare Workers สำหรับ Backend, Supabase PostgreSQL/Auth และ Private Storage สำหรับพักไฟล์ ไม่ล็อก Next.js, ไม่บังคับ framework/UI kit ที่ทำให้ดีไซน์เปลี่ยน และไม่แบ่ง Business Logic ซ้ำสองฝั่งโดยไม่มีเหตุผล

HTML/CSS ยังเป็นพื้นฐานของ UI แม้ใช้ React ไม่ใช่ทางเลือกแบบต้องเลือก CSS หรือ React อย่างใดอย่างหนึ่ง

## 3. ผู้ใช้และ Login

- ผู้ใช้เริ่มต้นที่อนุญาต: `ar@katathani.com` เพิ่มผู้ใช้อื่นภายหลังได้ผ่านการอนุมัติ
- Login ได้ทั้ง Sign in with Google และ User/Password
- ข้อเสนอเริ่มต้นให้ User หมายถึง email เดียวกัน ไม่ต้องสร้าง username แยก แต่ยืนยันกับเจ้าของในแผน
- Password เป็นของ Web App ไม่ใช่รหัส Gmail; ใช้ Supabase Auth จัดการ ไม่เก็บรหัส plaintext เอง
- Google และ Password ต้องผูกกับ user identity และข้อมูลชุดเดียวกัน ไม่สร้างบัญชีซ้ำ
- ไม่เปิดสมัครทั่วไป; Backend และ DB/file access ต้องตรวจสิทธิ์จริง ไม่ใช่ซ่อนเมนูอย่างเดียว
- ไม่ทำสถิติประสิทธิภาพรายพนักงานว่าใครเตรียมหรือใครส่ง แต่ระบบยังต้องมี session/security context ที่จำเป็น
- กล่องอีเมลทำงาน/ผู้ส่ง: `ar@katathani.com` แยก Google mailbox integration token จาก session login

## 4. Hotel, Account Type, Account และกลุ่ม Agent

- โรงแรมเริ่มต้นตามบริบทที่คุย: KAT และ TSK; ยืนยัน Hotel IDs จริงก่อนใช้
- Operational Account identity ต้องมี Hotel + OPERA Account ID เสมอ Account No. และชื่อเก็บแยกจาก Account ID
- Invoice identity ต้องมี Hotel + Account + stable OPERA item identity ไม่ใช้ตำแหน่งใน array และไม่ใช้ชื่อแขก/ยอดเงินอย่างเดียว
- Account Type ใช้ค่าจาก OPERA ไม่เปลี่ยนชื่อกลุ่มโดยเดา มี filter/drilldown ทุกสถิติ
- Agent เดียวกัน เช่น Agoda แสดงยอด KAT, TSK และ Total ได้ แต่ยังแสดงแยก Hotel เสมอ ไม่รวม ledger/สถานะ/Invoice ข้ามโรงแรม
- Portfolio: ตามคำยืนยันเจ้าของ 11 กันยายน 2026 ให้ Account เดียวกันอยู่แถวเดียวเพื่อเทียบ KAT/TSK. ใช้ Account No. ที่ตรงกัน (trim/case-insensitive) และไม่ซ้ำภายในโรงแรมเป็น reporting mapping โดยคง explicit group เดิมหากมี. เลขขาด/กำกวมยังแยก Hotel + Account ID; ไม่จับคู่ด้วยชื่อหรือ internal ID อย่างเดียว. ข้อนี้ใช้แสดงผลเท่านั้น ไม่รวม operational identity
- Billing, Credit Term, ผู้รับ และเอกสารยังผูกกับ Hotel + Account ไม่ใช้ grouping เพื่อส่ง Statement รวมข้ามโรงแรม
- THB เท่านั้น หากพบสกุลอื่นให้แจ้งข้อมูลผิดขอบเขต ไม่แปลง/ติดป้าย THB ให้เอง

## 5. OPERA: อ่านบัญชี แต่อนุญาตผลด้านเอกสาร

ห้ามเว็บเปลี่ยนยอด Invoice/Payment, Apply/Unapply, Adjustment, Transfer, สร้าง/ลบรายการบัญชี, เปลี่ยน Invoice/Folio identifiers หรือแก้ Guest/Profile ใน OPERA พนักงานแก้ต้นทางใน OPERA เองแล้ว Refresh เว็บ

อนุญาตให้ขอ/สร้าง/พิมพ์ Statement, Invoice และ Folio แล้วเกิดการเปลี่ยน print history, report sequence หรือ Statement Number ตามการทำงานเอกสารที่พิสูจน์และอนุญาต ห้ามใช้การอนุญาตนี้เปิดโมดูลเขียนบัญชีทั้งหมด

ไม่ใช้ API สร้าง Invoice ทางบัญชีแทนการ reprint PDF ของ Invoice เดิม คำสั่งเอกสารที่มี side effect ต้องป้องกันการเรียกซ้ำเมื่อผลไม่แน่นอน

## 6. บทบาท API ข้อมูลสามชุด

### 6.1 Account list

`GET /ars/v1/accounts`

ใช้หารายชื่อและ Account IDs; รับข้อมูลที่จำเป็นต่อ navigation เช่น Hotel, Account ID/No./Name/Type/Balance ดึงทุกหน้า ไม่คาดว่า API รองรับเลือก fields เฉพาะชื่อ+ID หากยังไม่มีหลักฐาน

Current work อาจอ่าน Open Accounts แต่ทะเบียนบัญชี/การตรวจยอดศูนย์/สถิติรายการเข้าต้องครอบคลุมบัญชีที่ปิดระหว่างรอบด้วย ไม่ใช้ Open-only list เป็นหลักฐานว่าบิลนั้นไม่มี

### 6.2 Current Account

`GET /ars/v1/hotels/{hotelId}/accounts/{accountId}`

ขอ `fetchInstructions=Account`, `Summary`, `Invoices`, `Aging`, `Payments` ใช้เป็นแหล่งหลักของ snapshot ปัจจุบันตามขอบเขตที่พิสูจน์จริง

เก็บ/อ่านข้อมูล: Account ID/No./Name/Type, profile context, ยอด Account/Summary, credit limit/ข้อมูลติดต่อเฉพาะที่ UI ต้องใช้, aging buckets, Invoice, Payment และ identifiers/dates/flags ที่จำเป็น

Invoice: original/current/payments/open, guestName, reference, transactionNo, transactionDate, invoiceNo, folioNo, reservationId, folioDate และ context ที่ต้องใช้ขอ PDF ไม่เดา field ที่ไม่ส่งมา

Payments แยกจากยอด payments ที่อยู่ภายใน Invoice; ไม่หัก Payment ซ้ำจากยอด Invoice.balance

OPERA email จะไม่เป็น recipient fallback ของการวางบิล/ทวงหนี้

ต้องพิสูจน์ความครบใน Account ใหญ่/partial payments/credits ไม่ถือว่าตัวอย่างหนึ่ง Invoice พิสูจน์ว่าทุก Account คืนทุกแถวครบ และยอดรวมตรงอย่างเดียวไม่พิสูจน์ membership ครบ

### 6.3 Invoice/Payment history

`GET /ars/v1/invoicePayments/accounts/{accountId}`

แนวทางคำขอใหม่: `inclZeroBalance=true`, `inclDetails=true`, fetch Invoices และ Payments พร้อม pagination เริ่มต้น offset=0 / limit=50 เป็นค่าที่ต้องยืนยันกับ environment ไม่ส่ง unBilled ใน query ปกติหลังตรวจผลเทียบค่าเดิม

ไม่ใช้ unBilled/printed/Statement Number เป็นสถานะวางบิลของเว็บ

ใช้เปิด history, ตรวจ Invoice ที่หายจาก Current และเติมสถิติที่ Current-only อาจพลาด ไม่โหลดประวัติหลายปีทุก Account ทุกการเปิดหน้า

ยอดศูนย์ไม่ใช่ทุกแถวที่ history คืน เพราะ inclZeroBalance=true รวมทั้งเปิดและปิด แยก type และใช้ identifiers กันนับซ้ำ

Business Date, payment allocation และเอกสารอาจต้องใช้ endpoint เพิ่ม สามตัวนี้คือ API ข้อมูลหลัก ไม่ใช่ข้อจำกัดว่าทั้งระบบมีได้เพียงสาม endpoint

## 7. Refresh และข้อมูลล่าสุด

- Auto refresh เวลา 07:00 และ 19:00 Asia/Bangkok
- Manual refresh ตาม Account/Hotel/ทั้งระบบที่เลือก
- เมื่อเปิดเว็บ: เช็กความเก่าก่อนและให้ทุกคนใช้ผลร่วมกัน เกณฑ์ 30 นาทีเป็นข้อเสนอที่ยังปรับได้ ไม่ใช่ periodic refresh ทุก 30 นาที
- เปลี่ยนเมนู/เปิดแท็บหลายคนไม่เริ่ม full refresh ซ้ำ หากมีงานอยู่ให้ใช้ผลของงานเดิม
- ก่อนทำเอกสาร/Draft/Send Now ตรวจยอดเฉพาะรายการที่ใช้ตามความเสี่ยง ไม่จำเป็นต้องอ่านทุกโรงแรมใหม่
- แสดง last successful refresh และ stale/error ตามโรงแรม ไม่แสดง API error เป็น 0
- ปกติแสดงข้อมูลล่าสุดที่เก็บร่วมกันจาก DB; ไม่ใช้ live request ต่อเนื่องทุก Browser page
- ใช้ข้อมูลใหม่เมื่อดึงครบตามขอบเขต ไม่ให้หน้าครึ่งชุดแทนของเก่า ไม่จำเป็นต้องยก candidate/publication machinery เดิมมา
- ตรวจพื้นฐาน identity, field type, money semantics, pagination, duplicate rows, scope และ atomic replacement คงไว้
- ผลรวมไม่ตรงให้ตรวจ/เตือนและกันการกระทำที่พึ่งข้อมูลนั้นตามแผน ไม่ยกเลิก safeguards ทั้งหมดเพราะเชื่อบัญชี OPERA
- cron ต้องแปลงเวลาให้ตรงตาม runtime ที่ใช้ ยืนยันอีกครั้งก่อน deploy

## 8. วันที่และ Aging

วันหลักของบิลใน UI/สถิติใช้ `transactionDate` จาก OPERA ตามกฎที่เจ้าของยืนยัน ไม่สร้าง KPI วันที่เว็บพบครั้งแรกอีกคอลัมน์ให้สับสน

เก็บ capture/sync timestamp ทางเทคนิคเพื่อบอกความสดและตรวจงานได้ ไม่สวมวันที่พบแทนวันที่บิล และไม่ต้องทำสถิติความช้าพนักงานจากเวลาที่พบครั้งแรก

ในกระบวนการของโรงแรม เจ้าของใช้ transactionDate ของ Invoice เป็นวันที่เริ่มงานซึ่งสัมพันธ์กับ Check-out แต่ห้ามนิยามว่า transactionDate ของทุก object คือ Departure Date โดยเฉพาะ Payment ใช้วันที่ของ Payment และห้ามปลอม departureDate หากต้นทางไม่มี

Aging จาก OPERA กับจำนวนวันเกิน Due Date ของเว็บเป็นคนละค่า รักษา label/range/order ของโรงแรม ถ้าช่วง Aging สองโรงแรมไม่เท่ากัน ไม่บังคับรวมให้ดูเหมือนเท่ากัน

สถิติรายวันใช้วันที่ที่ถูกความหมาย: bill entry = OPERA bill date; billing/follow-up = actual sent date; remittance = received date; collection cash = verified payment date ไม่ใช้ capture date แทนวันที่ชำระจริง

## 9. Billing, Credit Term และ Due Date

ค่าตั้งต่อ Hotel + Account: Billing Required/Not Required, Credit Term, Billing/Collection recipients และ document preferences

- Required: Due Date = วันที่วางบิลสำเร็จจริงครั้งแรกของ Invoice + Credit Term
- Not Required: Due Date = วันที่ฐาน Invoice จาก OPERA + Credit Term
- ยังไม่วางบิลใน Required: ไม่มี Due Date ที่เดาขึ้นเอง แต่เข้าคิวรอวางบิลทันทีตามรายการที่ระบบได้รับ
- การสร้าง PDF/Draft ไม่ใช่การวางบิล การส่งจริงหรือบันทึกวางบิลภายนอกที่ยืนยันแล้วจึงนับ
- Billing date ผูก Invoice ที่ส่งจริง ไม่กำหนดให้ทั้ง Account เพียงเพราะส่งบางใบ
- resend/corrected copy/follow-up ไม่ reset Billing date หรือ Due Date
- Term มี effective meaning; การแก้ setting ไม่เปลี่ยน due date ของงานเก่าเงียบ ๆ
- ขาด Term ยังดู Account/Invoice/Aging ได้ ไม่ซ่อนหนี้หรือกันอ่านทั้งบัญชี แต่ไม่คำนวณ Due/Friendly โดยเดา Term=0
- เก็บความสามารถบันทึก external billing อย่างชัดเจน (วัน/ช่องทาง/อ้างอิง) สำหรับงานที่ไม่ส่งผ่าน Gmail ของเว็บ
- จำนวนวันปฏิทินเป็นแนวทางที่คุยไว้; ยืนยันการตีความ end-of-day/overdue ตาม OPEN_ITEMS

Email วางบิลและทวงหนี้ตั้งเองแยก To/CC/BCC ไม่มี OPERA fallback หากผู้รับขาดให้แก้ข้อมูล ไม่หยิบอีเมลจาก JSON มาใช้แทน

## 10. Collection และหน้างาน

ลำดับตั้งต้นล่าสุด: BILLING (เฉพาะ Required) → FRIENDLY → FOLLOW 1 → FOLLOW 2 → FOLLOW 3 → FINAL

- Friendly: Due Date - 7 วัน
- Follow 1: เลย Due Date และยังมียอดค้าง (ข้อเสนอเริ่มวันถัดจาก Due Date)
- Follow 2: หลังส่ง Follow 1 จริง 7 วัน
- Follow 3: หลังส่ง Follow 2 จริง 7 วัน
- Final: หลังส่ง Follow 3 จริง 7 วัน
- Final ส่งแล้วแต่ยังไม่ศูนย์ต้องปรากฏ urgent/เร่งด่วน ไม่จบงาน ไม่หายจากหน้าจอ ข้อเสนอคือแสดงทันทีหลัง Final พร้อมวันที่ส่งและ days overdue
- รอบเป็นค่าตั้ง เพิ่ม/ลด/เปลี่ยนชื่อ/ช่วงวัน/Subject/Body ได้ ไม่แก้ history ของสิ่งที่ส่งแล้วตาม template ใหม่
- การลบรอบที่เคยใช้หมายถึงปิดอนาคต ไม่ทำประวัติเดิมหาย
- การครบกำหนดเพียงสร้างงานเตือน ไม่สร้าง Draft หรือ Send อัตโนมัติ
- Draft กี่รอบก็ไม่เลื่อน stage; resend ที่ผูกกับ stage เดิมไม่เป็น next stage เอง
- ถ้าไม่ส่ง Follow 2 ตามวันที่เตือน งานยังรอ Follow 2 ไม่กระโดด Follow 3 ตามเวลา
- Payment บางส่วนใช้ latest open; ไม่ reset รอบเป็น Follow 1
- Reply หรือได้รับใบแจ้งโอนไม่ถือว่าเคลียร์ ไม่ auto-reset Due Date/รอบ; หากมีการพัก/เลื่อนต้องเป็นคำสั่งคนที่ชัดเจน
- คงความสามารถหมายเหตุ ข้อโต้แย้ง และการพักอย่างตั้งใจได้ แต่ไม่ทำให้หนี้หายจากยอดรวม

### สองมุมมองที่ต้องแยก

1. Latest sent stage ของ current open Invoice: หนึ่ง Invoice อยู่กลุ่ม latest stage เพียงกลุ่มเดียว ไม่สะสม Friendly/Follow1/Follow2 พร้อมกัน
2. Next action: บอกต้องทำอะไรต่อและเมื่อไร เช่น latest=Follow1 แต่ next=Follow2 due today

สองกลุ่มเป็นการมองรายการเดียวกันคนละมุม ห้ามบวกสองมุมเป็น total bills Urgent/Remittance เป็น tag หรือ urgency ที่สัมพันธ์กับ Invoice ไม่ใช่ Invoice ใหม่ให้นับซ้ำ

Queue ต้องมีจำนวนใบและยอดใน Billing/Friendly/Follow1/Follow2/Follow3/Final/Urgent และดูงานยังไม่ถึงรอบได้ พร้อม filter Hotel/Account Type/Account; กดตัวเลขแล้วต้องเห็น Invoice จริง

## 11. ยอดศูนย์และการปิดงาน

OPERA ยืนยันยอดราย Invoice = 0 → CLEARED สถานะเดียวบนหน้าจอ → ออกจาก Billing/Friendly/Follow/Final/Urgent และคิวหนี้ค้างของใบนั้น

ไม่บังคับทีมเลือกว่าปิดด้วย Payment/Adjustment/Transfer ไม่ใช้ Reply/Remittance แทนยอดศูนย์ ไม่ใช้ Account net balance=0 เพื่อปิด Invoice ทุกใบ และไม่ถือว่าหายจาก open list หรือ API error คือยอดศูนย์ ต้องอ่านหลักฐานตัว Invoice เดิม

หากกลับมาเปิดจาก OPERA ภายหลังต้องตรวจรายการเดิมและปรับ current state ไม่เพิ่มเป็นบิลเข้าครั้งแรกซ้ำหรือเริ่มส่งทวงเอง กฎเปิดรอบต่อหลัง reopen ยังต้องกำหนดใน OPEN_ITEMS

การปิด state เดียวไม่ได้ให้คำนวณ cash collected โดยเอายอดบิลศูนย์ทั้งหมดมาบวก ดูข้อสถิติเงินรับ

## 12. Remittance

ความหมายที่เจ้าของยืนยัน: ลูกค้าส่งใบแจ้งโอนแล้ว แต่ยังรอเงินเข้าหรือรอตัดยอดใน OPERA

บันทึกวันที่ได้รับ เลขอ้างอิง Invoice ที่เกี่ยวข้อง และยอดที่แจ้งชำระแต่ละใบ/รวมตามหลักฐานที่มี ไม่เดาจัดสรรเงินต่อใบถ้าเอกสารไม่บอก

Remittance ไม่ลด Open เอง ไม่ถือว่าเก็บเงินแล้ว ไม่ reset collection stage ถ้าเป็น wait/hold ต้องเป็นกฎที่ยืนยัน ไม่ซ่อนคำเตือนเองเพียงมี Reply

แยกจำนวนเอกสารแจ้งโอนกับจำนวน Invoice หนึ่งเอกสารครอบคลุม 5 Invoice ต้องนับตามสิ่งที่เลือกวัด ไม่คูณยอดรวมซ้ำให้ทุก Invoice

สถิติ: ได้รับ Remittance วันนี้ (activity) กับ Remittance รอเคลียร์ทั้งหมด (current) แสดงยอดแจ้งชำระแยกจากยอด OPERA ถ้าเกิด partial settlement แล้วไม่รู้การจับคู่ ให้บอกข้อจำกัดของยอดรอจริง ไม่ลดด้วยการเดา

## 13. สถิติและยอดเงิน

ทุกมุมรองรับ Hotel → Account Type → Account → Invoice และจำนวนใบ/ยอด THB พร้อมหลักฐานแถว ไม่แยกผลงานรายพนักงาน

| สถิติ | วัน/ขอบเขตที่นับ | ยอด |
|---|---|---|
| บิลเข้าวันนี้ | transactionDate ของ Invoice เป็นวันนี้ รวมที่เคลียร์ระหว่างวันเมื่อดึงครบ | ยอด Invoice ตามนิยามยอดที่กำหนดและติดป้ายชัด ไม่ใช้เฉพาะ Open |
| วางบิลวันนี้ | ส่งวางบิลครั้งแรกจริงวันนี้ รวม Invoice วันเก่าได้ | ยอดที่วางบิล ณ ตอนส่ง |
| ยังไม่วางทั้งหมด | Required + ยังไม่ส่ง + ยัง Open จากทุกวัน | Current open |
| Friendly/Follow ส่งวันนี้ | Actual sent events ของวันนั้น ไม่ใช่ Draft | ยอดที่ส่ง ณ ตอนนั้น |
| Current stage | Latest successfully sent stage ต่อ Invoice ที่ยังค้าง | Current open |
| ต้องทวงรอบใด | งาน due ตาม progression | Current open |
| บิลเคลียร์ | รายการที่ยืนยัน Balance=0 โดยรู้ช่วง observation | ยอดบิล/ยอดอ้างอิงติดป้าย ไม่เรียกเป็น cash collected ทั้งหมด |
| มีจ่ายกี่ใบ | Invoice ที่มีหลักฐาน payment application ในช่วงนั้น | Applied amount ของช่วงนั้น |
| เก็บเงินได้ | Receipt/payment transactions ของช่วงนั้นตามขอบเขตที่พิสูจน์ | Cash/payment amount ไม่ใช่ AR drop หรือ sum zero invoices |
| Remittance วันนี้ | Received date ของหลักฐานแจ้งโอน | แจ้งชำระ ไม่บวกเข้ารับเงินจริงซ้ำ |
| Remittance รอเคลียร์ | Invoice ที่เกี่ยวข้องยังไม่เคลียร์ | Reported/remnant ตามหลักฐาน แยก Open |
| บิลเกิน 90 วัน | OPERA age >90 และยัง Open | Current open |
| เกิน 60 วันยังไม่วาง | OPERA age >60 + Required + ยังไม่ส่ง + ยัง Open | Current open |

บิลเข้า 20 ใบ วางวันนี้ 35 ใบ และยังไม่วางรวม 80 ใบเป็นไปได้ ตัวเลขเป็นคนละสถิติ ไม่บังคับเป็น cohort วันนี้เดียวกัน

Historical activity ไม่ลดลงเมื่อ Invoice เคลียร์ในวันถัดไป Current work ต้องลดลง วันที่ใน OPERA อาจย้อนเข้ามาภายหลัง ให้เติมสถิติวันต้นทางไม่เปลี่ยนเป็นวันที่เว็บพบ

Current-only refresh อาจพลาด Invoice ที่เกิดและปิดระหว่างรอบ ต้องกำหนด bounded history/discovery สำหรับ daily stats ก่อนอ้างว่าครบทุกใบ Initial import แยกยอดยกมา ไม่เอาบิลเก่ามานับเป็นวันนี้ ไม่สัญญาสถิติการส่งก่อนเริ่มใช้ระบบถ้าไม่มีหลักฐาน

ตัวอย่างเงินรับ: Invoice 100,000 จ่ายก่อนหน้า 90,000 วันนี้จ่าย 10,000 → วันนี้เคลียร์ 1 ใบ แต่เก็บเงิน 10,000 ไม่ใช่ 100,000 ยอด Invoice.payments เป็นยอดสะสม ไม่ใช่เงินรับประจำวันโดยตัวมันเอง

หากไม่มี payment-to-invoice mapping ห้ามอ้างจำนวน Invoice ที่รับชำระแบบแน่นอนจากเลขเงิน/ชื่อ/วันที่ใกล้กัน

## 14. จำนวนวันที่ดู ไม่ใช่ SLA รายพนักงาน

ต้องดู: ยังไม่วางกี่วันจาก OPERA bill date; วางบิลหลังวันที่บิลกี่วัน; เกิน Due Date กี่วัน; จากการทวงล่าสุดกี่วัน

ไม่ต้องมี SLA เป้าทีม ไม่วัดรอเอกสาร/เวลา PDF/Draft ค้าง ไม่แยกคนเตรียมคนส่ง ไม่กล่าวโทษพนักงานจาก data ingestion delay

Not Required แสดงไม่ต้องวางบิล ไม่ให้เข้า billing-latency average เป็น 0 วัน อาจดูค่าเฉลี่ย/ช่วงของจำนวนวันจริงได้ แต่ไม่เพิ่มรายงานที่เจ้าของตัดออก

## 15. PDF ต้นทาง การเลือก และการจัดไฟล์

ใช้ PDF ต้นฉบับที่ OPERA สร้างตรงโรงแรม/รายการ ไม่วาด PDF เลียนแบบแล้วอ้างว่าเป็นต้นฉบับ API Statement/Folio ต้องพิสูจน์ output จริงก่อนอ้างว่าหน้าตาตรง UI

System renderer เผื่อไว้เป็นความสามารถแยก แต่ไม่เป็น automatic fallback; การเก็บ feature ไว้ไม่อนุญาต reuse โค้ดแอปเก่าทั้งโมดูล

หนึ่งงานเอกสารมีหนึ่ง Hotel + Account เลือก Invoice/Folio หลายใบได้ ไม่เลือกทุกใบใน Account เอง ไม่เลือก posting ภายใน Folio เป็นสิ่งใหม่โดยอัตโนมัติ

Content: Statement only / Invoices-Folios only / Both

Delivery:
1. รวมทั้งหมด PDF เดียว เรียง Statement ก่อน ตามด้วย Invoice ตามลำดับที่เลือก
2. Statement หนึ่ง PDF + Invoices รวมอีกหนึ่ง PDF
3. Statement หนึ่ง PDF + Invoice แต่ละใบคนละ PDF

เมื่อ Statement only มีไฟล์เดียว; Invoice only เลือกรวมหรือแยกได้ หนึ่ง Invoice อาจมีหลายหน้า ห้ามแบ่งทุกหน้าว่าเป็นคนละ Invoice

ตรวจ selected-only ทั้ง membership และบริบทของ total/aging ของ Statement ถ้า OPERA ส่งรายการเกินต้องไม่ใช้โดยเงียบ ๆ ห้ามตัดแถวจาก PDF แล้วเหลือยอดรวมเก่า

ยอมให้ native standalone Statement ที่พิสูจน์ membership ได้ ไม่ยก hard-coded limitation เดิมที่ต้องเป็น combined batch เสมอมาเป็นข้อกำหนดใหม่

รับ URL/report delivery ที่พิสูจน์ว่าเชื่อถือได้ รวม signed/query URLs ได้ ไม่จำกัด path แคบตามระบบเดิม แต่ไม่เปิด arbitrary URL/proxy หรือส่ง credential ข้าม host

## 16. PDF Editor และไฟล์

ต้องการแก้ได้อิสระเหมือน Word/Note ในการใช้งาน ไม่จำกัดเฉพาะตัวเลข: text/font/style/image/note/stamp/position/page add/delete/reorder/undo/redo รวมถึงแก้เนื้อหาเดิมตาม capability ที่เลือก

ต้องพิสูจน์ว่าตัว editor ที่ใช้แก้ text เดิม/reflow ได้แค่ไหน ห้ามเรียกเครื่องมือ annotation-only ว่าทำ Word-like editing ครบ ถ้าต้องใช้ paid SDK ต้องขออนุมัติก่อน ไม่รวมราคาในแผนเดิมโดยเดา

ก่อนแก้ตรวจต้นฉบับตรงรายการ หลังแก้แสดง final preview และรับทราบการเปลี่ยน ไม่บังคับ final PDF ต้องมีค่าทุกตัวเท่ากับ OPERA จนแก้ไม่ได้ การแก้ PDF ไม่เปลี่ยน current accounting values/local workflow facts และไม่เขียนกลับ OPERA

ปิดข้อมูลต้อง redaction/flatten ที่ทำให้ข้อความเก่าไม่ยังถูก Copy/Search ได้โดยไม่ตั้งใจ ไม่อ้างว่า rectangle สีขาวเท่ากับลบข้อมูลต้นทางแล้ว

## 17. Gmail และสถานะการส่ง

- มี Create Gmail Draft และ Send Now; ทุกครั้งเป็นคนเริ่ม ไม่มี scheduled auto-send หรือ auto-create drafts
- ปรับ Subject/Body แต่ละรอบและข้อความเฉพาะงานได้; template บันทึกแยกจาก message edits
- รองรับ To/CC/BCC ที่ตั้งเอง; no silent OPERA fallback
- Preview ผู้รับ ข้อความ ไฟล์จริงก่อนส่ง; selected Invoice list ใช้ชุดเดียวกันกับไฟล์และ record การส่ง
- ไม่เก็บ Draft creation เป็น business KPI; เก็บ technical mapping ขั้นต่ำเพื่อรู้ว่า draft/message ใดเกี่ยวกับรายการ/รอบไหนและป้องกันซ้ำ
- Actual Gmail sent time ใช้เริ่ม Billing/next round ไม่ใช่วันที่สร้าง Draft ไม่ใช่เพียง draft หายหรือ API request เริ่มแล้ว
- Draft ถูกลบ ≠ ส่งแล้ว ต้องตรวจ actual sent evidence และการเปลี่ยน Message ID
- การส่งจาก Gmail นอกเว็บอาจเกิดหลังข้อมูลเปลี่ยน ตรวจ reconciliation และแจ้ง stale draft ได้ แต่ไม่รับรองว่าสกัดก่อนผู้ใช้คลิก Send ใน Gmail ได้ทุกกรณี
- Ambiguous send outcome ตรวจผลเดิมก่อน retry ไม่ส่งฉบับใหม่ทันที
- ถ้าผู้ใช้แก้ recipients/attachment ใน Gmail หลังสร้าง Draft ให้เก็บผลที่พิสูจน์ได้ ไม่เดาว่าครอบคลุม Invoice เดิมครบหากหลักฐานเปลี่ยน
- ไฟล์เพิ่มเองแยกจาก PDF ที่ generate; ไม่ตัด attachment/ส่งบางส่วน/เปลี่ยนเป็น Drive link เอง
- Reply match จาก identifiers/thread ที่มีหลักฐาน unmatched ต้องตรวจ ไม่สรุปจ่ายจากข้อความตอบ

## 18. Drive และ retention

ใช้โฟลเดอร์จริงที่เจ้าของยืนยันตั้งแต่ทดสอบ ไม่ต้องมี test folder แยกที่ต้องเปลี่ยนปลายทางภายหลัง แต่ mark test files และเก็บ exact file IDs ของแต่ละ run ลบเฉพาะไฟล์ที่ run สร้าง ไม่ล้าง folder/Drive หรือจับชื่อคล้ายแล้วลบ

Drive เก็บเอกสารที่แก้ไขจาก OPERA เป็นหลัก เอกสารที่ไม่แก้ไม่ต้องทำ long-term duplicate ทุกฉบับ การ merge/split-only ไม่จำเป็นต้อง archive โดยอัตโนมัติ (ยืนยัน final retention รายการใน OPEN_ITEMS)

ไฟล์ทำงานชั่วคราวใช้ private storage และ cleanup ตามวงจรงาน ค่าระยะวันยังไม่ตกลง อย่าฝัง retention 30/90 วันใหม่เอง

Original/edited pair สำหรับงานแก้ PDF เป็นข้อเสนอเรื่อง audit ไม่ใช่ให้เก็บต้นฉบับทุกงาน ต้องกำหนดกติกานี้ก่อนทำ

ไม่สมมติว่า regenerate จาก OPERA เมื่อไรก็เหมือนไฟล์เก่าทุก byte/ยอด/print date ใช้ sent message และ attachment ที่มีอยู่เป็นหลักฐานของสิ่งที่ส่งจริงได้ตาม retention ของ Google

## 19. ข้อมูลที่เก็บและการล้างเมื่อเคลียร์

1. Account configuration: Term, required flag, recipients, grouping, preferences เก็บต่อแม้ยอดบัญชีเป็น 0 เพราะมีงานใหม่ภายหลังได้
2. Latest OPERA data: ชุดล่าสุดและ metadata ที่พอรักษาความครบ ไม่ keep snapshots detail ทุก refresh เป็น default
3. Workflow ย่อ: actual billing/send dates, latest stage, current waits/remarks ที่ใช้, message refs, remittance records
4. Historical business events/aggregates: เก็บพอทำ daily stats และ drilldown ที่สัญญา ไม่ลบผลงานเมื่อ invoice เคลียร์
5. Daily AR/Aging summaries: เพื่อแนวโน้ม ไม่สัญญา historical invoice-by-invoice ถ้าไม่เก็บ
6. Transient PDF/drafts: ล้างตามวงจรโดยไม่ทำงานส่งที่ไม่แน่นอนหาย

ยอดศูนย์: ออกจาก current work ทันทีเมื่อพิสูจน์ได้; ลด/ล้างข้อมูลหนักได้ แต่เก็บสรุปที่ใช้ counts/dedup/billing history ตาม retention ที่ยืนยัน

## 20. ความปลอดภัย ขนาดไฟล์ และการทดสอบจริง

Secret/Token/backend key ไม่เข้า Git/Browser bundle/log; Auth/session/RLS/backend checks ต้องมี; ตาราง financial data และไฟล์ไม่ public

ยกเลิก hard-coded business caps เก่าที่ไม่มีเหตุจำเป็น แต่ข้อจำกัด Provider/runtime ยังมีจริง จัดการไฟล์เป็นส่วน ๆ กำหนด operational safeguards ที่ตั้งค่าได้และให้ error ที่ถูกต้นเหตุ ไม่รอ Gmail ตอบเมื่อ worker memory อาจล้มก่อน

เก็บ identity check, full pagination, unknown/error≠zero, safe update, exact selection, explicit preview, command dedup และ Backup/Restore

ใช้ Cloudflare/Supabase/OPERA/Gmail/Drive จริงเป็น integration acceptance หลัก รักษา unit tests และ error simulation สำหรับเสี่ยง/duplicate cases

ผู้ใช้อนุญาตผู้รับทดสอบแบบใช้ครั้งเดียวแล้ว แต่ขอไม่ให้จำ: ไม่อยู่ใน packet นี้ ไม่ใส่ persistent spec/default/allowlist ต้องรับจากบริบทส่วนตัวตอนทดสอบ ไม่ส่งลูกค้าจริงเป็นการทดลองโดยเงียบ ๆ

Test mail/files ไม่ mark Invoice จริงว่าบิลแล้ว ไม่เลื่อน stage และไม่เพิ่ม KPI จริง ตรวจ To/CC/BCC ไม่ให้ recipient ลูกค้าปน

## 21. Backup/Restore และปล่อยระบบ

ใช้ built-in daily backups ตามสิทธิ์ Supabase Pro ที่มี ไม่ซื้อ PITR ไม่รักษา RPO 15 นาทีจากของเก่าโดยเดา ตรวจ entitlement ปัจจุบันและทดสอบ restore ให้กู้ DB/config/workflow ได้

DB backup ไม่ให้ถือว่าครอบคลุม object bytes/Google Drive/Gmail/secrets โดยอัตโนมัติ การกู้ไฟล์และความหมายของ source refs ต้องบอกตรง ไม่อ้าง full-system backup จาก DB อย่างเดียว

ไม่ต้องรอ legacy Google Cloud restore/cutover/migration gates ก่อนเชื่อมทดสอบ providers ใหม่ รักษาความปลอดภัยและ backup ก่อน destructive operations ไม่ยก test ที่ fail มาเรียก pass เพราะเลิกใช้สถาปัตยกรรมนั้น

หลัง restore ตรวจ Gmail send ที่เกิดหลัง backup ก่อนเริ่มส่งซ้ำ DB ย้อนเวลาไม่ได้ย้อนอีเมลจริง

## 22. Frontend และขอบเขตที่ไม่เปลี่ยน

UI/report ภาษาอังกฤษ; คุยกับเจ้าของเป็นไทย ใช้ชื่อ Katathani AR Collection System และต้นแบบ 7 หน้าใน DESIGN_HANDOFF ไม่อ้างว่าแอปเดิมหน้าตาถูกแล้วเพียง test ผ่าน

คง navigation Portfolio → Account Type → Account → Invoice/Folio; Queue, reports, stats/history, settings, PDF และ Email รองรับ desktop/laptop เป็นหลัก มือถือเป็น companion ตามแบบ

ตาราง searchable/sortable, currency/Hotel/freshness อ่านง่าย, no silent top-N truncation, logo/font/spacing/layout ตาม reference ที่เปิดดูจริง ไม่ copy policy เก่าจาก mock กลับมาเมื่อขัดกับ business rules ใหม่

รายงานสรุปภายใน Excel/PDF ของเว็บยังทำได้ ไม่ต้องใช้ OPERA original สำหรับทุก analytical report กฎ OPERA-only เจาะจง Statement/Invoice/Folio ต้นทางส่งลูกค้า

นำ legacy account-library/manual attachments/settings ที่ไม่ขัดมาเป็นข้อกำหนดได้เฉพาะมีหลักฐานความต้องการ ไม่คัดลอก infrastructure gates/Vault engine เก่าเพราะคำว่า unchanged
