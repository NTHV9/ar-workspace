# สถานะโครงการใหม่

## Checkpoint ล่าสุด — 8 กันยายน 2026: สองหน้าแรกบน Cloudflare พร้อมตรวจ

### Implemented / pushed / deployed

- เจ้าของอนุมัติเริ่มพัฒนา ใช้ GitHub, Supabase และ Cloudflare จริงตั้งแต่ต้น รวมถึงสร้าง Worker และ Supabase Project ชื่อ `ar-workspace`.
- GitHub `NTHV9/ar-workspace` เป็น **Public** ตรวจปลายทางและสิทธิ์ก่อน initial push; ใช้ branch `codex/first-increment`. ไม่มี force push หรือแก้ repository/บริการเดิม.
- Source commit ที่ deployment นี้ใช้: `818535b8a7a798881e2f3f2d71cdd710f66b4c2f` (pushed). Commit เอกสาร/ภาพหลักฐานที่ตามมาจะไม่เปลี่ยน source ของ deployment นี้.
- Cloudflare account `c82e3ca0932179eba19918aee28a9845`, Worker `ar-workspace`, deployment `04671d5ed465442b83494e875308fcfe`.
- Live URL: https://ar-workspace.ar-c82.workers.dev ; synthetic review: https://ar-workspace.ar-c82.workers.dev/?mode=review . หน้า root ต้อง Login ก่อนอ่านข้อมูลจริง.
- Supabase `ar-workspace`, ref `jmyvpurzmoiecpydjrci`, organization `ar-katathani`, region `ap-southeast-1`; organization เป็น Pro และ create-project cost tool ประเมินค่าเพิ่ม $0/month ก่อนสร้าง.
- ตรวจ public tables/migrations ว่างก่อน Apply migration `20260908132012_ar_foundation`. สร้าง `ar_accounts`, `ar_invoices`, `ar_account_settings`, member RLS, private authorization function, allowlist insert trigger และ health RPC ที่คืนเฉพาะ schema version.
- Private Storage bucket `ar-working-files` ไม่ public มีเฉพาะ member-read policy; ยังไม่มี upload/delete workflow. ไม่มีการ seed ข้อมูลธุรกิจสมมติ.
- React/Vite/TypeScript: shell, Portfolio comparative matrix, Account Detail, Hotel/Account Type/Account/Aging filters, column sort, Aging expansion, selection, right detail/drawer และกลับ Portfolio โดยรักษา query/sort/filter.
- ใช้ Cloudflare connector deploy เพราะ Wrangler ในเครื่องยังไม่มี OAuth session. Public assets ถูก pack ใน Worker module ตาม `scripts/build-connector-deployment.mjs`; ไม่มี secret ใน bundle. GitHub Actions ตรวจ typecheck/tests/build; ยังไม่เปิด auto-deploy workflow.

### Tested จริง

- `/api/health` ผ่าน HTTP จาก Cloudflare เรียก Supabase PostgreSQL RPC จริง ได้ `database_verified`; COMMIT_SHA ตรง source commit ด้านบน.
- `/api/portfolio` ไม่มี token → 401; invalid token → 401. บัญชีนอก allowlist และอีเมลไม่ยืนยัน → 403 ใน isolated unit tests.
- Database policy test ภายใต้ authenticated role: approved identity → true, unknown identity → false. Direct signup ของบัญชีสมมตินอก allowlist ถูกปฏิเสธ; ตรวจไม่มีผู้ใช้อื่นถูกสร้าง.
- เจ้าของสร้าง email/password user และใส่ Google client credential ผ่าน Dashboard โดยตรง. ตั้ง Site URL/redirect เฉพาะ Worker นี้; ปิด public signup/anonymous login; คง email confirmation.
- Google Login จากหน้า Cloudflare ผ่านการเลือกบัญชี/consent (email/profile เท่านั้น) และกลับหน้า live สำเร็จ. ตรวจ Supabase ได้ user เดียว มี identities `email` และ `google`.
- Email + Password: เจ้าของกรอกผ่านหน้าแอปและยืนยันเข้าได้; ตรวจ DOM หลัง login พบ live Portfolio/Sign out ไม่มี error และไม่มีข้อมูลสมมติปน. ไม่อ่าน/บันทึกรหัสผ่าน.
- Build และ Typecheck ผ่าน; Vitest **12 tests / 3 files ผ่าน**.
- Playwright **4 tests ผ่าน**: 3 tests ตรวจ deployed Cloudflare/API/UI; อีก 1 test intercept ด้วย fictional session/data ใน browser context แยก เพื่อพิสูจน์ snapshot/error/retry ไม่ใช่หลักฐาน OPERA หรือ real login.
- Browser behavior: filters, Total Open sort, Aging expand/collapse, selection/clear, Hotel + Account scope, กลับหน้ารักษาบริบท, right drawer ที่ 1100×760.
- ภาพ Cloudflare 1440×900 และ 1280×800 อยู่ใน `../evidence/` ใช้ synthetic review เท่านั้น; เปิดตรวจเทียบ PNG เดิมแล้ว ไม่เขียนทับ reference. `../evidence/visual-comparison.html` เปิดเทียบด้านข้างได้.
- Independent review พบและแก้: live aging ห้ามใช้สัดส่วนสมมติ, due ไม่ทราบห้ามเรียก Not billed, invoice Retry ต้องดึง ledger ซ้ำ, เก็บ same-user snapshot เมื่อ service ล้มและแยกข้อมูลข้าม session. Regression tests ผ่าน.
- GitHub Actions ของ source commit `818535b` ผ่าน: https://github.com/NTHV9/ar-workspace/actions/runs/34235030168 .
- Security advisor เคยเตือน leaked password protection หลังเปิด Auth; เปิดการป้องกันใน Email Provider โดยไม่เปลี่ยนรหัสผู้ใช้หรือซื้อ add-on. ตรวจซ้ำแล้ว `lints: []`.

