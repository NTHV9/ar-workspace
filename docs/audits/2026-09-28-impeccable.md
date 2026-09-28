# Impeccable: ตรวจ UI/UX ทั้งระบบ — 28 กันยายน 2026

Method: dual-agent (A: `/root/impeccable_audit_design` · B: `/root/impeccable_audit_technical`) พร้อมการยืนยันหน้าจอบางส่วนโดยผู้รวบรวมรายงาน

## ผลสำคัญ

ระบบมีโครงสร้างที่เหมาะกับงาน AR และไม่จำเป็นต้องรื้อดีไซน์ทุกหน้า แต่พบจุดที่ควรแก้ก่อนปรับความสวยงามเพิ่มเติม โดยเฉพาะการนำทางที่ทำให้หลุดล็อกอิน พื้นที่เขียนอีเมลซ้อนกับลายเซ็น และการดูยอดเงินเต็มใน Account

- คะแนน UX ตามเกณฑ์ Impeccable: **25/40**
- คะแนนทางเทคนิคหลังรวมหลักฐาน: **12/20** — ใช้คะแนน B และปรับ Responsive จาก 3 เป็น 2 หลังยืนยันอีเมลทับกันบนจอแล็ปท็อป
- ข้อเสนอที่รวมประเด็นซ้ำแล้ว: **13 กลุ่ม — P1 5, P2 7, P3 1**
- **ไม่พบ P0 ในขอบเขตที่ตรวจ** ไม่ใช่การรับรองว่าไม่มีปัญหาในทุกสถานการณ์
- รอบนี้เป็นการตรวจและเสนอแนะ **ยังไม่ได้แก้โค้ดแอป Deploy หรือเปลี่ยนข้อมูลลูกค้า**

## วิธีตรวจและข้อจำกัด

ตรวจ frontend 176 ไฟล์ (68 TSX, 48 CSS, 60 TS) ในระดับรายการโมดูล จุดเข้าใช้งานและส่วนที่สัมพันธ์กับข้อค้นพบ ไม่ใช่การพิสูจน์ทุกบรรทัดหรือทุกเส้นทางของโปรแกรม ตรวจโค้ดอ้างอิง HEAD `6fa5d2784c8b55fb805afc9a91d10b909813fd02` ซึ่งมีโค้ดการใช้งานเดียวกับ deployed runtime `868e5045041a9532226f8c4f3500c1e204c69698` ต่างกันที่บันทึกผลตรวจ

ใช้ impeccable 4.3.1 จากปลั๊กอินที่ติดตั้งใหม่ Assessment A ประเมินดีไซน์/การใช้งานโดยไม่อ่านผล detector ส่วน Assessment B ตรวจโค้ด เครื่องมือ และ DOM แยกกัน ผู้รวบรวมอ่าน B หลัง A เสร็จแล้ว จากนั้นตรวจข้อสรุปที่ขัดกันก่อนรวมรายงาน ไม่มี ignore list เดิม

หลักฐานประกอบด้วยโค้ดปัจจุบัน ภาพอ้างอิงเดิมทั้ง 7 ภาพ ภาพทดสอบล่าสุดที่ตรวจความตรงกับโค้ดแล้ว และหน้าจอปัจจุบันที่เปิดด้วย browser แยกกัน ใช้ข้อมูลจำลองใน synthetic review และเซิร์ฟเวอร์ localhost ที่ไม่ส่งคำขอไป OPERA/Gmail/Drive จริง พฤติกรรมที่เกิดจากข้อมูลจำลองไม่ครบหรือ MIME ของเซิร์ฟเวอร์ทดสอบถูกตัดออกจากข้อบกพร่องของแอป

ทดสอบหน้าจอแล็ปท็อป 1280×720 เป็นหลัก มีภาพ responsive เดิมและการตรวจ source breakpoint ประกอบ แต่ **ยังไม่ได้ทดสอบทุกหน้าบนมือถือ ทุกขนาดจอ 200% zoom หรือด้วย screen reader จริง** ไม่ได้ตรวจยอดเงินจริงทุก Invoice, MIME ของอีเมลที่ส่งจริง, ความถูกต้องของ PDF จาก OPERA ทุกแม่แบบ หรือเวลาตอบสนองของบริการจริง

