# ผลตรวจรับ — Katathani AR Collection System

วันที่ 11 กันยายน 2026 · ระบบใหม่ React/Vite/TypeScript + Cloudflare Workers + Supabase

งานพัฒนาตามแผน C1–C11 และการทดสอบบัญชีสมมติสามบิลดำเนินการครบแล้ว ข้อจำกัดของหลักฐานและของผู้ให้บริการระบุไว้ท้ายเอกสาร ไม่มีการส่งอีเมลหาลูกค้าจริงเพื่อทดลอง และไม่มีการแก้ ledger ใน OPERA

## ระบบที่ Deploy จริง

| รายการ | ผลที่ตรวจได้ |
|---|---|
| เว็บ | https://ar-workspace.ar-c82.workers.dev |
| GitHub | NTHV9/ar-workspace · Public · branch codex/opera-refresh |
| Source ที่เปิด retention | 755e3dda1e6c178f3877fb75148dc49b807bf55a |
| Worker version | ae0576ce-fc97-44bc-8648-27d69fbe918a |
| Worker | ar-workspace ในบัญชี Cloudflare ที่เจ้าของยืนยัน |
| Supabase | ar-workspace · jmyvpurzmoiecpydjrci · Pro |
| Runtime | Worker เดียว พร้อม refresh/document/financial Workflows แยกคิว |
| Health | commit ตรง, database_verified; มีผลเรียก OPERA จริงแยกจาก health |
| Auth | ar@katathani.com หนึ่ง user มี email และ google identities; login ทั้งสองวิธีผ่านก่อนหน้า |
| Flags | Budget=true, Retention=true, Acceptance=false; ไม่มี auto-send |
| Schedules | OPERA 07:00/19:00 ไทย; on-open เมื่อเกิน30นาที; Gmail Sent reconciliation ทุก15นาที |

เอกสาร/ภาพตรวจรับที่ commit ภายหลัง source ข้างต้นไม่เปลี่ยน runtime ของ Worker. อ่าน source ที่กำลังรันล่าสุดได้จาก `/api/health` โดยไม่มี Key/Password ใน response

## สิ่งที่ทำครบ

| ส่วน | พฤติกรรมและผลตรวจ |
|---|---|
| Portfolio / Account Detail | Comparative matrix TSK/KAT/Total, ทุกบัญชีที่เข้าเงื่อนไข, sort/filter/aging/selection, แยก Guest/Invoice/Folio, ย้อนกลับคงบริบทและมีแผงรายละเอียดจอเล็ก |
| Billing | Required/Not Required และ term ครั้งแรกใช้กับบิลเก่าที่ยังไม่กำหนดด้วย; ไม่เดาวันวางบิลเก่า; Due Date ที่กำหนดแล้วไม่ถูกเปลี่ยนตามค่าใหม่อัตโนมัติ |
| By System | เปิดลิงก์ portal ที่ตั้งไว้และให้พนักงานบันทึกวัน/อ้างอิงจริง; ไม่ส่ง billing email แทน portal และไม่อ้างว่าแอปเข้า portal ไปวางบิลเอง |
| Collections | Friendly/Follow-up 1–3/Final, กฎแบบมี version ปรับได้, นับ stage ล่าสุดต่อบิล, next action แยก, หลัง Final ยังค้างขึ้น Urgent |
| Exceptions | note/dispute, explicit hold/release, zero→reopen ขึ้น Needs review และรักษาวันวางบิล/Due Date/ประวัติเดิม |
| Documents | Statement สร้างโดย renderer ของระบบตามแบบ KAT/TSK ที่รับแล้ว; Invoice/Folio ใช้ OPERA API; selected-only และ arrangement ทั้งสามแบบ |
| PDF editor | แก้ fixed-page text/object/page, save/reopen, รวม/แยกไฟล์, preview และ acknowledgement ก่อนใช้งาน; ไม่แก้ยอด source |
| Email | rich text/templates/attachments, Draft และ Send Now แบบคนสั่ง, Gmail threads/replies, no-duplicate handoff และตรวจ SENT ก่อนลงประวัติ |
| Gmail evidence | รองรับ Gmail เปลี่ยน provider ID/header และตัดบรรทัดข้อความ; reviewed match ตรวจผู้ส่ง/ผู้รับ/subject/body/ไฟล์ก่อนยืนยัน ไม่ใช้การส่งซ้ำแก้ receipt |
| Remittance | หนึ่งโรงแรม/หนึ่งบัญชีต่อฉบับ, totals นับครั้งเดียว, เชื่อมบิลหลายใบ, correction/void/restore/history และ private evidence; ไม่ถือเป็นการชำระเงินจริง |
| Reports | Current work แยก daily activity, source invoice dates, received payments แยก current applications, daily captures/zero/reopen observations และระยะเวลา AR |
| Operations | งานเอกสาร/อีเมล/Drive/source ค้างแบบแบ่งหน้า, เปิดงานเดิม, ตรวจ existing SENT และ metadata audit หลัง restore |
| Storage | explicit Drive archive ในโฟลเดอร์ Restricted เดิม, private Supabase files, quota reservations และ one-calendar-month retention |
| Recovery | write hold นอกฐานข้อมูล, no-resend recovery runbook, included backup inventory, local logical dump/restore และตรวจ receipt ที่เหลือจาก scenario |

