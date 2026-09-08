# Checklist ตรวจรับ — ยังไม่มีข้อใดถูกทำเครื่องหมายผ่าน

นี่คือ test scenarios จากข้อกำหนดและการตีความที่ระบุ ไม่ใช่ผลทดสอบจริง ใช้ข้อมูลสมมติใน code tests และใช้ของจริงเฉพาะ integration ที่อนุญาต

## A. โครงการและดีไซน์

- [ ] Root ใหม่ ไม่ใช้ source/schema/workflows/gates ของ app เก่าเป็นฐาน และไม่ลบของเก่า
- [ ] อ่านภาพ PNG ต้นฉบับครบ 7 หน้าและคำอธิบาย Codex ที่เข้าถึงจริง; รายงาน missing ไม่เดา
- [ ] เปรียบเทียบภาพเว็บบน Cloudflare กับ reference ที่ viewport เดียวกัน โดยไม่ overwrite baseline
- [ ] Portfolio แสดง KAT/TSK/Total และทุก Account Type; Account ใช้ Guest/Invoice/Folio columns แยก
- [ ] Queue แยก Billing/Collection, next action/latest sent, urgent หลัง Final และ filters ที่ครบ
- [ ] Mobile companion ตามแบบ ไม่ยัด desktop PDF editor โดยไม่ยืนยัน
- [ ] loading/empty/stale/API failure ชัด ไม่แสดง error เป็น 0

## B. Identity และความปลอดภัย

- [ ] Google login ของ ar@katathani.com และ Password login เข้าบัญชีเดียวกัน
- [ ] Email อื่นถูกกันที่ backend/data access ไม่ใช่แค่หน้าจอ login
- [ ] Password ของเว็บไม่ใช่ Gmail password; provider tokens ไม่เข้า client/repo/log
- [ ] Secret key/service-role ไม่เปิดใน Browser; Storage private และการเข้าถึงไฟล์ตรวจสิทธิ์
- [ ] Cross-hotel/account identifiers เดียวกันไม่ทำให้อ่านหรือส่งผิด
- [ ] URL redirects ไม่รั่ว credentials, signed URLs ไม่ลง logs

## C. ข้อมูลและ Refresh

- [ ] 07:00/19:00 เวลาไทยทำงานถูก; manual ได้; on-open ใช้เกณฑ์ที่ยืนยันและไม่ซ้ำต่อแท็บ
- [ ] API errors/partial pages คงข้อมูลล่าสุดเดิมพร้อม stale ไม่แทนด้วยข้อมูลขาด
- [ ] Account 5 fetch instructions ถูก map ตาม response จริง รวม nested fields
- [ ] Pagination ครบ ไม่มี duplicate และ source changes ระหว่างหน้ารับมือได้
- [ ] Account ใหญ่/credit/partial/zero มี member coverage ตรวจจริง ไม่ใช้ sum ตรงอย่างเดียว
- [ ] Invoice เกิดและเคลียร์ระหว่างสองรอบไม่พลาด daily arrivals หากหน้าจออ้างว่าครบ
- [ ] Sample amounts signed ไม่ถูกหักซ้ำ; THB-only ไม่แปลงสกุลอื่นให้ผ่าน
- [ ] OPERA transactionDate เป็นวันบิล ไม่เปลี่ยนเป็นวัน capture เมื่อดึงช้า

## D. Billing และวัน

- [ ] Required: bill date 1 ก.ย., Draft 3 ก.ย., actual billing 4 ก.ย., term30 → Due 4 ต.ค. ตาม calendar-day convention ที่ยืนยัน
- [ ] Not Required: OPERA base 1 ก.ย. term30 → Due1 ต.ค.; ไม่เข้าตัวนับยังไม่วาง
- [ ] Missing Credit Term ยังเปิด Account ได้; ไม่สร้าง due ปลอม/Term0
- [ ] Resend/corrected copy ไม่เปลี่ยน first billing date และไม่เพิ่ม first-billing count
- [ ] ส่งเพียง A/C ใน Account มี A/B/C เปลี่ยนวันที่เฉพาะ A/C
- [ ] External billing ที่ยืนยันเป็นเหตุการณ์จริง ไม่บังคับว่าต้อง Gmail เท่านั้น
- [ ] Term/template เปลี่ยนภายหลังไม่เขียนประวัติวันครบกำหนด/ข้อความเก่าใหม่

## E. รอบทวง

