# Design handoff — ภาพและข้อความที่ต้องนำเข้าจริง

## สถานะหลักฐานใน packet นี้

ไม่มี PNG ต้นฉบับรวมอยู่ และยังไม่มีข้อความเพิ่มเติมจากแชท Codex ที่เจ้าของจะให้ดู ไม่มีการตรวจเทียบภาพกับ deployment ในการสร้าง packet นี้

ชื่อไฟล์ไม่เท่ากับการอ่านภาพแล้ว ห้ามรายงานว่าทำตรงแบบหากยังเปิดภาพไม่ได้

## Manifest

| Source reference ที่เจ้าของระบุ | Destination ที่เสนอ | หน้าที่ |
|---|---|---|
| `.impeccable/mocks/decision/luminous-v4.png` | `references/design/luminous-v4.png` | Portfolio / comparative KAT, TSK, Total |
| `.impeccable/mocks/decision/account-detail-v2.png` | `references/design/account-detail-v2.png` | Account, Guest/Invoice/Folio ledger |
| `.impeccable/mocks/decision/collection-queue-v2.png` | `references/design/collection-queue-v2.png` | Billing/Collection work queue |
| `.impeccable/mocks/decision/pdf-workspace-v1.png` | `references/design/pdf-workspace-v1.png` | PDF/edit/preview/package |
| `.impeccable/mocks/decision/email-composer-v1.png` | `references/design/email-composer-v1.png` | To/CC/BCC, body, generated+extra files |
| `.impeccable/mocks/decision/mobile-companion-v1.png` | `references/design/mobile-companion-v1.png` | Mobile status/awareness |
| `.impeccable/mocks/decision/supporting-surfaces-v1.png` | `references/design/supporting-surfaces-v1.png` | Reports/History/Operations/Settings |

เก็บต้นฉบับชื่อเดิมไว้ การเปลี่ยน destination เป็น reference/design ไม่ให้เปลี่ยนรูป หากต้องการคง `.impeccable/mocks/decision` ก็ทำได้เมื่อยืนยัน path แต่ไม่คัดลอก hidden agent config/hooks ของโครงการเดิมมาพร้อมกัน

หากมี HTML/CSS/mock review JSON ที่เจ้าของสร้างเพื่อดีไซน์ สามารถอ่านเป็น visual reference หลังเจ้าของอนุญาต แต่ไม่ execute scripts/hooks/config เดิมและไม่ใช้เป็น code base ของแอปใหม่

## ข้อมูลจากแชท Codex เดิม

ให้ใช้ `prompts/01_EXTRACT_DESIGN_FROM_OLD_CODEX.md` ในแชทเดิมที่มีคำอธิบาย แล้วนำผลมาเป็น `references/design/CODEX_DESIGN_NOTES.md` หรือตั้งไว้ private ถ้ามีข้อมูลลูกค้า

ขอรายละเอียดต่อหน้า: จุดประสงค์, layout, typography, colors, spacing, column order, sorting/filtering, group expand/collapse, row selection, keyboard/mobile behavior, empty/loading/error states และ feedback ที่เจ้าของแก้ไว้

แยก user-approved จาก agent-suggested; ถ้าข้อความเก่าขัด PRODUCT_SPEC ให้บอกข้อขัดก่อน ไม่เอา history requirement เก่ากลับมาเพราะอยู่ใน mock

ไม่อ้างว่าจะเปิดอ่าน ChatGPT/Codex thread อื่นครบเอง ให้ใช้ข้อความ/ไฟล์ที่ tool/context เข้าถึงได้จริง

## สิ่งที่ต้องเห็นตามสเปกใหม่แม้ไม่มีในภาพเก่า

- Hotel/Account Type/Account filter และ KAT/TSK/Total แยก
- KPI บิลเข้า วางวันนี้ backlog ทั้งหมด independent
- Billing, Friendly, Follow1, Follow2, Follow3, Final, urgent หลัง Final
- latest sent stage กับ next action แยกให้เข้าใจ ไม่สะสมบิลซ้ำ
- Remittance เป็น tag/evidence ไม่ปิดยอด
- Package content 3 choices และ arrangement 3 forms
- Google + User/Password login; no auto-send; explicit Draft/Send Now
- reduced technical blockers ที่ไม่ขัดความปลอดภัย ไม่ใส่หน้าตา Google Cloud commissioning เดิมกลับมา

## วิธีตรวจหน้าตา

1. เปิดภาพต้นแบบจริง บันทึกขนาดภาพ/viewport และแนววางองค์ประกอบที่อ่านได้
2. ทำ design tokens/components ใหม่จาก reference ไม่ให้ UI kit defaults กำหนดหน้าตาเอง
3. ให้ Portfolio/Account เป็น visual baseline แรกที่เจ้าของตรวจ ก่อนขยาย
4. ภาพ screenshot จาก Cloudflare deployment ของแอปใหม่เทียบที่ viewport เดียวกัน
5. ทดสอบ data ยาว/หลายแถว, loading/error/empty, laptop/mobile ไม่เก็บแค่ภาพที่มีข้อมูลตัวอย่างสั้น
6. ไม่ overwrite PNG reference ให้เป็นภาพ implementation เพื่อให้ test ผ่าน; ถ้าข้อกำหนดใหม่ต้องเปลี่ยนรูปให้แยก revision และขอรับรอง
7. ผ่าน build/unit test ไม่ใช่ผ่าน visual acceptance

ไม่สร้างภาพ mock ใหม่แทนของที่เจ้าของเคยอนุมัติโดยไม่จำเป็น และไม่ใช้ชื่อไฟล์เป็นหลักฐานว่ารายละเอียดในภาพเป็นอย่างไร