## สองปัญหาเอกสารที่แจ้ง

1. แยก Document Workflow จาก current refresh และ financial history ภายใน Worker เดิม งานเก่าคง queue เดิมเพื่อไม่ dispatch/พิมพ์ซ้ำ ส่วนงานใหม่ใช้ `ar-workspace-documents` (concurrency2)
2. แก้การเลือก font ตาม glyph coverage สำหรับอักขระ Latin/Thai และ Unicode normalization แทนการส่งอักขระ non-ASCII ทุกตัวไปยัง font ไทย
3. งานเดิมที่ Statement unavailable ถูกซ่อมและเปิด PDF ได้แล้ว โดยไม่พิมพ์ Invoice ต้นทางซ้ำในการซ่อมครั้งนั้น
4. ทดสอบสร้างชุดใหม่จาก **บิลจริงชุดเดียวกับที่แจ้ง**: Statement หนึ่งไฟล์และ Invoice API สามไฟล์ ready ครบใน **20.115708วินาที** จากเวลาสร้าง job ถึง ready; มีไฟล์จริง 221,095 / 115,861 / 115,811 / 115,423 bytes และเปิด Statement หนึ่งหน้าได้

20วินาทีเป็นผลของชุดที่ทดสอบ ไม่ใช่ SLA ทุกจำนวนบิลหรือทุกสถานะ OPERA. การพิมพ์ Invoice ในการทดสอบชุดใหม่นี้อาจบันทึกประวัติการพิมพ์ตามสิทธิ์ที่เจ้าของอนุมัติ ไม่มีการส่งอีเมลหรือแก้บัญชี

## บัญชีสมมติสามบิล: ผล end-to-end

สร้าง namespace แยก, private bucket แยก และ subfolder ใหม่ใน Drive ที่ยืนยันแล้ว ไม่มี Account สมมติในตารางธุรกิจจริงและไม่มีการสร้าง Account ใน OPERA. Fixture transport ใช้ parser/reader เดิมแต่ปฏิเสธเส้นทางที่ไม่รองรับ ไม่มี fallback ไป OPERA จริง

