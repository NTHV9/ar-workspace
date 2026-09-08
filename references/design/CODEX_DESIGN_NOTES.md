<!-- Prepared 2026-09-08. Reference-only material supplied by the owner. -->

> ที่มา: สรุปจาก **Phase 2 (4)** ที่เจ้าของวางต่อท้ายคำสั่งเตรียมโครงการใหม่ วันที่ 8 กันยายน 2026
> ข้อความด้านล่างเก็บตามที่เจ้าของให้ ไม่ใช่รายงานสถานะล่าสุดของทั้งโปรเจค และไม่ใช่การรับรองว่าได้อ่านแชทอื่นครบ
> ใช้ร่วมกับภาพทั้ง 7 ในโฟลเดอร์นี้เพื่ออ้างอิงดีไซน์ หากข้อกำหนดธุรกิจ/บริการ/ข้อจำกัดเดิมขัดกัน ให้ใช้คำสั่งล่าสุดและ `../../docs/PRODUCT_SPEC.md` ของระบบใหม่
> ตำแหน่งไฟล์เก่าและข้อความ “ยังไม่ได้ตรวจไฟล์” ด้านล่างเป็นบริบทของสรุปเดิม; การเตรียมครั้งนี้ตรวจภาพและคัดลอกครบแล้ว ดู `../HANDOFF_VERIFICATION.md`

---

# สรุปความต้องการ Frontend จากแชท Phase 2 (4)

> เอกสารนี้สรุปเฉพาะข้อความและภาพที่เข้าถึงได้ในแชทนี้ ไม่ใช่สถานะล่าสุดของโปรเจกต์ และไม่รวมการพัฒนาที่เกิดขึ้นในแชทถัดไป  
> ไม่มีการอ่านหรือแก้ไฟล์ เปลี่ยน Branch ย้อน Commit ทำงานพัฒนาต่อ หรือ Deploy เพื่อจัดทำสรุปนี้

## 1. หน้าตาและการจัดวางที่ผู้ใช้ต้องการ

### ภาพรวม

- ชื่อระบบ: **Katathani AR Collection System**
- ใช้โลโก้ **Katathani Collection** จากเว็บไซต์ทางการ
- ไม่จำเป็นต้องใช้สีของโรงแรมเป็นสีหลักของระบบ
- ต้องดูสวย ทันสมัย ไม่เรียบจนเกินไป และไม่ใส่ลูกเล่นมากเกินไป
- ให้ความสำคัญกับ Font, Typography และความอ่านง่ายของตัวเลข
- ออกแบบแบบ **Desktop/Laptop-first** สำหรับงาน AR เต็มรูปแบบ
- Mobile ใช้ตรวจสถานะ การแจ้งเตือน และการตรวจ/อนุมัติแบบย่อ
- ใช้แนวทาง **Comp-first**: ทำภาพต้นแบบให้ดูและแก้ก่อนลงมือพัฒนา

### ทิศทางภาพที่เลือก

ผู้ใช้เลือกและอนุมัติ **Luminous Portfolio — Comparative Matrix**

ลักษณะของภาพที่อนุมัติ:

- พื้นหลังสว่าง โทนฟ้าเทาอ่อน
- พื้นที่ข้อมูลเป็นสีขาวหรือพื้นทึบที่อ่านง่าย
- ใช้สีน้ำเงินและเขียวอมฟ้าเป็นสีประกอบ
- การ์ดและแผงข้อมูลมุมโค้ง มีมิติและเงาบาง
- ตัวเลขสำคัญมีลำดับความเด่นชัด
- ตารางเป็นพื้นที่ทำงานหลัก
- Visual ตกแต่งต้องไม่ตัดผ่านหรือทำให้ข้อความและตัวเลขอ่านยาก

### โครงข้อมูลหลัก

ผู้ใช้ต้องการดูข้อมูลตามลำดับ:

**ภาพรวมสองโรงแรม → Account Type → Account → Invoice/Folio**

โดยมีทั้ง:

- ภาพรวมรวมสองโรงแรม
- มุมมองแยกโรงแรม
- Filter โรงแรม, Account Type และ Account
- ยอดเงิน จำนวน Invoice และยอดตามช่วง Aging
- การเปรียบเทียบว่า Account Type หรือ Account ใดมียอดมากในแต่ละโรงแรม

---

## 2. สิ่งที่ผู้ใช้อนุมัติแล้ว

### Portfolio

ผู้ใช้อนุมัติภาพ `Luminous Portfolio — Comparative Matrix` และรายละเอียดต่อไปนี้:

- เปิดมาที่ `All Hotels` เป็นค่าเริ่มต้น
- แสดงยอดของ **TSK, KAT และ Total** แยกคอลัมน์
- แสดงทุก Account Type ไม่จำกัดเพียง Top 4
- ตาราง Account ใช้รูปแบบเปรียบเทียบ TSK/KAT/Total เช่นเดียวกัน
- มีข้อมูล Over 90 Days, สัดส่วน และจำนวนรายการ
- เรียงตาม `Total Open` จากมากไปน้อยเป็นค่าเริ่มต้น
- ทุกคอลัมน์กดเรียงได้
- Aging สามารถกดขยายดูทุกช่วงได้

### Account Detail / Invoice–Folio

ผู้ใช้อนุมัติภาพ Account Detail หลังแก้คอลัมน์เป็น:

- `Guest Name`
- `Invoice No.`
- `Folio No.`

ภาพที่อนุมัติยังมี:

- บริบทโรงแรมและ Account
- Summary ยอดเงินและ Aging
- ตารางรายการ
- การเลือกหลายรายการ
- แถบยอดรวมของรายการที่เลือก
- แผงรายละเอียดรายการและเอกสารด้านขวา

### Billing & Collection Queue

ผู้ใช้อนุมัติภาพหลังเพิ่ม:

- Filter `Account Type`
- Filter `Account`
- การแยก **Billing / วางบิล** กับ **Collection / ทวงหนี้**
- Filter `All Work / Billing / Collection`
- Purpose badge ในแต่ละแถว
- วันที่ เวลา และเขตเวลาใน Timeline
- ปุ่มดำเนินการที่ใช้ข้อความต่างกันตาม Purpose

### Documents / PDF และ Email / Attachments

- ผู้ใช้ถามเพิ่มเติมว่าไฟล์แนบเพิ่มเติมอยู่ตรงไหน
- ผู้ช่วยทำภาพขั้น Email ที่แยก Generated PDF และ Supplemental Attachments
- ผู้ใช้ตอบรับภาพ Email & Attachments
- ภายหลังผู้ใช้ยืนยัน Written Frontend Specification ซึ่งรวม Documents/PDF และ Email ไว้ด้วย

องค์ประกอบที่อยู่ในชุดที่อนุมัติ:

- ขั้นตอน `Scope → Documents → PDF Review → Email → Handoff`
- เลือก Statement, Invoice/Folio หรือทั้งสอง
- เลือกไฟล์รวม หรือแยกไฟล์
- PDF editor และ Preview
- ไฟล์แนบเพิ่มเติมในขั้น Email
- ตัวเลือก Thread เดิม หรือ Email ใหม่

### Mobile Companion

ผู้ใช้อนุมัติภาพที่มี:

- ภาพรวม All Hotels/KAT/TSK
- จำนวนงาน Billing/Collection และ Exceptions
- Notifications แยก Purpose
- วันที่และเวลา
- Quick Review
- ทางไปทำงานเต็มบน Desktop

### หน้าสนับสนุน

ผู้ใช้อนุมัติภาพรวมของ:

- History
- Reports & Exports
- Operations
- Settings

### Written Specification

ผู้ใช้ตอบ **“ยืนยัน”** ต่อเอกสาร Frontend Design Specification และ Design System ที่ผู้ช่วยนำเสนอ

