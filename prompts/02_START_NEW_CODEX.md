# ข้อความเริ่มงานในโครงการ Codex ใหม่

เราจะสร้าง Katathani AR Collection System ใหม่ทั้งหมด ไม่ใช่ refactor/migrate แอปเก่า และไม่ต้องนำ source code, database schema, AGENTS, workflows, deployment gates หรือ dependencies ของโปรเจคเดิมมาใช้เป็นฐาน

กรุณาตรวจว่ากำลังทำงานในโฟลเดอร์โครงการใหม่ที่ฉันเปิดอยู่ และรายงาน instruction sources ที่มีผล โดยไม่แก้ global/parent instructions เอง

อ่านตามลำดับ:
1. AGENTS.md และ README_START_HERE.md
2. docs/PRODUCT_SPEC.md
3. docs/DECISIONS_AND_OPEN_ITEMS.md
4. docs/DESIGN_HANDOFF.md
5. docs/INTEGRATION_VALIDATION.md
6. docs/ACCEPTANCE_CHECKLIST.md
7. docs/PROJECT_STATUS.md

จากนั้นอ่าน PNG ต้นแบบทั้งเจ็ดที่ references/design/ และ CODEX_DESIGN_NOTES.md ที่ฉันจะนำมาจากแชทเดิม หากภาพหรือคำอธิบายยังไม่มี ให้รายงานตรง ๆ ไม่สร้างภาพใหม่ทดแทนและไม่อ้างว่าอ่านแล้ว

ข้อยืนยันล่าสุดของฉันและ PRODUCT_SPEC เป็นฐานธุรกิจใหม่ รูปและ Codex notes เป็นฐานดีไซน์ เมื่อขัดกันให้ยึดข้อยืนยันล่าสุดและแจ้งข้อขัด อย่าเอาโค้ด/สเปกเก่ากลับมามีอำนาจเหนือข้อกำหนดใหม่

โครงหลักคือ Cloudflare + Supabase; Next.js ไม่บังคับ; React+Vite เป็นข้อเสนอ งานปกติใช้ PDF ต้นทาง OPERA แก้ได้อิสระแต่ไม่แก้บัญชีใน OPERA อนุญาตผลจากการพิมพ์เอกสาร มี Google+User/Password login เฉพาะ ar@katathani.com, มี Draft+Send Now โดยคน ไม่มี auto-send และ Follow3/Final/Urgent ต้องเห็นบนเว็บ

รอบแรกให้ทำเฉพาะ:
- สรุปความเข้าใจทุกหมวดและชี้ข้อกำหนดที่อาจตกหล่น
- ทำรายการไฟล์/ข้อมูลที่ได้รับจริงกับที่ยังขาด
- แยกเรื่องที่ตกลงแล้ว ข้อเสนอ และ API/editor/runtime facts ที่ต้องพิสูจน์
- เสนอ architecture/data model/ลำดับงานและวิธีตรวจหน้าตา โดยไม่พึ่งโครงเก่า
- เสนอแผนแบ่งระยะให้ฉันตรวจ ไม่ทำเว็บทั้งหมดในครั้งเดียวแล้วค่อยให้ฉันดู

ยังไม่เริ่ม scaffold/เขียนแอป/สร้าง resource เสียเงิน/แก้ DB/Deploy/ส่ง Gmail/ลบ Drive หรือของเก่า จนฉันตรวจแผนระยะแรกก่อน หลังยืนยันแล้วทำงานตามระยะ โดยใช้ Cloudflare/Supabase และ provider จริงในขอบเขตที่อนุญาต พร้อมรักษาการทดสอบผิดพลาดแบบจำลองด้วย

ห้ามนำข้อมูลลูกค้าหรือ Secret เข้า Git/Browser/log ชุด handoff ไม่มีผู้รับ test email แบบใช้ครั้งเดียวและไม่มี target project/folder IDs ต้องขอเฉพาะข้อมูลที่ยังไม่มีจริงเมื่อถึงขั้นใช้งาน ไม่เดาปลายทาง

ตอบฉันเป็นภาษาไทยที่เข้าใจง่าย ส่วน UI/report ของแอปเป็นภาษาอังกฤษตามสเปก และอัปเดต PROJECT_STATUS ด้วยผลจริงทุกระยะ