- A/B/C มียอดสมมติ1,000/2,000/3,000; filter/sort/selection และย้อนกลับผ่านบน Cloudflare
- เลือก A/C ได้ Balance Due4,000 และ Aging ทั้งบัญชี6,000; editor/save/reopen/preview และ combined, statement+bundle, separate exports ผ่าน
- ส่งอีเมลจริงสองฉบับไปเฉพาะผู้รับทดสอบที่เจ้าของให้: A ผ่าน Gmail Draft→Send→reviewed SENT match, B ผ่าน Send Now; ไม่บันทึกผู้รับลง Git หรือค่า contact จริง
- Draft ไม่เริ่ม Due Date; หลัง actual SENT ของ A จึงเป็น first billing11กันยายน/Due11ตุลาคม. B บันทึก external billing2สิงหาคม/term30/Due1กันยายน และ actual Follow-up1 วันที่11กันยายน
- C ใส่ historical Final แบบสมมติแล้วเห็น Urgent ทันที; ไม่ได้ส่ง Final จริงใน scenario นี้
- ทดสอบ dispute, hold, release; A ศูนย์→เปิดใหม่→Needs review→acknowledge โดยวันวางบิลและ Due Date ไม่เปลี่ยน
- Remittance หนึ่งฉบับเชื่อมสามบิล ยอด6,000นับครั้งเดียว; อัปโหลดไฟล์จริง, เอาลิงก์ออกและคืนลิงก์ผ่าน. Remittance ไม่ทำให้ยอดหนี้ลด
- Source refresh ยืนยันศูนย์ครบสามใบแล้ว pending Remittance หายจากงานค้าง แต่ประวัติยังแสดง Linked balances zero
- Financial fixture ผ่านเส้นทาง Workflow/Supabase/report จริง: payments3/application3 ยอด6,000แยกคนละ metric. ข้อนี้เป็น **source simulation**; หลักฐานอ่าน OPERA จริงอยู่ในหัวข้อถัดไป

## ข้อมูลการเงินจริง

ช่วงที่พิสูจน์การอ่าน/เผยแพร่จริง: 12สิงหาคม–11กันยายน2026

| โรงแรม | Invoice history | Payment rows | Application rows |
|---|---:|---:|---:|
| KAT | 5,752 | 369 | 1,836 |
| TSK | 1,001 | 135 | 265 |

เงินรับใช้ OPERA transactionDate ของ payment. การนำยอดไปตัด Invoice เป็นสถานะ allocation ที่ API ให้ ณ เวลาตรวจ; ไม่สร้าง application event date ขึ้นเอง. วันที่ระบบตรวจพบยอดศูนย์เป็น audit observation แยกจากวันรับเงิน ไม่ใช้ยอด Invoice ทั้งใบเป็นเงินรับของวันนั้น และไม่เรียก debit posting ว่า cancellation หากไม่มี reversal evidence

## Retention, cleanup และ quota