การยืนยันนี้เกิดในแชทนี้เท่านั้น ไม่ได้บอกว่าเอกสารดังกล่าวยังเป็นฉบับล่าสุดหลังการพัฒนาในแชทอื่น

---

## 3. สิ่งที่ผู้ใช้ไม่ชอบและสั่งให้แก้

| เรื่อง | คำขอหรือเหตุผลของผู้ใช้ | การปรับที่ได้รับการยอมรับ |
|---|---|---|
| หน้าตาชุดแรก | ยังไม่สวยหรือทันสมัยพอ | Research และทำทิศทางใหม่ |
| สี | ไม่จำเป็นต้องใช้สีโรงแรม | ใช้สีของ UI แยกจากโลโก้ |
| Typography | Font และตัวอักษรดูล้าสมัย | เปลี่ยนเป็นแนวร่วมสมัย |
| รูปแบบการนำเสนอ | ไม่ต้องการอนุมัติจากคำอธิบายอย่างเดียว | ทำภาพต้นแบบให้ดูแต่ละหน้าหลัก |
| Visual ของ Total Open | เส้นและรูปทรงทับตัวเลข ทำให้อ่านยาก | ย้ายข้อมูลไปพื้นที่อ่านชัด ตกแต่งไม่ทับข้อความ |
| Where exposure lives | พื้นที่สั้นและแสดงเพียงบาง Account Type | เปลี่ยนเป็นตารางเต็มความกว้าง แสดงทุกประเภท |
| All Hotels | ต้องการเห็นแต่ละโรงแรมจริง ๆ | แยก TSK/KAT/Total ทั้งระดับ Account Type และ Account |
| Sorting | ไม่ต้องการเรียงได้เฉพาะ Total Open | ทุกคอลัมน์กดเรียงได้ |
| Aging | เห็นเพียง Over 90 Days ไม่พอ | เพิ่มการขยายทุกช่วง |
| คอลัมน์ Invoice/Folio | ไม่เอา Document Type/No. | ใช้ Guest Name, Invoice No., Folio No. |
| Queue filters | ขาด Account Type และ Account | เพิ่มทั้งสองตัวกรอง |
| Timeline | ต้องการวันที่และเวลา | เพิ่ม timestamp |
| วางบิลกับทวงหนี้ | ยังแยกไม่ชัด | แยก Purpose, Filter, Badge และข้อความปุ่ม |
| ไฟล์แนบเพิ่มเติม | ยังไม่เห็นในภาพ PDF | เพิ่มส่วน Supplemental Attachments ใน Email |

---

## 4. พฤติกรรมที่ภาพต้นแบบอธิบายไม่ครบ

### 4.1 Portfolio และตารางเปรียบเทียบ

**ผู้ใช้ระบุโดยตรง**

- `Total Open` มากไปน้อยเป็นเพียงค่าเริ่มต้น
- ทุกคอลัมน์ต้องเรียงได้
- ชื่อเรียงตามตัวอักษร
- ต้องขยาย Aging เพื่อดู:
  - 0–30
  - 31–60
  - 61–90
  - 91–120
  - 121–150
  - 151+
- `All Hotels` ต้องเห็นยอดของทั้งสองโรงแรม ทั้งระดับ Account Type และ Account

**ผู้ช่วยเสนอและผู้ใช้ตอบรับต่อมา**

- กด Account Type แล้วกรองตาราง Account ด้านล่าง
- กดยอดของโรงแรมเพื่อเข้า Account Detail ของโรงแรมนั้น
- กดชื่อ Account ที่อยู่สองโรงแรมเพื่อดูภาพรวมก่อนเลือกโรงแรม
- ย้อนกลับแล้วคืน Filter, Sort และตำแหน่ง Scroll
- ตรึงคอลัมน์ชื่อและ Total ขณะเลื่อนแนวนอน
- ถ้าช่วง Aging ของสองโรงแรมไม่ตรงกัน ต้องแยกตามโรงแรม ไม่รวมโดยสมมติว่าตรงกัน