## P1 — ควรแก้ก่อน

### U01 — ลิงก์ภายในบางตัวทำให้หลุดล็อกอินและเสียปลายทาง

**ยืนยันใน browser และโค้ด:** เข้าระบบจำลอง → Storage → กด “Operations & recovery →” แล้วได้หน้า Sign in แทนหน้า Operations ปุ่มเมนูหลักทำงานได้ แต่ลิงก์ `<a href>` ทำให้โหลดเอกสารใหม่ และกติกา tab session ล้างการล็อกอิน จากนั้น OAuth กลับไป Aging โดยไม่เก็บปลายทางเดิม

**ผลกระทบ:** พนักงานเข้าไปกู้คืนงานผ่านทางที่หน้าเว็บเสนอไม่ได้อย่างต่อเนื่อง และอาจเข้าใจว่า session หมดอายุ

**เสนอ:** เปลี่ยนลิงก์ภายในเป็นการนำทางภายในแอปที่รักษา session ของแท็บเดิม พร้อมตรวจ unsaved work และเก็บบริบท Hotel/Account/งาน คงข้อกำหนดที่ให้ล็อกอินใหม่เมื่อเปิดแท็บหรือเปิดเว็บรอบใหม่ไว้ ไม่เพิ่มอายุ token หรือผ่อนสิทธิ์เพื่อแก้ปัญหานี้

ตำแหน่ง: `src/drive/DriveStorage.tsx:87,113`, `src/access/tab-session.ts:8–12`, `src/App.tsx`, `src/operations/Operations.tsx:24`

ขอบเขต: Storage → Operations ถูกทดลองจริง ลิงก์ Back to Dashboard/Open saved work/Storage settings เป็นรูปแบบเดียวกันที่ควรตรวจต่อ ไม่ได้อ้างว่าทดลองทุกลิงก์แล้ว

คำสั่งที่เหมาะ: `$impeccable harden`

### U02 — ข้อความอีเมลแบบ Plain text ทับกับลายเซ็น

**ยืนยันใน browser/DOM และโค้ด:** ที่ 1280×720 เมื่อเปิดลายเซ็น โลโก้ทับข้อความอีเมล `.email-body-label` ถูกยุบเหลือสูง 32px ขณะที่ textarea ยังสูง 130px; ลายเซ็นเริ่ม y≈487.98 แต่ textarea จบ y≈627.57

**ผลกระทบ:** อ่านและแก้ข้อความก่อนส่งได้ยาก ดูเหมือนเนื้อหาผิดรูป แม้รอบนี้ไม่ได้พิสูจน์ว่าไฟล์อีเมลที่ส่งจริงผิดด้วย

**เสนอ:** กำหนดความสูงขั้นต่ำของส่วน Plain text รวม label และ textarea ไม่ให้ flex ยุบ และให้ข้อความกับลายเซ็นเลื่อนเป็นเนื้อหาต่อเนื่องในพื้นที่เดียว ทดสอบ Plain/Rich text และเปิด/ปิดลายเซ็นที่ 1280×720/800 พร้อมคงปุ่มบันทึกที่เข้าถึงได้

ตำแหน่ง: `src/email-composer.css:1,5,7`, `src/email/signature.css:4`, `src/EmailComposer.tsx`

คำสั่งที่เหมาะ: `$impeccable harden`, `$impeccable layout`

### U03 — Account แสดงยอดแบบ K/M แต่ไม่มีทางดูยอดเต็มในจุดที่ใช้ตัดสินใจ