- ใช้เกณฑ์ที่อนุมัติ: บิลทุกใบผูกไฟล์ยืนยันศูนย์, ไม่มีงานเอกสาร/อีเมลค้าง, ไม่มี hold/dispute/review ค้าง แล้วเก็บต่อหนึ่งเดือนปฏิทินไทย ตรวจ eligibility/identity ซ้ำก่อน DELETE
- Actual provider proof: 23ไฟล์ทดสอบ blocked ขณะหนี้ยังเปิด; หลังครบงานเป็น waiting ทั้ง23 โดยยังไม่ลบ. เลื่อนเฉพาะ test clock31วันแล้วลบ Supabase20 objects + Drive3files ผ่าน production adapters และตรวจ authenticated absence/SHA/ownership
- หลังลบ byte ประวัติ SENT สองรายการยังอยู่. จากนั้น seal scenario, เก็บเพียง provider IDs/timestamps, ลบโฟลเดอร์และ bucket ที่ยืนยันว่า empty, ถอนสอง namespace พร้อมบัญชี/สามบิล/ข้อมูล scenario ทั้งหมด
- Reservation ของ scenario ปิดแล้ว, overrun=false; managed egress upper bound1,420,582bytes; ไม่มีผู้รับทดสอบใน contact ธุรกิจจริง. Gmail test messages คงในกล่องจดหมายตามหลักฐาน ไม่ได้ลบทิ้ง
- เปิด retention บน runtime จริงแล้ว. Full refresh KAT/TSK รอบ09:12ผ่าน และ **ทั้งสอง Workflow รัน retention hook จริง**: checked78, blocked78เพราะsourceยังค้าง, deleted0, uncertain0, errors0. ไม่มีการบังคับลบไฟล์ลูกค้าให้การทดสอบผ่าน
- ค่าจำกัดแอป: working files1GiB, managed file egress2GiBต่อเดือนแอป, logical DB256MiB และเผื่อ20%; มี concurrent reservation และ stop เมื่อ usage ไม่ยืนยัน/เกินเพดาน
- หลัง scenario cleanup และทดสอบ native PDFs ใหม่: working bytesประมาณ11.7MiB, logical DBประมาณ48.3MiB. เป็นค่าตรวจ ณ เวลานั้น; ไม่ใช่ยอดบิลรวม Supabase. Auth/non-file API traffic/usageก่อนเริ่ม meter แยกจาก managed-file counter
- Spend Cap ตรวจว่าเปิดแล้วก่อนหน้า; ไม่เพิ่มแพ็กเกจ/PITR/add-on. ไม่ลบไฟล์ config/template ที่ยังใช้งานหรือไฟล์ที่ไม่รู้ความสัมพันธ์เพื่อคืน quota
- หาก allowance period ปิดหรือ usage/headroom ยังไม่ยืนยัน ระบบหยุดงานไฟล์ใหม่ให้ผู้ดูแลตรวจ Usage/Spend Cap และบันทึก measurement ที่ยืนยันผ่าน service-only budget RPC. ไม่ขยายเพดานหรือรีเซ็ต usage เป็นศูนย์อัตโนมัติเพียงเพื่อให้ผ่าน; การตรวจเดือนถัดไปเป็นงานดูแลระบบตามปกติ

## Tests และการตรวจรับ

| การตรวจ | ผล |
|---|---|
| Typecheck / production build | ผ่าน; มีคำเตือน bundle >500kB ของ editor/core ซึ่งเป็น warning ไม่ใช่ build failure |
| Unit tests | 793 tests / 85 files ผ่าน |
| Browser tests | 203 cases: 180ผ่านรอบเต็ม; 23พบ fixture ไม่ได้จำลอง GET collection-policy ที่เพิ่มใหม่ จึงเพิ่มเฉพาะ fixture endpoint แล้ว23ผ่านทั้งหมด โดยคง assertion เดิม |
| Actual browser/provider scenario | Cloudflare→Worker→Supabase + Gmail/Drive/storage จริง ผ่าน; OPERA synthetic leg ระบุแยก |
| SQL latest replay | 60 migrations / 19 rollback fixtures ผ่าน; server หยุดแล้ว |
| Logical dump/restore | 59 migrations / 19 fixtures, actual local pg_dump/pg_restore ผ่าน; dump791,013bytes SHA e2b0815687ca8eb34f686e5e0740c1121f941da4b08bd96485fb6ace4ccb6574 |
| Migration alignment | ชื่อและ version ทั้ง60ตรง hosted history; rename20ไฟล์เก่าโดย SHA contents ไม่เปลี่ยน ไม่มีการแก้ประวัติ migration บน server |
| Anonymous HTTP | Operations/status/queue, documents และ acceptance routes ตอบ401 |
| Supabase security advisor | ไม่มี WARN/ERROR หลังถอนสิทธิ์ retired acceptance RPC; เหลือ INFO49ตาราง private RLS ไม่มี direct-access policy ตามเจตนา |
| Privacy | provider keys/credentials ไม่อยู่ใน dist; private data, HAR, actual customer PDFs/screenshots และผู้รับทดสอบไม่เข้า Git |