### 4.2 Account Detail

**ผู้ใช้ระบุโดยตรง**

- Guest Name, Invoice No. และ Folio No. ต้องเป็นคนละคอลัมน์

**พฤติกรรมในข้อเสนอที่ได้รับการรับรอง**

- กดแถวเพื่อเปิดแผงรายละเอียดด้านขวา
- Checkbox ใช้เลือกหลายรายการ
- การเลือกและทำงานต่ออยู่ภายใน Hotel + Account เดียว
- แถบด้านล่างแสดงจำนวนและยอดรวมที่เลือก
- ค้นหาและเรียงคอลัมน์ได้
- เมื่อหน้าจอแคบ แผงรายละเอียดเปลี่ยนเป็น Drawer เพื่อรักษาความอ่านง่ายของตาราง

### 4.3 Billing & Collection Queue

**ผู้ใช้ระบุโดยตรง**

- เพิ่ม Account Type/Account filters
- Timeline ต้องแสดงวันที่และเวลา
- แยกวางบิลและทวงหนี้ให้ชัด พร้อม Filter

**รายละเอียดจากข้อเสนอที่ได้รับการรับรอง**

- `Billing` หมายถึงวางบิล
- `Collection` หมายถึงทวงหนี้และติดตามหนี้
- การเลือก Purpose ไม่ขึ้นกับว่าเป็น Email ครั้งแรกหรือครั้งถัดไป
- แต่ละแถวแสดง Purpose แม้อยู่ใน All Work
- ปุ่มเปลี่ยนตาม Purpose:
  - `Prepare Billing Package`
  - `Prepare Follow-up`
- Timeline แสดงวันที่ เวลา และ `ICT`
- การกด Prepare เป็นการเริ่มเตรียมและตรวจข้อมูล ไม่เท่ากับส่ง Email

> หมายเหตุ: คำว่า Round และลำดับ Priority ในต้นแบบเป็นรายละเอียดที่ผู้ช่วยนำมาจากเอกสารขณะนั้น ไม่ใช่ข้อกำหนดใหม่ที่ผู้ใช้พิมพ์เองในช่วงออกแบบนี้ จึงควรตรวจอีกครั้งกับระบบที่พัฒนาต่อภายหลัง

### 4.4 Documents / PDF Review

รายละเอียดที่ผู้ช่วยอธิบายและถูกรวมใน Written Specification ที่ผู้ใช้ยืนยัน:

- เนื้อหาเอกสารกับรูปแบบไฟล์แนบเป็นคนละตัวเลือก
- เลือก Statement only, Row PDFs only หรือ Both
- เลือก Separate หรือ Combined
- เอกสารผูกกับรายการที่เลือก
- PDF editing เป็นทางเลือก
- Preview, การรับทราบความแตกต่าง และ Safe Flatten เป็นขั้นก่อนส่งต่อ
- การแก้ PDF ไม่เปลี่ยนข้อมูล OPERA
- แสดงบริบท Hotel, Account, Purpose และจำนวนรายการตลอดขั้นตอน

### 4.5 Email และไฟล์แนบเพิ่มเติม

**ผู้ใช้ถามโดยตรง**

- ต้องมีที่แนบไฟล์เพิ่มเติม

**ข้อเสนอที่ผู้ใช้ตอบรับ**

- เพิ่มไฟล์ในขั้น Email
- Generated Final PDF กับ Supplemental Attachments แสดงแยกกัน
- ไม่รวมไฟล์เพิ่มเติมเข้า PDF อัตโนมัติ
- เพิ่มและลบไฟล์เป็นรายไฟล์ได้
- แสดงจำนวน ขนาดรวม และสถานะตรวจสอบ
- เลือก Thread เดิมหรือเริ่ม Email ใหม่
- แก้ผู้รับ Subject และ Body ได้
- การแก้ข้อความครั้งนี้ไม่เปลี่ยนค่าเริ่มต้นของ Account โดยอัตโนมัติ

**รายละเอียดเชิงระบบจากผู้ช่วย**