### Enabled / ยังไม่ enabled และข้อจำกัด

- Enabled: Worker web/API, Supabase schema/RLS/private bucket, Google Login และ Email/Password Login. Google OAuth client ใหม่แยกจาก Client เดิมทั้งสอง; ไม่แก้ client เดิม.
- OPERA ยัง **not connected**: ต้องมี confirmed environment/base URL, Hotel IDs และ authorized secret-storage location/auth grant. ยังไม่ได้อ่านลูกค้าจริงหรือทดสอบ native PDF/selected-only; Gmail delivery และ Drive archive ยังไม่เชื่อม ไม่มีการส่งอีเมลหรือแก้บัญชี OPERA.
- Refresh 07:00/19:00 ICT และ on-open >30 นาทีเป็นค่าที่เจ้าของยืนยัน แต่ cron/shared OPERA refresh ยังไม่ enabled จนมี adapter; ปุ่ม Reload saved data อ่าน Supabase ไม่อ้างว่า refresh OPERA.
- Billing/Collection/PDF/editor/Gmail/Reports/History/Settings เต็มรูปแบบและ backup restore อยู่ถัดจากการตรวจสองหน้านี้; ไม่อ้างพร้อมใช้งานครบ.
- ภาพต่างจากแบบโดยตั้งใจ: synthetic labels, คำ stage ใหม่, ข้อมูลตัวอย่างชุดใหม่, คอลัมน์ % share เรียงได้ และงานเอกสารที่ยังไม่เปิดไม่มีปุ่มหลอกว่าทำงานแล้ว. Font Plus Jakarta Sans เป็นตัวเลือกใกล้ reference; exact original font ไม่ได้ให้มา. โลโก้จากเว็บไซต์ทางการ.
- Static assets ผ่าน Worker module fallback ในรอบนี้; เปลี่ยนใช้ Wrangler Static Assets ได้หลัง CLI authorization เพื่อลด invocation ฝั่ง static โดยไม่ต้องเปลี่ยน UI.
- ไม่มี Secret/Token/Password/service-role/customer PDF/JSON/screenshot จริงใน Git. ภาพหลักฐานมีแต่ synthetic; reference PNG เดิมรักษา hashes.

ขั้นถัดไป: เจ้าของตรวจ Portfolio และ Account Detail ที่ deploy แล้วก่อนขยายหน้าอื่น. รอข้อมูลเชื่อม OPERA อย่างปลอดภัยเมื่ออนุมัติงานช่วงถัดไป.

## การเตรียมโฟลเดอร์จริง — 8 กันยายน 2026

