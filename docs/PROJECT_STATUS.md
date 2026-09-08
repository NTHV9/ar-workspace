# สถานะโครงการใหม่

## Checkpoint ล่าสุด — 8 กันยายน 2026 23:23 ICT: OPERA snapshot จริงและ Refresh

### Implemented / deployed / enabled
- Branch `codex/opera-refresh`; deployed source `4dfed578b17298aedf5e0c416cc9d0faef44f224` pushed to public `NTHV9/ar-workspace`.
- Worker `ar-workspace`: https://ar-workspace.ar-c82.workers.dev ; deployment `f82b7befcf7b4e758240a8a6131937b3`. Workflow `ar-workspace-refresh` version `b6b16f42-2e0f-448b-8b23-56ddbcd733c6`.
- Supabase `ar-workspace` / `jmyvpurzmoiecpydjrci`. Applied phase migrations: `20260908144712_ar_durable_refresh`, `20260908145545_ar_refresh_failure_recovery`, `20260908161054_ar_history_quality`. เพิ่ม private staging/jobs/quality, lease coordination และ atomic account/invoice publication; ไม่ reset/drop ข้อมูลเดิม.
- Worker secret_text ครบ OPERA_CLIENT_ID / OPERA_CLIENT_SECRET / OPERA_APP_KEY / SUPABASE_SECRET_KEY; ตรวจชื่อและชนิดโดยไม่อ่านค่ากลับ.
- Enabled on-open เมื่อเก่ากว่า30นาที และ Cron UTC `0 0,12 * * *` (07:00/19:00 ICT). ตรวจตั้งค่า Cron จริงแล้ว แต่ยังไม่มีหลักฐาน event ตามเวลารอบถัดไปเกิดแล้ว. ไม่มี auto-send.

### Tested จริง
- Full discovery + Current/history identity/balance reconciliation + atomic publish ผ่านทั้งสองโรงแรม: KAT105 accounts/699 Invoice rows, TSK70 accounts/104 Invoice rows. Account verified175; ไม่มี Invoice verification error/missing ในรอบแรก; staging เหลือ0.
- KAT run `984c2918-5648-4298-ac4e-5af9745d01a3` สำเร็จ23:19:08 ICT; TSK run `70348339-b19e-48d2-aac0-28b7d86f9c82` สำเร็จ23:18:49 ICT. ใช้ source `f7419ee` ซึ่งเป็น logic เดียวกับ release เปิด schedule.
- Browser ที่ login แสดง OPERA connected และ175 matching accounts จาก Supabase จริง. `/api/health` ตอบ database_verified / opera connected / deployed SHA ถูกต้อง. Unauthenticated/invalid-token Portfolio request ได้401 หลัง publication.
- Fresh on-open RPC ทั้งสองโรงแรมตอบ fresh/created=false. Repeat successful publish ไม่เพิ่ม quality rows: ยังคง175. Scope join/claim/renew/failure recovery ผ่าน transaction tests ก่อนหน้า; Browser refresh polling/scoped dispatch ใช้ synthetic interception เพื่อแยกจาก real ingestion.
- Private quality table และ publish RPC ไม่ให้ anon/authenticated อ่านหรือ execute. Frontend อ่านผ่าน user token/RLS; refresh writes ใช้ backend secret เท่านั้น.
- Typecheck/Build ผ่าน; Vitest89 tests/9files ผ่าน; Playwright5 tests ผ่าน. ตรวจ final deployed public access ซ้ำอีก1 testผ่าน. GitHub CI source4dfed57 ผ่าน: https://github.com/NTHV9/ar-workspace/actions/runs/34250387785 .
- ภาพ synthetic จาก Cloudflare 1440×900 และ1280×800 ทั้งสองหน้าตรวจเปิดดูแล้ว; test drawer1100×760/filter/sort/selection/back ผ่าน. ภาพจริงไม่เก็บใน Git; reference PNG ไม่เปลี่ยน.

### ข้อจำกัดที่ยังต้องแสดง
- OPERA history metadata รายงานน้อยกว่าจำนวนแถวที่ส่งจริง2แถวใน8บัญชี (KAT7/TSK1). เก็บ warning ต่อ account/run และแสดงคำเตือนใน UI; ตรวจทุกแถวที่รับและ exact Current nonzero Invoice membership/balance ก่อน publish. ไม่ตัดแถวให้ตรง total; discovery ยัง strict. สิ่งนี้ไม่ใช่การรับรองจำนวนประวัติย้อนหลังหรือการนำเข้าทุก closed Invoice/Payment แบบถาวร.
- Selected Statement GET เตรียม1รายการตรง scope/balance ผ่านทั้งสองhotel แต่ยังไม่ได้ native PDF bytes. Folio trial KATได้400, TSK sample ไม่มี selector; ยังไม่อ้าง PDF พร้อม. ไม่มี Statement generation POST, accounting write, Gmail send หรือ Drive operation.
- Billing/due/stage จริงยังไม่เชื่อม workflow; แสดง unavailable ตามจริง. Synthetic review แยกด้วย mode=review ไม่ปนข้อมูลธุรกิจ.
- รอบนี้พร้อมให้ตรวจข้อมูลจริงบนสองหน้าที่อนุมัติไว้; งาน native PDF และ Collection/Billing เป็นช่วงถัดไป.

## Checkpoint ระหว่างงาน — 8 กันยายน 2026: OPERA และ Refresh

- เจ้าของยืนยันหน้าตาสองหน้าแรก และอนุมัติขั้นเชื่อม OPERA/Refresh ต่อแล้ว.
- ปลายทางที่เจ้าของให้: gateway Mumbai `mtcb2pr.hospitality-api.ap-mumbai-1.ocs.oraclecloud.com`, enterprise `TSTLKL`, hotels `KAT`/`TSK`.
- เจ้าของกรอก OPERA_CLIENT_ID, OPERA_CLIENT_SECRET, OPERA_APP_KEY และ SUPABASE_SECRET_KEY ใน Cloudflare โดยตรง ตรวจพบเป็น secret_text; ไม่อ่านค่ากลับหรือเก็บใน Git.
- OPERA token, discovery หน้าแรก, Current Account, History และ Business Date ตอบสำเร็จทั้ง KAT/TSK. เป็นหลักฐาน sample read ไม่ใช่ full-import acceptance.
- Discovery environment จำกัด 20 records/page (HTTP400/OPERAWS-ODE09998 เมื่อขอ50); ปรับ pagination แล้ว. supplied openapi.json รุ่น26.3 ตรงสามGET contract ที่ใช้.
- Branch `codex/opera-refresh`; source ล่าสุดช่วงนี้ `3658897fd263bed83daa292d7f8faa214f281064` pushed/deployed. Workflow `ar-workspace-refresh` ใช้ Worker เดิมและ Workers plan เดิม ไม่มีแพ็กเกจเพิ่ม.
- Apply migration `20260908144712_ar_durable_refresh`: private runs/staging, per-hotel lease, full-scope atomic publish, source verification state, public member-only refresh status. Coordination test ใน transaction rollback ผ่าน; ไม่ seed customer/sample business rows.
- Typecheck/Build และ 54 tests ผ่านก่อน real refresh. กำลังตรวจ full discovery/current-history membership และ publication จริง; cron/on-open refresh ยังไม่ enabled จนกว่ารอบแรกผ่าน.
- รักษาภาพต้นแบบ/ข้อมูล/บริการเดิมทั้งหมด. ไม่มี OPERA accounting write, Gmail send หรือ Drive operation.

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