- การบล็อกไฟล์ต้องห้าม/เกินขนาด
- ไม่ตัดไฟล์ทิ้งเงียบ ๆ
- ไม่เปลี่ยนเป็น Drive link อัตโนมัติ
- Draft/Send และนโยบายไฟล์ชั่วคราว

รายละเอียดกลุ่มนี้รวมอยู่ในสเปกที่ยืนยัน แต่ไม่ควรถือเป็นนโยบายล่าสุดของระบบโดยไม่ตรวจแชทหรือเอกสารภายหลัง

### 4.6 Mobile

**ผู้ใช้ระบุโดยตรง**

- Desktop/Laptop สำหรับงาน AR เต็มรูปแบบ
- Mobile สำหรับสถานะ แจ้งเตือน และอนุมัติแบบย่อ

**การตีความในต้นแบบที่ผู้ใช้ตอบรับ**

- Status, Alerts และ Quick Review
- แสดงค่าก่อน/หลังสำหรับการตรวจแบบย่อ
- งานตารางเต็ม PDF และ Email handoff ไปทำต่อบน Desktop

### 4.7 หน้าสนับสนุน

รายละเอียดในภาพที่ผู้ใช้อนุมัติ:

- **History:** Timeline, วันที่เวลา และประเภทเหตุการณ์
- **Reports:** R&A Summary/Detail, Billing Queue, Collection Queue และรายการ Export
- **Operations:** สถานะข้อมูล งานเบื้องหลัง และความพร้อมของบริการ
- **Settings:** Credit Terms, ผู้รับ Billing/Collection, Templates, Document/Thread defaults และ Version history

---

## 5. ภาพและไฟล์ต้นแบบที่เกี่ยวข้อง

รายการต่อไปนี้เป็นชื่อและตำแหน่งที่ถูกอ้างอิงในแชท ไม่ได้ตรวจสอบการมีอยู่หรือเนื้อหาปัจจุบันของไฟล์

### ภาพที่ผู้ใช้อนุมัติ

โฟลเดอร์ฐาน:

```text
C:\Users\naruethorn.t\Documents\ChatGPT\AR DB\.superpowers\worktrees\phase-1a-current-ar\.impeccable\mocks\decision\
```

| หน้า | ไฟล์ภาพ |
|---|---|
| Portfolio | `luminous-v4.png` |
| Account Detail — Guest/Invoice/Folio | `account-detail-v2.png` |
| Billing & Collection Queue | `collection-queue-v2.png` |
| Documents / PDF Review | `pdf-workspace-v1.png` |
| Email / Attachments | `email-composer-v1.png` |
| Mobile Companion | `mobile-companion-v1.png` |
| History / Reports / Operations / Settings | `supporting-surfaces-v1.png` |

### เอกสารที่สร้างและอ้างถึงในแชท

ภายใต้ core worktree เดียวกัน:

```text
DESIGN.md
PRODUCT.md
docs/superpowers/specs/2026-08-26-frontend-design.md
docs/research/2026-08-26-modern-finance-dashboard-visual-patterns.md
```

แชทยังระบุ Implementation Plan suite แต่ไม่ใช่หลักฐานว่าการพัฒนาตามแผนเสร็จแล้ว:

```text
docs/superpowers/plans/2026-08-26-frontend-master.md
docs/superpowers/plans/2026-08-26-frontend-foundation-shell.md
docs/superpowers/plans/2026-08-26-frontend-portfolio-account.md
docs/superpowers/plans/2026-08-26-frontend-billing-collection-composer.md
docs/superpowers/plans/2026-08-26-frontend-supporting-mobile-acceptance.md
```

### ภาพอ้างอิงที่ผู้ใช้แนบ

- ภาพแสดงปัญหา Visual ทับ Total Open
- ภาพ `Where exposure lives` ที่มีพื้นที่และจำนวนประเภทไม่พอ
- ภาพ Excel เปรียบเทียบ Account Type/Account แยกโรงแรมและ Total
- ภาพ Excel ตัวอย่างคอลัมน์ Guest Name, Invoice No. และ Folio No.