**ยืนยันใน browser และโค้ด:** ยอด Original/Open ในตาราง ยอดที่เลือก และยอดในแผง Invoice ใช้ตัวจัดรูปแบบย่อ ตัวอย่างข้อมูลจำลอง 1,558,080 แสดงเป็น `THB 1.56M` โดยไม่มี exact-value title หรือ accessible label ที่ยอดนั้น

**ผลกระทบ:** เทียบยอดเอกสารหรือเงินรับแบบละเอียดไม่ได้จากหน้านี้ นี่เป็นเรื่องการแสดงผล ไม่ใช่หลักฐานว่ายอดบัญชีผิด

**เสนอ:** อย่างน้อยยอดที่เลือกและรายละเอียด Invoice ต้องแสดง THB เต็มพร้อมสองทศนิยม และพิจารณาทำให้ Original/Open เต็มด้วย ปรับสัดส่วนคอลัมน์โดยรักษาเลข Invoice และข้อกำหนดตาราง Account ที่ไม่ขึ้นบรรทัดใหม่/ไม่เลื่อนแนวนอน หากยังย่อตัวเลขบางส่วน ต้องเปิดยอดเต็มได้ด้วย focus/tap ไม่ใช่เฉพาะ hover

ตำแหน่ง: `src/domain/portfolio.ts:80`, `src/AccountDetail.tsx` — selection, ledger และ detail amount

คำสั่งที่เหมาะ: `$impeccable clarify`, `$impeccable layout`

### U04 — ตัวอักษรเมนูและคำกำกับบางส่วนมี contrast ต่ำ

**ยืนยันจาก computed styles และคำนวณสี:** เมนูที่ยังคลิกได้ใช้ `#6e839e` บน `#ecf3f8` ได้ประมาณ **3.47:1**; บนพื้นขาวใน Register ได้ประมาณ **3.89:1** คำกำกับ `#657b96` บนขาวได้ประมาณ **4.35:1** ข้อความเหล่านี้มีขนาดปกติ ไม่ใช่ข้อความใหญ่หรือปุ่ม disabled ที่ได้รับข้อยกเว้น

**ผลกระทบ:** เมนูและคำกำกับอ่านยากขึ้นบนจอซีดหรือสำหรับผู้มีสายตาเลือนราง

**เสนอ:** เพิ่มความเข้มเฉพาะสีข้อความใช้งานจริงในกลุ่ม navy/slate เดิม ตรวจสีหลังรวม CSS ทุกชั้น รวม hover/focus ไม่จำเป็นต้องเปลี่ยนสีโรงแรมหรือทั้งธีม

