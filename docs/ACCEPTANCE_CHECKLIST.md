# Checklist ตรวจรับตามสเปก

## Dashboard scope update — 12 September 2026

- [x] Single-day/inclusive range filters; closing-date positive invoices and dated activity remain distinct
- [x] Current-only Aging compares Account Types/Account Nos acrossTSK/KAT/Total, source percentages/credits and invoice drilldown
- [x] Past Due date is distinct from OPERA age; billed/unbilled/Not Required/age/stages include counts and monetary basis
- [x] Reports contains External billing only; old routes, external scope and Back navigation are preserved
- [x] Source uncertainty/classification/mapping gaps never become verified zero; known-cleared zeros do not invalidate positive debt
- [x] Bounded history, role protection, actual source refresh/capture and portable SQL replay verified
- [x] Cloudflare final UI deployment/browser validation and CI-green merge for this scope (PR #14; 51 deployed cases plus real signed-in read-only UI check)

ผลตรวจรับ 11 กันยายน 2026 อยู่ใน [FINAL_ACCEPTANCE_20260911.md](FINAL_ACCEPTANCE_20260911.md) และ PROJECT_STATUS.md เครื่องหมายผ่านหมายถึงตรวจตามขอบเขตและหลักฐานที่ระบุ ไม่ใช่การรับรองทุกข้อมูล/ทุก API ของผู้ให้บริการ การทดสอบที่ต้องเปลี่ยนรหัสผ่านจริงและ production restore ไม่ได้ทำ

รอบล่าสุดรวม source-history ทั้ง KAT/TSK, payment/application แยกยอด, daily observations, By System, hold/reopen, Operations, private retention และ disposable acceptance. ข้อมูลที่ API ไม่ยืนยันยังแสดง unavailable/unknown พร้อมขอบเขต coverage

## A. โครงการและดีไซน์

- [x] Root ใหม่ ไม่ใช้ source/schema/workflows/gates ของ app เก่าเป็นฐาน และไม่ลบของเก่า
- [x] อ่านภาพ PNG ต้นฉบับครบ 7 หน้าและคำอธิบาย Codex ที่เข้าถึงจริง; รายงาน missing ไม่เดา
- [x] เปรียบเทียบภาพเว็บบน Cloudflare กับ reference ที่ viewport เดียวกัน โดยไม่ overwrite baseline
- [x] Portfolio แสดง KAT/TSK/Total และทุก Account Type; Account ใช้ Guest/Invoice/Folio columns แยก
- [x] Queue แยก Billing/Collection, next action/latest sent, urgent หลัง Final และ filters ที่ครบ
- [x] Mobile companion ตามแบบ ไม่ยัด desktop PDF editor โดยไม่ยืนยัน
- [x] loading/empty/stale/API failure ชัด ไม่แสดง error เป็น 0

## B. Identity และความปลอดภัย

- [x] Google login ของ ar@katathani.com และ Password login เข้าบัญชีเดียวกัน
- [x] Email อื่นถูกกันที่ backend/data access ไม่ใช่แค่หน้าจอ login
- [x] Password ของเว็บไม่ใช่ Gmail password; provider refresh tokens/client secrets ไม่เข้า client/repo/log
- [x] Secret key/service-role ไม่เปิดใน Browser; Storage private และการเข้าถึงไฟล์ตรวจสิทธิ์
- [x] Cross-hotel/account identifiers เดียวกันไม่ทำให้อ่านหรือส่งผิด
- [x] URL redirects ไม่รั่ว credentials, signed URLs ไม่ลง logs

## C. ข้อมูลและ Refresh

- [x] 07:00/19:00 เวลาไทยทำงานถูก; manual ได้; on-open ใช้เกณฑ์ที่ยืนยันและไม่ซ้ำต่อแท็บ
- [x] API errors/partial pages คงข้อมูลล่าสุดเดิมพร้อม stale ไม่แทนด้วยข้อมูลขาด
- [x] Account 5 fetch instructions ถูก map ตาม response จริง รวม nested fields
- [x] Pagination ครบ ไม่มี duplicate และ source changes ระหว่างหน้ารับมือได้
- [x] Account ใหญ่/credit/partial/zero มี member coverage ตรวจจริง ไม่ใช้ sum ตรงอย่างเดียว
- [x] Invoice เกิดและเคลียร์ระหว่างสองรอบไม่พลาด daily arrivals หากหน้าจออ้างว่าครบ
- [x] Sample amounts signed ไม่ถูกหักซ้ำ; THB-only ไม่แปลงสกุลอื่นให้ผ่าน
- [x] OPERA transactionDate เป็นวันบิล ไม่เปลี่ยนเป็นวัน capture เมื่อดึงช้า

## D. Billing และวัน

- [x] Required: bill date 1 ก.ย., Draft 3 ก.ย., actual billing 4 ก.ย., term30 → Due 4 ต.ค. ตาม calendar-day convention ที่ยืนยัน
- [x] Not Required: OPERA base 1 ก.ย. term30 → Due1 ต.ค.; ไม่เข้าตัวนับยังไม่วาง
- [x] Missing Credit Term ยังเปิด Account ได้; ไม่สร้าง due ปลอม/Term0
- [x] Resend/corrected copy ไม่เปลี่ยน first billing date และไม่เพิ่ม first-billing count
- [x] ส่งเพียง A/C ใน Account มี A/B/C เปลี่ยนวันที่เฉพาะ A/C
- [x] External billing ที่ยืนยันเป็นเหตุการณ์จริง ไม่บังคับว่าต้อง Gmail เท่านั้น
- [x] Term/template เปลี่ยนภายหลังไม่เขียนประวัติวันครบกำหนด/ข้อความเก่าใหม่

## E. รอบทวง

- [x] มี Friendly, Follow1, Follow2, Follow3, Final และแก้เพิ่มลดได้
- [x] Friendly -7 วัน; Follow1 overdue; รอบถัดไป +7 วันจาก actual sent ตามค่าตั้งที่ยืนยัน
- [x] แค่ครบกำหนดหรือสร้าง Draft ไม่เลื่อนรอบ
- [x] ส่ง Follow2 ให้ 3 จาก 10 ใบเดิมใน Follow1 → latest Follow1=7, Follow2=3 ไม่รวมเป็น13
- [x] ใบใน Follow2 ถูกจ่ายบางส่วนยัง latest Follow2 แต่ Open ลด
- [x] ใบใน Follow2 =0 ที่พิสูจน์แล้วออกจาก current counts; historical sent activity ยังอยู่
- [x] Reply/Remittance ไม่ปิดหรือ auto-hide งาน; explicit hold แสดงเหตุชัด
- [x] Final sent ยัง Open แสดง urgent พร้อมเวลาส่ง/Due/ยอด; ไม่ auto-send ต่อ
- [x] Latest stage กับ next action แยก ไม่บวกข้าม views เป็น invoice total

## F. Remittance และสถิติ

- [x] Filters Hotel/Account Type/Account และ drilldown ตรงทุก metric
- [x] วันเดียว arrivals20, billed35 (รวมเก่า), unbilled-total80 แสดงได้อย่างอิสระ
- [x] Daily bill entries ใช้ OPERA date; billed daily ใช้ actual sent; backlog ใช้ current ไม่วันที่ filter แบบไม่บอก
- [x] Initial import ไม่เพิ่ม arrivals ของวันนี้ทุกใบ; revised old invoice ไม่เป็น new invoice ซ้ำ
- [x] Remittance1เอกสารครอบคลุม3ใบรวม30,000 → count3 invoice /1document /amount30,000 ไม่90,000
- [x] Remittance amount และ OPERA open แสดงแยก และไม่รวมใน cash receipts ซ้ำ
- [x] Invoice100,000 prior paid90,000 today10,000 → todaycash10,000 cleared1 ไม่cash100,000
- [x] ขาด payment mapping ไม่แสดงจำนวน paid invoices แน่นอนจากการเดา
- [x] Over90 และ over60-unbilled ใช้ OPERA age+current open ไม่สับกับ days overdue
- [x] วางบิลหลัง bill date4วันคำนวณตรง; ไม่มี SLA/person/Draft-wait KPIs ที่ถูกตัดออก
- [x] historical sent counts ไม่หายเมื่อล้างข้อมูลหนักของ cleared invoice

## G. PDF

- [x] Statement ใช้ renderer ของระบบตามคำยืนยันล่าสุด; Invoice/Folio ใช้ OPERA API จริง ตรวจตัวตนและไฟล์ที่รับได้
- [x] selected-only A/C ไม่ติด B ทั้งรายการ/ไฟล์; scope total/aging ชัด
- [x] POST status ไม่ถูกถือว่า PDF ดาวน์โหลดแล้ว ต้องมีไฟล์จริง
- [x] Print history/statement numbering เกิดได้ตามที่อนุญาต แต่ไม่มี accounting mutation
- [x] Native Invoice/Folio output ใช้ไม่ได้ → แจ้ง ไม่ auto-system-fallback
- [x] System Statement เป็นเส้นทางที่เลือกถาวร ไม่อ้างว่าได้ PDF จาก Statement API
- [x] Content ทั้ง3 และ arrangement ทั้ง3 ถูกต้อง รองรับ Invoice หลายหน้า
- [x] แก้ข้อความ/รูป/font/page/ตำแหน่งได้ตาม capability ที่สาธิต; ไม่อ้าง Word reflow ถ้าทำไม่ได้
- [x] Edited PDF มี Preview/acknowledgement และไม่เปลี่ยนยอดฐานข้อมูล/OPERA
- [x] Redaction/whiteout ไม่เหลือข้อความที่ตั้งใจลบให้ copy/search ได้
- [x] File processing ไม่ล้มจากการ buffer ซ้ำและไม่ตัดไฟล์ส่งบางส่วนโดยไม่บอก

## H. Gmail/Drive/Backup

- [x] Draft ไม่เพิ่ม KPI/ไม่เริ่ม Due; Sent จริงเท่านั้นจึงบันทึก
- [x] Supabase login แยก Gmail OAuth; sender/recipient config ตรงกล่องงาน
- [x] Deleted Draft ไม่ถูกนับ Sent; ambiguous API result ไม่ยิงส่งซ้ำ
- [x] Test mode ไม่ mark real billing/stage/KPI และไม่มี CC/BCC ลูกค้าปน
- [x] Actual send evidence หลัง Gmail edits ตรวจ mapping ที่เปลี่ยนแล้วอย่างซื่อสัตย์
- [x] Drive folder จริงยืนยัน ID; cleanup จำกัด exact test file IDs ไม่ลบไฟล์ที่ไม่ได้สร้าง
- [x] เก็บ edited files ตามนโยบาย ไม่ archive originals ทุกงานเงียบ ๆ
- [x] included Supabase backups ตรวจได้; local synthetic pg_dump/pg_restore ผ่าน โดยไม่อ้างว่า production physical backup restore แล้ว
- [x] DB/file/token restore scope รายงานชัด ไม่มี paid PITR/project/SDK โดยไม่อนุมัติ
- [x] หลัง DB restore เทียบ Gmail actual sent เพื่อไม่ resend งานที่ส่งจริงหลังจุด backup

## ขอบเขตที่ไม่ได้อ้างว่าทดสอบจริง

- การเปลี่ยน/กู้รหัสผ่านจริงขั้นสุดท้าย: PKCE/callback/form และ permission tests ผ่าน แต่ไม่ได้เปลี่ยนรหัสผ่านของเจ้าของขณะไม่อยู่หน้าคอม
- Production restore, การกู้ byte ของลูกค้าจาก backup และ RTO/RPO: ไม่ได้ทำ; มี local synthetic logical restore และ runbook แยก provider/file boundary
- Native Statement API ถูกยกเลิกตามคำสั่งเจ้าของ; native Invoice ที่ไม่มี reservation/folio mapping ต้องแสดงข้อจำกัด ไม่สร้างเอกสารปลอมแทน
- ภาพเว็บใช้ข้อมูลสมมติ ส่วนภาพ/PDF ของลูกค้าจริงตรวจแบบ private ไม่เก็บใน Git