GitHub CI ของ source ที่เปิด retention [ผ่านแล้ว](https://github.com/NTHV9/ar-workspace/actions/runs/34553365639). Actual SENT audit วันที่10–11กันยายนอ่านครบ37messages พบ7ARmatches:5receiptsเดิมและ2isolated-testreceipts ไม่มี missing/conflict. ผล INFO ของตาราง private RLS ไม่มี policy อธิบายที่ [Supabase database linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy); ไม่เพิ่ม client policy เพียงเพื่อทำให้คำแนะนำนี้หาย

ภาพที่บันทึกเข้า repository ใช้ข้อมูลสมมติเท่านั้น. Browser suites ตรวจ1440×900,1280×800และ390×844 พร้อม overflow/interaction assertions. ภาพทั้งเจ็ดใน references/design ไม่เปลี่ยนและไม่ถูกใช้เป็น output ที่เขียนทับเพื่อให้เทสผ่าน

ตัวอย่างหลักฐาน: [Portfolio](../evidence/portfolio-1440.png), [Account](../evidence/account-1440.png), [Laptop](../evidence/account-1280.png), [Mobile](../evidence/responsive-account-390.png), [PDF editor](../evidence/pdf-workspace-cloudflare-1440x900.png), [Operations](../evidence/operations-1440.png). ภาพ actual isolated scenario: [Portfolio](../evidence/acceptance-portfolio-1440.jpg), [selected Account](../evidence/acceptance-account-selection.jpg)

ส่วนที่เพิ่มจากภาพเริ่มต้นตามสเปกใหม่ ได้แก่แท็บประวัติ/Remittance, ตัวเลือกปรับรอบทวง, hold/Needs review, สถานะ source/coverage และ Storage/Operations. โครง matrix,สี/ตัวอักษรและแผงรายละเอียดที่เจ้าของรับยังคงอยู่; mobile แยกบทบาท companion และให้เปิด editor เต็มบน desktop

## ขอบเขตที่คงไว้อย่างตรงไปตรงมา

- ไม่มี auto-send, ไม่มีการแก้ ledger OPERA และไม่มีการเชื่อม portal ของ Account อัตโนมัติ. พนักงานเป็นผู้ยืนยันการวางบิล/ส่ง/hold/review
- Native Statement API ไม่ใช่งานค้าง: ยกเลิกตามคำสั่งเจ้าของ. Native Invoice ที่ขาด reservation/folio identity หรือ API ไม่ให้ไฟล์ยังต้องแสดง unavailable; ไม่มี invoice สมมติทดแทนในธุรกิจจริง
- ตัวสร้าง PDF เป็น fixed-page editor; ไม่อ้าง Word-style reflow หรือภาพเหมือน OPERA100%ทุกข้อมูล. คงหัวข้อ Aging Summary ทั้งบัญชีตามที่ยืนยัน และไม่เติม watermark ลง Statement
- อักขระที่ OPERA ส่งมาเป็น mojibake ไม่แก้ชื่อบุคคลโดยเดา. รองรับ glyph ตาม fonts ที่มี; ถ้าอยู่นอกชุดรองรับต้องแจ้งชัด
- Password login/Google login พิสูจน์แล้ว แต่ไม่ได้เปลี่ยนรหัสผ่านจริงของเจ้าของระหว่างไม่อยู่หน้าคอม. Recovery PKCE/callback/form/permission tests ผ่าน; actual password-reset completion ยังเป็นการตรวจด้วยเจ้าของเมื่อจำเป็น
- ไม่มี production physical restore, live customer-data export/restore หรือคำรับรอง RTO/RPO. Local logical restore, included backup inventory และ provider-boundary runbook เป็นหลักฐานคนละชนิด
- ประวัติงานเก่าที่ไม่ยืนยันผล/งานวิจัย Native Statement ที่ยกเลิกยังคงไว้ให้ตรวจ ไม่ส่งซ้ำหรืออ้างว่าไม่เคยเกิดผลภายนอกจากการไม่พบ receipt

ระบบพร้อมให้เจ้าของตรวจการใช้งานจริงตามขอบเขตนี้. การทดลองส่งหาลูกค้าจริงไม่ใช่เงื่อนไขที่นำมาใช้ปิด acceptance