- โฟลเดอร์ที่จัดเตรียม: `C:\Users\naruethorn.t\Documents\ChatGPT\katathani-ar-workspace`
- แตกเอกสารจาก `Katathani_AR_Codex_Handoff.zip` จำนวน 10 ไฟล์ โดยให้ `AGENTS.md`, `README_START_HERE.md`, `docs/` และ `prompts/` อยู่ที่ราก ไม่มีโฟลเดอร์ห่อ ZIP ซ้อน
- เปิดดูและคัดลอกภาพต้นแบบครบ 7 ภาพไว้ใน `../references/design/` จาก core worktree ภายใน AR DB โดยคงชื่อและ bytes เดิม
- บันทึกข้อความ Frontend ที่เจ้าของให้จาก Phase 2 (4) ใน `../references/design/CODEX_DESIGN_NOTES.md` พร้อมระบุว่าไม่ใช่สถานะล่าสุดทั้งโปรเจค
- เพิ่ม `../references/LEGACY_REFERENCE_NOTES.md` เป็นข้อมูลอ้างอิง ไม่มีอำนาจเหนือสเปกใหม่ และไม่คัดลอกโค้ด/schema/config เดิม
- หลักฐานตรวจรับไฟล์และข้อจำกัดอยู่ใน `../references/HANDOFF_VERIFICATION.md`
- ยังไม่มีแอป, scaffolding, Git repository ใหม่, commit/push, migrations, การเชื่อมบริการ, deploy หรือการส่งอีเมล
- โครงการเดิมยังมีงานค้างและไฟล์ untracked ซึ่งรักษาไว้ตามเดิม ไม่อัปเดต PROJECT_STATUS ของระบบเก่าเพราะคำสั่งรอบนี้ห้ามแก้ไฟล์เดิม
- ไม่พบ `AGENTS.md` ในโฟลเดอร์บรรพบุรุษที่ตรวจตั้งแต่ `C:\` ถึง `C:\Users\naruethorn.t\Documents\ChatGPT`; ไม่ได้แก้ global/parent configuration หรืออ้างว่าได้ตรวจทุก global setting

ขั้นถัดไป: เจ้าของเปิดโฟลเดอร์ใหม่นี้เป็นโปรเจค แล้วให้คำสั่งต่อ รอบนี้หยุดที่การเตรียมเอกสาร ไม่เริ่มขั้นวางแผน/พัฒนาจาก prompt ใน ZIP โดยอัตโนมัติ

## บันทึกเดิมที่มากับ ZIP

ข้อความด้านล่างเป็นสถานะขณะจัด packet ก่อนเติมภาพและ notes ในเครื่อง ไม่ใช่รายการสิ่งที่ขาดหลังการเตรียมครั้งนี้ ให้ใช้ checkpoint ด้านบนและ HANDOFF_VERIFICATION สำหรับสถานะปัจจุบันของโฟลเดอร์

อัปเดตล่าสุด: 8 กันยายน 2026 — จัดชุดเอกสารส่งต่อเท่านั้น

## ทำแล้วในรอบ handoff นี้

- รวบรวมข้อกำหนดล่าสุดจากบทสนทนาที่เห็น
- แยกสิ่งยืนยัน/ข้อเสนอ/เรื่องที่ต้องพิสูจน์
- จัดรายการดีไซน์ต้นฉบับและคำสั่งสรุปแชท Codex เดิม
- จัดตัวอย่าง acceptance scenarios และข้อกำหนดไม่ให้ของเก่าติดมา

## ยังไม่ได้ทำ

- ยังไม่ได้สร้างโครงการหรือแชทใหม่ใน Codex ให้ผู้ใช้
- ยังไม่ได้สร้าง/แก้ GitHub repository หรือ push/commit
- ยังไม่มี code scaffolding, app implementation หรือ database migrations ใหม่
- ยังไม่ได้สร้าง/เลือก Cloudflare/Supabase resource หรือแก้ schema
- ยังไม่ได้เชื่อม OAuth, อ่านค่าลับ, ส่ง Gmail, อัปโหลดหรือลบ Drive files
- ยังไม่มี PNG ต้นฉบับ 7 ภาพหรือคำอธิบายดีไซน์จาก Codex chat แนบใน packet
- ยังไม่ได้แนบ JSON/PDF ลูกค้าจริงใน packet
- ยังไม่ได้ทดสอบ provider/runtime/PDF editor/backup restore ของระบบใหม่

## ขั้นถัดไป

เจ้าของเปิดโฟลเดอร์ใหม่และแชทใหม่ใน Codex วางเอกสารชุดนี้ นำดีไซน์และคำอธิบายเก่าที่ต้องการมาเป็น reference-only ให้ Codex อ่านแล้วสรุป scope, missing inputs และ phase plan ก่อนเขียนแอป

## กติกาอัปเดตต่อไป

เมื่อเริ่มทำจริงให้ระบุ phase, files/resources ที่เปลี่ยน, สิ่งที่ทดสอบพร้อมผล, สิ่งที่ยังไม่ได้พิสูจน์, blockers เฉพาะงาน และ next action ไม่อ้าง status ของระบบเก่ามาแทนหลักฐานของระบบใหม่
