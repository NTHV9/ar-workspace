# Integration validation — สิ่งที่ต้องพิสูจน์บนระบบใหม่

> แผนการทดลองต้นฉบับด้านล่างเป็นประวัติ. Native Statement research ถูกยกเลิกตามคำสั่งเจ้าของ; ไม่ต้องเรียก getARStatements/postStatements หรือ R&A เพื่อปิดงานนี้. ผลบริการจริงล่าสุดและข้อจำกัดอยู่ใน [FINAL_ACCEPTANCE_20260911.md](FINAL_ACCEPTANCE_20260911.md)

เอกสารนี้บอกขอบเขตการทดลอง ไม่ได้ยืนยันว่า endpoint ใช้ได้ทุก environment ไม่ใส่ Secret หรือข้อมูลลูกค้าจริง ตรวจ official docs ปัจจุบันของ Oracle, Cloudflare, Supabase, Google ก่อนเขียน integration

## 1. OPERA request map

| งาน | เส้นทางที่อยู่ในบทสนทนา | สิ่งที่ต้องยืนยัน |
|---|---|---|
| Account discovery | GET /ars/v1/accounts | Hotel filters, open/all/zero scope, pagination และ stable identity |
| Current account | GET /ars/v1/hotels/{hotelId}/accounts/{accountId} | 5 fetch instructions, current membership/large account coverage |
| Invoice/payment history | GET /ars/v1/invoicePayments/accounts/{accountId} | inclZeroBalance=true, details, all pages, date/filter semantics |
| Business Date | GET /bof/v1/hotels/{hotelId}/businessDate | ใช้ business date ของแต่ละ Hotel จริง |
| Prepare Statement | GET /ars/v1/statements | selection parameters และ selected-only row set |
| Generate Statement | POST /ars/v1/hotels/{hotelId}/accounts/{accountId}/statements | request schema, print/history effect, actual output retrieval |
| Folio report | GET /med/config/v1/hotels/{hotelId}/reservations/{reservationId}/folioReports | supported selector, response encoding, PDF identity/template |
| Payment↔Invoice | เลือก API allocation จาก official docs ที่ environment รองรับ | receipt/application date และยอด ต้องไม่เดา |

จุดที่ยังเป็นการทดลองไม่ควรถูกสร้างเป็นสัญญา fixed payload จากคำอธิบายเก่าของผู้ช่วย เช่น billNumber=invoiceNo หรือ folioWindowNo=internalFolioWindowID ต้องมี evidence ก่อน

## 2. คำขอข้อมูลที่ต้องการ

### Current account (เป้าหมาย)

```http
GET /ars/v1/hotels/{hotelId}/accounts/{accountId}
?fetchInstructions=Account
&fetchInstructions=Summary
&fetchInstructions=Invoices
&fetchInstructions=Aging
&fetchInstructions=Payments
```

### History (เป้าหมาย ต้องตรวจ pagination จริง)

```http
GET /ars/v1/invoicePayments/accounts/{accountId}
?inclZeroBalance=true
&inclDetails=true
&fetchInstructions=Invoices
&fetchInstructions=Payments
&offset=0
&limit=50
```

ไม่ส่ง unBilled ใน query หลักหลังเทียบว่าไม่เปลี่ยน scope แบบที่ไม่ต้องการ ข้อมูล billing ของเว็บไม่ใช้ OPERA billed/printed flags

ไม่ประกาศว่า response offset คือ current หรือ next ด้วยการเดา ไม่เอาสูตร heuristic เก่ามาใช้แทนสัญญา pagination ที่ทดสอบแล้ว ดู hasMore/count/totalResults และตรวจ unique membership โดยคง ordering/filter ระหว่างหน้า

การตรวจ totals เป็น sanity check ไม่ใช่ proof ว่าครบเมื่อมี offsetting credits หรือ zero rows

## 3. สิ่งที่ตัวอย่างในแชทพิสูจน์และยังไม่พิสูจน์

ผู้ใช้มีตัวอย่าง Get Account ที่ขอ 5 sections แล้วได้ account/header/aging/summary, invoice เปิดหนึ่งใบและ payments array ว่าง อีกตัวอย่าง InvoicePayments inclZeroBalance=true มีทั้ง Invoice เปิด Invoice ศูนย์ และ Payment ใช้แล้ว พร้อม hasMore=true

พิสูจน์ว่ารูปแบบข้อมูลเหล่านี้เกิดใน environment ที่ผู้ใช้ทดสอบ ไม่พิสูจน์ทุก Account ไม่มีการตัดข้อมูล ไม่พิสูจน์ว่ารายการ history ครบจาก request เดียว และไม่พิสูจน์ Payment-to-Invoice allocation ทุกกรณี

มี PDF reference สองหน้า Statement และ Invoice ต้นฉบับจาก OPERA แต่ยังไม่ใช่ผลทดสอบว่า PDF API ของแอปใหม่ดึงออกมาตรงกับไฟล์นั้นแล้ว

ตัวอย่างจริงเป็นข้อมูลส่วนตัว ให้ attach/mount แบบ private ใน Codex ที่ทำงานจริง ไม่คัดลอก identifiers หรือ bank details เข้า fixtures ที่ commit

## 4. Test set ข้อมูล