ชื่อและตัวเลขจริงในภาพ Excel เป็นข้อมูลอ้างอิงโครงสร้าง ไม่ได้ถ่ายทอดซ้ำในสรุปนี้

### แหล่งแรงบันดาลใจที่ผู้ใช้ส่ง

- [Katathani Collection](https://katathanicollection.com/)
- [CashPanel — Modern Fintech Dashboard](https://me.muz.li/orbix-studio/cashpanel-modern-fintech-dashboard-ui-for-crypto-investment-management)
- [Finebank Financial Management Dashboard](https://www.figma.com/community/file/1227525441534506928/finebank-financial-management-dashboard-ui-kits)
- [Modern Finance Dashboard UI](https://www.figma.com/community/file/1522234175468349854/modern-finance-dashboard-ui-smart-scalable-design)
- Google Sheets แท็บ `📊 สรุป` ที่ผู้ใช้ส่ง เพื่ออ้างอิงยอด จำนวน Invoice หมวด และโรงแรม

---

## 6. การแยกสถานะการอนุมัติและข้อจำกัดของข้อมูล

### ยืนยันได้จากข้อความผู้ใช้

- เลือก Luminous Portfolio
- อนุมัติ Comparative Matrix หลังแก้ความอ่านง่าย
- อนุมัติ Sorting และ Aging expansion
- อนุมัติ Account Detail หลังแยก Guest/Invoice/Folio
- อนุมัติ Billing/Collection Queue หลังเพิ่ม Filter และ Timestamp
- อนุมัติ Email/Attachments, Mobile และหน้าสนับสนุน
- ยืนยัน Written Frontend Specification
- เลือก Inline Execution และให้สร้างแชทใหม่สำหรับพัฒนา

### เป็นข้อเสนอของผู้ช่วยที่ถูกยอมรับในภาพหรือสเปกรวม

- ชุดสีและชื่อ Font ที่เฉพาะเจาะจง
- ขนาดตัวอักษร ระยะห่าง Radius และ Design Tokens
- Drawer, Sticky columns, Sort cycle และ URL-state mechanics
- ข้อจำกัด Quick Review บน Mobile
- รายละเอียด Preview, Safe Flatten, Draft/Send และไฟล์ชั่วคราว
- Library และโครงสร้างทางเทคนิคใน Implementation Plan

สิ่งเหล่านี้ไม่ควรถูกอ้างว่าเป็นคำสั่งที่ผู้ใช้ระบุเองทุกข้อ แม้ผู้ใช้จะอนุมัติผลลัพธ์รวมแล้ว

### สิ่งที่ยังยืนยันไม่ได้จากแชทนี้

- ผลการพัฒนาในแชทใหม่ `Implement Luminous AR Frontend`
- การเปลี่ยนแปลง Requirement, Backend, Design หรือ Deployment ในแชทถัดไป
- สถานะระบบจริง ณ ปัจจุบัน
- ความถูกต้องเชิงตัวเลขของข้อมูลใน Comp; ภาพได้รับการอนุมัติด้านดีไซน์ ไม่ใช่การตรวจบัญชี
- รายละเอียดเต็มจาก Figma Community ทั้งสองไฟล์ เพราะแชทบันทึกว่าการเข้าถึงมีข้อจำกัด
- คำตอบผู้ช่วยบางช่วงต้นก่อนการออกแบบ ซึ่งในบริบทที่เข้าถึงได้มีเพียงข้อความผู้ใช้และสรุปย้อนหลังบางส่วน

ดังนั้นการสร้างระบบใหม่ควรนำเอกสารนี้ไปใช้เป็น **หลักฐานความต้องการและการอนุมัติด้าน Frontend ของแชทนี้** แล้วเทียบกับข้อกำหนดที่เปลี่ยนในแชทภายหลังก่อนกำหนดสเปกใหม่