เกณฑ์ข้อความปกติอย่างน้อย 4.5:1: [W3C — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

ตำแหน่ง: `src/styles.css:1,4,5,24`, `src/ui-typography.css:25,114`

คำสั่งที่เหมาะ: `$impeccable colorize`, ตรวจซ้ำด้วย `$impeccable audit`

### U05 — PDF “Move lines” เริ่มเลือกเส้นด้วยคีย์บอร์ดไม่ได้

**ยืนยันใน browser และโค้ด:** เปิด Move lines แล้ว focus ปุ่มเส้น กด Enter/Space ยังไม่เกิด `.pdf-native-area` และ Undo ยัง disabled แม้มีเส้นให้เลือก 7 เส้น ปุ่มเส้นมีเฉพาะ pointer handlers; arrow-key nudge ใช้ได้ต่อเมื่อสร้าง selection แล้ว

**ผลกระทบ:** ผู้ใช้คีย์บอร์ดเข้าเครื่องมือได้ แต่ทำขั้นตอนเลือกวัตถุเพื่อย้ายต่อไม่ได้ ไม่ได้หมายความว่า PDF editor ทั้งหมดใช้คีย์บอร์ดไม่ได้

**เสนอ:** Enter/Space เลือกเส้นและย้าย focus ไปยังพื้นที่ที่เลือก แล้วใช้ระบบลูกศร/Shift+ลูกศรที่มีอยู่ต่อ สำหรับ Move table/area ควรมีวิธีกำหนดกรอบด้วยคีย์บอร์ดหรือค่าตัวเลข โดยรักษาขอบเขตข้อความและ Undo

เกณฑ์ที่เกี่ยวข้อง: [W3C — Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)

ตำแหน่ง: `src/pdf/use-native-editing.tsx:17,96,119,121`, `src/pdf/PdfWorkspace.tsx`

คำสั่งที่เหมาะ: `$impeccable harden`

## P2 — ควรปรับในรอบถัดไป

| ID | จุดที่ควรปรับ | หลักฐานและผลต่อผู้ใช้ | ข้อเสนอ / ตำแหน่ง |
|---|---|---|---|
| U06 | พื้นที่ทำงานใน Account เหลือน้อย และชื่อบางส่วนไม่ตรงงาน | ที่ 1280×720 ตารางเริ่ม y≈596.8; แรกเข้าเห็นประมาณ 2 แถว สรุป 5 กล่อง/Aging ซ้ำเหนือ History/Settings ด้วย ค่า Next action เป็น Review account ทุกบัญชี และ Overview เปิด settings | ย่อสรุปในโหมดทำงาน เปิดรายละเอียดเมื่ออยากดู; แสดง next action จากสถานะจริงหรือเปลี่ยนชื่อ; ใช้ชื่อ Account settings ให้ตรงหน้าที่ `AccountDetail.tsx`, `settings/AccountSettings.tsx` — `$impeccable layout`, `$impeccable clarify` |
| U07 | Error ไม่บอกช่องที่ผิด | ใส่ Credit term -1 ถูกปฏิเสธและเก็บข้อมูลไว้ แต่มีเพียงข้อความรวมด้านล่าง ครอบคลุม term/email/URL โดยไม่มี invalid marker | Error รายช่อง, `aria-invalid`/`aria-describedby`, focus ช่องแรกที่ผิด และเปิด subsection ที่เกี่ยวข้อง โดยคง validation/backend safeguards `AccountSettings.tsx`, `CollectionPolicySettings.tsx`, `HistoryEditor.tsx` — `$impeccable harden` |
| U08 | สถานะเมนู/โรงแรม/เครื่องมือถูกบอกด้วยสีอย่างเดียว | App/Account/PDF หลายปุ่มใช้ class active แต่ไม่มี current/pressed state ใน DOM; บางหน้ารุ่นใหม่มีแล้ว | เพิ่ม `aria-current` หรือ `aria-pressed` ตามชนิดของ control ไม่ใส่ role tab อย่างเดียวโดยไม่มี keyboard/panel behavior `App.tsx`, `AccountDetail.tsx`, `PdfWorkspace.tsx`, `TemplateLibrary.tsx` — `$impeccable harden` |
| U09 | Template บอก Saved ทั้งที่เพิ่งแก้และยังไม่บันทึก | เลือกแม่แบบที่บันทึกไว้แล้วเปลี่ยน Subject: หัวแผงยัง Saved แต่ท้ายแผงเป็น Unsaved template edits ผู้รวบรวมยืนยันจากหน้าปัจจุบันอีกครั้งโดยไม่กด Save | ใช้ dirty/busy/saved/error เป็นแหล่งสถานะเดียวกันทั้งหัว/ท้าย `email/TemplateLibrary.tsx` — `$impeccable clarify` |
| U10 | ข้อความ Storage ยังอธิบายขั้นตอนเก่ารวมกับขั้นตอนใหม่ | แนะนำ archive จาก reviewed job และอธิบายหนึ่งเดือนแบบรวม แต่ preparation ใหม่เป็น transient และไม่มี action archive แบบเก่า | แยกไฟล์ชั่วคราวหลัง Sent/discard จากไฟล์เก่า/Drive/remittance; คงการปกป้อง Draft/uncertain ไม่เปลี่ยน retention code เพื่อให้ตรงข้อความ `drive/DriveStorage.tsx`, `drive/RetentionStatus.tsx`, `DocumentRoute.tsx` — `$impeccable clarify` |
| U11 | PDF/Email มีคำสั่งและเงื่อนไขให้คิดพร้อมกันมาก | PDF มีเครื่องมือหลัก 11+ รายการ; save/draft/provider/attachment state ในอีเมลอยู่หลายตำแหน่ง | จัดกลุ่มข้อความ/โครงตาราง/markups/ไฟล์แนบ และอธิบายเหตุที่ทำขั้นต่อไปไม่ได้ใกล้ปุ่ม โดยยังแก้ได้อิสระและไม่เพิ่มบังคับดู Preview/checkbox `PdfWorkspace.tsx`, `EmailComposer.tsx` — `$impeccable distill`, `$impeccable clarify` |
| U12 | Remittances ใช้พื้นที่กับ summary และคำอธิบายมาก | หน้าปัจจุบันที่ 1280×720 เพิ่งเริ่มเห็นรายการหลังแท็บ/filters/summary 4 กล่อง และมีคำอธิบายซ้ำหลายชั้น | มีมุมทำงานแบบกระชับ ย้ายคำอธิบาย quota/retention ยาวไปยังรายละเอียดที่เรียกดูได้ โดยยังแยก reported กับ OPERA open ชัด `remittance/Remittances.tsx`, `RemittanceDetail.tsx`, `RemittanceEvidence.tsx` — `$impeccable layout`, `$impeccable distill` |

## P3 — งานดูแลระบบดีไซน์

**U13 — ปรับเอกสาร/token ให้ตรงกับรูปแบบที่อนุมัติแล้ว**: มีค่า CSS และ override หลายชั้น รวมทั้ง Arial เก่าของ Register ที่ถูก override ไปแล้ว ทำให้เปลี่ยนจุดเล็ก ๆ แล้วคาดผลได้ยาก ควรบันทึกข้อยกเว้นของแต่ละหน้าและเก็บกฎที่ถูกแทนแล้วอย่างระมัดระวังหลังทำงานสำคัญ ไม่เปลี่ยนค่าทั้งหมดให้ตรงเอกสารเก่าเพียงเพื่อให้เครื่องมือตรวจเป็นศูนย์

ตำแหน่ง: `DESIGN.md`, `.impeccable/design.json`, `src/styles.css`, `src/ui-typography.css`, `src/ui-depth.css` และ CSS รายหน้า คำสั่ง: `$impeccable document`; ปิดรอบด้วย `$impeccable polish`

## ผลตรวจแต่ละกลุ่มหน้า

| หน้า/งาน | หลักฐานรอบนี้ | ผลและทิศทาง |
|---|---|---|
| Login | หน้าปัจจุบัน + โค้ด | ทางเลือก Google เดียวชัดเจน ไม่พบปัญหาหลัก ไม่คืน password login เก่า |
| เมนูหลัก/เลือก Hotel/OPERA | หน้าปัจจุบัน + computed styles | แก้ U01/U04/U08; ปุ่ม OPERA แบบย่อและ tooltip มีประโยชน์ ไม่คืนแถบสีเหลือง |
| Dashboard / Period | หน้าปัจจุบันทั้งสองพื้นที่ที่จอแล็ปท็อป + โค้ด | การแยกยอดคงค้าง/กิจกรรมถูกทิศทาง ไม่พบการบีบส่วนบนที่ทดสอบ อาจมีทางลัดไป section สำหรับหน้ายาว |
| Aging / drilldown | โค้ด + current source-unverified state + ภาพ comparison ที่เทียบความใหม่แล้ว | คง all ranges, บริบท Hotel/Account และ unknown ไม่ใช่ zero ยังไม่ยืนยันทุก data shape ของตารางในรอบนี้ |
| Account / Invoice details | หน้าปัจจุบัน + DOM + โค้ด | U03/U06/U08; ให้ความสำคัญกับยอดเต็มและพื้นที่รายการ |
| Account settings/Recipients | หน้าปัจจุบัน + invalid-term interaction + โค้ด | U06/U07; เปลี่ยนชื่อ Overview และ error รายช่อง |
| History / Documents & Gmail | หน้าปัจจุบัน + โค้ด | แสดงหลักฐานและต่อ preparation ได้; ลดส่วนสรุปที่ซ้ำ และ humanize state/ID ทางเทคนิค |
| Collections | โค้ดปัจจุบัน + ภาพ desk ล่าสุด | รูปแบบงานชัด ไม่จำเป็นต้องรื้อใหม่; คง scope/stage และยอดที่เลือก |
| Collection rules | โค้ด | Review/change history มีเหตุผล; U07 ช่วยแก้ค่าผิดได้ตรงจุด ยังไม่ได้เผยแพร่กฎหรือทดสอบทุกฟอร์มใน browser รอบนี้ |
| Invoice Register | หน้าปัจจุบัน + DOM + โค้ด | Sheet เต็มพื้นที่และ frozen Invoice/Account/Guest เหมาะสม Keyboard help ไม่มีแล้ว ไม่เอากรอบ/คำอธิบายเดิมกลับมา |
| External billing | โค้ด + ภาพเดิมที่ใช้เฉพาะประกอบโครงสร้าง | คง review/reason และผลต่อประวัติ; ยังไม่ยืนยันทุกสถานะของ browser ปัจจุบัน |
| Remittances | หน้าปัจจุบัน list/detail + โค้ด; editor ใช้ภาพประกอบเดิม | U12; คงยอดแจ้งรับ/จัดสรร/OPERA แยกกัน ไม่ปิดหนี้จาก remittance |
| Templates | หน้าปัจจุบัน + unsaved-subject interaction + โค้ด | U09; ปุ่มแทรก placeholder เป็นข้อเสนอเสริม ไม่คืน version history ที่ผู้ใช้ให้ลบ |
| Users & Access | หน้าปัจจุบันผู้ใช้หนึ่งราย + โค้ด | แยก Name/Position/Region ชัด admin protected; ยังไม่ตรวจรายการผู้ใช้จำนวนมากและมือถือใหม่ในรอบนี้ |
| My email signature | หน้าปัจจุบัน + โค้ด | Preview ตาม Hotel ชัดเจน ไม่ส่ง preview email; แก้ overlap ที่ composer ตาม U02 |
| Storage / Drive | หน้าปัจจุบัน + โค้ด | U01/U10; เมื่อเชื่อมต่อปกติ ควรลดความเด่นของคำสั่ง setup/test ให้เรื่องที่ต้องจัดการเด่นกว่า |
| Operations / recovery | โค้ดและลิงก์เข้าหน้าจาก browser | U01; ไม่กล่าวหาว่า financial route หาย เพราะมีการแปลง bookmark ไป Dashboard อยู่แล้ว |
| Document preparation | หน้าปัจจุบัน ready-fixture + โค้ด | ระบุเอกสารและ scope ชัด; ข้อความสถานะควรอ่านเป็นภาษางาน ไม่ใช่ raw state งานสร้าง/ยอดจาก OPERA จริงยังไม่ได้ทดสอบ |
| PDF workspace/Preview/attachments | current harness + DOM/keyboard + โค้ด | U05/U11; Preview ไม่มีข้อบังคับดูครบทุกหน้าหรือ checkbox ตามที่เคยขอ คงการแก้ไขอิสระและ Undo |
| Email compose/draft/thread/recovery | composer ปัจจุบัน + geometry; โค้ดและภาพเดิมของ thread/recovery | U02/U11; ไม่ได้ทดสอบส่งจริง และไม่อ้างว่าลายเซ็นใน MIME ผิด |
| Retained Financial/Observation reports, acceptance/diagnostic | รายการโมดูล/โค้ด | แยก legacy ที่ไม่ถูก mount ออกจากหน้าที่พนักงานใช้จริง ไม่เสนอ redesign legacy เป็นงานหลัก |

## คะแนน UX

| เกณฑ์ | /4 | เหตุผลหลัก |
|---|---:|---|
| เห็นสถานะระบบ | 3 | มี loading/retry/uncertain ชัด แต่ Template Saved ขัดกับ dirty |
| ภาษาและแนวคิดตรงงาน | 3 | Hotel/Account/Invoice ชัด แต่ยอดแบบย่อและศัพท์ระบบยังมี |
| ควบคุมงาน/ย้อนกลับ | 2 | มี Undo/เก็บงาน แต่ลิงก์ภายในทำให้หลุด session |
| ความสม่ำเสมอ | 2 | รูปแบบหน้าที่ต่างกันมีเหตุผล; สถานะ/ยอด/ชื่อทางเข้ายังไม่สม่ำเสมอ |
| ป้องกันข้อผิดพลาด | 3 | รักษา scope, actual sent, read-only และคำสั่งไม่ซ้ำ |
| ไม่ต้องจำเองมาก | 2 | การตั้งค่าผู้รับและเงื่อนไขก่อนส่งกระจายหลายจุด |
| ความคล่องตัว | 3 | Register/Collections คล่อง; Account/PDF ยังมีแรงเสียดทาน |
| ความเรียบง่าย/ลำดับสายตา | 2 | ข้อมูลสรุปแข่งกับงาน และอีเมลมี overlap |
| เข้าใจและแก้ error | 3 | เก็บค่าและ retry ดี แต่ชี้ช่องผิดไม่ชัด |
| คำแนะนำตรงบริบท | 2 | คำอธิบายเยอะ แต่บางจุดไม่อยู่ใกล้การตัดสินใจ |
| **รวม** | **25/40** | คะแนนเชิงประเมิน ไม่ใช่การรับรองมาตรฐาน |

คะแนนทางเทคนิค: Accessibility **2/4**, Performance **3/4**, Responsive **2/4**, Theming/system use **2/4**, Implementation integrity **3/4** รวม **12/20** คะแนน Performance อิงโครงสร้าง ไม่ใช่ผลวัดความเร็วบนเครือข่ายจริง

## ผลเครื่องมือตรวจและสิ่งที่ไม่ควรนับเป็นบั๊ก

รัน `impeccable detect --json src` หนึ่งครั้ง ได้ **1,143 รายการใน 53 ไฟล์**: 1,133 advisories และ 10 warnings ไม่ใช่ 1,143 บั๊ก

| กลุ่ม | จำนวน | การตีความ |
|---|---:|---|
| ค่าสีไม่ตรง token ที่บันทึกไว้ | 643 | รายการตรวจความสอดคล้อง ไม่ได้วัด contrast |
| ขนาดตัวอักษร | 345 | ต้องดู CSS หลัง override และเจตนาตารางแบบหนาแน่น |
| รัศมีมุม | 145 | มีรูปแบบเฉพาะหน้าที่ผู้ใช้ตั้งใจเลือก |
| Font / overused font | 8 | Arial สำหรับ email และกฎเก่าที่ถูก override; Plus Jakarta Sans เป็นฟอนต์ที่อนุมัติ |
| Layout transition | 1 | ตรวจผิดเป็น width แต่จริงเป็น SVG stroke-width และมี reduced-motion |
| Side-tab | 1 | CSS ของรายงานเก่าที่ App ไม่ mount; ไม่ใช่ปัญหาหน้าปัจจุบัน |

ตรวจบริบท warnings ทั้ง 10 แล้ว ไม่ยกเป็น defect ใหม่จากการเตือนนั้น ส่วน advisories ตรวจเป็นกลุ่มและสุ่มตาม surface ไม่ได้พิสูจน์ทุก literal รายตัว ปัญหา U01–U12 มาจาก source/runtime/การใช้จริง ไม่ใช่นับตาม regex

ไม่ควรเพิ่ม Dark mode เพื่อคะแนน, เปลี่ยนฟอนต์เพียงเพราะ detector เรียกว่าใช้บ่อย, คืน Keyboard help, คืนแถบ OPERA ใหญ่, บังคับ Preview ครบ หรือห้าม Register เลื่อนแนวนอน สิ่งเหล่านี้ขัดกับบริบท/คำยืนยันของผู้ใช้

เกณฑ์ target 44px เป็นแนวทางใช้งานสบาย ไม่ใช่ใช้เหมารวมเป็น AA failure: [W3C Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) ใช้ขั้นต่ำ 24 CSS pixels พร้อมข้อยกเว้น

## สิ่งที่ควรรักษาและแผนที่เสนอ

สิ่งที่ทำงานดี: Collections จับคู่บัญชีกับ Invoice ที่เลือกอย่างชัดเจน; Register รองรับงานต่อเนื่อง; ระบบแยก Draft/Sent และ unknown/zero; การส่งยังเป็นการตัดสินใจของคน; Remittance ไม่ถูกใช้ปิดหนี้เอง

ลำดับที่เสนอ:

1. U01/U02/U03/U04/U05: แก้เส้นทาง การซ้อนทับ ความแม่นยำในการแสดงยอด และ accessibility ที่ยืนยันแล้ว (`harden`, `layout`, `clarify`, `colorize`)
2. U06/U07/U08/U09: ทำหน้า Account/validation/สถานะให้ตรงงานและอ่านง่าย
3. U10/U11/U12: ลดภาระของ Storage/PDF/Email/Remittances โดยคงข้อป้องกันที่จำเป็น
4. U13: บันทึกและลดความซ้ำของ design rules หลังเห็นผลจริง (`document`)
5. ปิดรอบด้วย `$impeccable polish` และตรวจซ้ำเส้นทางเดิม

ผู้ใช้หลักที่ได้รับผล: พนักงานที่ทำซ้ำหลาย Invoice ต้องการยอดเต็มและพื้นที่แถวมากขึ้น; ผู้ใช้ใหม่ต้องค้นผู้รับ/เครื่องมือได้ง่าย; ผู้ใช้คีย์บอร์ด/สายตาเลือนรางต้องรู้ current state และเลือก native line ได้ จุดที่มีภาระคิดสูงที่สุดอยู่ใน PDF/Email ไม่ใช่ทุกหน้าของระบบ

## บันทึกการตรวจ

- Target slug: `src-app-tsx`; ignore list: ไม่มี
- Assessment A และ B แยกกันจนเสร็จ; ผู้รวบรวมตรวจข้อสรุปซ้ำที่ขัดกัน ก่อนเผยแพร่
- ตัดข้อกล่าวหา source-only ว่า financial bookmark เป็น dead route: `initialWorkspaceParams()` เรียก `normalizedDashboardParams()` อยู่แล้ว ปัญหา auth ใน U01 ยังคงเป็นคนละประเด็นที่ทดลองจริง
- ใช้ native browser และ read-only DOM/computed styles; ไม่ได้ฉีด detector overlay เพราะ evaluate ที่ให้ใช้เป็น read-only ไม่ได้อ้างว่ามี overlay ให้ผู้ใช้เห็น
- เซิร์ฟเวอร์ localhost ใช้เฉพาะ build/fixture จำลอง ไม่มีการ forward ไปผู้ให้บริการ ไม่ได้แก้ source/config ของแอปเพื่อการตรวจ
- รายงานย่อย/raw detector อยู่ใน `.tmp/impeccable-audit-20260928/`; เก็บไว้เป็นหลักฐาน ไม่มี secret หรือข้อมูลลูกค้าจริง
- ปิดแท็บที่สร้างเพื่อการตรวจและเซิร์ฟเวอร์จำลองก่อนส่งรายงาน ภาพอ้างอิงเดิมคงเดิม
- รอบนี้ไม่ทำ deploy, ส่งเมล, สร้าง/ลบ cloud resource หรือแก้ข้อมูลการเงิน

สถานะข้อเสนอทั้งหมด: **เสนอให้ปรับ — ยังไม่ implemented / deployed / enabled**
