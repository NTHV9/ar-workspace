# ข้อความสำหรับวางในแชท Codex เดิม

เราจะสร้าง Katathani AR Web App ใหม่ทั้งหมดบน Cloudflare + Supabase โดยไม่ใช้โค้ดหรือโครงแอปเดิม

งานครั้งนี้เป็นการสรุปข้อมูลดีไซน์แบบอ่านอย่างเดียว ไม่แก้แอปเดิม ไม่ Commit/Push/Deploy ไม่เปลี่ยน Credential/Cloud/Database และไม่ส่งอีเมลหรือลบไฟล์

ช่วยสรุปข้อกำหนดและ feedback เรื่องหน้าตาที่ฉันเคยให้ในแชทนี้ โดยอ่านเฉพาะข้อความและไฟล์ที่คุณเข้าถึงได้จริง แล้วจัดผลเป็น Markdown สำหรับนำไปชื่อ CODEX_DESIGN_NOTES.md ในโครงการใหม่

อ้างอิงภาพ:
- .impeccable/mocks/decision/luminous-v4.png
- .impeccable/mocks/decision/account-detail-v2.png
- .impeccable/mocks/decision/collection-queue-v2.png
- .impeccable/mocks/decision/pdf-workspace-v1.png
- .impeccable/mocks/decision/email-composer-v1.png
- .impeccable/mocks/decision/mobile-companion-v1.png
- .impeccable/mocks/decision/supporting-surfaces-v1.png

ต่อหน้าให้บอก:
1. จุดประสงค์/องค์ประกอบหลัก/การจัดวางและการใช้งาน
2. สิ่งที่ฉันอนุมัติชัด กับสิ่งที่คุณเคยเสนอแต่ฉันยังไม่ได้ยืนยัน
3. สี ตัวอักษร ระยะห่าง ตาราง คอลัมน์ filter sort selection/expand-collapse ที่มีหลักฐาน
4. Feedback ที่ฉันสั่งแก้และสิ่งที่ต้องหลีกเลี่ยง
5. Desktop/laptop/mobile behavior และ state empty/loading/error ที่กำหนดไว้จริง
6. Path ของ PNG และ mock description/HTML ที่เกี่ยวข้องที่มีอยู่จริง
7. ส่วนไหนขาดบริบท อ่านไม่ได้ หรือมีข้อขัดกัน ห้ามเดาหรืออ้างว่าครบเมื่อไม่ครบ

อย่านำ business rules, deployment gates, credential policy exceptions หรือ source code เดิมมาเป็นข้อกำหนดของโครงการใหม่ ใส่เงื่อนไขที่ปรากฏใน mock เฉพาะเป็นบริบทและแยกจากดีไซน์ เพราะจะมีสเปกธุรกิจใหม่จาก ChatGPT มาใช้แทนส่วนที่ขัดกัน

อย่ารวม Secret, Token, ข้อมูลลูกค้าจริง หรือผู้รับอีเมลทดสอบแบบใช้ครั้งเดียวในผลสรุป ไม่ต้องคัดลอกภาพ/ไฟล์ออกไปปลายทางที่ยังไม่ระบุ ให้รายงานแหล่งและสรุปข้อความก่อน