- [ ] มี Friendly, Follow1, Follow2, Follow3, Final และแก้เพิ่มลดได้
- [ ] Friendly -7 วัน; Follow1 overdue; รอบถัดไป +7 วันจาก actual sent ตามค่าตั้งที่ยืนยัน
- [ ] แค่ครบกำหนดหรือสร้าง Draft ไม่เลื่อนรอบ
- [ ] ส่ง Follow2 ให้ 3 จาก 10 ใบเดิมใน Follow1 → latest Follow1=7, Follow2=3 ไม่รวมเป็น13
- [ ] ใบใน Follow2 ถูกจ่ายบางส่วนยัง latest Follow2 แต่ Open ลด
- [ ] ใบใน Follow2 =0 ที่พิสูจน์แล้วออกจาก current counts; historical sent activity ยังอยู่
- [ ] Reply/Remittance ไม่ปิดหรือ auto-hide งาน; explicit hold แสดงเหตุชัด
- [ ] Final sent ยัง Open แสดง urgent พร้อมเวลาส่ง/Due/ยอด; ไม่ auto-send ต่อ
- [ ] Latest stage กับ next action แยก ไม่บวกข้าม views เป็น invoice total

## F. Remittance และสถิติ

- [ ] Filters Hotel/Account Type/Account และ drilldown ตรงทุก metric
- [ ] วันเดียว arrivals20, billed35 (รวมเก่า), unbilled-total80 แสดงได้อย่างอิสระ
- [ ] Daily bill entries ใช้ OPERA date; billed daily ใช้ actual sent; backlog ใช้ current ไม่วันที่ filter แบบไม่บอก
- [ ] Initial import ไม่เพิ่ม arrivals ของวันนี้ทุกใบ; revised old invoice ไม่เป็น new invoice ซ้ำ
- [ ] Remittance1เอกสารครอบคลุม3ใบรวม30,000 → count3 invoice /1document /amount30,000 ไม่90,000
- [ ] Remittance amount และ OPERA open แสดงแยก และไม่รวมใน cash receipts ซ้ำ
- [ ] Invoice100,000 prior paid90,000 today10,000 → todaycash10,000 cleared1 ไม่cash100,000
- [ ] ขาด payment mapping ไม่แสดงจำนวน paid invoices แน่นอนจากการเดา
- [ ] Over90 และ over60-unbilled ใช้ OPERA age+current open ไม่สับกับ days overdue
- [ ] วางบิลหลัง bill date4วันคำนวณตรง; ไม่มี SLA/person/Draft-wait KPIs ที่ถูกตัดออก
- [ ] historical sent counts ไม่หายเมื่อล้างข้อมูลหนักของ cleared invoice

## G. PDF

- [ ] ขอ native Statement/Invoice/Folio จริง ตรวจตัวตน/layout เทียบต้นฉบับของ Hotel
- [ ] selected-only A/C ไม่ติด B ทั้งรายการ/ไฟล์; scope total/aging ชัด
- [ ] POST status ไม่ถูกถือว่า PDF ดาวน์โหลดแล้ว ต้องมีไฟล์จริง
- [ ] Print history/statement numbering เกิดได้ตามที่อนุญาต แต่ไม่มี accounting mutation
- [ ] Native output ใช้ไม่ได้ → แจ้ง ไม่ auto-system-fallback
- [ ] System renderer สำรองเก็บแยกและไม่แสดงเป็น OPERA original
- [ ] Content ทั้ง3 และ arrangement ทั้ง3 ถูกต้อง รองรับ Invoice หลายหน้า
- [ ] แก้ข้อความ/รูป/font/page/ตำแหน่งได้ตาม capability ที่สาธิต; ไม่อ้าง Word reflow ถ้าทำไม่ได้
- [ ] Edited PDF มี Preview/acknowledgement และไม่เปลี่ยนยอดฐานข้อมูล/OPERA
- [ ] Redaction/whiteout ไม่เหลือข้อความที่ตั้งใจลบให้ copy/search ได้
- [ ] File processing ไม่ล้มจากการ buffer ซ้ำและไม่ตัดไฟล์ส่งบางส่วนโดยไม่บอก

## H. Gmail/Drive/Backup

- [ ] Draft ไม่เพิ่ม KPI/ไม่เริ่ม Due; Sent จริงเท่านั้นจึงบันทึก
- [ ] Supabase login แยก Gmail OAuth; sender/recipient config ตรงกล่องงาน
- [ ] Deleted Draft ไม่ถูกนับ Sent; ambiguous API result ไม่ยิงส่งซ้ำ
- [ ] Test mode ไม่ mark real billing/stage/KPI และไม่มี CC/BCC ลูกค้าปน
- [ ] Actual send evidence หลัง Gmail edits ตรวจ mapping ที่เปลี่ยนแล้วอย่างซื่อสัตย์
- [ ] Drive folder จริงยืนยัน ID; cleanup จำกัด exact test file IDs ไม่ลบไฟล์ที่ไม่ได้สร้าง
- [ ] เก็บ edited files ตามนโยบาย ไม่ archive originals ทุกงานเงียบ ๆ
- [ ] included Supabase backups ตรวจได้; restore ที่ทำจริงไม่เท่ากับมี screenshot ว่า backup enabled
- [ ] DB/file/token restore scope รายงานชัด ไม่มี paid PITR/project/SDK โดยไม่อนุมัติ
- [ ] หลัง DB restore เทียบ Gmail actual sent เพื่อไม่ resend งานที่ส่งจริงหลังจุด backup