บัญชีเล็ก/ใหญ่มาก/หลายหน้า, positive invoices + negative credit, partial payment, zero invoice, net-zero account ที่ยังมี individual open items, transaction ย้าย/กลับรายการ, non-reservation invoice, ปิดบิลทั้ง Account, created-and-cleared ระหว่าง 07:00–19:00

เมื่อทำ stats daily ต้องแยก transaction date กับ changed-at และ payment application date ไม่ assume start/end เป็น modified date

ไม่ทำเงินผิดจริงเพื่อสร้าง edge cases ใช้หลักฐานจริงที่ได้รับอนุญาต + unit fixtures ที่ anonymized/synthetic สำหรับกรณีเสี่ยง

## 5. Statement/Folio acceptance

- API catalog/support เท่ากับลองได้ ไม่เท่ากับเอกสารถูกต้อง
- ต้องรับ bytes ของ PDF จริง ไม่ถือ 201/status/link object เป็น PDF สำเร็จ
- รองรับ trusted report/signed URLs ได้ ตรวจ scope และ redirect ทุกจุด ไม่ส่ง OPERA Authorization ข้าม origin โดยอัตโนมัติ
- Statement selected A/C ห้าม include B; ตรวจ scope ของ grand total/Aging ว่า selected-only หรือ account-wide แล้วแสดง/ใช้ตามที่เจ้าของยืนยัน
- ตรวจ Hotel/Account/Invoice/Folio identities ก่อน editor; original folio amount อาจต่าง current AR open เพราะ payment ภายหลัง ต้องตรวจอย่างเข้าใจบริบท ไม่แก้ยอดใน original เพื่อผ่าน validator
- Native statement เดี่ยวไม่ควรถูก reject เพียงไม่เป็น combined batch หากพิสูจน์ exact scope ได้
- รูปแบบ 1+N/2/allcombined ต้องทดสอบ multi-page invoices และไม่ตัดเอกสารเป็นหน้าเดียว
- เก็บ system renderer แยกปิด default ไม่ fallback อัตโนมัติใน billing/collection
- Print/history effects อนุญาต แต่ unknown result ต้องอ่านหลักฐานก่อนลอง generate ซ้ำ

## 6. Gmail/Drive acceptance

Supabase auth session ยืนยันสิทธิ์เข้าระบบ; Gmail OAuth ให้สิทธิ์กล่องงาน เป็นคนละ authority backend ไม่มี Gmail password

เริ่ม allowlist ar@katathani.com, Google/password identity เดียวกัน; ข้อความ test recipient ชั่วคราวไม่ได้รวมมา ห้ามเดาผู้รับ ใช้ private action-time config ที่ผู้ใช้อนุญาตและเอาออกจาก persistent spec

Test mail ต้อง override/ตรวจ To/CC/BCC ไม่ให้ค่า customer template ปน และ mark test ไม่เพิ่ม billing/events จริง ใช้ send evidence ไม่ใช่ draft disappearance

Test Draft→edit→send-in-Gmail, Send Now, double click, network timeout หลัง write, token revocation, partial attachment error, message id เปลี่ยน, body/attachment changed after handoff, test cleanup

ใช้ Drive folder จริงที่เจ้าของให้ ทำไฟล์ทดสอบ exact IDs และ mark TEST; ไม่ลบ folder/ไฟล์ที่ไม่ได้สร้างโดย test นั้น ถ้าไม่มี permission delete ให้รายงาน ไม่เพิ่มสิทธิ์ทั้ง Drive เงียบ ๆ

## 7. Provider/runtime facts ที่ต้องตรวจปัจจุบัน

Cloudflare deployed limits, Worker execution model/streaming, cron timezone, private cache and server auth; Supabase plan backups, RLS, Storage privacy, OAuth linking; Google OAuth grants/token scope/upload caps/Workspace policy

ไม่ฝังค่าจากบทสนทนาเก่าว่าเป็น limit ปัจจุบันถาวร ใช้ config/provider-specific adapter จุดเดียว แต่คง resource safeguards ไม่รอ provider error เมื่อ backend memory อาจพังก่อน

Password reset/recovery mail เป็นงาน Supabase Auth แยกจาก AR Gmail delivery ให้ตรวจ mail setup โดยไม่สร้าง paid provider เอง

## 8. Backup/restore

ตรวจ included daily backups ไม่เพิ่ม paid PITR; โฟลเดอร์/secret/Storage bytes มี lifecycle แยก ไม่อ้างว่า DB restore คืนทุกไฟล์และ Provider actions

ทดลองกู้ในขอบเขตที่ไม่ทับ live data ไม่สร้าง paid project/upgrade โดยไม่มีอนุมัติ หลัง restore ต้องเทียบ actual Gmail sends เพื่อไม่สร้าง billing/follow-up duplicates และกู้สิทธิ์ file refs ตามที่ทำได้จริง

## 9. วิธีบันทึกผล

บันทึก environment แบบไม่ลับ เวลา release/commit endpoint+parameter shape จำนวน/coverage และ categorical outcome ไม่ใส่ token/header/pdf raw/customer strings ลง logs หรือ repo

แยก implemented, locally tested, cloud-tested, deployed, provider-enabled ไม่ copy green evidence จากระบบเดิมมายืนยันแอปใหม่
