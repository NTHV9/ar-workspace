# สถานะโครงการใหม่

## Checkpoint Modern Dashboard and current Aging — 12 กันยายน 2026

- Implemented: ปรับ Dashboard ให้เห็นจำนวนบิลและยอดค้าง/ยังไม่วางบิล/Past Due date/อายุเกิน60วันทันที พร้อมกราฟสัดส่วนวางบิลและlatest Follow-Up. กิจกรรมตามช่วงวันอยู่คนละส่วนกับยอดค้างณวันสิ้นสุด; รายละเอียดจำนวน/ยอด/%และdrilldownยังครบ
- Current Aging: ภาพรวมNet openและ6ช่วงอายุ เทียบTSK/KAT/Totalจากข้อมูลปัจจุบัน. คงmatrixครบเป็นdefault; ปุ่มColumnsเลือกSummary/All aging/ซ่อนแสดงช่วง/Net open/% ได้. ตัวเลือกคงอยู่หลังเจาะAccount/Invoiceและย้อนกลับ ไม่มีTop Nหรือรวมledgerข้ามโรงแรม
- Fixed: current totalsไม่ถูกทำให้unavailableเพราะlatest refreshกำลังqueued/runningหรือfailedเมื่อมีpublicationที่ยืนยันแล้ว. Same-scope Reloadคงresponseเดิมพร้อมสถานะ; เปลี่ยนวัน/hotel/account/userไม่ใช้ค่าค้างจากscopeเดิม. ไม่เปลี่ยนunknownเป็นzeroหรือสร้างประวัติย้อนหลัง
- Tested locally: Typecheck/Buildผ่าน, Vitest869tests/96files, portable PostgreSQL64migrations+22rollbackfixturesผ่าน, browser39casesผ่าน. Red reproductionยืนยันทั้งSQL queued-refreshและbrowserReloadก่อนแก้. Synthetic screenshots1440/1280/390และcolumn/drill/contextทดสอบแล้ว. ชุดconfirmครั้งหนึ่งล้มเพราะshareddevserverถูกหยุด; rerunกับserverแยก39casesผ่าน ไม่ใช่productfailure
- Review: scoped period reviewแก้accessible count/amount descriptionsและhotel captionเมื่อเลือกAccount; integrated backend/Aging reviewผ่าน ไม่มีข้อค้าง. Supabase apply20260911201752_ar_dashboard_publication_freshnessสำเร็จ (แก้readerfunctionเท่านั้น); actual read complete=true/unverified0/freshness arraysว่างในรอบsucceeded, anon/authenticatedไม่มีRPCEXECUTE. Database61951123bytes. Deploy/mergeเสร็จแล้วตามหลักฐานด้านล่าง
- No email sends, OPERA accounting writes, customer-file cleanup, paid add-ons or new stored history tables in this change.
- Deployed source `9733c85a7b1b2378e5b95e1d5af31c55a9102cb2`, Worker version `e293a829-8adf-40dd-ba6e-54d90dd7ae5e` ที่ https://ar-workspace.ar-c82.workers.dev . Healthยืนยันexactcommit/database_verified/OPERAconnected. Cloudflare browser57casesผ่าน รวมDashboard/Reports/Portfolio/Account/PDFregressionsและscreenshotssynthetic. ภาพmodern-dashboard-*ที่จับจากdeployedassetsตรงกับlocal
- Actual authenticated UI: ยอดค้างจริงแสดงครบก่อนRefresh; กดOPERARefreshจริงทั้งKAT/TSKแล้วReloadDashboard ยอดยังแสดงพร้อมlastverifiedpublicationnotice. Hostedreadระหว่างรันcomplete=true/unverified0/refreshingHotels=[KAT,TSK]. ทั้งสองรอบสำเร็จเวลา03:24ICT (12Sep). LiveAgingเลือกSummaryและAllagingได้ตามจริง. NewAPIsunauthenticated401; securityadvisorมีINFO1รายการ RLS/no client policy ไม่พบWARN/ERROR
- [PR #15](https://github.com/NTHV9/ar-workspace/pull/15) merged `934d491e46ed32b3adb2a0c7fa3ceb5c507b13c1` หลัง [CI](https://github.com/NTHV9/ar-workspace/actions/runs/34643664152) และอีกpushCIสำเร็จ. Mergedtreeตรงกับtested/deployedsource; closeoutเปลี่ยนเฉพาะเอกสาร
- Limits: วันที่ย้อนหลังที่ไม่มีsnapshotยังแสดงunavailableตามจริง; source/mapping/Duedateที่ยังไม่ยืนยันยังเป็น—เฉพาะmetricนั้น. ไม่ใช้ข้อมูลสมมติแทนเงินจริง. Agingcolumnpreferencesคงระหว่างnavigationในsession; ไม่บันทึกเป็นค่าถาวรของบัญชีผู้ใช้



## Checkpoint Dashboard period analysis and current Aging — 12 กันยายน 2026

- Implemented: ReportsแสดงExternal billing activityหน้าเดียว; old financial/observation bookmarksไปDashboardอย่างปลอดภัย. Dashboardมีวันเดียว/ช่วงวัน/presets, scopeตามโรงแรม/Account Type/Account, จำนวนและยอดค้างณวันสิ้นสุดช่วง, latest actual Follow-Up stages และกิจกรรม/เงินรับของช่วง. ใช้คำPast Due dateแยกOPERA age
- Current Agingไม่รับdate filter. Matrixครบ6source bucketsพร้อมTSK/KAT/TotalในแถวAccount Type/Accountเดียวกันและ%ของsource net. เจาะAccount/Invoice, pagination/sort/search, sourceเครดิตและparent-child, exact bucket-schema guard, owner isolation และกลับจากAccount Detailโดยคงcontext. Sourceกับinvoice evidenceที่ไม่ตรงกันแสดงชัด
- Period/detailมีpaginationโดยsummaryไม่ถูกจำกัดด้วยpage, unknown/date/source/classificationไม่เป็น0, billing classification unavailableมีแถวแยก. Source refreshแบ่งช่วงไม่เกิน365วันต่อคำขอ; retryเก็บconfirmed receiptของทุกsubrequestจนทั้งชุดยืนยันแล้ว; หยุดdispatchเมื่อออกหน้า/เปลี่ยนtoken. Poll global runningจนงานเก่าที่อยู่นอกlatest10runsจบ
- Supabase applied:20260911185831_ar_dashboard_period_balances และ20260911190946_ar_dashboard_confirmed_nonpositive บนproject jmyvpurzmoiecpydjrci. เพิ่มprivate daily captures/invoices/capture_state, protected read RPCsและpublisher/workflow/SENT hooks; follow-upviewแยกknown-cleared nonpositiveจากpositive-debt scopeโดยคงunknown/missing-is-not-zero guard. Localfilenamesตรงservice-assigned versions; ไม่แก้applied migrationย้อนหลัง
- Hosted ACL/RLSตรวจแล้ว:3newprivate tablesไม่ให้anon/authenticatedอ่าน; namedRPCsเฉพาะservice_roleและตรวจactor. Unauthorized actorปฏิเสธ. Security advisorมีINFOเฉพาะprivate RLS/no client policy ไม่พบWARN/ERROR
- Live verification: genuine whole-hotel OPERA refreshสำเร็จทั้งKAT/TSK, actualcurrentRPC complete=true/unverified=0 และcapturedtodayครบ. TSK recaptureเฉพาะวันนี้จากlatest genuine publicationหลังแก้view โดยคงsource timestampและใช้capture timeจริง; ไม่เขียนย้อนหลังหรือแก้OPERA. Historical31Augไม่มีcaptureและคืนunavailableตามจริง. ตารางประวัติใหม่ประมาณ0.38MiB ณตอนตรวจ; capและdatabase headroomทำงาน
- Tested: Typecheck/Buildผ่าน; Vitest867tests/96files; portable PostgreSQL63migrations +5rollbackfixturesผ่าน, providerRequests0และserverหยุดแล้ว. Scoped Aging/backendและbroad source reviewsแก้findingsแล้ว รวมSENT finalization timing, missing-account false zero, source/classification gaps และmulti-hotel retries
- Local browser55casesผ่านในfinalmixedrun; live-onlyhealthcaseที่ถูกส่งไปViteตอบHTMLจึงไม่นับผ่านและจะรันบนCloudflare. เพิ่มvisualconfirm5casesผ่านที่1440x900/1280x800/390. Publicevidenceเป็นsyntheticเท่านั้น: dashboard-period-*และdashboard-aging-*; เก็บข้อมูลจริง/SQLรายละเอียดส่วนตัวนอกGit. Detector26advisoryจากincumbenttokens/typography ไม่มีhigher findings
- ไม่มีemail sends, OPERA accounting writes, customerfiledeletion, DNSchanges หรือpaid add-ons. Retained original design PNGsและPDF/editor regressions
- Deployed source `d1b7d6e4b63d62912ff42bf176b6136dbc592f41`, Worker `b7ffb653-af32-41db-8574-d00b81c95e7d` ที่ https://ar-workspace.ar-c82.workers.dev . HealthยืนยันSHAตรง/database_verified/OPERA connected. NewDashboardAPIทั้งสองปฏิเสธunauthenticatedด้วย401
- Cloudflare browser **51casesผ่าน** รวมdate ranges/current Aging/drill/back/Reports/partial retry/cancellation/source gaps และPDF/Account regressions. Live-onlyhealthcaseผ่านบนCloudflareแล้ว. ภาพหลักฐานใหม่ใช้syntheticfixturesและตรงกับdeployedassets
- ตรวจผ่านในbrowserที่ลงชื่อเข้าใช้จริงด้วยGoogleflowเดิม: Dashboardแสดงconfirmedclosingtotalและปุ่มdetail, Agingแสดงcomparisonrowsจากข้อมูลจริง, ReportsมีExternalbillingและไม่มีcontrolsที่ตัดออก. ไม่เก็บcustomerpagecontentหรือauthcodeลงGit; ไม่ได้อ้างการทดสอบPasswordใหม่ในรอบนี้
- [PR #14](https://github.com/NTHV9/ar-workspace/pull/14) Mergeแล้ว `6ec82c459b56af6ae3db1f9cf4284bc1fe9f16b5` หลัง [CIผ่าน](https://github.com/NTHV9/ar-workspace/actions/runs/34639068905); mergetreeตรงtested/deployedsource. โค้ดscopeนี้พร้อมให้เจ้าของตรวจหน้าตาและนิยามตัวเลข; วันก่อนเริ่มเก็บรายInvoiceยังunavailableตามจริง

## Checkpoint Direct typing, content flow and whole-page Preview — 11 กันยายน 2026

- Implemented: พิมพ์แก้บนหน้าเอกสารโดยตรงด้วย caret/selection และ Enter; กล่องด้านขวาเป็นตัวเลือกสำรอง. รักษาการวาด glyph ของต้นฉบับบน canvas และใช้ Unicode caret metrics ที่ปรับให้สอดคล้องกัน. ข้อความ/แถวเพิ่มแล้วดันเนื้อหาถัดไป รวมถึงส่วนท้ายลง พร้อมหน้าต่อเมื่อเกิน sheet เดิม. ตัว editor เก็บ logical source section; Preview แสดงจำนวนหน้าที่ออกจริง
- แก้ Helvetica/WinAnsi ordinary-character mapping กรณีเติม lowercase n ในรหัส Statement. Private system-generator KAT/TSK samples มี45runsต่อไฟล์ รองรับn45/45; qualifying regular Helvetica9 field unchanged มี0 pixel differenceที่3x และเพิ่มnเรนเดอร์ได้. Native Invoice ยังมีบาง combined/subset groups ที่ต้องเลือกฟอนต์เอง ไม่อ้างรองรับทุกglyph
- Tolerant editor render เก็บ source artwork และ edits ที่ถูกต้องไว้เมื่อ layer ใดมีปัญหา; เตือนสั้น ๆ แยกจาก artwork ไม่ยัด exception text ลงรูปย่อ. Strict export ยังคงปฏิเสธ unresolved edits. ไม่มีการส่งไฟล์ที่ละทิ้งข้อความแก้ไขเงียบ ๆ
- New flow extent ไม่เปลี่ยน native sheet size. Source-fragment compositor และ per-sheet raster รักษาความละเอียด300dpiภายใต้20MPต่อsheet; ไม่ย่อภาพยักษ์หลายหน้ามาใช้ทั้งไฟล์. Pagination เลี่ยง text lines/ordinary native images เมื่อทำได้, รักษา footer และ thin vertical rules, trim unused source whitespace. หน้าที่ไม่แก้ยัง copy native
- Typing spacers มี ownership metadata. Shrink ตรวจ source fragments + text/overlay occupancy; move destination ที่ทับพื้นที่ยกเลิก ownership. One multiline paste มากกว่าหนึ่งsheetทำได้ภายใต้ total extent limit; Undo/Redo และ paste/shrink tests ผ่าน. ปรับ dense-row geometry อ้าง line positions แทน bbox paddingที่ทำให้แทรกแถวปกติไม่ได้
- Final Preview เริ่ม Fit page เห็นทั้ง4ขอบ; มี Fit width/numeric zoom, Previous/Next/page selector. ต้องเห็นทุก output page/fileก่อน acknowledgment. เก็บ visited state แยกจาก rendering state และกัน stale file/page renders. Preview overlayบัง editor handles และย่อ controls ให้พื้นที่เอกสารมากขึ้น
- Tested local: Typecheck/Build ผ่าน; Vitest846tests/94files; Playwright57cases (56 related flows + 1 app-canvas font-preservation regression). รวม exact typing, missingglyph source-preservation, dense9pt/10.5leading row insertion,85-line paste/shrink, footer on continuation, high-resolution output, native images/rules, original style/reload, full-page1280/1440, pending/render guards และ email handoff. Independent review2findingsแก้และre-reviewผ่าน
- Public evidence เป็นsynthetic: pdf-direct-typing-1440/1280.png และ pdf-fit-page-1440/1280.png. Private source samplesไม่เข้าGit. ไม่แก้ database/integration/OPERA ledger หรือส่ง Gmail ในรอบนี้
- Limits: เป็นการแก้ PDF แบบพิมพ์ตรงและflow ไม่ใช่ Microsoft Word/DOCX engineเต็มรูปแบบ. Source text groupsบางแบบ/ฟอนต์หรือglyphที่ไม่มี/ภาพสูงเกินsheetยังมีข้อจำกัด. Existing solid source masksอาจเปลี่ยนพื้นหลังสีหรือเส้นใต้ข้อความ; source print page labelsและfinancial totalsไม่ปรับคำนวณใหม่อัตโนมัติ. ผู้ใช้ตรวจactualPreviewก่อนส่ง
- Deployed source `0240e56516fcab18777571850e7a963cd4ab52c2`, Worker version `d0c6667b-e1d9-41a8-83ac-08701d7bf901` ที่ https://ar-workspace.ar-c82.workers.dev . Health ยืนยัน SHA ตรงและ `database_verified`. ใช้ --keep-vars คง bindings/cron/secretsเดิม
- Cloudflare browser **28 cases ผ่าน** รวม direct typing, Fit pageที่1440×900/1280×800, original-font canvas regression, actual export/Preview, exact reviewed-byte email handoff, pending/Back guards, auth และ Portfolio/Account regression. API/PDF data ในUI testsเป็นsyntheticทั้งหมด; ภาพใหม่ทั้ง4ไฟล์จับจากdeployed assetsแล้วตรงกับภาพlocal. ไม่อ้างการส่งอีเมลจริง
- [PR #12](https://github.com/NTHV9/ar-workspace/pull/12) Merge แล้ว `b85fb56be2a9417ee149e519af689ca22f200fc0` หลัง [CI ผ่าน](https://github.com/NTHV9/ar-workspace/actions/runs/34609284650); merge treeตรงกับsourceที่deploy/test. ไม่มี migration/บริการหรือadd-onเสียเงินเพิ่ม

## Checkpoint PDF source editing and native objects — 11 กันยายน 2026

- Implemented: เอาข้อความเตรียมเอกสาร/Statement สองย่อหน้าที่เจ้าของระบุออก. PDF Workspace คลิกข้อความต้นฉบับได้โดยตรงและโฟกัสช่องแก้ไข, + Line / − Line, กรอบขยายตามข้อความโดยไม่ย่อฟอนต์, Restore original formatting และแยก Position & size ไว้ใน disclosure
- Source text ใช้ font/glyph mapping, size, RGB color, baseline, spacing และ weight/italic จาก PDF.js. ไม่ใช้ Arial/navy/padding เป็นค่าแทนข้อความต้นฉบับโดยเงียบ ๆ. Embedded subset ใช้ fontChar ที่ตรง glyph; non-composite fonts รองรับตัวอักษรเพิ่มเติมจาก mapping ที่ตรวจได้. References ที่เปิดใหม่ผูกกับ source/current loader; ไม่รับ arbitrary CSS/font URLs จาก editor JSON และล้าง private runtime font state เมื่อปิดเอกสาร
- เพิ่ม Add row below / Delete row: แถวว่างมีเซลล์ที่แก้ได้, source/layers ด้านล่างเลื่อนตาม, รักษาเส้นแนวตั้งที่ผ่านรอยต่อจริง. ไม่คำนวณ totals ใหม่. ตรวจ source text และ editable-layer intersections ก่อนเปลี่ยนหน้า และปฏิเสธ insertion ที่จะตัดเนื้อหาด้านล่างทิ้ง. Row membership คงอยู่หลังเลือกฟอนต์ใหม่; เพิ่มแถวซ้ำ/Undo ได้
- เพิ่ม Move lines สำหรับเส้นแนวนอน/แนวตั้งที่ตรวจได้ และ Move table / area ให้ลากครอบแล้วลากทั้งพื้นที่; ลูกศรคีย์บอร์ดย้ายพื้นที่ที่เลือกได้. การเปลี่ยนแก้ pixels/source geometry เฉพาะ PDF และเก็บ Undo; ไม่แก้ OPERA หรือ ledger. หากเส้นตรวจแยกไม่ได้ ใช้การเลือกพื้นที่โดยผู้ใช้
- Edited pages รวมหน้าที่มีแต่การย้ายเส้น/แถวถูก flatten และไม่มี hidden source text ใน output; หน้าที่ไม่แก้ยัง copy native. Preview/acknowledgment, selected-only scope, transient storage และ exact reviewed-byte email handoff คงเดิม. ปรับ legacy async tests ให้ตรวจการล็อก editor ขณะ export/save ตาม behavior ที่เปิดใช้แล้ว
- Tested local: Typecheck/Build ผ่าน; Vitest **840 tests / 93 files**, Playwright **46 cases** ผ่าน. รวม original RGB/bold/italic/embedded fonts, appended digits/new letters, multiline, replay/reload/disposal, row-boundary protection, repeated rows after custom font, vertical rules, native move pixels/flatten, three-column layout และ email handoff
- Private KAT/TSK native Invoice samples: supported same-text replacement แตกต่าง0.10–0.72%ของ source ink pixels ในการเปรียบเทียบ; supported numeric runs รับเลขเพิ่มได้ทุกตัวที่ตรวจ. Unsupported ลดเหลือ7/209และ4/108ในสองตัวอย่างหลัก หลังแก้ physical text-position matching สำหรับ repeated/trimmed chunks. ไม่ Commit PDF/text/raster ลูกค้าจริง
- Limits: combined/unmatched groups, missing subset/CID glyphs, rotated/path-only/unsupported text styles แสดงว่าไม่สามารถคงต้นฉบับอัตโนมัติ ต้องเลือกฟอนต์แทนเองเมื่อจำเป็น. Source mask ยังเป็นสีทึบตาม editor ไม่สร้างภาพพื้นหลังกลับ. เพิ่มแถวได้เมื่อหน้ามีพื้นที่ ไม่ใช่ Word-style pagination หรือ auto-total recalculation; ไม่อ้างเหมือนทุก PDF100%
- ภาพ synthetic editor1440×900และ1280×800ตรวจแล้ว; detector มี existing palette advisories และ font warning ซึ่งใช้รูปแบบ/ฟอนต์ที่เจ้าของอนุมัติ. ตรวจ independent review และแก้ทั้ง3 findings แล้ว. ซ่อมหัวข้อ Markdown ใน status/spec/decisions ที่แยกบรรทัดผิดจากครั้งก่อน
- Deployed source `22f2844806b11b8f3aab37af40885d28d04f4def`, Worker `2be610d0-9e5c-4d90-9487-c7c1e50d4830` ที่ https://ar-workspace.ar-c82.workers.dev . Health ยืนยัน database_verified และ commit ตรง. [PR #11](https://github.com/NTHV9/ar-workspace/pull/11) Merge แล้ว `e05651da043d2efa76fe8d0a4d057d1f17761784` หลัง [CI ผ่าน](https://github.com/NTHV9/ar-workspace/actions/runs/34597802348); merge tree ตรง tested source
- Cloudflare browser **25 cases ผ่าน** รวม source editing/dragging ที่1440×900และ1280×800, actual exported Preview, exact reviewed-byte email handoff, paragraph removal, auth protection และ Portfolio/Account navigation/filter/sort/selection. API/PDF ใน UI tests เป็น synthetic; ภาพ evidence/pdf-source-editing-1440.png และ1280.png จับจาก deployed assets แล้ว. เพิ่ม targeted test ให้ Undo/Redo ล้าง area selection เก่าเพื่อไม่ลากผิดพื้นที่ในครั้งถัดไป
- รอบนี้ไม่มี database migration, Gmail send หรือการเปลี่ยน integration. คง Worker bindings/cron/secrets ผ่าน --keep-vars; ไม่เพิ่ม paid resources. Private font samples และผลตรวจจริงเก็บนอก Git

## Checkpoint Transient document preparation — 11 กันยายน 2026

- Implemented: นำเมนู/หน้ารวม Documents ออก เริ่มงานจาก Account/Collections. งานใหม่ไม่บันทึก editor JSON; Preview + acknowledgment แล้ว Continue to email ในขั้นเดียว หรือ Download reviewed PDFs สำหรับ By System. ปุ่ม Back/ปิดแท็บเตือนเมื่อมี PDF edits; กำลัง handoff จะล็อก editor. Legacy job/draft recovery และ Account email history ยังเข้าถึงได้
- Reviewed bytes พักใน Private Storage เฉพาะ attempt. Network retry ใช้ upload receipts/revision/bytes เดิม; ไม่สร้าง email send อัตโนมัติ. Sent ที่ยืนยันแล้วปิด transient preparation ทันที และ sweep ที่ bounded ทุก 15 นาทีลบ exact original/export objects เมื่อผ่าน reference/claim/arm/provider-absence guards. การตอบ Sent ไม่รอการลบไฟล์. Explicit discard ใช้กับ terminal preparation ที่ไม่มี pending generation/mail/upload; metadata คงอยู่
- Existing legacy/Drive/Remittance/supplemental files คงนโยบายเดือนปฏิทินเดิม. ไม่สร้าง Drive archive สำหรับ transient jobs. Unknown upload/send ยังคงไฟล์; known no-dispatch budget failure ปลด intent พร้อม audit. Supplemental orphan ที่ยืนยัน bytes แล้วมี receipt สำหรับ original retention policy
- Supabase migration applied: `20260911104715_ar_transient_documents` บน `jmyvpurzmoiecpydjrci`. เพิ่ม lifecycle/closure, upload intents และ cleanup rotation พร้อม service-only review/discard/create_v4 RPC. v4 explicit opt-in ทำให้ runtime v3 เดิมปลอดภัยระหว่าง DB-first rollout. ก่อน/หลังพบ 31 legacy jobs, 3 email drafts, 115 Storage objects; ไม่แปลงหรือลบงานเก่า
- Tested: Typecheck/Build/dry-run ผ่าน. Vitest 835 tests / 91 files ผ่าน และ focused final 47 tests ผ่านหลัง versioned creation. Local PostgreSQL replay 61 migrations / 20 rollback suites ผ่าน. Hosted rollback fixture ผ่าน review/no project/exact replay, owner denial, Draft/uncertain, actual ar_mail_confirm_sent, discard, shared references และ provider-observation guards; ไม่เหลือ synthetic business rows
- Hosted Storage ปฏิเสธ SQL จำลองการลบ metadata จึงแยก test branch ให้ตรวจว่า existing object ไม่ถูกอ้างว่า absent โดยไม่ปิด guard. Tombstone simulation ผ่านเฉพาะ local provider stub; รอบนี้ยังไม่มีการอ้างว่าได้ลบ customer files หรือส่งอีเมลจริง. Security advisor มี INFO เฉพาะ private RLS tables ที่ตั้งใจไม่ให้ client policy; ไม่มี WARN/ERROR
- Browser tests: legacy flow 11 cases และ transient flow/Back/in-flight guards 7 cases ผ่าน; Account/Gmail/Drive context 23 cases ผ่านหลังแก้ assertion ของหน้า Portfolio ที่เปลี่ยนปลายทาง. ภาพ synthetic Preview ที่ 1440×900 และ 1280×800 เปิดตรวจแล้ว. ปุ่ม Continue/Download อ่านได้ normal/hover/focus; renderer clarity และ selection ordering คงเดิม
- Deployed source `a5d6d63c23d93e0c53818c60b28261bfd3fdc855`, Worker `50c55b0b-c09c-4fbb-9bb1-c0428a06a929` ที่ https://ar-workspace.ar-c82.workers.dev . `/api/health` ยืนยัน `database_verified` และ SHA ตรง; document read/review/discard ที่ไม่มี Login ได้ 401 ทั้งสามกรณี
- Cloudflare browser tests **23 cases ผ่าน** รวม transient/legacy preparation, direct email handoff, no project upload, upload-receipt retry, Preview acknowledgment, download/discard, browser Back, in-flight editing lock และ Account history ที่ 1440/1280/390. API/PDF data ใน browser tests เป็น synthetic ทั้งหมด. ภาพ `evidence/transient-review-1440.png` (1440×900) และ `evidence/transient-review-1280.png` (1280×800) จับจาก deployed assets แล้ว ตรวจภาพและ contrast ผ่าน ไม่เปลี่ยน reference PNG
- [PR #10](https://github.com/NTHV9/ar-workspace/pull/10) Merge แล้ว `b2d0ba206acfbfe0eb443bf4d68a0b8ff891db37` หลัง [CI ผ่าน](https://github.com/NTHV9/ar-workspace/actions/runs/34591152380). Merge tree ตรงกับ source ที่ deploy/test. คง cron/Worker bindings เดิม ใช้ --keep-vars; ไม่มีบริการหรือ add-on เสียเงินเพิ่ม

## Checkpoint Button visibility — 11 กันยายน 2026

- Reproduced Create document job แบบ white-on-white ใน normal state: computed foreground/background เป็น rgb(255,255,255), contrast 1:1. สาเหตุ `.document-dialog footer button` ทับ primary background แต่ไม่เปลี่ยน foreground. ลบ background override นี้เพื่อให้ใช้คู่สีของปุ่มหลัก
- ตรวจพบอีกกรณีจริงใน deployed PDF Workspace ก่อนแก้: Save reviewed PDFs privately เมื่อ hover ถูก generic PDF button hover ทับเป็นพื้นอ่อน/ตัวขาว (contrast 1.11:1). เพิ่ม primary hover pair และกัน generic hover บน disabled buttons. ปรับ primary ใน reviewed-document list ให้ใช้สีหลักเดียวกัน (white contrast 4.66:1)
- เพิ่ม browser checks normal/hover/keyboard focus และ disabled/disabled hover โดยใช้ computed foreground/background กับ opacity. ตรวจปุ่มหลักและปุ่มข้อความใน Create documents, PDF final review, reviewed documents, email/send confirmation, Account Settings, invoice actions/history, templates, Storage และ Remittance editor/review. ไม่ใช่การอ้างว่า audit WCAG ทุกส่วนของเว็บไซต์ครบ
- Local 9 audit flows ผ่านรวม Create documents ที่ 1440/390, typecheck/build ผ่าน. Cloudflare 11 cases ผ่านรวม button audit และ health/auth protection. Tests ใช้ synthetic data; ไม่ส่ง Gmail/สร้างไฟล์ Drive/แก้ข้อมูลลูกค้าจริง
- Deployed source `8d51ea927f36cf2d3069c31a27cb3b3556a309f6`, Worker `48d1b3be-7c51-439d-843c-0cece43b5590`; health ตรง SHA/database_verified. [PR #9](https://github.com/NTHV9/ar-workspace/pull/9) Merge แล้ว `5bc5ef2152c1fdf6c71568ca973d49654c63d301` หลัง CI ผ่าน; merge tree ตรง tested source

## Checkpoint Sticky selected-invoice actions — 11 กันยายน 2026

- เจ้าของขอให้แถบจำนวนบิล/ยอดที่เลือกและปุ่มทำงานไม่อยู่ท้ายรายการยาว. ย้ายแถบเดียวขึ้นเหนือตาราง Account Detail และตรึงด้านบนขณะ page scroll; จำนวน ยอด Hotel/Account และ event handlers เดิมคงอยู่ ไม่มีแถบซ้ำ
- ย้ายออกจาก ledger panel ที่ตัด overflow และใช้ overflow clip เฉพาะ app shell ที่มีแถบนี้ เพื่อให้ sticky อิงการเลื่อนหน้าเว็บจริง. จอเล็กจัดปุ่มหลายแถวและคง touch targets; native document/external-billing dialogs ยังอยู่เหนือแถบ
- Fixture 84 invoices ล้มเหลวก่อนแก้ทั้ง 1440/1100/390. หลังแก้ตรวจ DOM order, scroll 1600px, sticky bounds, count/amount, เปิด Prepare documents พร้อม 3 selected invoices, เปิด external billing และ Clear selection ผ่าน. Local regression 22 cases, typecheck/build และ Cloudflare browser 25 cases ผ่าน
- Deployed source `82e864dab46fcbdb7b5b1b6a34079d79ed347eae`, Worker `d8778469-0ded-4107-8b99-2b34d3c544c4`; health ตรง SHA/database_verified. [PR #8](https://github.com/NTHV9/ar-workspace/pull/8) Merge แล้ว `c4990975959ca071b7a5abf9d8e38e766951591a` หลัง CI ผ่านและ merge tree ตรง tested source. ภาพหลักฐาน `evidence/selected-actions-sticky-*.png` ใช้ synthetic fixtures
- ทดสอบด้วยข้อมูลสมมติ ไม่มีการสร้างเอกสาร/บันทึกวางบิล/ส่งเมลจริงหรือแก้ฐานข้อมูล. ไม่เปลี่ยนแผง Selected guest/item, Aging หรือ Latest Sent

## Checkpoint Account panel presentation — 11 กันยายน 2026

- เจ้าของย้ำว่าภาพก่อนแก้ PDF ต่างจากแผงลอยปัจจุบัน จึง reconstruct source ก่อน PDF clarity (`1c938970^`, `a9feb61`) และ source ก่อนปรับรอบนี้ (`8779266`) ด้วย synthetic fixture เดียวกัน 84 rows, เวลา/scroll/viewport เท่ากัน แทนการสรุปจากรายชื่อไฟล์ที่แก้เพียงอย่างเดียว
- ผล 1440×900: ทั้งสองรุ่นเป็น inline panel ที่ x=1061.75, width=336.25, height=600, ไม่มี modal; Notes/History มีอยู่ทั้งคู่. ผล 1100×900: ทั้งสองรุ่นเปิด modal; ก่อน PDF อยู่ x=0 และรุ่นปัจจุบัน x=745 จาก right-edge fix รอบก่อน. นี่คือ local reconstruction ไม่ใช่ screenshot ของ Cloudflare deployment ในอดีต และยังไม่ยืนยันการตั้งค่า zoom/viewport ของ Edge ที่เจ้าของใช้อยู่
- ปรับ Account Detail ให้คงแผงแนบขวาบนพื้นที่เว็บกว้างกว่า 1000 CSS px (เดิม 1200) เพื่อให้ Laptop 1024/1100/1200 ใช้การจัดวางแบบจอกว้าง. ต่ำกว่านั้นยังเป็น right drawer; mobile/focus/selection คงเดิม. เพิ่มคำแนะนำเลื่อนตารางแนวนอนในช่วง Laptop โดยไม่ซ่อนคอลัมน์
- Regression ใหม่ล้มเหลวก่อนแก้ทั้งสาม Laptop widths และผ่านหลังแก้; ตรวจ inline geometry, ไม่มี modal/backdrop, เลือกบิลขณะเปิดรายละเอียด และ resize 900↔Laptop โดยไม่สูญเสีย selection. Typecheck/build, local regression 19 cases และ Cloudflare 22 cases ผ่าน. ภาพ `evidence/account-panel-inline-1100.png` เป็น synthetic fixture บน UI ที่ deploy แล้ว
- Deployed source `735a3e90e4614bc32539aabda3b5ab7419044a33`, Worker `0440bcbb-b24e-475a-986f-f663d3db27bf`; health ตรง SHA/database_verified. [PR #7](https://github.com/NTHV9/ar-workspace/pull/7) Merge แล้ว `cad4baf407390ab8a63fbe60d88877ba25f0f776` หลัง CI ผ่าน และ merge tree ตรง tested source. การตรวจนี้ไม่ได้ใช้ภาพลูกค้าหรืออ้างว่าอ่านค่าจอ/zoom ของ Edge จริงแล้ว
- ไม่เปลี่ยนเนื้อหาแผง, timeline, ประวัติ, Aging/Latest Sent, PDF/editor หรือบัญชี OPERA. ไม่มี migration, credential หรือ resource ใหม่. Development servers ที่ใช้เทียบประวัติหยุดแล้ว

## Checkpoint Account Detail corrections — 11 กันยายน 2026

- แก้ drawer Selected guest/item ในจอ 601–1200px โดยล้าง browser dialog `left` ให้ยึดขอบขวา 15px. Desktop ยังเป็นคอลัมน์ขวา; mobile คงระยะขอบทั้งสองด้าน. Native modal/focus/Escape/selection เดิมคงทำงาน
- Aging sort ใช้ OPERA `age` เป็นตัวเลข; หากขาด age ใช้ start day ของ source bucket ที่ตรงกัน ไม่เรียงข้อความอย่าง Up to 30. ค่าไม่ทราบอยู่ท้ายทั้ง asc/desc. Demo เพิ่ม source age สมมติที่ตรงกับช่วงเดิม ไม่ seed business data
- Latest Sent ใช้ workflow แยก No billing sent/Billed/No reminders sent/Billing setup needed/Not available และคง actual reminder stage/Final urgency. ใช้กฎเดียวกันใน Account Detail และคิวงาน; Billing status ฝั่งรายละเอียดของ Not Required แสดง Not required
- ก่อนแก้ browser regression ล้มเหลว 4 cases ตรงอาการ (sort, status และ right-edge ที่ 1100/1200). หลังแก้ 5 cases ผ่านรวม mobile; full unit 817/88 files, typecheck/build และ local regression 21 cases ผ่าน (selection/filter/back, queue, focus). หลักฐาน synthetic เท่านั้น
- ตรวจบัญชีที่เจ้าของแจ้งแบบ read-only: open invoice workflows 84 รายการเป็น Billing Required และยังไม่มีวันวางบิลหรือ reminder stage ในระบบ จึงควรขึ้น No billing sent ตามคำยืนยัน. ไม่ได้แก้ฐานข้อมูลหรือเดาประวัติวางบิลเก่า
- Deployed source `b66f9b5c95cb0c8f8771eb2bb254b07f6740b8ee`, Worker `6e60652c-73d4-41f6-8212-df8fabc41a9d`; health ตรง SHA/database_verified. Cloudflare browser 25 cases ผ่าน รวม regression ทั้งสามจุด, responsive/selection/back/focus, compressed child restrictions และ real unauthenticated API rejection. [PR #6](https://github.com/NTHV9/ar-workspace/pull/6) Merge แล้ว `40bf6edb5fc6751932dd9cc5c6d9098b88ead39f` หลัง CI ผ่าน; merge tree ตรง tested source
- ข้อจำกัดการตรวจครั้งนี้: แท็บ browser ของผู้ช่วยสำหรับข้อมูลจริงแจ้ง session expired จึงยังไม่ได้ตรวจ visual ด้วย customer rows หลัง deploy. ใช้ compiled Cloudflare UI กับ synthetic fixtures และตรวจ workflow จริงผ่าน read-only Supabase แยกกัน ไม่ลดสิทธิ์เพื่อให้ทดสอบผ่าน และไม่อ้างว่า live customer visual ผ่านแล้ว

## Checkpoint PDF clarity and Email handoff — 11 กันยายน 2026

- เจ้าของพบ PDF ไม่คมเมื่อขยายและไม่เห็นปุ่มไปอีเมลใน Editor หลังบันทึก. สาเหตุ display ใช้ raster scale คงที่ และ Prepare email อยู่เฉพาะหน้ารายการเอกสารที่ถูก Editor บัง
- Editor/thumbnail/source preview ใช้ขนาด CSS กับ devicePixelRatio และ re-render เมื่อขนาด/ความละเอียดจอเปลี่ยน ตาม [PDF.js HiDPI guidance](https://mozilla.github.io/pdf.js/examples/). Final Preview เพิ่ม Zoom ถึง 200% และเรนเดอร์หน้าที่อยู่ใน viewport ให้คม; หน้าไกล viewport ใช้ภาพเบา โดยคง pixel budget และการ render ทีละหน้า ไม่เก็บทุกหน้าเป็น bitmap ขนาดเต็มพร้อมกัน
- Edited-page export เปลี่ยนจาก scale 2 เป็นเป้าหมาย 300 dpi ภายใต้ 20M pixel/page cap เดิม. หน้าที่ไม่มีการแก้ยัง copy native PDF; ตรวจหน้า A4 ที่แก้มี embedded image กว้างอย่างน้อย 2480px และไม่มี hidden original text. Whiteout/color/image/reorder/reopen tests ผ่าน
- เพิ่ม Continue to email ทั้ง final-preview หลัง save และแผงขวา. ใช้ได้เฉพาะ latest project ที่ review/save สำเร็จหรือ saved project ที่ restore พร้อม acknowledgment; draft/new edits/start-from-original ไม่อาศัย acknowledgment ของไฟล์เก่า. ส่ง job ID + saved revision เข้า Email preparation; การเข้า Composer ไม่ส่ง Gmail. กลับออกมาแล้วเปิด project ล่าสุดได้
- Local: 22 PDF/DocumentRoute browser cases ผ่าน, เพิ่ม save-failure guard ผ่าน, full unit 811/87 files และ typecheck/build ผ่าน. HiDPI/200% ใช้ DPR 2; browser fixtures และภาพใน Git เป็น synthetic เท่านั้น
- Deployed source `1c938970a9a9155108dcda328060f7c5b745765f`, Worker `f92a45d6-5798-41fd-8923-801a128af23c`; health ตรง SHA/database_verified. Cloudflare browser 20 cases ผ่าน รวม editor 1440×900/1280×800, private access 401, reviewed save→email, save failure, draft/reopen และ explicit Gmail controls (Gmail calls เป็น fixtures ไม่มีการส่งจริง). [PR #5](https://github.com/NTHV9/ar-workspace/pull/5) Merge แล้ว `1db209efbe4845b99207e25a0681e5d59eca3dc4`, CI ผ่านและ merge tree ตรง tested source
- เปิด saved project จริงที่เจ้าของแจ้งแบบอ่านอย่างเดียว: acknowledgment เดิมครบและ Continue to email เปิดใช้งานได้. Canvas ในจอ DPR 2 กว้าง 998 physical pixels สำหรับ 498.6 CSS pixels ตามขนาดแสดงจริง. ไม่กดบันทึก/เขียนอีเมลกับเอกสารลูกค้าในการตรวจ; รูปข้อมูลจริงไม่อยู่ใน Git
- ไม่มี migration/credential/บริการใหม่ และไม่เปลี่ยนเอกสารลูกค้าเพื่อทดสอบ

## Checkpoint Financial range status — 11 กันยายน 2026

- เจ้าของสั่ง backfill 1–31 สิงหาคมแล้วทั้ง KAT/TSK เวลา 13:41 ICT; ตรวจ Supabase และ Cloudflare ตรงกันว่า queued หลังงานช่วงอื่น. รอบก่อนหน้ามีบัญชีที่ต้องตรวจ payment links จำนวนมาก; ตรวจ step ใหม่เดินต่อและบันทึก mapping batches เพิ่ม ไม่ใช่ workflow หยุด. ยังไม่อ้างว่า August coverage ครบ
- พบ UI bug: report จะ reload หลัง status เปลี่ยนเมื่อ global queue ว่างเท่านั้น ทำให้ publication ของช่วงที่เลือกอาจไม่ขึ้นขณะที่ช่วงอื่นยังทำงาน. แก้ให้โหลดใหม่เมื่อมี run สิ้นสุดโดยไม่รอ global queue; คง server-side coverage gate และ unknown totals เป็น —
- เพิ่มสถานะตามช่วงวันที่และโรงแรม แยก Queued/Reading OPERA/Finished/Failed กับงานช่วงอื่น; ป้องกันกดซ้ำเมื่อทั้ง scope มีงานอยู่แล้ว. Notice ระบุวันที่ที่ส่งจริงและล้างเมื่อเปลี่ยนช่วง. แสดง recent runs ครบที่ API คืนมา และบอกให้เลือกวันก่อนกด refresh
- Regression สองกรณีล้มเหลวก่อนแก้และผ่านหลังแก้. Full unit 811/87 files และ typecheck/build ผ่าน; local browser Financial Reports + Dashboard 19 cases ผ่าน รวม date payload, other-range queue, publication ขณะคิวยังไม่ว่าง, missing coverage, unavailable API, 1440/1280/390. ภาพทดสอบ synthetic เท่านั้น
- Deployed source `484a6a663edd31cdf1fe87f3ca78bdfb7aaa3b65`, Worker version `019fc1d7-b6ee-4a4e-bfc9-6bb4786b1046`. Health ตรง SHA และ database_verified. Cloudflare browser 19 cases ผ่าน; [PR #4](https://github.com/NTHV9/ar-workspace/pull/4) Merge แล้วด้วย `4d0389fb59b834e014157c07011c2c01c002d729` หลัง branch/PR CI ผ่าน และ merge source tree ตรงกับที่ทดสอบ
- Signed-in live check เลือก 1–31 สิงหาคมแล้วเห็น KAT/TSK Queued ตรงทั้ง Supabase/Cloudflare; รอบก่อนหน้า KAT เสร็จ 105/105 บัญชีแล้วและงาน TSK ช่วงอื่นเริ่มต่อ. August totals ยังเป็น — ตาม coverage ที่ยังไม่ครบ ไม่อ้างว่าดึงเดือนสิงหาคมเสร็จจากผลทดสอบ UI สมมติ. ไม่มี migration, queue restart, เพิ่ม concurrency, OPERA accounting write หรือ backfill ซ้ำจากการตรวจครั้งนี้

## Checkpoint Account comparison — 11 กันยายน 2026

- แก้ Portfolio ที่แยก Account เดียวกันเป็นคนละแถว KAT/TSK: live source มี Account No. ตรงกันแต่ไม่มี explicit group จึงเคยตกไปใช้ Hotel + internal ID. ข้อมูลตรวจแบบ read-only มี 175 operational accounts, 69 คู่ที่ Account No. ตรงกัน และไม่พบเลขซ้ำภายในโรงแรม
- ใช้ Account No. เป็น reporting key โดยคง explicit group และป้องกันเลขขาด/กำกวม. สมาชิกในแถวยังเป็น Hotel + Account ID เดิม; ยอดศูนย์แสดง 0 และโรงแรมที่ไม่มีบัญชีแสดง —. กดยอดเปิด ledger ของโรงแรมนั้น; กดชื่อเลือกโรงแรมพร้อมชื่อเดิม/Account No.
- Search/Account filter ตรวจสมาชิกทั้งคู่หลังจับแถว เพื่อไม่ให้การค้นชื่อที่สะกดต่างกันหรือ Account No. ทำให้อีกโรงแรมหาย. Hotel/type/aging filters คง scope เดิม; คอลัมน์ Accounts นับ operational accounts ในแถวและ Items รวมรายการของสมาชิก โดยไม่รวม ledger
- Tests: regression ก่อนแก้ล้มเหลวตามอาการ 2 cases; หลังแก้ full unit 811/87 files, typecheck/build ผ่าน. Local browser 3 cases ผ่าน ครอบคลุม 1440×900/1280×800, ทุก sort column, filter/search, zero vs absent, chooser, KAT/TSK drilldown/back และ Account Detail selection เดิม. ภาพ `evidence/portfolio-comparison-*.png` เป็น synthetic API fixtures ไม่ใช่ข้อมูลลูกค้าจริง
- Deployed: source `5ae158ff351382e59e0ef36148a92f01be2ad912`, Worker version `25c3162d-f537-44e8-9dec-567a81af0e51`, [Portfolio](https://ar-workspace.ar-c82.workers.dev/). Health ตรง source SHA และ `database_verified`. [PR #3](https://github.com/NTHV9/ar-workspace/pull/3) Merge แล้วด้วย `224df2670c8225745a32c590ec3af0356c73cf4b`; CI ของ branch/PR ผ่านก่อน merge และ source tree ตรงกัน
- Cloudflare browser 17 cases ผ่าน (Portfolio comparison, Account Detail เดิม, Dashboard และ health/auth rejection). ภาพ 1440×900/1280×800 ใช้ synthetic fixtures บน Cloudflare และเปิดตรวจจริง. แยกจาก signed-in live check: ชุดบัญชีที่เคยแยก 10 แถวเหลือ 5 แถว มี KAT/TSK ในแถวเดียวกัน; สองตัวอย่างที่เจ้าของแจ้งมีคู่ครบ และยอดศูนย์ยังแสดง 0. กดยอด KAT และ TSK เปิด internal Account IDs ของแต่ละโรงแรมถูกต้อง และกลับมารักษา search/type/sort เดิม
- ไม่มี migration, database write หรือ resource ใหม่ในงานนี้; ไม่แก้ ledger/settings/OPERA และไม่มีข้อมูลลูกค้าหรือ credentials ในไฟล์หลักฐานที่ commit

## Checkpoint Dashboard — 11 กันยายน 2026: เพิ่มหน้ารวมกิจกรรมและงานค้าง

ส่งมอบแล้ว: [Dashboard](https://ar-workspace.ar-c82.workers.dev/?dashboard=1), source `e89bbc2d33fa391c01c4c296a0902359a63a3a2b`, Worker version `c4b45f5d-018f-47b0-a88e-5ecc3154cff4`. HealthตรงSHAและdatabase_verified. [PR #2](https://github.com/NTHV9/ar-workspace/pull/2) Mergeเข้า `codex/first-increment` แล้วด้วย `75410ce196364382ebe6fd38be449308318000b5`; CIผ่านก่อนMergeและtreeตรงกับheadที่ตรวจ. ผลล่าสุดunit806/87filesผ่าน, browser31casesบนCloudflareผ่าน. ไม่มี migration หรือบริการใหม่

- เจ้าของขอ Dashboard กลางเพิ่มเติมหลังตรวจรับระบบชุดก่อน. เพิ่มเมนู Dashboard ที่ `/?dashboard=1` โดยคง Portfolio แบบ comparative matrix เดิม
- กิจกรรมวันที่เลือก: Invoice entries จาก OPERA invoice date, จำนวน first billing จาก Gmail/external records, actual follow-up sends, OPERA payment credits. แสดง applied/unallocated เป็นสถานะปัจจุบันของ payment cohort ไม่ใช่เหตุการณ์ตัดยอดในวันนั้น
- งานค้างใช้ข้อมูลล่าสุด ไม่ถูกกรองเป็นยอดย้อนหลังตาม activity date. แสดง Net AR แยก KAT/TSK, queue actions และ Remittance pending. Urgent กับ Hold/Needs review อาจเป็น invoice เดียวกัน จึงระบุว่าไม่ให้นำยอดแต่ละมุมมาบวกเป็น grand total
- Scope Hotel/type/Account/date ส่งต่อไปยังรายงานและกลับ Dashboard ได้; Invoice identity แยก Hotel. API ที่ล้มเหลวหรือ coverage ไม่ครบแสดง unavailable แยกส่วน ไม่มีข้อมูลตัวอย่างแทนผลจริง
- ใช้ read APIs ที่มีอยู่ ไม่มี migration/credential/service เพิ่ม. App-level on-open refresh เดิมยังทำงาน; Dashboard อ่านสรุปใหม่เมื่อ snapshot ของ OPERA เผยแพร่เสร็จ
- Typecheck/build และ unit805 tests/87files ผ่าน. Dashboard browser cases12ผ่านใน local test runs รวมการเปลี่ยนวัน, cross-hotel identity, drilldown/back, failure/coverage, mobile disclosure และ new publication. กำลังตรวจบน Cloudflareก่อนส่งมอบ
- Impeccable reviewer ให้ fix สองเรื่อง: mobile first viewport และ synthetic provenance. แก้แล้วและ reviewer ให้ ship สำหรับสองรายการนั้น; ภาพ1440/1280/390ใช้ข้อมูลสมมติพร้อมป้ายชัด ภาพ referenceเดิมไม่เปลี่ยน

ผล Cloudflare เพิ่มเติม: source `f00a1f00a88e30fcfbc1623e546b9d06f9c1c8e4` / Worker `e8d0d01f-88dd-49f1-b640-266cfd15f2cb` Deploy แล้วและ healthตรงSHA/database_verified. Browser31casesผ่าน รวม12Dashboardcases. เปิดหน้า authenticated จริง โหลดทุกส่วนได้ เปลี่ยนวันที่11→10กันยายนและเปิด payment evidence ได้ยอด/จำนวนรายการตรงกัน พร้อมกลับ Dashboardโดยคงวันเดิม. ตัวเลขและภาพลูกค้าจริงไม่เก็บในGit. เพิ่มคำอธิบายว่า allocationใช้เครื่องหมาย debit/credit ตามOPERA และมีsign-preservation testด้วยข้อมูลสมมติ

## Checkpoint GitHub — 11 กันยายน 2026: Merge งานเข้าสาขาหลักแล้ว

- [PR #1](https://github.com/NTHV9/ar-workspace/pull/1) เปลี่ยนจาก Draft และ Merge เข้า default branch `codex/first-increment` แล้ว ด้วย merge commit `ce027110538732864232f045cf2c5e1071c8588e` โดยคงประวัติเดิม
- ตรวจ PR head `4215757f0d2c39b45e9d0dc36bba3938c8e2c2b7`: GitHub CI ผ่านทั้ง Push และ PR, ไม่มี conflict และล็อก expected head SHA ตอน Merge. ตรวจ tree ของ merge commit ตรงกับ head ที่ทดสอบแล้ว
- Workspace เปลี่ยนมาที่ `codex/first-increment` และ fast-forward ตรง remote โดยไม่ force/reset หรือลบ branch/ไฟล์งานเดิม. Cloudflare ยังรัน source ที่ตรวจไว้ใน checkpoint ส่งมอบ; การ Merge นี้ไม่ได้เปลี่ยน runtime หรือบริการภายนอกอื่น

## Checkpoint ส่งมอบ — 11 กันยายน 2026: งานหลักและ acceptance ครบตามขอบเขต

รายงานละเอียด: [FINAL_ACCEPTANCE_20260911.md](FINAL_ACCEPTANCE_20260911.md). ข้อจำกัดของ native Invoice บางชนิด, fixed-page PDF, password-reset completion และ production restore ระบุแยก ไม่ใช้คำว่า verified ครอบคลุมสิ่งที่ไม่ได้ทดสอบ

- Runtime ที่เปิด retention: source755e3dda1e6c178f3877fb75148dc49b807bf55a, Worker ae0576ce-fc97-44bc-8648-27d69fbe918a, ar-workspace.ar-c82.workers.dev; healthตรงSHA/database_verified และ GitHub CI success. Budget/Retention=true, Acceptance=false
- ทดสอบเอกสารจริงชุดที่เคยแจ้งอีกครั้ง: generated Statement + native Invoice API3ไฟล์พร้อมครบใน20.115708วินาทีจากcreatedถึงready เปิดStatementหนึ่งหน้าได้จริง ไม่ส่งอีเมลในขั้นตอนนี้ ข้อมูล/PDF/ภาพจริงเก็บprivate
- ปิดscenarioหนึ่งAccount/สามInvoices: actualGmailสองฉบับ, editedPDFสามarrangements, BySystem/hold/reopen/Remittance/report/retentionผ่าน. ลบ20Supabaseobjects/3Drivefilesแล้วตรวจabsent, ลบemptytestbucket/folderและถอนสองnamespace. Mainbusinesscontactsไม่มีผู้รับทดสอบ; mainSentEvents/Remittancesยัง0 ไม่ได้แก้ประวัติของลูกค้าเพื่อทดลอง
- Apply20260911014928_ar_acceptance_closeout,20260911015853_ar_retire_acceptance_workspace,20260911020036_ar_disable_retired_acceptance_rpc. ทั้ง60migrationnames/versionsตรงhosted; rename20ไฟล์เดิมโดยไม่เปลี่ยนSQLbytesหรือแก้servermigrationhistory
- Actualretentionhookหลังfullrefresh09:12ทั้งสองโรงแรม: checked78/blocked78เพราะsourceopen/deleted0/uncertain0/errors0. Filesจริง92รายการรวมtemplate/configและPDFทดสอบใหม่ยังคงครบ. ตัวเลขไฟล์ที่ไม่มีความสัมพันธ์รองรับไม่ถูกบังคับลบ
- SENTauditจริงวันที่10–11กันยายนอ่านจบ37messages พบ7ARmatches:5receiptsเดิมและ2sealedisolated-testreceipts ไม่มีmissing/conflictและไม่มีการส่งซ้ำ. เก็บเฉพาะIDs/timestampsของtestเมื่อถอนข้อมูลscenarioแล้ว
- Typecheck/buildผ่าน, unit793/85files. Browser203casesผ่านรวม23casesที่แก้fixtureGETcollection-policyโดยคงassertions. ภาพ1440/1280/390ใช้ข้อมูลสมมติ; references/designทั้ง7ภาพไม่เปลี่ยน
- Latestlogicalrestore59migrations/19fixturesผ่าน พร้อมpg_dump/pg_restoreจริงและserverหยุด;60migrations/19fixtureSchemaReplayผ่านหลังถอนretiredRPC. ไม่ใช่productionphysicalrestore. Securityadvisorไม่มีWARN/ERROR เหลือINFO49privateRLS-without-policyตามเจตนา
- Quotaหลังทดสอบประมาณworkingfiles11.7MiB/DB48.3MiB, reserveของscenariofinished/overrunfalse. ตั้งเพดานแอป1GiBfiles/2GiBmanagedegress/256MiBDBพร้อม20%headroom; ไม่มีpaidaddon/upgrade/PITR
- หน้าเว็บพร้อมให้เจ้าของตรวจงานจริง. ไม่เพิ่มauto-send, ไม่แก้ledgerOPERAหรือบริการARDBเดิม. เอกสาร/หลักฐานส่งมอบที่จะPushต่อจากsourceข้างต้นไม่มีruntimechange

## Checkpoint ระหว่างงาน — 11 กันยายน 2026 08:51 ICT: ทดสอบวงจรงานและ retention จริง

- บัญชีสมมติหนึ่งบัญชี/สามบิลทำงานใน namespace และ private bucket แยกจากธุรกิจจริง; OPERA เป็น fixture transport ที่ผ่าน reader เดิม ส่วน Cloudflare, Supabase, Gmail และ Drive ใช้บริการจริง ไม่มีการสร้างหรือแก้ ledger ใน OPERA
- งาน Selected-only A/C พร้อม Statement และ Invoice fixtures พร้อมครบใน 7.72 วินาทีบนคิวเอกสารเฉพาะ; Balance Due 4,000 และ Aging ทั้งบัญชี 6,000 ตรงกติกา ทดสอบ editor/save/reopen/preview/ack และไฟล์รวม, Statement+bundle, แยกแต่ละใบแล้ว
- ส่งอีเมลสมมติสองฉบับตามการอนุญาต: Draft ส่งจาก Gmail และ Send Now จากเว็บ โดยมี SENT receipts สองรายการในพื้นที่ทดสอบ ไม่เพิ่ม business Sent events. Gmail เปลี่ยน ID/ตัด header/ตัดบรรทัดข้อความ จึงเพิ่ม reviewed Sent matching พร้อมตรวจเนื้อหา ผู้รับและ SHA ไฟล์ก่อนบันทึก ห้ามส่งซ้ำเพื่อแก้ receipt
- ทดสอบ By System, วันวางบิล/credit term, Final→Urgent, dispute/hold/release และ zero→reopen→Needs review ผ่าน โดยเก็บ Due Date และประวัติเดิม บิลมี Remittance ยังไม่ถูกเคลียร์จน source refresh ยืนยันศูนย์ทั้งสามใบ
- Remittance รวมสามบิลนับยอด 6,000 ครั้งเดียว; อัปโหลดหลักฐานจริงใน test bucket, remove link และ restore ผ่าน รายงานการเงินทดสอบแยก payment 6,000 กับ invoice applications 6,000 (สามรายการ) ไม่ตีความวันตรวจพบศูนย์เป็นวันรับเงิน
- Retention provider proof: ก่อนงานเสร็จ 23 รายการ blocked; หลังศูนย์ครบและไม่มีงานค้างเป็น waiting ครบ 23 รายการ วันครบกำหนดหนึ่งเดือนปฏิทิน. เลื่อนเฉพาะ test clock 31 วันแล้ว production adapters ลบ Supabase 20 objects และ Drive 3 files พร้อมตรวจ authenticated absence; ประวัติ SENT ยังสองรายการและไฟล์ main bucket ยัง 88 รายการ
- Source 42ddba82342b73cf173333612cb8efe3647973c3/Worker bc9182eb-6c0d-42b9-847c-df7ef9a5cb11 ใช้ในการทดสอบข้างต้น. Closeout กำลัง Deploy: seal scenario, เก็บ receipt IDs/timestamps แบบไม่เก็บผู้รับ/เนื้อหา, ลบเฉพาะ container ที่ยืนยันว่า empty แล้ว จึงถอน namespace ภายหลัง
- Apply 20260911014928_ar_acceptance_closeout และ hosted rollback ผ่าน. Full unit 793 tests/85 files, typecheck/build ผ่าน. Local synthetic pg_dump/pg_restore รุ่น 58 migrations/20 fixtures ผ่านและ server หยุดแล้ว; dump SHA f089a763971fdd95c1f26a7e6941d3681c419e3a5cdb7e3555ce494130c8ead3. ไม่ใช่ production restore
- ยังไม่ปิด Goal: เหลือ closeout/settle reserve, เปิด retention จริง, final acceptance/privacy/runbook และยืนยัน deployment รอบส่งมอบ

## Checkpoint ระหว่างงาน — 11 กันยายน 2026 07:23 ICT: พื้นที่ Acceptance และการตรวจยอดศูนย์

- คิวเอกสารเฉพาะ Deployจริงในsource0dca42a82209f92f1f86bf62df6702003772faf7, Worker370f2c48-2a95-4d66-b292-444f01c322f8; healthตรงและdatabase_verified. งานใหม่ใช้ar-workspace-documents ส่วนงานเดิมคงคิวเดิม;ยังรอวัดงานจริงของscenario.
- พบและแก้source bugระหว่างfixture: บิลที่ยืนยันศูนย์จากHistoryต้องนำหลักฐานcompressed/parentไปresolveด้วย. เพิ่มการอ่านซ้ำเฉพาะzeroInvoicesที่ยังมีไฟล์Supabase/Driveผูกอยู่,แบ่งinvoiceNo20ต่อคำขอ. หากยืนยันไม่ได้เป็นmissingโดยไม่เปลี่ยนยอด และreplayเก่าไม่ทับverificationใหม่. Apply20260911000150_ar_retained_zero_verification;hostedrollbackผ่านหลังรอcronจริงจบ (ไม่ได้ปิดuniquenessguardเพื่อทดสอบ).
- สำรองทรัพยากรสำหรับscenarioในglobalbudgetก่อนสร้างพื้นที่:40MiBfiles/80MiBegress/24MiBDB. Reservationยังstartedจนกว่าจะพิสูจน์cleanup/settlement. ไม่เพิ่มplanหรือpaidaddon.
- Apply20260911001933_ar_isolated_acceptance: temporaryschemasแยกจากbusinessจริง,servicegatewayมีactorbound,RLSยังเปิดและไม่มีdirectschemausageของclient. โครงสร้างคัดจากแอปที่สร้างใหม่นี้เท่านั้น;ไม่copycustomer/credentialrows. DBหลังโครงสร้าง47,148,179bytes;ยังไม่มีAccountสมมติในตารางธุรกิจจริง.
- Registeredscenarioแบบpreparedแล้ว;Bucket/folderยังไม่สร้างและยังไม่ส่งอีเมลของscenario. โค้ดCookie/scopedRPC/fixturetransport/recipientguard/provisionกำลังDeploy. Sourceadapterไม่มีnetworkfallbackไปOPERAและPDFInvoiceตัวอย่างติดSYNTHETICชัดเจน. ActualInvoiceAPIproofแยกจากsimulation.
- Typecheck/build/fullunit781/82filesผ่าน,localbrowser15casesผ่านรวมexistingPDFflowและacceptancecontrols. LocalSQLreplayผ่านscopeFK/defaults/threeInvoice-trigger isolationและtypedgateway;หลักฐานนี้ไม่ใช่actualproviderproofของscenario. Goalยังactive.


## Checkpoint ระหว่างงาน — 11 กันยายน 2026 06:04 ICT: SENT audit และคิว PDF เฉพาะ

- Operations source838acca555e75c208d666abc0e9a6cb18affc34b DeployบนWorker1f89a280-dbe2-42d2-bc9b-10e1024582ac และผ่านCloudflarebrowser5cases. แก้auditเพิ่มprovider-ID matchingและSENTที่ยังอยู่ในTrashในsource225f8aba7049d710e744d34d8ee52a4a5b582f8f, Worker c9887cee-9980-4501-bda1-648f2a761ab5. HealthตรงSHAและdatabase_verified.
- ตรวจGmailจริง (แยกจากข้อมูลวันรับเงินOPERA): ช่วง10กันยายนถึงเวลาตรวจ11กันยายน อ่านครบ33SENTmessages พบ5ARmatches ทั้ง5เป็นReceipt recordedตรงกับ5รายการที่DBยืนยันไว้. ไม่มีการส่งอีเมลหรือแก้กล่องจดหมายในaudit. ข้อความที่หายทั้งreceipt/markerยังต้องตรวจMailboxด้วยคน ไม่ถือว่ายังไม่ส่ง.
- Apply20260910223712_ar_recovery_provider_identity และhostedrollbackผ่าน. Read-onlyauditใช้ข้อมูลกำกับข้อความ ไม่มีการอ่านbody/attachmentของข้อความที่ไม่เกี่ยวข้อง. หน้ารายงานรักษาpaginationและไม่ใช้ผลpartialอ้างว่าอ่านครบ.
- พบCurrent OPERA refreshสองโรงแรมยังใช้คิวเดียวกับPDF. เพิ่มคิวar-workspace-documentsภายในWorkerเดิม (concurrency2) แยกจากrefresh2/financial1. Apply20260910230220_ar_document_queue_isolationแล้ว (รวม53migrations): คิวของjobกำหนดครั้งเดียวตอนINSERT; replay/activejoinของงานเดิมคงrefreshqueue ไม่ย้ายแล้วพิมพ์ซ้ำ. NewV3RPCใช้documentsqueue;oldV2ยังใช้refreshระหว่างrollingdeploymentได้อย่างปลอดภัย.
- Hostedqueuefixtureผ่าน new/replay/old-active-join/immutable-location/permissions. Sourcecodequeueใหม่กำลังPush/Deploy;ยังไม่อ้างว่าทดสอบเวลารันจริงผ่านแล้ว. ไม่มีWorkerใหม่/backendซ้ำหรือpaidaddon.
- บัญชีทดลอง3บิล: แผนแยกnamespaceอยู่ในISOLATED_ACCEPTANCE_PLAN. Blueprintและgatewayผ่านlocal53/54schema replay รวมกรณีInvoice triggerไม่แตะตารางธุรกิจจริง;ยังไม่ได้สร้างnamespaceนี้บนSupabaseหรือส่งอีเมลของscenario. Goalยังactiveจนจบscenario,retentionproviderproof/enablementและfinalacceptance.


## Checkpoint ระหว่างงาน — 11 กันยายน 2026 05:05 ICT: Operations และการกู้คืน

- Storage controls Push/Deployแล้ว: source321e96e53e4cc2b71c3cc554b89d535d7ebe51ca, Worker2be508b2-4532-4b3a-9af2-ccb2861d4913. HealthตรงSHA/database_verified;3Operationsroutesที่ไม่Loginได้401. Cloudflarebrowser18Storage/Drivecasesและอีก1expired-archivecaseผ่าน.
- เปิดเว็บจริงอ่านStored11.2MiB/DB40.1MiB, DriveยังConnected/Restricted. เปิดStatementเดิมผ่านguardและเห็นPDF1หน้า; Supabaseยืนยันreadreservation1รายการ/221,092bytes. ไม่มีการสร้างเอกสารซ้ำ. Budgetenabledจริง;Retentioncleanupยังdisabledระหว่างทดสอบprovider.
- LocalSyntheticRestoreฉบับ50migrations/14fixturesผ่าน ใช้pg_dump/pg_restoreจริง เปรียบเทียบcounts/hashesและno-duplicateSENT;serverหยุดแล้ว. ไม่ใช่การrestorebackupจริงของProduction.
- Implemented Operations & recovery: งานค้างทุกประเภทแบบแบ่งหน้า,เปิดงานเดิม,ตรวจexistingSENTโดยไม่ส่งซ้ำ,metadata-onlypost-backupauditเทียบARdeliverymarkersกับreceiptในDB. Missingreceiptไม่ใช่หลักฐานว่ายังไม่ส่งและไม่สร้างreceiptสมมติ.
- Implemented writeholdนอกDBสำหรับก่อนrestore: กันnewmutations/cron/Workflow/providerdispatch;ยังอ่านข้อมูลและตรวจexistingSENTได้. ต้องdrainงานที่เริ่มไปแล้วก่อนrestoreตามrunbook. ไม่ได้เปิดholdในProductionหรือทำproductionrestoreเพื่อทดสอบ.
- Apply20260910220244_ar_operations_recovery (รวม51migrations) หลังตรวจไม่มีfunctionชื่อชน. Local51schema/15fixturesและhostedOperationsrollbackผ่าน. Unitfull758/78filesผ่าน;targeted9/9และLocalbrowser5/5รวม1440/1280/390ผ่าน. กำลังPush/DeployOperations;ผลliveSENTauditยังไม่ได้อ้างว่าผ่าน.
- Goalยังactive: ตรวจliveOperations,providerretentionproof/enablement,บัญชีทดลองแยก3บิลพร้อมทดสอบครบและลบเฉพาะข้อมูลนั้น,finalacceptance/runbook.


## Checkpoint ระหว่างงาน — 11 กันยายน 2026 04:42 ICT: Storage controls และ Retention

- Source ที่ live ก่อนรอบนี้คือ 40a940e80bad38f399adb5b02bcd26f54d7a1940, Worker ade3e831-89c2-421d-998d-5f86084229aa. แยก financial Workflow concurrency1 จากคิวเอกสาร/current refresh concurrency2. KAT full historyสำเร็จ 5,752 Invoice rows /369 Payments /1,836 application links; TSKก่อนหน้าสำเร็จ1,001/135/265. Payment dateใช้OPERA transactionDate ไม่ใช้วันพบยอดศูนย์.
- แก้Statementfont mappingและกู้เฉพาะStatementของงานที่เจ้าของแจ้งแล้ว; PDFจริงเปิดดูได้. NativeInvoice3ไฟล์เดิมคงbytes/timestamps ไม่มีการพิมพ์ซ้ำ. รายละเอียด STATEMENT_FONT_REPAIR.md. Daily ARมีactualcapture2ชุด/175Account rowsแล้ว;ไม่มีการสร้างวันย้อนหลังเทียม.
- Apply4 migrationsใหม่: 20260910213926_ar_operation_budgets, 20260910213928_ar_file_retention, 20260910213931_ar_storage_budget_integration, 20260910213933_ar_retention_integration. รวม50migrations. ก่อนapplyไม่มีตารางชื่อชน; DB41,348,243bytes. Private/RLS/service-only;ไม่มีการReset/Dropหรือเปลี่ยนledger.
- Managed file budget: immutable upload reservations, bounded/precharged downloads, checksum reconciliationไม่uploadซ้ำ, Storage/DB usageจริง, 1GiB stored /2GiB managed file transferต่อเดือนปฏิทินไทย /256MiB DBพร้อม20%headroom. ไม่อ้างว่าmeterนี้คือproviderbillingทั้งหมด; SpendCapที่ตรวจไว้ยังเป็นขอบเขตค่าใช้จ่ายฝั่งprovider. GuardDBหยุดการเริ่มงาน/เพิ่มstaging ไม่บล็อกการบันทึกผลของproviderที่เริ่มไปแล้ว.
- Retention: onecalendar month,exactappownedobjectID/checksum,source+pendingworkrecheck,shared-referencefences,providerDELETEack/absenceproof,tombstonesและhistoryretained. ภาพ/notes/credentialsจริงไม่เข้าGit. Runtimecleanupยังปิดจนกว่าผ่านการทดสอบproviderด้วยข้อมูลสมมติเฉพาะงาน.
- Local schema50migrations/14rollbackfixturesผ่าน. Hostedbudgetfixtureผ่าน; hostedretentionตรวจcalendar/freshness/refs/dispatch/uncertainty/permissionsผ่านแล้วrollback. HostedStorageห้ามSQLDELETEแม้fixture:รักษาguardเดิมและแยกabsence/tombstoneเป็นlocal/providerproof ไม่ปิดการป้องกัน. ตรวจหลังจบไม่มีsyntheticAccount/reservation/retentionitemค้าง.
- Unit749/77files,Typecheck/Buildผ่านก่อนการปรับป้ายexpiredล่าสุด; LocalbrowserStorage+Drive18casesผ่านรวม1440/1280/390. SecurityadvisorมีเฉพาะINFO47privateRLS-no-policyที่ตั้งใจdenyclient. กำลังตรวจรอบสุดท้ายและDeploy;ไม่อ้างว่าcodeใหม่นี้liveแล้ว.
- Goalยังactive: Operations/recoveryhold,finalrestore/acceptance,isolatedAccount3Invoicesจริงในappและscopedcleanupยังต้องทำต่อ. ไม่ส่งเมลลูกค้าจริงหรือเปิดpaidaddon.


## Checkpoint ล่าสุด — 11 กันยายน 2026 01:13 ICT: ประวัติการเงินและ Password Recovery

- Pushed/deployed source `84b32af` บน branch `codex/opera-refresh`; Worker version `d23b27d0-2e26-40d0-a495-41657e012bad`. ก่อนหน้านี้ `75b1b02310d5cadd6ab2d6a18ccff6f5b7cdca27` ผ่าน live health database_verified และ anonymous financial routes 3 เส้นทางถูกปฏิเสธ401. รอบ84แก้การแปลง timestamp PostgreSQL เมื่อ Workflowกลับมาทำต่อ; ไม่เปลี่ยน frontend.
- Applied `20260910173527_ar_financial_history_ingestion` และ `20260910174454_ar_financial_mapping_coverage`: private source invoice/payment/application observations, immutable changes, exact date coverage/commands/leases, atomic Hotel publication. Ten new tables have RLS and no direct client grants. Hosted synthetic transaction rollback passed. ไม่แก้ ledger OPERA หรือ billing/send history.
- Implemented/enabled Financial history: ทุก Account ที่ discoveryพบ, source-date range, paginated records, แยก payment credits/debits/currently applied/unallocated; current applications ตาม invoice-date cohort. วันที่ application event ไม่มีใน API จึงไม่สร้างเอง. Unknown mapping แยกจาก verified payment history และไม่แสดงผลรวม application เป็นศูนย์.
- Full real TSK run `b1e46aaa-369b-4488-816e-574deefc348b` succeeded:70/70 Accounts,1001 invoice rows,135 payment rows,265 verified application links สำหรับ12สิงหาคม–11กันยายน2026. KATยังไม่ผ่านเต็มรอบ; อ่านใหม่และตรวจ Workflowต่อ. ไม่อ้าง financial reportครบสองโรงแรมหรือ current applicationsทุกใบตรวจได้แล้ว.
- Actual sparse detail: cumulative payment fieldอาจไม่ส่งมา; ยืนยัน SUM applicationsกับ independently-read invoice amount minus openก่อน/หลัง โดยค่าที่ขาดยังเป็นnull. ถ้าpayment identity/detailsไม่ครบ คง unavailableเฉพาะmappingนั้น. ไม่มี amount/customer identitiesเข้ารายงานหลักฐานPublic.
- Web password recovery deployed: explicit request, PKCE callback, new/confirm password, short/error/session states; ไม่โหลด/Refreshข้อมูลARขณะกู้รหัส. Supabase allowed redirectเพิ่มเฉพาะ `/?recover=1` บนWorkerนี้; Site URLเดิม/Googleเดิมคงไว้. ตรวจtemplateใช้ConfirmationURL และยังเป็นbuilt-in mail service; ไม่มีSMTP/add-onใหม่. ไม่ส่ง recovery emailจริงหรือเปลี่ยนpasswordผู้ใช้เพื่อทดสอบ.
- Build/Typecheckผ่าน; full unit720ผ่านก่อนtimestampfix และ focusedfinancial10ผ่านหลังfix. Cloudflarebrowser10ผ่านสำหรับauth5+financial5; synthetic images1440/1280/390ตรวจแล้ว. Native Invoice path/Statement rendererไม่เปลี่ยน. LocalPGreplay45migrations/10fixturesผ่านและserverหยุดแล้ว ก่อนเริ่มdraftexternalbilling.
- Supabase connectorเคยขอreauthชั่วคราว; ตรวจใหม่ตามเจ้าของเสนอและSQLผ่านแล้ว. SQL Dashboardยังเข้าถึงได้. ไม่มีcredentialถูกอ่าน/แสดงเพิ่ม.
- งานที่ดำเนินต่อ: external billing provenance/preview/corrections/daily activity, dailyAR/clearing metrics, Operations/recovery hold, integrationของbudget/retentionทั้งSupabase/Drive, final acceptance. Goalยัง active; ไม่อ้างจบงานทั้งหมด. Retention foundationยังไม่เปิดลบไฟล์จริง.

## Checkpoint ล่าสุด — 10 กันยายน 2026 23:04 ICT: Policy บน Cloudflare และหลักฐาน Payment

- Source **e4f56a85fd397bbf3a59680670f1917c86b4e0f8** Push branch `codex/opera-refresh` และDeployผ่านWranglerจริงบนWorkerเดิม. Worker version **4864f885-3c83-4f55-a916-52408020acab**, Workflow **1e3b0361-c2bf-40eb-a097-8031b0ac47bf**. HealthSHA/Supabaseตรง; anonymousthread/remittance19routesยัง401. ไม่เปลี่ยนSecrets/Cron/บัญชีปลายทาง.
- Cloudflare browser26กรณีผ่าน รวมPolicy1440/1280/390, Queue, Composer, Reports และGooglePicker origin-only referrer. Browserจริงเปิด `?collectionPolicy=1` อ่านversion1/offsets-7,+1,+7,+7,+7จากSupabaseได้ ไม่Publishกฎสมมติลงข้อมูลจริง. รายละเอียด COLLECTION_POLICY_VERIFICATION.
- Financial corroboration แบบอ่านจริง: รหัสtransactionในคำตอบapplied-paymentแบบslimตรงกับPayment detailที่อ่านแยกในHotel/Accountเดิม และวันที่ตรง. OriginalAmountยังไม่ตรง signed Payment amount จึงยังไม่ยอมรับเป็นmapping/เปิดingestion. กำลังเพิ่มเฉพาะการเทียบsign/magnitude/Invoice amountแบบcounter ไม่ส่งยอดหรือIDจริงออกlog.
- พบและแก้การพิมพ์ค่ารอบติดลบในlocalUI (เช่น-14) ที่เดิมเครื่องหมายลบหาย; regressionใหม่ผ่าน. การแก้ย่อยนี้กับdiagnosticถัดไปยังรอPush/Deployรอบต่อไป. Goalยังactive;งานส่วนที่เหลือไม่ได้ถูกตัดออกจากขอบเขต.

## Checkpoint ระหว่างงาน — 10 กันยายน 2026 22:54 ICT: กฎรอบทวงและความถูกต้องของประวัติ

- Implemented/local browser tested: Collection rules แบบเพิ่ม/เลื่อน/retire/เปลี่ยนวันและชื่อรอบ พร้อม Preview/CAS/command replay; Queue/Composer/Templates/History ใช้policyเดียวกัน. Message claim เก็บpolicyVersionและstage snapshot; รอบTerminalที่ส่งแล้วคงUrgentแม้เปลี่ยนpolicyภายหลัง. ยังไม่สร้างpolicyจริงใหม่เพื่อทดสอบกับบัญชีลูกค้า.
- Applied/tested Supabase: `20260910145824_ar_collection_policy`, `20260910153901_ar_report_stage_evidence`, `20260910154154_ar_account_history_stage_labels`, `20260910154423_ar_sent_order_tiebreak`. SQL rollbackผ่าน custom stages/templates, policyเปลี่ยนระหว่างpending send, legacy/exception/thread/BySystem guards, captured labelsและurgent. พบและแก้duplicate Gmail auditในmanual-history และเมื่อsent_atเท่ากันใช้captured workflow revisionแทนrandomUUIDตัดสินรอบล่าสุด. Policyheadคง1; business events/synthetic accountsคง0.
- Typecheckและfull unit702/70filesผ่าน. Localbrowser17policy/queue/reports casesผ่าน; ก่อนหน้านี้22policy/queue/templates/composer regressionsผ่าน. ปรับกริดคิวให้สถานะOn holdเพิ่มแล้วไม่เกิดแถวว่างบนDesktop และตรวจสามขนาดซ้ำผ่าน. การDeployชุดนี้ยังรอขั้นถัดไป;ไม่อ้างCloudflare UIผ่านจากlocal tests.
- Wrangler4.129.0เชื่อมจริงแล้วด้วยaccount/user readและworkers_scripts write. CLIรายงานencrypted credential fileโดยกุญแจอยู่Windows Credential Manager;ไม่มีToken/Secretเข้าworkspaceหรือGit. ติดตั้งnative keyring1.3.0เฉพาะdirectoryของWrangler. คงขอบเขตบัญชี/Workerเดิม, public headersและWorkflow concurrency2; dry-runผ่าน. ไม่เพิ่มoptional OAuthสิทธิ์อื่น/paid resource.
- งานย่อยหยุดเพราะCodex usage limit;งานหลักยังดำเนินต่อ. Financial mapping corroboration, financial ingestion/reports, external billing, Operations/recovery/budget/retention integrationและAuth recoveryยังเหลือ. Goalยังactive.

## Checkpoint ล่าสุด — 10 กันยายน 2026 21:34 ICT: completion increment แรก Deploy และอ่านจริง

- Source **c369c848dbc69e7d7cb9407e7f546e51469d13e5** Push `codex/opera-refresh` ใน public `NTHV9/ar-workspace`; staged79filesตรวจsecret/private-artifact/one-time-recipientแล้วไม่พบ. Worker `ar-workspace` deployment **66ce2d5bd1884a48a14d5e65b9d0ebb1**; Workflow **b1a66d8a-52c6-406b-b8c0-ace38634dbac**. HealthตรวจSHA/Supabaseตรง. URL https://ar-workspace.ar-c82.workers.dev/ . Secrets/Cron/แผนบริการเดิมคงไว้.
- Cloudflare browserชุดใหม่19กรณีผ่านครบในการตรวจสุดท้าย และ CIของsourceผ่าน. รอบแรก17/19ผ่าน โดยสองURLยังโหลดUIเก่าที่Account tabsเป็นข้อความ; ตรวจHTML/assetsใหม่แล้วรันยืนยันทั้งชุดผ่าน19/19 ไม่เปลี่ยนbaseline/ลดassertionsเพื่อผ่าน. Unit666/67filesและTypecheck/Buildผ่านก่อนpush (รวมbudgetfoundationที่ยังไม่เปิด). Anonymousใหม่5routesได้401 และthread/remittanceเดิม19routesได้401.
- Browserจริงด้วยsessionที่มีอยู่เปิด Account Collection History และ Documents & Gmail ผ่าน Worker/Supabase แสดงemptyตามข้อมูลจริง ไม่มีสร้างDraft/แก้ประวัติบัญชี. ภาพในGitทั้งหมดเป็นAPI fixturesสมมติ; sourcePNGเดิมคงไว้.
- Financial read-only diagnostic จริงในWorkflow: KATสองบัญชีพบinvoice/payment5/1และ2/1; TSKสองบัญชีพบ0/0และ5/3 (ยอดศูนย์4บิล). page20เทียบ10ตรงทั้งmembership/ค่าที่อ่าน; transactionDateอยู่ในช่วงและadjacent-day checksตรงในตัวอย่างที่มีข้อมูล. รายการจับคู่applied-paymentของสามตัวอย่างยังinvalid_response จึงยังไม่เปิดfinancialingestion/ไม่เรียกยอดตัดInvoiceว่าverified. ขั้นต่อไปตรวจfieldshapeเฉพาะที่อนุญาตโดยไม่ส่งcustomerpayloadออกlog.
- Goalยังactive และยังไม่ใช่ส่งมอบครบทั้งหมด. Policy UI/database integration, financial ingestion/reports, external billing/operations, quota/retention execution และ recovery completionยังดำเนินต่อ.

## Checkpoint ระหว่างงาน — 10 กันยายน 2026 21:25 ICT: completion Goal และกฎล่าสุด

- Goal ยัง active: ทำงานที่เหลือทั้งหมดตาม COMPLETION_PLAN. เจ้าของยืนยัน Statement ใช้ renderer ระบบเราเท่านั้น; Invoice/Folio ใช้ API. ยืนยันเก็บไฟล์ Supabase/Drive หนึ่งเดือนปฏิทินหลังบิลทุกใบที่ผูก verified-zero และไม่มีงานเอกสาร/อีเมลค้าง คงประวัติรายการและการส่ง. ยังไม่เปิดลบระหว่างพัฒนา.
- Implemented/local tested: เส้นทาง Statement บังคับ workspace รวมปิด native research/generic probe; หน้า Account มี Collection History และ Documents & Gmail แบบแบ่งหน้า, saved email อ่าน exact draft/revision โดยไม่สร้างฉบับใหม่; note/dispute/manual hold/release/reopen review มี Preview/CAS/retryคำสั่งเดิม. Dirty account forms คงอยู่เมื่อโหลดข้อมูล/token refresh และถามก่อนทิ้ง; มือถือ preview PDF อ่านอย่างเดียว และย่อจาก Desktop แล้วยังบันทึก Draft ได้.
- Applied SQL จริงใน Supabase ใหม่: `20260910134824_ar_statement_source_policy`, `20260910140014_ar_account_workspace_read`, `20260910140917_ar_invoice_exceptions`, `20260910142129_ar_financial_diagnostic_candidates`. Source/account/exception SQL synthetic rollback ผ่าน. ไม่เปลี่ยน ledger หรือวันวางบิล/stageลูกค้า. ข้อมูลสังเคราะห์คงเหลือ0; business sent events0; exceptions0. เพิ่ม compact last-verified-balance observations1109แถว/zero observation clocks75แถว เพื่อไม่ลืม verified-zero เมื่อมี API unknown ระหว่างทาง และระงับ clock เมื่อ reopen.
- Unit suiteล่าสุด666กรณี/67filesผ่านและTypecheckผ่าน รวม foundationที่ยังไม่เปิดใช้งาน. Browserชุดใหม่ทดสอบบนlocalด้วยAPIสมมติ; ผลCloudflareของincrementนี้ยังรอdeploy. ไม่ใช้ผลunit/SQLแทนหลักฐานOPERA financial historyจริง.
- ตรวจSupabaseDashboardจริง: Pro, Spend Capเปิด, projected/currentค่าแพ็กเกจ$25; egress0.032/250GB, cached0.006/250GB, averageStorage0.004/100GB, disk2GBใช้0.27GB (DB31.9MB/WAL80MB/System167.9MB). Spend Capจำกัดขยายดิสก์ภายใน8GBincluded. ไม่มีเปลี่ยนแพ็กเกจ/add-on. Metricsมีความหน่วงตามProvider ไม่ใช่ตัววัดreal-time.
- พบPhysical daily backupsจริง3รายการ: 9ก.ย.19:44:47UTC, 8ก.ย.19:43:47UTC, 8ก.ย.13:06:35UTC. PITRยังไม่เปิด. กำลังทำlocal PostgreSQL17 synthetic restore drill แยกจากliveและไม่อ้างว่าได้restorePhysical backupแล้ว.
- ยังต้องปิด: policy UI/claims/templates integration, external billing provenance, source-backed daily financial ingestion/reports, Operations/recovery controls, budget integration/retention execution, Auth recovery และ final acceptance. รายละเอียด auditทั้งสามและแผนอยู่ใน COMPLETION_PLAN; checkpointนี้ไม่ใช่คำรับรองงานครบหรือdeployแล้ว.

## Checkpoint ล่าสุด — 10 กันยายน 2026 20:08 ICT: Remittance และหลักฐานส่วนตัว

- เจ้าของยืนยันหนึ่งฉบับต่อหนึ่ง Hotel/Account. Implemented/pushed/deployed: เมนู Remittances และทางเข้าจาก Account, วันที่ได้รับ/เลขอ้างอิง/หมายเหตุ, เลือก Invoice หลายหน้า, ยอดรวมและรายบิลที่ไม่ระบุได้, Preview ก่อนบันทึก, correction history, void/restore และ private evidence PDF/PNG/JPEG.
- สรุปแยกจำนวนฉบับกับ Invoice ไม่ซ้ำ และยอดแจ้งชำระกับ OPERA open. Pending ไม่จำกัดวันที่รับ; Activity ใช้วันที่รับจริง. Void ไม่รวมในยอดสรุป; บิลหาย/ข้อมูลไม่ยืนยันไม่เป็นศูนย์; linked-zero ไม่ถือเป็นเงินรับ. ไม่มีเปลี่ยน ledger, Due Date/stage/hold หรือส่งอีเมลจาก Remittance.
- Source **`0eb387d5651d0d134d4df1681a8d02f0677cb9f4`**, branch `codex/opera-refresh`; Worker `ar-workspace` deployment **`5167f983036f4d0482cc9ac614f62c96`**; Workflow **`c878bcad-207a-40e8-859c-2df8044176b9`**. URL https://ar-workspace.ar-c82.workers.dev/?remittances=1 ; health SHA/Supabase ตรง. คง Secrets/Cron/บริการเดิม.
- Supabase applied `20260910125100_ar_remittance_core`, `20260910125102_ar_remittance_commands`, `20260910125104_ar_remittance_evidence`, `20260910125107_ar_remittance_diagnostic`. มี RLS/owner/revision/command guards และ immutable history/file identities; private helper/table ไม่ให้ client เขียนตรง. ไม่ reset/drop ฐานข้อมูลหรือเพิ่มบริการเสียเงิน.
- Typecheck/Build และ490 unit testsผ่าน; browserบนCloudflare22กรณีผ่าน รวมRemittance21และPicker1. Boundary13routesของRemittanceและ6routesเธรดเดิมได้401; unapproved user ได้403ในtests. ภาพสมมติ12ภาพขนาด1440×900/1280×800/390×844เปิดตรวจแล้ว; referenceเดิมไม่เปลี่ยน.
- Tested จริง **20:08:22 ICT** ผ่าน Browser → Worker → Supabase: synthetic command/summary/history/file metadata tests ทำใน subtransaction แล้วrollback; PDFสมมติ622bytesอัปโหลดPrivate Storageและอ่านกลับ SHA-256ตรง. มี diagnostic receipt verified1/ไฟล์ส่วนตัว622bytesคงไว้. Notice/lines/commands/history/evidenceธุรกิจและsynthetic Accountsคงเหลือ0; business sent events/วันวางบิล/stageทวงยัง0.
- ไฟล์เอาลิงก์ออกยังเก็บ bytes; quotaนับ retained/reserved bytes ส่วนจำนวนไฟล์นับ active links. Restoreคำสั่งเดิมใช้ผลบันทึกเดิมได้แม้Storageขัดข้อง; restoreใหม่ต้องอ่านตรวจbytesก่อน. ยังปิดauto-delete/auto-archive.
- ไม่ทดสอบสร้างRemittanceค้างถาวรกับAccountลูกค้าตามคำสั่งเจ้าของ; normal UI/APIใช้synthetic fixturesร่วมกับDBrollbackและlive isolated storage proof. ขั้นเงินรับจริง/บิลเข้ารายวัน/retention/restore backupยังแยกงาน ไม่อ้างว่าพร้อมครบทุกสถิติ. รายละเอียด [REMITTANCE_VERIFICATION.md](REMITTANCE_VERIFICATION.md).

## Checkpoint ล่าสุด — 10 กันยายน 2026 18:36 ICT: เธรด Gmail และดูบทสนทนา

- Implemented / pushed / deployed: เลือก New email/Existing thread ใน Email Composer, ค้นหาจาก To/CC ที่ตั้งเอง, preview ผู้ร่วมสนทนาและ parent, ยืนยัน Hotel/Account ก่อนเลือก, ล็อก subject ให้ตรงเธรดและกลับไป New email ได้. ไม่แทนผู้รับด้วยอีเมล OPERA หรือ participant ใน Gmail.
- ดูข้อความ metadata/snippet แบบแบ่งหน้าและ Refresh โดยคน; ใช้ historyId กันข้อความคนละเวอร์ชันปนกัน. แสดง incoming/outgoing/unknown และ explicit reply reference โดยไม่เปลี่ยนยอด วันวางบิล วันครบกำหนด stage/hold หรือ KPI. ยังไม่ใช่ระบบ auto-monitor inbox/Remittance.
- Source **`67ad43f0121adfeb7e53a5c0d002ba76aa92b588`**, branch `codex/opera-refresh`; Worker deployment **`03c7af55e74245199353ecec01251518`**, Workflow **`f10eaa54-c2ed-4e77-b9b1-b3a823328a7c`**. Health SHA/Supabase verified และ anonymous 6 routes ได้401. ไม่เปลี่ยน cron/secrets/บริการเก่า.
- Supabase applied **`20260910112014_ar_email_threads`**: private choices/RLS, selection/getter, save/claim thread guards และ isolated diagnostic list. ฟังก์ชันเดิมของแอปใหม่นี้เก็บใน private helpers เพื่อรักษากฎธุรกิจและปิดทางเรียกข้าม guard. ไม่มี reset/drop/แก้ ledger. SQL synthetic rollback ผ่าน; leftovers0/business events0.
- Typecheck/Build และ342 unit testsผ่าน; rootทดสอบ browser20กรณีบนlocalและ21กรณีบนCloudflare (รวม Picker regression). ภาพใหม่ที่1440×900,1280×800,390×844ใช้ข้อมูลสมมติและเปิดตรวจแล้ว; baseline/referenceเดิมคงไว้.
- Tested Gmail จริง **18:31:44 ICT**: อ่านเธรด test เดิมผ่าน Worker, ส่ง generic PDF สมมติ1ไฟล์แบบ reply, ตรวจ SENT/threadId/RFC headers/ผู้รับ/ข้อความ/file hash ผ่าน และอ่านเห็น2ข้อความในเธรดเดียวกัน. Diagnostic sentรวม5, business events0, private account thread choices0. ผู้รับทดสอบไม่เข้าGit/defaults และ proofไม่เก็บ matchedRecipients.
- Tested incoming จริงหลังเจ้าของตอบ: Refresh เวลา18:36แสดง3ข้อความในเธรด โดยคำตอบเวลา18:34เป็น Incoming พร้อม snippet และ Explicit reply reference ตรง parent ของtestล่าสุด. หลังอ่าน business events/วันวางบิล/stageทวง/การผูกเธรดกับบัญชีจริงยัง0. เส้นทางบัญชีจริงยังไม่ทดสอบส่ง/บันทึกเธรดกับลูกค้า ตามคำสั่งให้ใช้ข้อมูลสมมติ. รายละเอียด [EMAIL_THREADS_VERIFICATION.md](EMAIL_THREADS_VERIFICATION.md).

## Checkpoint ล่าสุด — 10 กันยายน 2026 17:46 ICT: Drive จริงและแก้ Google Picker

- Implemented / pushed / deployed: Storage, แยก Drive OAuth แบบ `drive.file`, ยืนยันโฟลเดอร์ที่เจ้าของกำหนด, archive ชุด PDF ที่ตรวจแล้วแบบ explicit และ synthetic connection test. Source แรก `40590266b46014a1f204297c45e30277a2b7cfe1`; source ปัจจุบัน **`ebfc2cf79fba1d3636b323edd613accb65e00302`**, branch `codex/opera-refresh` ใน public `NTHV9/ar-workspace`.
- Worker `ar-workspace`: https://ar-workspace.ar-c82.workers.dev/?storage=1 ; deployment **`7a0757b985d3491fa0cf448dabd258ed`**; Workflow version **`86378705-6914-47d8-97a1-d59d36bd8b33`**. Live health ยืนยัน SHA ตรง, Supabase database_verified และ OPERA connected. Cron เดิมคงไว้.
- Supabase `ar-workspace` / `jmyvpurzmoiecpydjrci`: applied **`20260910093801_ar_drive_archive.sql`**. เพิ่ม private targets/connections/OAuth states/archives/commands/file receipts พร้อม RLS และ service-only RPC; destination revision, token refresh CAS, immutable source revision และ pre-generated Drive file ID กันซ้ำ. SQL rollback checks ผ่านก่อน deploy; ไม่มี reset/drop หรือเปลี่ยนบัญชี OPERA.
- Google Cloud: ใช้ client ใหม่ `ar-workspace-gmail` และ callback เดิม; owner ยืนยันเพิ่ม Worker JavaScript origin และสร้าง `ar-workspace-picker` ที่จำกัดเฉพาะ Worker origin กับ docs.google.com และ Drive/Picker API. ค่า key อยู่ใน Worker Secret; provider refresh tokens เข้ารหัสใน private DB. ไม่มี secret/client secret/backend provider token ลง browser bundle.
- พบจริงและแก้ `The API developer key is invalid`: key ใน Picker ตรงกับ Google Console และข้อจำกัดถูกต้อง แต่ asset response ใช้ `Referrer-Policy: same-origin` จึงไม่มี Referer ใน cross-origin iframe. เปลี่ยนเป็น `strict-origin-when-cross-origin`. Browser regression ก่อนแก้ได้ Referer undefined; หลัง deploy ได้เฉพาะ app origin โดยไม่ส่ง path/query. คีย์และ API restrictions เดิมไม่ถูกผ่อนคลาย; OAuth callback ยังคง `no-referrer`.
- เจ้าของเลือกโฟลเดอร์จริงผ่าน Picker สำเร็จหลังแก้. Worker ตรวจพร้อมใช้ และ sharing เป็น **Restricted**. สถานะ owner-only ตรวจพบแล้วหลังเจ้าของอนุมัติจำกัดสิทธิ์; ไม่อ้างว่า agent เป็นผู้กดเปลี่ยน sharing. Folder ID และหลักฐานส่วนตัวอยู่นอก Git.
- Tested จริง **17:44:24 ICT**: Browser → Worker → Supabase receipt → Drive อัปโหลด PDF สมมติ 622 bytes, ตรวจ metadata/parent/size/SHA-256 และอ่านกลับ checksum ตรง จากนั้นย้ายเฉพาะ file ID ที่ test สร้างไป Trash. DB ยืนยัน `read_verified=true`, `state=trashed`, error null, upload session/claim ถูกปล่อย. มี Drive test 1 รายการ ไม่มี business document job ที่ถูก archive จริงในรอบนี้.
- Gmail regression จริง **17:45:45 ICT**: ส่ง diagnostic 1 ฉบับไปผู้รับครั้งเดียวที่เจ้าของอนุญาต พร้อม PDF สมมติ 1 ไฟล์ ไม่มี supplemental/customer documents; verified SENT ผ่าน. Diagnostic sent รวม 4; business sent events ยัง **0**. ผู้รับไม่ถูกบันทึกเป็น account default/source/docs.
- By System ตรวจผ่าน synthetic browser cases: portal link, คำแนะนำให้พนักงานบันทึกวันวางบิลจริง, ปิด Gmail billing และยังอนุญาต collection email; ไม่มีเปิดส่งข้อมูลเข้า portal หรือแก้ประวัติ Account จริง. Account/recipient data สำหรับ browser tests ถูก intercept ด้วยข้อมูลสมมติ.
- Typecheck/Build ผ่าน; unit suite 319 ข้อผ่านก่อนแก้ header และ Drive unit 49 ข้อผ่านหลังแก้. Cloudflare browser ชุด Drive/Document/By System ผ่าน 26 ข้อ และ cross-origin referrer regression หลังแก้ผ่าน 1 ข้อ. ภาพ evidence ที่เปลี่ยนเป็นข้อมูลสมมติและเปิดตรวจแล้ว; reference ทั้งเจ็ดไม่เปลี่ยน.
- Enabled: เชื่อม Drive และ explicit archive controls. ปิด auto archive/auto cleanup; ยังไม่กำหนด retention. การ archive reviewed business exports หลายไฟล์ผ่าน unit/SQL/browser simulation แต่ยังไม่อ้างว่าทดสอบอัปโหลดเอกสารลูกค้าจริงครบ เพราะเจ้าของให้ใช้ข้อมูลสมมติเท่านั้น.
- ยังเหลือ: review ข้อความใช้งานกับเจ้าของ, existing threads/reply-remittance/รายงานเงินรับตามนิยามที่ยืนยัน. การลบ Google credentials เก่ายังเป็นรายการรอตรวจผลกระทบ แยกจาก Drive; ไม่ลบ project, default Compute service account หรือ resource เก่าใดในรอบนี้. รายละเอียด [DRIVE_ARCHIVE_PLAN.md](DRIVE_ARCHIVE_PLAN.md) และ [GOOGLE_RESOURCE_REVIEW.md](GOOGLE_RESOURCE_REVIEW.md).

## Checkpoint ล่าสุด — 10 กันยายน 2026: นำเข้ากฎและผู้รับจากชีท Agent

- เจ้าของยืนยันทุก53แถวในชีทเป็น Billing Required และให้ใช้กับทั้ง KAT/TSK ที่ Account No.ตรงกัน นำเข้า104บัญชีจริง (KAT53/TSK51) แบบtransactionเดียว ไม่เลือกจากชื่อคล้ายและไม่สร้างบัญชีที่ไม่พบ
- KAT By Email49/By System4; TSK By Email47/By System4. อ่านกลับเทียบค่า Credit Term,อีเมลแยก Billing/Collection,Portal/คำแนะนำครบ104รายการตรง ไม่มี mismatch;ข้อมูลและSQLรายบัญชีอยู่ในprivate/agent-settings-import ไม่อยู่Git
- 721 eligible existing invoice workflows รับกฎเริ่มต้นตามที่เคยอนุมัติ ยังคงไม่มีวันวางบิล/รอบทวง/Due Date ที่เดาขึ้น และไม่มี business sent events
- สอง source rows ช่องอีเมลวางบิลเป็นชื่อแบบฟอร์ม: เก็บคำแนะนำพร้อมเว้นBilling To ไม่คัดลอกอีเมลทวงมาแทน. สองsource accountsไม่พบTSKจึงกำหนดเฉพาะKAT. ปรับquoteเกินท้ายและรายชื่อซ้ำตามprivateaudit
- เพิ่ม Billing Type,HTTPS PortalและคำแนะนำในAccount Settings. BySystemเตรียมPDFแล้ววางในระบบAccountและบันทึกfirst actual billing date; Gmail Billingถูกบล็อกทั้งUI/Worker/data claim แต่Collection emailยังใช้ได้ ไม่มีเชื่อมPortalAPIหรือส่งแบบอัตโนมัติ
- เพิ่มLoad account recipientsให้ผู้ใช้เลือกดึงprofileปัจจุบันเข้าอีเมลที่ค้างไว้ โดยไม่แก้ข้อความ/ผู้รับเก่าเงียบๆ
- Applied `20260910062740_ar_billing_channel`; SQLrollbackพิสูจน์pending-handoff guardแม้ยังไม่มีsettings,zero-day term,actor/revision/no-op,legacy/currentclaimและประวัติไม่เปลี่ยน. Full104-rowrehearsalrollbackผ่านก่อนนำเข้าจริง
- Typecheck/Build/270unit testsและ29Cloudflarebrowser checksผ่าน;ภาพใช้ข้อมูลสมมติ. เปิดAccount Settingsจริงเห็นBySystem/CreditTerm/Portalตรงชีท;ไม่ส่งอีเมลหรือSubmitPortalในรอบนี้
- Push/Deploy source **9a95100669e2c4b8d0ee6f7adff2f64ef6ec9474** บน`codex/opera-refresh`; Worker deployment **0771d880f4594ff5ace7f93986793413**, Workflow **388d39aa-c46c-4bc9-8619-775ecc95e78b**. Health200 SHAตรงและSupabaseverified
- รายละเอียด: [BILLING_CHANNEL_IMPORT.md](BILLING_CHANNEL_IMPORT.md). ยังต้องเติมอีเมลวางบิลสองsource rowsเมื่อมีข้อมูล;บัญชีอื่นนอกชีทยังไม่ได้กำหนดกฎเอง


## Checkpoint ล่าสุด — 10 กันยายน 2026: Templates, Rich text, Reports และจอเล็กพร้อมตรวจ

- ทำครบชุดงานที่เจ้าของอนุมัติให้ทำขณะไม่อยู่หน้าคอม: versioned email templates, rich message editor, verified activity/current reports, laptop/mobile และ regression/security checks
- เมนู Templates มีแม่แบบ Billing/Friendly/Follow-up 1–3/Final; บันทึกและอ่านกลับทั้งหกผ่าน UI → Worker → Supabase จริงเป็น version 1 มี history/archive/copy-earlier-version โดยไม่แก้ข้อความหรือ Due Date ย้อนหลัง
- Rich text รองรับ bold/italic/underline/list/quote/links/undo/redo; MIME มี plain+HTML และตรวจทั้งสองส่วน แก้ selection timing และ multilingual payload limits จาก independent review แล้ว
- Reports แยก Current receivables กับ Verified sent activity, วันที่ไทย, First billing/Rebilling/รอบทวง, filters/pagination/Invoice history; เปิด Account แล้วย้อนกลับรักษาตัวกรอง ช่วงวัน และหน้าเดิม
- ไม่มีสร้าง cash/arrivals/remittance ยอดสมมติ; ข้อมูลธุรกิจจริงยังไม่มี actual sent events จึงแสดงประวัติว่างตามจริง ส่วน current เปิดอ่านจาก Supabase ได้จริง
- ทดสอบส่ง Rich text ผ่าน Cloudflare/Gmail ไปยังผู้รับครั้งเดียวที่เจ้าของอนุญาต verified SENT **04:19:49 ICT** พร้อม PDF สมมติหนึ่งไฟล์; ไม่รวมเอกสารลูกค้า ไม่เก็บผู้รับใน Git/defaults
- หลังงาน: templates 6/version rows 6, business events 0, assigned history dates/stages 0, recipient defaults 0, active supplementals 0; diagnostic sent ทั้งหมด 3 (รอบนี้เพิ่ม 1)
- Applied migrations: `20260909205357_ar_email_templates_rich`, `20260909205630_ar_activity_reports`, `20260909210914_ar_sent_evidence_immutability`; SQL rollback/owner/revision/no-op/immutable history checks ผ่าน ไม่มี reset/drop/เปลี่ยน legacy หรือ paid add-on
- Typecheck/Build/260 unit tests ผ่าน; 57 Cloudflare browser cases +23 editor harness cases ผ่านตามหลักฐาน รอบสุดท้ายมี timeout2กรณี แล้วตรวจซ้ำด้วย trace ผ่าน4/4โดยไม่แก้ timeout/assertions รายละเอียดและข้อจำกัดใน UNATTENDED_COMPLETION.md
- ภาพ synthetic จาก Cloudflare ตรวจ viewport 1440×900,1280×800,390×844; Portfolio/Account/Email1440เป็นภาพ1440×900จริง Referencesทั้งเจ็ดไม่เปลี่ยน
- Sourceที่ Push/Deploy: **125e366d46ef84ea61427c51694e524a0a6f5060**, branch `codex/opera-refresh`; Worker `ar-workspace` deployment **08d9cbb89be6446f9ed8384b88d353e3**, Workflow **0e5acf8c-d5ee-4ad7-85ad-a02a32b590dc**; health SHA ตรง Supabase verified; cron OPERA07:00/19:00และGmail15นาทีคงเดิม
- ยังรอค่ากฎและผู้รับรายบัญชีจริง/Drive folder/retention/นิยามเงินรับ; existing threads, reply-remittance และ native OPERA Statement transport ยังไม่ใช่ส่วนที่พร้อมครบ ดู **[รายงานละเอียด](UNATTENDED_COMPLETION.md)**


## Checkpoint ล่าสุด — 10 กันยายน 2026: ไฟล์แนบเพิ่มเติมและส่งทดสอบครบสามชนิด

- Email Composer อัปโหลด/preview/นำไฟล์เพิ่มเติมออกได้ รองรับ static PDF, PNG, JPEG แยกจาก generated PDFs และรวมจำนวน/ขนาดทั้งสองกลุ่มในหน้าตรวจทานก่อนส่ง
- ตรวจ owner/revision/package/handoff และ UUID+SHA กันซ้ำ รวมงบทั้งชุดแบบ atomic; ไฟล์ล้มเหลวต้อง retry หรือเอาออกอย่างชัดเจนก่อน handoff การนำออกเป็น soft removal ไม่ลบไฟล์ต้นฉบับหรือหลักฐานส่ง
- Applied ar_supplemental_attachments, ar_test_supplemental_snapshot, ar_test_command_guard ใน Supabase ใหม่; ไม่มีเปลี่ยนบัญชี/ยอด/legacy/แผนเสียเงิน
- Live upload PDF 2 หน้า, PNG, JPEG ผ่าน Worker ไป Private Storage พร้อม hash ตรงและเปิด preview ได้; PDF สมมติที่มี OpenAction ถูกปฏิเสธและปุ่มส่งถูกกั้น
- เจ้าของยืนยันผู้รับทดสอบครั้งเดียวเพิ่มเติม จึงส่งผ่าน diagnostic แบบ explicit supplemental selection โดยไม่รวม customer-generated PDFs; Gmail verified SENT เวลา 03:04:07 ICT พร้อม 4 ไฟล์ (test PDF ของระบบ + ไฟล์สมมติ 3 ชนิด) ไม่บันทึกผู้รับเป็น defaults/source/docs
- หลังทดสอบนำไฟล์สมมติ 3 รายการออกจาก working draft แล้ว: active supplementals 0/soft removed 3/business events 0/ประวัติบิลเปลี่ยน 0/recipient profiles ที่มี To 0; private originals/sent evidence คงอยู่
- Build/Typecheck/212 unit tests และ 14 browser tests ผ่าน รวม Desktop/Laptop/Mobile; SQL rollback owner/retry/budget/handoff/tombstone/test-source guards ผ่าน; anonymous attachment methods 401
- Deployed source 171f84c5be987327f21eba5115cfd1eb3ec3073d บน ar-workspace deployment ea16fc1e477a499c81326c35487d1f60, workflow 337c0f1a-c9b3-4675-8676-43276b2a1242; health SHA ตรง Push codex/opera-refresh
- ยังไม่รองรับ XLSX/DOCX/archives/interactive หรือ encrypted PDF; ยังไม่ใช่ antivirus guarantee และยังมีงาน templates/threads/real account rules/reply-remittance/reports ต่อ รายละเอียด SUPPLEMENTAL_ATTACHMENTS_VERIFICATION.md


## Checkpoint ล่าสุด — 10 กันยายน 2026: ลดรอบตรวจ Gmail เป็นทุก 15 นาที

- เจ้าของเห็นชอบให้ลดจากทุก 5 เป็นทุก 15 นาที เพื่อลดรอบฐานข้อมูลที่ไม่มีงาน เหลือ 96 รอบ/วัน (2,880 รอบใน 30 วัน) จาก 288 รอบ/วัน ลดประมาณ 67%
- แก้ Worker cron handler, Cloudflare cron configuration และค่า interval ที่หน้าคิวอ่านเป็น 15 นาที คง OPERA 07:00/19:00 ICT, manual Check sent status, immediate post-send verification และ batch 3 ตามเดิม ไม่มี migration/ล้างประวัติ/ส่งอีเมล
- Scheduler tests 5 เคสผ่าน รวมไม่ส่งอีเมล/ไม่เปิด OPERA refresh จาก Gmail cron และไม่ทำงานซ้ำเมื่อ lease หมด; Typecheck/Build ผ่าน
- Push source c442e956f17b377cefdb81a001a0c129feae74fb บน codex/opera-refresh; deployed Worker ar-workspace: 3ee1632d41914f3aa478e4a40fc23377, workflow 3e3e3bed-c1e6-418e-a9d1-5527030d0399
- Cloudflare read-back ยืนยัน cron ใหม่ทุก 15 นาทีและ OPERA cron เดิม; health SHA ตรง เป็นการตรวจ configuration/deployment ยังไม่ได้รอรอบ scheduled 15 นาทีรอบแรก


## Checkpoint ล่าสุด — 10 กันยายน 2026: Collection Queue และรอบตรวจ Gmail ตามเวลา

- เพิ่ม Collections: คิวตาม Hotel/Account Type/Account, Next action, Latest sent stage, Ready/Upcoming และค้นหา แยกบิลจริงในแผงขวาและเตรียมเอกสารตาม purpose โดยไม่ส่งอีเมลอัตโนมัติ ใช้ชื่อเต็ม Follow-up 1/2/3 ตามคำยืนยันล่าสุด
- กติกา Friendly due-7 / Follow-up 1 due+1 / รอบหลังจาก actual previous send+7 / Urgent หลัง Final มียอด ผ่าน tests; งานไม่มีกฎ/ข้อมูลไม่ยืนยันยังเห็น Setup needed/Needs review ไม่ซ่อนหนี้ และไม่ทวง child แยกจาก parent
- Live Browser → Worker → Supabase โหลด 836 บิล / 69 กลุ่ม ตรงฐานข้อมูล แยก child 12 แถว; TSK filter 107 บิล / 23 กลุ่ม ทุกบิลปัจจุบันยังไม่มีกฎบัญชีจึงอยู่ Setup needed ไม่ seed ค่ากฎเพื่อให้ดูมีงาน
- Applied ar_mail_reconcile_schedule, ar_collection_queue, ar_mail_reconcile_fence; read view ใช้ security_invoker/RLS; manual+scheduled ใช้ lease เดียวและตรวจ lease ก่อนแต่ละฉบับ ไม่มี path create draft/send ใน scheduler
- เปิด cron Gmail ทุก 5 นาที โดยคง OPERA 07:00/19:00 ICT; actual scheduled runs 01:25:50 และ 01:30:50 ICT complete ทั้งคู่ ไม่มี eligible business deliveries จึง checked 0 ไม่อ้างว่าตรวจส่งงานจริงผ่าน scheduled แล้ว
- Build/Typecheck/200 unit tests และ 6 browser tests desktop/laptop/mobile ผ่าน; SQL rollback lease/fence และ unapproved authenticated RLS ผ่าน; anonymous queue/reconcile 401
- Deployed bcb78228eacf0c6bec60f952013fbb7f18dbb146 บน ar-workspace deployment f3f8a32e1f404234813de4b04160063d, workflow df6dbba1-e5b6-4ff1-a6bd-fd1900fb3c53; health SHA ตรง Push branch codex/opera-refresh
- ไม่มีอีเมล/Draft เพิ่มรอบนี้ business sent events 0/ประวัติบิลเปลี่ยน 0/ตั้งกฎบัญชี 0 รายละเอียด COLLECTION_QUEUE_VERIFICATION.md และ COLLECTION_QUEUE_DESIGN.md


## Checkpoint ล่าสุด — 10 กันยายน 2026: ส่งตรงจาก Worker และตรวจ Sent ผ่านจริง

- เพิ่ม Review & send now → ตรวจผู้รับ/ข้อความ/Invoice/Folio/ไฟล์ → checkbox ยืนยัน → ส่งโดยคนเท่านั้น ไม่มี auto-send; Collection เลือก stage ชัดเจน, normal Billing ต้องมีกฎบัญชีที่กำหนดแล้ว
- ใช้ durable claim/revision และ immutable snapshot กันส่งซ้ำหรือบันทึกทับ ผลไม่แน่นอนใช้ Check sent status ไม่ยิงส่งใหม่; บันทึก Billing/Collection แบบ atomic หลังตรวจ SENT/เวลา/ตัวตน/ผู้รับ/เนื้อหา/PDF hash ครบเท่านั้น
- เพิ่ม Gmail readonly บน client ของแอปใหม่และ consent ผ่านจริง ทดสอบส่งตรงจาก Worker 1 ฉบับพร้อม PDF สมมติ เวลา 00:39:54 ICT; ผู้ใช้ยืนยันเผลอย้ายเข้า Trash ตรวจฉบับเดิมผ่านโดยไม่ส่งซ้ำ
- พบ Gmail เปลี่ยน RFC Message-ID จึงใช้ immutable provider receipt ที่แยกจาก observed candidate สำหรับ direct send; SENT+Trash ยังพิสูจน์การส่งได้เมื่อหลักฐานครบ แต่ draft หายไม่ใช่ sent
- Applied migrations ar_mail_delivery, ar_mail_revision_guard, ar_mail_receipt_provenance ใน Supabase ใหม่ ไม่แก้ยอด/legacy; final postcheck delivery 1/test sent 1/business events 0/ประวัติบิลเปลี่ยน 0/ผู้รับใน app records 0
- Build/Typecheck/189 unit tests และ 7 browser tests desktop/laptop/mobile ผ่าน; SQL rollback tests first billing/due/Final/duplicate/concurrent edits/test exclusion ผ่าน ไม่ทำ business event สมมติถาวร
- Deployed source c2ea6516fa3e668a401c7cdad42c9b4f249aa5d7 บน ar-workspace, deployment be002e58e51c491e9100a29e06a126f0, workflow 61528f8c-7353-4140-9a86-3cb23042dd00; health SHA ตรงและ anonymous send/check ได้ 401
- ยังต้องทำ: Collection Queue, scheduled read-only reconciliation, existing threads, rich-text/templates, supplemental inspection/upload และ live proof ของ Gmail-side draft-send correlation รุ่นใหม่; normal customer send ยังไม่ทดลองเพราะไม่มีคำสั่งส่งลูกค้าจริง รายละเอียด GMAIL_SEND_VERIFICATION.md


## Checkpoint ล่าสุด — 10 กันยายน 2026: Email Workspace และ Gmail Draft ทดสอบจริงแล้ว

- เปิด Email preparation จากชุด PDF ที่ review/save แล้วได้ แก้ผู้รับ/Subject/ข้อความ บันทึก workspace draft แยกจาก Gmail draft; ตรวจ owner/revision/ไฟล์แนบและ OPERA ปัจจุบันก่อน handoff มี single claim ป้องกันคำขอซ้ำ/ผลไม่แน่นอน
- สร้าง OAuth client ใหม่ ar-workspace-gmail ใน Google Project ar-project-506410 ซึ่งยืนยันผ่าน callback ของแอปใหม่แล้ว ไม่แก้ legacy clients เก็บ secrets ใน Worker และ provider tokens เข้ารหัส private schema
- Google consent → Worker callback → Gmail getProfile ผ่านจริงด้วยบัญชีที่อนุญาต; สร้าง Gmail Draft จริงพร้อม Statement 1 + Invoice 2 ไฟล์ ตรวจใน Gmail ว่าไฟล์ครบ
- เจ้าของอนุญาตผู้รับทดสอบแบบครั้งเดียวภายหลัง: นำไฟล์ลูกค้าทั้งหมดออกจาก Draft ใน Gmail เปลี่ยนเป็นข้อความทดสอบทั่วไปแล้วส่ง 1 ครั้ง Gmail แสดง Message sent ไม่บันทึกผู้รับใน app defaults/source/tests/docs และไม่บันทึก AR billing/reminder event ไม่อ้างว่าเป็นการส่งตรงผ่าน Worker หรือยืนยันถึงกล่องผู้รับ
- Applied migrations: ar_email_workspace, ar_gmail_connection, ar_email_save_guard, ar_gmail_claim_guard ใน Supabase ar-workspace (jmyvpurzmoiecpydjrci) ไม่มี reset/drop/เปลี่ยนยอดหรือข้อมูลระบบเดิม
- Build/Typecheck และ 179 unit tests ผ่าน; SQL rollback guards ผ่าน; browser 4 เคส desktop 1440×900, laptop 1280×800, mobile 390×844 ผ่าน ภาพสังเคราะห์ใน evidence/email-composer-*.png ผ่าน visual review เทียบแบบ ไม่แก้ baseline
- Source b1ac3c0965c43db160d599533cf9d86959a98071 Push branch codex/opera-refresh และ Deploy Worker ar-workspace: c59cf3e40fed4c59ad2bbc4460c7ecc7; Workflow version 62198213-a253-413d-abee-82c1cbcfc293; health SHA ตรง, anonymous Gmail 401, เปิดกลับแล้ว Gmail connected และ Create Draft ซ้ำถูกปิด
- Postcheck: Gmail attempt 1 (created), workspace drafts ที่มีผู้รับ 0, account settings 0, invoice workflow ที่กำหนด billing/reminder history 0
- ยังไม่ครบ: Send Now จากแอป, reconcile sent กลับเป็น billing/reminder events, เลือก thread เดิม, rich-text/versioned templates และ supplemental uploads; หน้าแสดงข้อจำกัดตามจริง อ่าน EMAIL_WORKSPACE_VERIFICATION.md และ EMAIL_COMPOSER_DESIGN.md


## Checkpoint ล่าสุด — 9 กันยายน 2026: Account Settings และประวัติตั้งต้นพร้อมใช้

- เจ้าของยืนยันให้ทั้ง Billing Required/Not Required และ Credit Term ใช้กับบิลเก่า และให้ Default เป็น Not billed / No reminders sent โดยแก้ประวัติย้อนหลังได้ ไม่ใส่วันที่ส่ง/วางบิลเอง
- เพิ่ม Account Detail → Overview สำหรับกฎบัญชีและ Billing/Collection To/CC/BCC และฟอร์ม Billing & reminder history ในรายละเอียด Invoice; ใช้ revision กันบันทึกทับและเก็บ audit ข้อกำหนดที่ผูกกับบิลแล้วไม่เปลี่ยนตาม default ใหม่เงียบ ๆ
- Applied migration ar_account_workflow ใน Supabase โครงการใหม่; Required รอ actual first billing date ส่วน Not Required ใช้ OPERA base date + term เมื่อกำหนดครบ ไม่แก้ข้อมูลการเงิน OPERA
- SQL rollback tests ตรวจ due/term pinning/history/สิทธิ์/การแยก Hotel ผ่าน; 162 unit tests/Typecheck/Build ผ่าน Browser settings 3 เคสผ่าน desktop/laptop; document regression มี timeout หนึ่งครั้งและ targeted rerun ผ่าน รายละเอียดใน ACCOUNT_SETTINGS_VERIFICATION.md
- Source c2252400d0188cb6f73bbed5ace384d5e3a16874 deployed ผ่าน d8be2ee9a6484402a06308050a73eba6; health SHA ตรงและ unauthenticated settings ได้ 401 เปิดตรวจข้อมูลจริงว่าบิลเก่าแสดง default ถูกต้องแล้ว
- ยังไม่มีการกรอก Credit Term/ผู้รับ/ประวัติจริงแทนเจ้าของ และไม่ได้ส่งอีเมล Email Composer/Gmail handoff ยังเป็นขั้นถัดไป ไม่อ้างว่าเชื่อม Gmail ผ่าน Worker แล้ว


## Checkpoint ล่าสุด — 9 กันยายน 2026: ทดสอบชุดเอกสารจริงครบสามรูปแบบ

- ทดสอบ KAT/TSK ทั้ง combined, Statement + Invoice bundle และแยกแต่ละ Invoice; ดาวน์โหลด 12 ไฟล์ เปิดตรวจหน้า/ลำดับ/Folio และ hash/ขนาดตรงกับ private receipts ทั้งหมด TSK Invoice สองหน้ายังคงอยู่ไฟล์เดียว
- Statement รุ่นสุดท้าย KAT 40 บิล 2 หน้า (34/6 แถว), TSK 27 บิล 2 หน้า (27 แถว/ส่วนท้าย) ตรวจ manifest ไม่ขาด/เกิน ยอดตรง และแนวคอลัมน์/Voucher ผ่าน เพิ่มดาวน์โหลดสองไฟล์นี้รวม 14 ไฟล์ที่ตรวจ hash ตรง
- KAT ทดลองเพิ่มหมายเหตุ → Save Draft → ปิด/เปิดกลับแล้วข้อความครบ จากนั้นลบหมายเหตุและบันทึก final ไม่มีข้อความทดสอบเหลือในไฟล์แยก ทั้งสองโรงแรมรักษารูปแบบที่บันทึกไว้เมื่อเปิดกลับ
- พบและแก้ initial delivery preference ที่ถูกละเลยตอนเปิด Editor ครั้งแรก และช่องว่างท้าย Voucher ที่ทำให้แนวตัวเลขคลาดเคลื่อนเล็กน้อย ข้อมูล OPERA/ยอด/หัวข้อ Aging เดิมไม่เปลี่ยน
- ทดสอบ replay command ไม่สร้างงานเพิ่ม, stale revision ถูกปฏิเสธ และ API/storage failure แบบจำลองไม่แสดง PDF ทดแทน ไม่มี deliberate outage/ปิดสิทธิ์/ส่งอีเมล
- Source 51226191d0cb412e39786eeb2ce6b27d8d940126 deployed ผ่าน deployment 6ce77294f884449fada551f15b405797; 156 unit tests/Typecheck/Build ผ่าน พบภายหลังว่า Vite watcher ล้ม EBUSY บน private PDF จึงตั้งให้ข้าม private/.cache; รอบ Browser tests สุดท้ายผ่านพร้อมกันครบ 20 เคสใน 50.3 วินาที ไม่เพิ่ม timeout/ลด assertions การตั้ง watcher เป็น dev-only ไม่เปลี่ยน runtime บน Cloudflare
- รายละเอียด หลักฐาน และลิงก์งานใน DOCUMENT_PACKAGE_VALIDATION.md ข้อมูลจริงอยู่ private/document-validation-20260909 นอก Git ไม่มี migration/paid service/แก้ legacy เพิ่มในรอบนี้


## Checkpoint ล่าสุด — 9 กันยายน 2026: จัด Voucher กึ่งกลางตามภาพ OPERA

- เทียบภาพที่เจ้าของให้: OPERA จัดหัวและค่า Voucher กึ่งกลาง ส่วนของเราชิดซ้าย แก้ทั้งหัวและทุกบรรทัดของค่าโดยคงความกว้างคอลัมน์/ข้อมูลครบ รวมกรณี Voucher ยาวสองบรรทัด
- ตรวจตำแหน่ง PDF จริงก่อนแก้ไม่ผ่าน หลังแก้ผ่าน KAT/TSK หลายหน้าและกรณีข้อความยาว ตรวจภาพตัวอย่างแล้ว; แนว Debit/Credit/Balance ยังผ่านตามเดิม ไม่เปลี่ยน Aging หรือหัวข้อ
- Source 238fdb5c37bc67c53b180fbf2440b56125c7449c pushed/deployed; deployment 28c2e4c622864d76bae242db9fe2cd05; workflow version 592ca928-d438-4775-adba-ce5afcf5bca4; health SHA ตรง 155 tests/Typecheck/Build ผ่าน ไม่มี migration หรือเขียนทับ PDF เดิม
- ฉบับข้อมูลจริงใหม่ ready ทั้งคู่: KAT 43115ebe-51c0-45d5-a7fe-b68be6eb448c และ TSK 233aea6c-f845-4130-bdf0-12fa67b71213 สำหรับเปิดตรวจใน PDF Workspace


## Checkpoint ล่าสุด — 9 กันยายน 2026: แก้แนวหัวคอลัมน์จำนวนเงินใน Statement

- ตรวจข้อสงสัยยอด Selected-only เทียบ Aging: ข้อมูลตัวอย่างยืนยันว่ามีบิลนอก selection อีกหนึ่งใบ จึงทำให้ยอดทั้งบัญชีมากกว่ายอดเลือก ไม่ได้เปลี่ยนยอดหรือ scope หลังเจ้าของยืนยันให้คง Aging ทั้งบัญชีและหัวข้อเดิมตาม OPERA
- แก้ Debit/Credit/Balance header ให้ชิดขวาเดียวกับข้อมูลในทุกหน้าที่มีตาราง ทั้ง KAT/TSK ไม่เปลี่ยนตัวเลขหรือ baseline RTF
- scripts/check-statement-alignment.py ตรวจ PDF ที่เรนเดอร์จริง: ก่อนแก้ล้มเหลว หลังแก้ผ่าน KAT/TSK หลายหน้า ตรวจภาพตัวอย่างแล้ว; 155 tests/Typecheck/Build ผ่าน
- Source 376bd2c68d8c6ad240240df9a71bc0c6340be5e0 pushed/deployed; deployment 7c75a52eb2bf48a7b195cd0b4e0a45bf; workflow version 5e08ea9b-bc08-44fd-ad34-529fc38b57b3; health SHA ตรง ไม่มี migration หรือแก้ไฟล์ PDF ที่บันทึกเดิม
- สร้างฉบับแก้ไขจากข้อมูลจริงพร้อมตรวจ: KAT job 771b3f90-1a35-498f-b343-00f0e0ff0a82 และ TSK job 75323183-f623-46d5-b406-82f0c0194547 ทั้งคู่ ready ไม่มี error เอกสารเก่ายังคงอยู่


## Checkpoint ล่าสุด — 9 กันยายน 2026: Generate in AR Workspace เชื่อมข้อมูลจริงและ PDF Workspace

- เพิ่มตัวเลือกภาษาอังกฤษตามเจ้าของ: Statement source → Generate in AR Workspace; ค่าเริ่มต้นยัง Original from OPERA ไม่มี fallback อัตโนมัติหรือป้ายสร้างโดยระบบบน PDF
- Apply migration ar_workspace_statement ใน Supabase โครงการใหม่ เพิ่ม provenance ของ job และ private template assets พร้อม service-only RPC; ไม่แก้ ledger/ข้อมูลเดิม ตรวจสิทธิ์และคำสั่งซ้ำผ่าน
- สร้าง Statement จริงผ่าน Worker จาก selected manifest และตรวจ OPERA สด: KAT 2 ใบที่ไม่ติดกัน, TSK 1 ใบ; เก็บ PDF Private และเปิดใน PDF Workspace/Preview ได้ทั้งคู่ เติม Arrival/Departure จาก Folio History ที่ยืนยัน identity แล้ว
- แก้เครื่องหมาย Payments จากผลจริงให้ Debit + signed Credit = Balance; trial แรกถูกบล็อกก่อนสร้างและคงหลักฐานไว้ รวมยอดเฉพาะที่เลือก แต่ Aging เป็นทั้ง Account
- Source 0305d9b91889b374657d0632ec84b04e124c9709 pushed/deployed; deployment eaeed98ff8c846be8f7ded41c095a140; 155 tests/Typecheck/Build ผ่าน รายละเอียด job IDs และขอบเขตทดสอบใน WORKSPACE_STATEMENT_INTEGRATION.md
- ส่วนคงที่จาก RTF เป็นภาพ 288 dpi ในเอกสาร ส่วนรายการเป็นข้อความ; ไม่รับรองเหมือน OPERA 100% ยังไม่ได้ทดสอบ live multipage/รวม native Invoice รอบใหม่ ไม่มี email/actual billing/เปลี่ยนยอดบัญชี ภาพและข้อมูลจริงอยู่นอก Git


## Checkpoint ล่าสุด — 9 กันยายน 2026: สร้าง PDF ภาษาไทยบน Cloudflare จริงผ่านแล้ว

- Cloudflare connector ยังเข้าถึง ar-workspace ได้ HTTP 200; Wrangler CLI ไม่ได้ล็อกอิน แต่ใช้ connector deploy ได้ ข้อผิดพลาด workerd เดิมอยู่ฝั่ง local startup ยังไม่ได้ระบุ root cause และไม่ใช่หลักฐานว่ารีเครื่องแล้ว Cloudflare หลุด
- Source 207c130647a473933289bd2dfc5849455d81fbbe pushed/deployed ผ่าน deployment abbd43995b6344049f46f794b38c2182 เพิ่ม fontkit/Noto Sans Thai พร้อม OFL และ endpoint วินิจฉัยที่ใช้ข้อความสมมติคงที่หลังตรวจ Auth/allowlist
- เปิด /?rendererCheck=1 ด้วย session จริงแล้วได้รับ PDF จาก Worker และ PDF.js แสดงภาษาไทย/อังกฤษได้ ตรวจภาพและไม่มี console error; unauthenticated API ได้ 401; health ยืนยัน Supabase และ source SHA ตรง
- Typecheck, 149 tests, Vite build และ connector bundle ผ่าน การปฏิเสธบัญชีอื่นทดสอบด้วย mock; ไม่อ้าง live second-user test
- ยังไม่ใช่ Statement ลูกค้าหรือการผูก template เข้ากับ document job ไม่มี migration/บริการเสียเงินเพิ่ม/แก้บัญชี OPERA รายละเอียดใน STATEMENT_RENDERER_FEASIBILITY.md


## Checkpoint ล่าสุด — 9 กันยายน 2026: ทดลองแนวทาง JavaScript สำหรับสร้าง Statement

- ทดสอบใช้ pdf-lib เติมข้อมูลสมมติบนส่วนคงที่จากแม่แบบ PDF เปล่าที่สร้างจาก RTF โดยไม่ต้องรัน LibreOffice ต่อเอกสาร สร้าง 4 PDF และตรวจครบ 8 หน้า; Voucher/ยอด/หัวซ้ำ/ขนาดหน้าผ่าน
- ESM bundle สำหรับ browser platform ผ่าน แต่ Wrangler local workerd เริ่มไม่ได้ (Windows access violation) จึงยังไม่ได้พิสูจน์ Worker runtime หรือ deploy จริง
- ข้อจำกัดสำคัญ: ฟอนต์ข้อมูลชั่วคราวยังไม่รองรับไทย, ต้องแยกและลด PDF resources ใน blank assets, ทำ validation/decimal/pagination production และต่อ Auth/private job ก่อนใช้จริง ยังไม่เหมือน OPERA 100%
- ตัวทดลองและแม่แบบอยู่ private/statement-worker-spike นอก Git; Commit เฉพาะผลวิจัย ไม่มีบริการใหม่/ค่าใช้จ่ายบริการใหม่/OPERA mutation/migration/deploy รายละเอียดและทางเลือกใน STATEMENT_RENDERER_FEASIBILITY.md


## Checkpoint ล่าสุด — 9 กันยายน 2026: เทียบ Statement เพิ่มเติมและปรับตัวทดลองรุ่น 2

- เจ้าของรับทิศทางหน้าตาตัวทดลอง และให้ตัวอย่าง KAT/TSK ใน Downloads/Batch พร้อม Batch 1681351.PDF เพิ่มเติม เปิดภาพทุกหน้าของตัวอย่างใหม่ทั้ง 5 ไฟล์แล้ว (รวม 8 หน้า)
- ตัวอย่าง TSK ใช้ The Shore ตรงกับ RTF ที่ให้มา จึงปิดข้อสงสัยเรื่องโลโก้จากหลักฐานตัวอย่างได้ ตัวอย่างหลายหน้ายืนยันหัว Statement/Account ซ้ำทุกหน้า และไฟล์ล่าสุดยืนยันหัวตารางซ้ำเมื่อมี Invoice ต่อหน้า
- ปรับเฉพาะ offline generator ให้หัวข้อมูลซ้ำและส่วน Aging/ธนาคาร/เงื่อนไข/ลายเซ็นอยู่ด้วยกัน ตัวทดลอง 4 PDF ตรวจ Voucher และยอดครบ; single อย่างละ 1 หน้า, 45-row อย่างละ 3 หน้า เปิดดูภาพทุกหน้าแล้ว ไม่มีลายเซ็นโดดเดี่ยว
- ยังไม่รับรองตรง 100% หรือจำนวนหน้าเท่ากับ OPERA เพราะ fixture คนละข้อมูลและยังมี spacing/font metrics ต่างกัน การจับส่วนท้ายไว้ด้วยกันอาจเหลือพื้นที่ว่าง
- ผลอยู่ private/statement-trial-v2; ต้นฉบับและหลักฐานลูกค้าอยู่นอก Git ไม่มี deploy/migration/เปลี่ยนบริการจริง รายละเอียดใน STATEMENT_RTF_RENDER_TRIAL.md


## Checkpoint ล่าสุด — 9 กันยายน 2026: ทดลองสร้าง PDF จาก RTF เดิมแล้ว

- เจ้าของอนุมัติsystem-renderedtrialและไม่เพิ่มgenerated-by-ARlabelบนPDF. ใช้ข้อมูลสมมติเท่านั้น;ไม่มีส่งemail/แก้ledgerหรือdefaultnativeworkflow.
- สร้างprivatePDF4ไฟล์จากRTFcopiesด้วยscripts/statement-template-trial.pyและLibreOfficeheadlessที่แยกcache:KAT/TSKsingle1หน้า;45InvoiceKAT2หน้า,TSK3หน้า. ตรวจครบVoucher/ยอด/Letterpages/no unresolvedfields/noเพิ่มlabelและrenderดูภาพจริง.
- ยังไม่100%:KATมีanchor/spacing/fontmetricsต่างจากnativebaseline;TSKมีPreparedlineแยกหน้าและยังไม่มีnativeTSKbaseline. ไฟล์TSKที่เจ้าของให้แสดงTheShore;คงตามต้นฉบับและฝากคำถามไว้.
- SourceRTFhashไม่เปลี่ยน. ผลPDF/RTF/ภาพและbank/letterheadจริงคงอยู่private/statement-trialนอกGit. Commitเฉพาะgeneratorที่ไม่มีข้อมูลจริงและเอกสารผล.
- เป็นofflineprototype ไม่ได้deployหรือเชื่อมWorker/Supabase. ไม่มีpaidSDKหรือการแก้OPERA. ดูรายละเอียดSTATEMENT_RTF_RENDER_TRIAL.md.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ทดลอง getARStatements inclFolios=true จริง

- เจ้าของอนุมัติGETtrial:KATselected2Invoiceเดิม หลังยืนยันHistoryสดแบบscoped. Workflowab607d47-8d2b-405e-bc66-5ac7c3940e92complete.
- ผลrequested2/returned2,exactScope=true,balancesMatch=true,serverคืนinclFolios=true. ยังเป็นJSONdescriptor มีreportSeqNoและInvoice/Folioข้อมูล;pdfStrings=0,links=0. ไม่ได้postStatements.
- PrivateJSONเก็บในjobtrialเดิมนอกGit. Normaldefaultfalseไม่เปลี่ยน;เปิดtrueเฉพาะadmintrial. ไม่มีaccounting/email/reportconfigurationmutationหรือmigration.
- Sourcee754c26e01ec09344e4599f58d4d03d40ef03231 pushed/deployed;deploymentd8412470f3b248ea8b6305821a88767c. Typecheck146unit/connectorbuildผ่าน;healthSHA/Supabaseจริงตรง.
- NativeStatementPDFBackendยังไม่สำเร็จจากflagนี้;ผลละเอียดในINTERNAL_STATEMENT_TRACE.md.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจ HAR รอบเปิด Print Invoices

- อ่าน1.1/2.1/3.1.harแล้วจำนวน14/125/2requests. ยืนยันcheckboxPrintInvoicesส่งค่าtจริง.
- BatchReportsมี4งาน:Statement1และInvoiceTemplate3 ทุกงานFinishedSuccessfully;มีreportviewerGETPDFหนึ่งคำขอและBATCHตรงกัน. รอบก่อนมี1งาน.
- ยังไม่มีdirectOHIPrequest/reportSeqNo/ช่องทางไฟล์ใหม่ในtrace. HARไม่เก็บPDFbinary จึงไม่อ้างpagecountหรือmergedmembershipที่ยังไม่ได้เปิดตรวจ;ตอนนี้ไม่มีEdgesessionสำหรับดูPDF.
- พบflaginclFoliosในpublishedARSตรงแนวคิดincludeInvoice/Folioเป็นcandidateสำหรับread-onlytrialถัดไป ยังไม่อ้างทดสอบtrueผ่านBackendแล้ว. ไม่มีnewPOST/reportgeneration/source/deploy/migrationรอบนี้.
- รายละเอียดเทียบอยู่INTERNAL_STATEMENT_TRACE.md;rawHARอยู่นอกGit.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจ repository Oracle ทั้งชุดเพิ่มเติม

- ยืนยันmainยังเป็นdd631fbd5d0fce74a7dbdf96b43f07ce587211f2. อ่านtreeครบ163filesและดาวน์โหลดsnapshotไว้ignoredcache;ไม่cloneทับprojectหรือใช้workflow/sourceเป็นฐาน.
- ตรวจแบบstructuredscan61RESTspecs/3641operations,successbinaryschemas32operations,Postman6collections/2923requests และGraphQLarea79files;อ่านcandidateเกี่ยวกับเอกสารละเอียด.
- พบgetFileAttachment/getEmailFile/CustomizedLetter/RegistrationCardและR&AObjectStorageเป็นfile-capable routesเพิ่มเติมนอกkeyword50รายการ แต่ยังไม่มีmappingจากInternalStatement BATCH/reportSeqNo. ไม่ยิงIDเดา/ไม่ส่งemail/ไม่สร้างPARหรือsubscription.
- ตรวจIssues/PR126recordsพร้อมcommentsที่ระบุในORACLE_STATEMENT_ISSUES_REVIEW.md;PR82เป็นR&AstorageของscheduledPublisher ไม่ใช่InternalStatementrenderer.
- ผลสรุปและขอบเขตอยู่ORACLE_REPOSITORY_WIDE_REVIEW.md. ยังไม่พบnativeStatementBackendtransportที่พิสูจน์ได้จากrepo;ไม่มีappcode/migration/deploy/บริการจริงเปลี่ยนในรอบนี้.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจทุก operation ในสองแท็บ OHIP แล้ว

- ตรวจReportทั้ง7modules/33operations และStatementทั้ง3modules/17operations รวม50distinctoperationsตามfiltersที่เจ้าของเปิดไว้. เปิดครบทุกmoduleและอ่านmethod/URI/operationID/Infoที่มีจากDOMจริง;5ReportMasterrowsไม่มีInfodescriptionจึงตรวจofficialschemaแทน.
- ตรวจrequest/responseเต็มจากOracleprimaryspecsประกอบทุกรายการ. getFolioReportเป็นตัวที่มีPDFbytefieldชัด แต่เป็นReservationFolioที่ระบบใช้แล้ว. getARStatements/postStatements/getStatementsHistory/getReports/getAllReports/getReportParametersมีประโยชน์ตามขอบเขตที่บันทึก ไม่ได้เพิ่มnativeStatementPDFtransport.
- generateChannelBillingStatementsเป็นChannelcontractbilling(deprecated);postGenericReportsเป็นconfigcreate;cashierClosureReportsListคืนประเภทreportenum ไม่ใช่files. ตรวจprintReportmetadataและRTFattachmentidentityแล้ว ไม่ถือเป็นPDFoutput.
- ตารางรายตัวครบ33และ17อยู่OHIP_REPORT_OPERATION_REVIEW.mdและOHIP_STATEMENT_OPERATION_REVIEW.md;สรุปOHIP_REPORT_STATEMENT_REVIEW_SUMMARY.md. ตรวจลำดับแถวครบ50แล้ว.
- รอบนี้ไม่มีExecute/TryIt,reportgeneration,email,configuration/subscription/keychange,migrationหรือdeploy. คืนสองแท็บสู่ผลค้นหาเดิม. ผลคือinspection/schema reviewไม่ใช่liveintegrationtestใหม่.
- ยังไม่พบoperationเพิ่มเติมใน50ผลค้นหานี้ที่พิสูจน์การรับInternalARStatementPDFจากBackend. ไม่ขยายเป็นคำกล่าวว่าOracleไม่มีAPIอื่น.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ไล่ Internal Statement และตรวจ History API แล้ว

- ยึดInternal/Customized ReportของOPERAตามเจ้าของยืนยัน;พักR&Aเป็นเส้นทางของStatementนี้.
- HARพบnumericBATCHครั้งแรกในresponseของpollReport(entry98ใน2.har);รหัสตรงGETreportviewerใน3.har. ไม่พบruntimebinding reportSeqNo/P_REPORT_SEQ/P_ARRAYในcapturedOPERArequest/response. SampleXMLไม่ใช้ยืนยันruntime.
- GETstatementsHistoryจริงผ่านWorkerโดยprofileIDจากfreshAccount:1history,ไม่มีชื่อไฟล์/เลขStatement/links และไม่พบcapturedBATCH. lastStatementInfoไม่มีfile/number. ไม่ได้สร้างStatement/พิมพ์/ส่งอีเมลเพิ่ม.
- Deployed sourceb122d209ce521a65c1a18ff061f2b18bccbdc3bd;deployment13f35d623d1a4d8da5dadc22c0baa916;Workflowc467daf0-dfcc-4bc0-86df-871f877f16e7complete. Typecheck145unit/connectorbundleผ่าน;healthSHAตรง. ไม่มีmigration/UIchange.
- BackendnativeStatementยังไม่verified;ไม่เดาBATCH=reportSeqNoและไม่copyUIstate. ผลและขอบเขตที่พิสูจน์ได้อยู่INTERNAL_STATEMENT_TRACE.md.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจ OHIP Portal จริงแล้ว

- อ่านAPI/Applications/Subscriptions/EnvironmentจากOHIPที่เจ้าของเปิดให้. Report search9items,Statement search3items;ไม่พบnativeARStatementPDFoperationเพิ่มเติมจากชุดเตรียม/ประมวลผล/ประวัติที่ทดสอบแล้ว.
- ReportMasterData12operationsเป็นconfiguration;ContentServiceพบgetFolioReport/emailFolioReport. ไม่เรียกemailและไม่แก้subscription.
- พบMyApplication TLK-Test(Production),subscriptionAPI Catalog for OIC;ไม่เปิดKey/ไม่เทียบกับWorkersecretจึงไม่อ้างexactApplicationbindingหรือPublisherRESTentitlement.
- EnvironmentยืนยันTSTLKL/client_credentials/scopeและGatewayตรงระบบที่ใช้. ไม่แก้IPallowlist/clientsettings/credentials.
- PublisherUIเข้าได้จริงแต่Catalogที่ค้นstatementไม่มีผลลัพธ์ และRESTmetadataยังไม่ผ่าน. ยังไม่ได้POSTPublisherrunหรือสร้างรายงานใหม่. รายละเอียดในSTATEMENT_EXTERNAL_CONTRACT_FOLLOWUP.md.


## Checkpoint ล่าสุด — 9 กันยายน 2026: พบ Publisher host จริงผ่าน SSO

- เปิดจากOPERA → Reporting And Analytics → Reports and Dashboards ได้OracleAnalyticsบนhgbu.gbua.ap-mumbai-1.oci.oraclecloud.com และยืนยันtenant /xmlpserver/ เปิดPublisherHomeได้จริง.
- ค้นหาstatementจากAnalyticsCatalogแบบAll/subfoldersและPublisherSearchได้0resultsทั้งสอง;ไม่สรุปว่าไม่มีhiddenreport แต่ยังไม่พบcatalogpathของkat_statement.
- ทดลองGETmetadataของcatalogreportที่เห็นจริง:single-encodedpathได้404;double-encodedตามคู่มือถูกEdgeบล็อกERR_BLOCKED_BY_CLIENT. ยังไม่พิสูจน์PublisherRESTหรือOHIPcredentialใช้ได้ และไม่ได้POSTrun.
- ไม่มีแท็บOHIPDeveloperPortalและไม่มีURLบัญชีที่ยืนยัน จึงฝากคำถามขอURL/เปิดแท็บโดยไม่ขอSecret. ไม่มีการส่งOracleinquiry/แก้รายงาน/สร้างรายงาน/เปลี่ยนสิทธิ์/Deployในรอบนี้.


## Checkpoint ล่าสุด — 9 กันยายน 2026: อ่าน Template และ Sample XML ของ Statement แล้ว

- อ่านค่าจริงManage Reports/kat_statement:ชนิดCustomized Report,ไฟล์kat_statement.rtf,Sample ReportและDatasource=sample_statement. ไม่ใช่ชนิดURL/Reporting And Analytics;ไม่พบPublisherhost/catalogpathในหน้านี้.
- ดาวน์โหลดTemplateและSample XMLเก็บนอกGitในDownloads. อ่านโครงสร้างพบXMLPublisher-style xdoxslt,รายการG_INVOICESและAgingคนละส่วน;parameterชื่อP_REPORT_SEQ/P_ACCT_NO/P_ARRAY/P_RESORTเป็นข้อมูลประกอบใหม่ แต่ยังไม่พิสูจน์mappingกับOHIPหรือexternalrenderer.
- ไม่มีการแก้fields/Save/upload/Generateหรือcredentials. Browsercontrolหลุดหลังดาวน์โหลด จึงไม่ได้ยืนยันCancel;ไม่อ้างว่าออกจากหน้าแล้ว. ไม่มีsource/deployment/migrationใหม่.
- NativeStatementBackendยังไม่สำเร็จ;ผลรายละเอียดและhashไฟล์อ้างอิงอยู่STATEMENT_EXTERNAL_CONTRACT_FOLLOWUP.md. ไม่ใช้Templateสร้างPDFเองแล้วอ้างOPERAoriginal.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจ Publisher route ตามคำขอ

- ตรวจแบบไม่ส่งCredential: GET /xmlpserver/ บนUIhostได้401;บนOHIPgatewayได้404. OPTIONS /xmlpserver/services/rest/v1/reports/kat_statement/run บนUIhostได้401 ไม่มีAllow/WWW-Authenticate.
- ยังไม่ได้POST run เพราะPublisherURL/catalogreportPathและselectionparametersยังไม่ยืนยัน. 401ไม่พิสูจน์ว่ามีPublisherหรือว่ารหัสOHIPใช้ได้;ไม่เอาClientSecret/Cookieไปทดลองสุ่ม.
- ตอนตรวจต่อไม่พบEdgesessionที่เชื่อมอยู่ จึงยังสำรวจผ่านloginหน้าเว็บไม่ได้. HARrunReportmatchเป็นGuidedLearningtooltip ไม่ใช่API.
- ไม่มีsource/deploy/migration/รายงานใหม่/อีเมลในรอบนี้. ร่างOracleinquiryยังไม่ส่งตามคำสั่งเจ้าของ;ผลละเอียดอยู่STATEMENT_EXTERNAL_CONTRACT_FOLLOWUP.md.


## Checkpoint ล่าสุด — 9 กันยายน 2026: คืนความครบถ้วนของ Printed Invoice แล้ว

- Implemented/pushed/deployed source1bddeaebd6504eed82e25a8274546f0187a65e90 บนcodex/opera-refresh. Worker ar-workspace deploymente7ed46ccc43448ad9b288295f0d90aa2; Workflow version832bf057-48b5-4a9e-927f-3684eb8dc619. HealthยืนยันSHAและSupabaseจริง.
- RefreshตรวจHistoryครบเมื่อCurrentไม่ตรง เพิ่มเฉพาะopenInvoiceที่Printed=trueและมีcompressionmetadataชัดเจน. Shared Current/history balancesต้องตรง,root totalsต้องตรงAccount,อ่านCurrentซ้ำและยืนยันHistoryเฉพาะใบซ้ำก่อนpublish. ไม่แทนCurrentทั้งชุดด้วยHistoryหรือยอมรับunknown mismatch.
- Root membershipใช้Historyที่ยืนยันแล้วเพื่อไม่บวกยอดบิลย่อยซ้ำ. Parent conflicts/duplicate/changed data/cross-Hotelยังถูกปฏิเสธ. Native InvoicePDFอ่านHistoryแบบscopedได้เมื่อCurrentไม่มีใบที่Printedแล้ว แต่ยังตรวจtransaction/invoice/folio/reservation/date/balanceและกันchildก่อนrender.
- ทดสอบRefreshจริงเฉพาะKATAccountที่มีปัญหา run7b8f3494-ed38-4e6f-90f8-4dc2cb82ac4f succeeded. หลังatomicpublishมี43Invoiceครบ;2ใบของtrialเดิมอยู่ครบ ยังopenและcollection_selectable=true;sumตรงAccount. ไม่อ้างว่าเป็นfull175-account auditรอบใหม่.
- ทดสอบnativeInvoicePDFของใบPrintedที่หายจากCurrent: jobbff5e71c-c4d6-452c-aab6-89c652626a18 ready,1file116672bytes,PDFparsed/hashedและเก็บPrivateStorage. ไม่สร้างStatementหรือส่งอีเมลในรอบนี้.
- Buildผ่าน;หลังreviewfixTypecheck/connectorbundleผ่าน;144unit testsผ่าน;6deployedbrowserregressionsผ่าน (auth/privatePDF/childselection/navigation). CIของsourceผ่าน https://github.com/NTHV9/ar-workspace/actions/runs/34315250244 . Independent reviewสองข้อได้รับการแก้และยืนยันแล้ว.
- ไม่มีmigrationหรือUI/design change. ภาพregressionใช้syntheticเท่านั้น;ไม่มีลูกค้าPDF/JSON/credentialsเข้าGit. OriginalledgerในOPERAไม่แก้.
- NativeStatementPDFผ่านBackendยังรอsupported external execution/auth contract;ร่างOracleinquiryยังไม่ส่ง. ผลแก้PrintedInvoiceนี้ไม่ใช่การปิดGoalStatementทั้งหมด.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ตรวจต่อขณะเจ้าของไม่อยู่คอม

- Deployed source576529126d875f248999d7a11959bf26ee6c71a6, branchcodex/opera-refresh, Worker ar-workspace deployment34894f052b7745c3beb8e34c2e846a4d, Workflow version19edc5d4-3491-4d9e-bc65-c4a2bdf2175a. HealthยืนยันSHA/Supabaseจริง. เพิ่มadmin read-only diagnostic;ไม่เปลี่ยนUIหรือnormalrefresh.
- Auditจริง a9e0c809-d238-467f-ac53-b1f84c42a3bb: Current41Invoice,เพิ่มfetchInstructions=Statementก็41;Historyครบ452rowsมี43openInvoice. History-only2ใบเป็นPrintedทั้งคู่และตรงPOSTtrialเดิม. Accountbalanceคงเดิม;HistoryopenรวมตรงAccountแต่Currentรวมไม่ตรง.
- คงmembershipguardเดิมเพื่อไม่publishชุดขาดและไม่ตีความmissingเป็นzero. เพิ่มregressionกรณีprinted-but-openหายจากCurrentแล้วต้องreject. ยังไม่ได้เปิดการเติมแถวจากHistoryในnormalizer/documentvalidation;ข้อกำหนดก่อนแก้อยู่STATEMENT_API_RESEARCH.md.
- Typecheckและconnectorbundleผ่าน;129unit testsผ่านก่อนเพิ่มregressionล่าสุด จากนั้นtargeted snapshot16testsผ่าน. รอบนี้ไม่มีmigration,accountingwrite,email,newStatementหรือcredentialcopy.
- Researchตรวจexternalcontractเพิ่มแล้ว ยังไม่พิสูจน์OHIPใช้UIreportviewerหรือสร้างBatchได้. เตรียมร่างคำถามOracleในSTATEMENT_EXTERNAL_CONTRACT_FOLLOWUP.md โดยยังไม่ส่ง. ไม่ซื้อreportingproduct/add-on และไม่ใช้UIcookiesเป็นBackendcredentials.


## Checkpoint ล่าสุด — 9 กันยายน 2026: พบ Statement PDF จากหน้า OPERA จริง

- HAR1/2/3ล่าสุดเชื่อมครบถึงPDFrequestแล้ว:จำนวน7/106/1requests;2.har entry98เปิดreportviewerด้วยbatchIDที่ตรง3.har GET,HTTP200,application/pdf,inline,no redirect. ไม่ต้องเก็บHARซ้ำ. เนื้อbody348bytesใน3.harเป็นHTML embedของviewer ไม่ใช่PDFbinary;ใช้ภาพPDFจริงที่ตรวจในรอบเดียวกันเป็นหลักฐานrender. ยังไม่พิสูจน์OHIP authหรือAPIสร้างbatchภายนอก;ไม่มีการcopycookies/JSFstateเข้าBackend. รายละเอียดSTATEMENT_API_RESEARCH.md.

- แก้คำแนะนำการเก็บHAR:ภาพล่าสุดของเจ้าของยืนยันreportviewer Refreshแล้วได้Report not found แม้HTTP200. จึงไม่ให้Refreshซ้ำเพื่อจับPDF;ต้องเตรียมcaptureก่อนpopupเปิดครั้งแรก. ยังไม่พิสูจน์ว่าเป็นsingle-use/หมดอายุ/ปัญหาconfiguration. ไฟล์HARชื่อเดิมยังเป็น104entriesก่อนหน้า ไม่ใช่captureของerrorล่าสุด.

- HARที่สองชื่อopera-statement-pdf.harมี104entriesจากBatch Reports/LaunchPage. Entry97ตอบFinished Successfullyพร้อมคำสั่งเปิดreportviewerและrep=BATCH_{id}. ยังไม่มีคำขอPDFโดยตรงหรือPublisherRESTในtrace. ยืนยันขั้นต่อจากHARแรกแล้ว แต่ไม่ใช่หลักฐานOHIPเรียกrenderer/viewerได้. ไม่ต้องCreate Statementซ้ำเพื่อเก็บหลักฐานนี้;rawHARคงPrivate.

- HARจากแท็บหลักอ่านแล้ว12requests:6ADFformPOST/textXML +6imageGET. เห็นเปิดreportwindowผ่านUI /launch แต่ไม่มีreportviewer/PDF/PublisherRESTrequestในไฟล์นี้. ต้องเก็บHARจากแท็บPDFที่เปิดอยู่เพิ่ม;ไม่ต้องCreate Statementซ้ำ. HARและViewState/customercontentคงอยู่นอกGit. รายละเอียดในSTATEMENT_API_RESEARCH.md.

- เจ้าของเปิดEdgeและเลือก3Invoiceไว้ พร้อมอนุญาตCreate Statement. ดำเนินการหนึ่งชุดผ่านBatch Statements Options → Process Statements → Batch Report Destination (kat_statement / Preview) → Process. Batch ReportsแสดงComplete/Finished Successfully.
- เปิดnativeStatement1หน้าใน /OPERA9/opera/operacloud/reportviewer?ex=PREVIEW&rep=BATCH_{id} บนOPERA UI host. ตรวจภาพPDFจริง:3FolioและBalance Dueตรงselection;มีVoucherอ้างอิงในแบบพิมพ์.
- Aging Summaryเป็นยอดทั้งAccount ไม่ใช่เฉพาะรายการที่เลือก จึงยังไม่ผ่านการอ้างselected-onlyทั้งtotal/aging. ไม่แก้PDF/แบบพิมพ์เพื่อให้ทดสอบผ่าน.
- พบUI download/view routeแล้ว แต่ยังไม่พิสูจน์OHIP authentication,ขั้นตอนสร้างbatch IDหรือAPIสำหรับBackend. ไม่ใช้browsercookiesแทนprovidercredentials.
- Edgeconnectorควบคุมหน้าเว็บได้แต่ไม่มีNetwork/DevTools API;ขอsanitizedHARที่เก็บนอกGitเพื่อวิเคราะห์ต่อ. ไม่อ้างว่าจับNetworkแล้ว. ภาพลูกค้าอยู่ในprivatebrowserเท่านั้น;ไม่ส่งอีเมล ไม่กดชำระเงิน/ปรับยอด.
- รายละเอียดอยู่STATEMENT_API_RESEARCH.md. รอบนี้ไม่มีsourcecode/migration/deploymentใหม่.


## Checkpoint ล่าสุด — 9 กันยายน 2026: ทดลอง getARStatements → postStatements จริง

- เจ้าของขอทดลองลำดับนี้โดยตรง: KATหนึ่งงาน/สองInvoice; ตรวจCurrentและdescriptorตรงรายการ/ยอดก่อนPOST. ใช้durableclaimและprivate immutable marker; POSTหนึ่งครั้ง ไม่มีauto-retry.
- ผลจริง HTTP201, JSON {}, Location=/ars/v1 ไม่มีquery/ลิงก์ไฟล์/PDF bytes. Locationเป็นAPIbaseจึงถูกguardหยุดก่อนGET;ไม่ได้POSTซ้ำ.
- หลังPOST selected2รายการไม่อยู่ในCurrent Account invoicesแบบเดิม แต่HistoryพบตรงtransactionIDครบ2/2 ยอดค้างเท่าเดิมและไม่ศูนย์. **ไม่ใช่หลักฐานชำระเงินหรือCLEARED**;ยังไม่สรุปสาเหตุการเปลี่ยนrepresentation. ต้องตรวจStatement fetch/contextก่อนปรับrefresh;คงexact-membership guardและsnapshotเดิมเมื่อข้อมูลไม่ตรง.
- ไม่มีการส่งอีเมลหรือบันทึกactual billing. ไม่เรียกAPIจ่ายเงิน/ปรับยอด/ลบ/ย้อนStatement. ไฟล์ทดลองทั้งหมดอยู่Private Storage;ไม่มีcustomerPDF/JSONเข้าGit.
- Source4c3dddb8f722346f7ba86e604fb2134d53210c88 pushed branchcodex/opera-refresh, Worker ar-workspace deployment4a2954881270432c84b250042c0b636f; healthSHAตรงและSupabasedatabase_verified. ไม่มีmigrationหรือfrontendchange.
- InitialtrialBuildผ่าน; backendfollow-upTypecheck/connectorbundleผ่าน;128unit testsผ่านก่อนเพิ่มread-onlycomparisonรายละเอียดท้ายรอบ. รายละเอียดและrunIDsอยู่STATEMENT_API_RESEARCH.md.
- NativeStatementPDFยังไม่สำเร็จ: ได้หลักฐานใหม่ว่าPOSTทำงานจริง แต่responseที่ทดสอบไม่ให้ไฟล์ดาวน์โหลด. PDFWorkspace/Invoiceเส้นทางเดิมยังคงอยู่;ไม่เปิดStatementtrialจากUIทั่วไป.


## Checkpoint ล่าสุด — 9 กันยายน 2026: Goal PDF Workspace — editorพร้อมตรวจ, Native Statementยังไม่ครบ

**Goal เป็น blocked และยังไม่สำเร็จครบ** หลังตรวจสาม goal turns ต่อเนื่อง: native Statement PDF transport ยังไม่มีหลักฐานรับไฟล์จริง และต้องรอ operation/คู่มือจาก Oracle หรือข้อมูลใหม่ที่ยืนยันช่องทางสร้างและดาวน์โหลดไฟล์. เจ้าของอนุมัติให้ทำงานต่อขณะนอนแล้ว; ไม่ต้องรับ Secret เพิ่มสำหรับส่วนที่ทำสำเร็จ.

### Implemented / pushed / deployed
- Source `e34439c4fc67c11608e8bf45c107ff584a8059f6` บน `codex/opera-refresh` / public `NTHV9/ar-workspace`; Worker `ar-workspace` deployment `40373775cc7d450898675d3607ceef26`; Workflow version `497a0ef1-975f-4be6-aa4c-d034098d74db`. เว็บ https://ar-workspace.ar-c82.workers.dev .
- Applied `20260908185317_ar_document_jobs` และ `20260908194840_ar_document_interrupted_fence`: jobs, ordered immutable manifest, source files, command aliases, draft revisions, immutable upload receipts; generated-file uncertainty fences. Memberอ่านเฉพาะงาน/ไฟล์ของowner; RPCเขียนเฉพาะservice role; Storage jobs/ผูกownerและvalidation/ยังprivate.
- Account Detail → Prepare documents → job → native source PDFs → PDF Workspace → Draft/reopen → mandatory final Preview/ack → private reviewed files. แยกสถานะpartial/unavailable/uncertain, retrydispatchไม่ออกคำสั่งrenderซ้ำที่claimไปแล้ว. ไม่แก้ยอดหรือส่งอีเมล.
- Editor: detected source-text run replacement,ข้อความ/font/style/color/position,whiteout,shape,note,stamp,PNG/JPEG,image resize/move,add/delete/reorderpagesภายในdocument group,undo/redo,บันทึกDraft/ป้องกันปิดงานที่ยังไม่บันทึก/เปิดคืน. แก้บนfixed-pageพร้อมwrapในtextbox ไม่อ้างautomatic Word paragraph/page reflow; scanned/rotated textใช้เครื่องมือวางข้อความ/ปิดข้อมูลและPreviewแทน.
- Content3แบบและdelivery3แบบ;รักษาหลายหน้าของInvoiceเป็นกลุ่มเดียว. Edited pagesส่งออกเป็นopaque raster pages;ไม่มีsource text streamซ่อนอยู่ในหน้าที่แก้ ส่วนหน้าไม่แก้คงnative. Previewใช้PDF.jsอ่าน **export bytesจริง** ทุกหน้า;ไม่ใช้iframeที่IABแสดงไม่ได้. Same-user token renewal/background reloadไม่ทำให้dirty editorหาย.
- Runtime budgets: upload20MiB (ปรับค่าได้ภายใต้Storage50MiB), editor source bytes64MiB (ปรับค่าได้). Selection4000ตามpublishedARS capacity ไม่มีsilent truncation. Validate editsก่อนapply/saveเพื่อไม่สร้างDraftที่เปิดคืนไม่ได้;ภาพ≤10MBและโครงprojectมีsafetybounds.

### Tested จริงและหลักฐาน
- KAT job `c5e1ef0e-370e-4132-9465-ab2d4c6adc40` สร้างผ่านlogged-in browserจริง:1Invoice/1nativePDF → เพิ่มข้อความValidation draftไม่ส่ง → privateDraft revision1 →เปิดกลับข้อความอยู่ →ตรวจPreviewจริง →ack/save revision2,exports1. DigestยอดARก่อน/หลัง **ตรงกัน**.
- TSK job `b60ded4b-f70b-4a70-91b9-0b4eaf4ba013`:1Invoice/nativePDF **2หน้า**;เปิดWorkspaceและPreviewแสดง2หน้าในไฟล์เดียว ไม่แยกเป็น2Invoice.
- Both-mode A/C job `0be1a572-932c-4cc3-bd5b-4fe79c208177`:2nativeInvoice filesพร้อม แต่Statement unavailable → jobpartialตามจริง ไม่มีStatementสมมติแทน. ต้องเลือกเปิดavailablefilesอย่างชัดเจน.
- SQL:81isolatedPGlite assertions (รวม4000selection,ownership,receipts,stale revisions,uncertain race) ผ่าน;hostedcreate/rollback,stale-revision rejection,interruption fenceผ่าน. Nonmemberroleเห็นjobs0/files0.
- Build/Typecheckผ่าน;124unit tests/17filesผ่าน. Full Playwright suiteล่าสุด25ข้อผ่าน (รวมeditor13ข้อและguardใหม่),production frontend1440×900/1280×800และactualexportPreviewผ่าน. APIทั้งหมดในภาพเปรียบเทียบเป็นsynthetic mocks; nativeintegrationแยกเป็นหลักฐานprivateข้างต้น.
- ภาพตรวจจริงจากCloudflare: `evidence/pdf-workspace-cloudflare-1440x900.png`, `-1280x800.png` และfinal-previewทั้งสองขนาด. เปิดตรวจแล้ว ไม่มีข้อมูลลูกค้า;referencePNGเดิมไม่เปลี่ยน. ภาพnativePDFที่ตรวจในIABไม่ได้เข้าGit.
- Independent reviewพบแล้วแก้: stale export/image completion,token refreshทำให้editorหาย,Storageownerbypass และstale snapshotทำให้ambiguous renderดูretryable. Reviewล่าสุดไม่มีactionablecodeblockerในscopeที่ตรวจ.

- CI ของsourceล่าสุดผ่าน: https://github.com/NTHV9/ar-workspace/actions/runs/34275917712 ; healthตรวจSupabaseจริงและSHAตรง.

### สิ่งที่ยังต้องรอ / ไม่กล่าวอ้างว่าครบ
- Native selectedStatementPDFยัง **ไม่ verified**. ตรวจAPIจริงพบ `kat_statement` / `tsk_statement` ผ่าน allReports รวมunpublished, exactmatch1ต่อhotel; typeIndividualOpenItems,hasParameters=false,formO9_GENERIC_FORM,procedureRequired=true,parameters/rendererlinksว่าง. ตรวจเพิ่มเติมจริงทั้งสองโรงแรม: moduleType=Cus, customized template=true, dataSourceType=ODT, external URLไม่มี; ไม่พบช่องทางdownloadที่ประกาศในmetadata. Publishedcontractsคืนdescriptor/print-processingstatus ไม่ใช่PDF. ไม่เดาrenderer endpoint ไม่เรียกpostStatementsเพียงเพื่อค้นหาไฟล์ และไม่ใช้systemPDFfallback.
- ฝากคำถามให้เจ้าของส่งoperation/คู่มือ/ข้อมูลจากOracleที่ยืนยันการสร้างและdownloadStatementPDFเมื่อสะดวกแล้ว;ยังไม่ต้องส่งSecret. รายละเอียดอยู่ใน STATEMENT_API_RESEARCH.md. **Goalห้ามmarkcompleteจนส่วนนี้ทดสอบได้จริง**.
- Native non-reservationหรือหลายhistoricalFoliosในwindowเดียวที่ยังจับคู่ไม่ได้จะแสดงunavailable;ไม่ได้อ้างcoverageทุกชนิดจากตัวอย่างที่ผ่าน.
- Gmail/Drive/Billing/Collectionการส่งจริง,recipient/credit-term setup,retention/cleanup policyยังอยู่นอกผลสำเร็จของGoalช่วงนี้. ไม่มีauto-send,accountingwrite,paidadd-on,legacyresourcechangeหรือcredentialอ่านกลับ.

## Checkpoint ล่าสุด — 9 กันยายน 2026: Native Invoice/Folio PDF trial และ Selected-only data

- ผู้ใช้อนุมัติทำงานต่อขณะไม่อยู่หน้าคอม ใช้ Worker Secrets/sessionเดิม ไม่ขอรหัสหรือ Secret เพิ่ม.
- Deployed/pushed source `2eabb3f7308ca0b41dacdc5d5ce918db9691d00a`, branch `codex/opera-refresh`; Worker deployment `43721fd0927246d28846d0a462e58b00`, Workflow version `6a8df2c6-510c-4e8c-b5af-d92e73f75f1f`. HealthยืนยันSHAและบริการจริง.
- Native PDF ผ่านเส้นทาง: GET reservation-scoped `/csh/v1/hotels/{hotel}/reservations/{reservation}/folios` + includeFolioHistory/Reservation/Foliohistory และช่วงวันที่เฉพาะ → จับคู่hotel/reservation/invoiceNo/folioNoและWindowจริง → GET `/med/config/v1/.../folioReports` พร้อม reservationIdContext=OPERA, reservationIdType=Reservation, Windowและวันที่ที่ตรวจแล้ว.
- ทางเดิม folioHistory: reservationIdIdได้400/RSV00060; root idได้400/FOF00404 (Voiding Foliosไม่active). ไม่เปิดหรือแก้ OPERA control. เส้นทางalternativeข้างต้นใช้ได้จริง. ก่อนเติมreservation contextในReportพบ500; หลังตรงตัวอย่างOracleรับPDFได้.
- KAT native PDF116672bytes และTSK104534bytes เก็บในprivate ar-working-files: validation/9a3245bb-72c3-4bf7-8ef8-0292dc7c9e5d/KAT.pdf และ validation/b596238f-58ac-4af3-9e3f-c1814d67fc32/TSK.pdf พร้อมexpected identity JSONในโฟลเดอร์เดียวกัน. รวม4objects; bucket public=false. ไม่มีcustomerPDF/JSON/screenshotในGit.
- เปิดPDFผ่านloginจริง Browser→Worker→Private Storage→PDF.js viewerได้ทั้ง2ไฟล์ เป็นCopy of Invoice1หน้าต่อโรงแรม. เลขFolioในPDFตรง; Invoice numberภายในOPERAไม่พบในข้อความแบบพิมพ์นี้ จึงอาศัยmapping APIร่วมกับFolioและHotelในการตรวจ ไม่อ้างว่าทุกidentifierถูกพิมพ์ในPDF. ตรวจภาพจริงในbrowserแล้ว ไม่เก็บภาพลูกค้าเข้าGit. ยอดfooterของFolioไม่ใช้แทนAR openหรือหลักฐานชำระAR.
- เพิ่มหน้า **validation viewer เท่านั้น** (`pdfCheck`/`pdfHotel` query) และauthenticated private PDF/metadata GET routes. PDF.js6.3.289 lazy loaded; worker .mjs MIMEถูกต้อง. ยังไม่ใช่PDF Workspace/editorตามต้นแบบเต็มรูปแบบ. การตรวจตัวเลขในviewerเป็นscreening ไม่ใช่approvalอัตโนมัติ.
- Selected A/C data trialผ่านทั้งKATและTSK: requested2/returned2, exactscope=true, balanceMatches=true, excludedMiddleAbsent=true. Runs713a5b28-df1b-46ea-8471-789218a9a30b และdc8b74bf-4c4b-433a-a9d2-6be8f8668d6b. เป็นGETเตรียมStatement data **ไม่ใช่Statement PDFรวมSelected-onlyที่ผ่านแล้ว**.
- Build/Typecheckผ่าน,103 unit testsผ่าน, final targetedBrowser3ข้อผ่าน (privatePDF/metadata401และlogin gate,collection401,child selection). Authenticated PDF renderingตรวจจริงเพิ่มเติมในIAB. ไม่มีmigrationรอบนี้;เพิ่มเพียงprivate validation objects. No-email/no-accounting-write. Native reportGETอาจมีผลprint historyตามขอบเขตที่อนุมัติ;ปิดretryและจำกัดไว้ในexplicit private validation jobs ไม่ทำจากปุ่มตรวจconnectionทั่วไป.
- ขั้นต่อไปที่ยังเหลือ: native Statement PDFSelected-only, batchหลายInvoice/หลายหน้า/non-reservation cases, durable document job/identity validation และPDF Workspace/editorตามต้นแบบ. ไม่เปิดBilling/Sendหรืออ้างPDFworkflowพร้อมครบจากsample2ไฟล์นี้.

## Checkpoint ล่าสุด — 9 กันยายน 2026: กันบิลย่อยจากการเลือกทวงแยก

- Implemented/pushed/deployed source `2a1c2e720ce5437497e7b75132235904a62a83ed`, branch `codex/opera-refresh`; Worker `ar-workspace` deployment `64d5813c462949ea822cc3247a3eb85a`, Workflow version `727962d3-f055-4c19-abd4-3be45e6eb15a`. Health endpoint ยืนยัน source/Supabase/OPERA ตรง.
- Applied migrations `20260908170335_ar_compression_context` และ `20260908170529_ar_collection_selection_guard` (timestamp UTC). เพิ่ม compressed/parent context/collection role และ generated collection_selectable; ค่าเก่าเริ่ม unverified. ไม่ reset/drop table หรือแก้ยอดเอง. ข้อมูลสมาชิก read-only; generated flag ตั้งค่าจาก client ไม่ได้.
- Parent lookup ใช้ Hotel+Account scope ที่ผ่าน audit และ parentInvoiceNo→invoiceNo แบบไม่กำกวม. Child ถูกบล็อกไม่ว่า balance หรือ parent balance เท่าไร; parent ไม่พบ/fieldไม่ยืนยันยัง unverified; conflict ระหว่าง Current/history fail. ยอดลูกยังเก็บตาม OPERA ไม่อนุมานเป็น0.
- Account Detail แสดง Child of/Parent invoice และแผงเหตุผลพร้อม parent balance; checkbox/Select all/selection total ข้าม child และunverified แม้รายการที่เลือกก่อนหน้ามีสถานะเปลี่ยน. Synthetic reviewยังแยก.
- Backend `POST /api/collection/validate-selection` ตรวจ allowlisted login/scope/IDs แล้วตรวจฐานข้อมูลด้วย user token/RLS ใหม่ ไม่เชื่อ role/amount/selectable ที่clientส่งมา. SQL guardปฏิเสธ child/unknown/nonpositive/missing/cross-scope ทั้งชุด. เป็น preflight สำหรับ snapshot ยังไม่ใช่การส่งอีเมล.
- Full real refresh ผ่าน: KAT run `4938a018-cd7f-42fc-b2e7-188b31fccaba`, TSK run `b31b8678-72da-40ef-b14a-cc4d65b41c25`. คง175accounts/803Invoice rows; KAT14child,TSK2child และ selectable0ทั้ง16. Positive child ที่ parentเป็น0มี12ใบ. ไม่มี unverified หลังรอบนี้; history count warnings0.
- ทดสอบ SQL guardด้วย authenticated role + approved user's claims แบบ transaction rollback: childทั้ง16ถูกปฏิเสธ, positive standalone sampleยอมรับ, wrong hotel/missing IDปฏิเสธ. ไม่ใส่ sample business rows. สิทธิ์ authenticated UPDATE=false, anon RPC EXECUTE=false.
- Build/Typecheck และ100 unit testsผ่าน; full deployed Browser suite6ข้อผ่าน และ compression/unauthorized targeted2ข้อผ่านหลังเพิ่มเคสใหม่. Browser behaviorใช้synthetic interception; SQL guardใช้ข้อมูลจริง. ทดสอบ HTTP401ของendpointจริงโดยไม่มี/invalid login. ไม่อ้างว่า authenticated HTTP preflightกับข้อมูลจริงถูกทดสอบครบเส้นทางแล้ว.
- ภาพ `evidence/compression-1440.png` เป็นsyntheticและเปิดตรวจแล้ว; narrow drawer1100×760ผ่าน. ภาพbaseline/referenceไม่เปลี่ยน. CI sourceผ่าน https://github.com/NTHV9/ar-workspace/actions/runs/34255193445 .
- ข้อจำกัด: Billing/Sendยังไม่เปิด; ขั้นส่งต้องเรียก server guardซ้ำ ณเวลาทำงานและตรวจ due/recipient/document ต่อ ไม่ใช้ผลpreflightเก่าเป็นใบอนุญาตส่ง. ไม่มี Gmail/Drive/OPERA accounting write. รอบนี้เสร็จเฉพาะการป้องกันและแสดงparent-child context.

## Checkpoint ล่าสุด — 8 กันยายน 2026: ปิดคำเตือนจำนวนประวัติ8บัญชี

- Root cause ยืนยันครบ8บัญชี: `totalResults` นับรายการหลัก ขณะที่ `inclDetails=true` ส่ง compressed parent1แถวพร้อม child2แถวที่เชื่อมด้วย `parentInvoiceNo` → `invoiceNo`. คำอธิบายเดิมว่า OPERA นับน้อยไปถูกแทนด้วยความต่างระหว่าง root count กับ expanded detail count.
- อ่านประวัติครบสองขนาดหน้า20/10 ได้ unique membership และ row content เหมือนกันทุกบัญชี; limit1 ตรงจุดขยายส่ง3แถวที่สัมพันธ์กันจริง. รวม4207รายการหลัก/4223แถวรายละเอียด. KAT7บัญชีตรวจทั้งชุดในแต่ละรอบ; TSK2332แถวตรวจแยกรอบและเทียบ content digestตรงกัน. ไม่มี duplicate; 2 diagnostic attempts เกิด internal Workflow error แล้วตรวจซ้ำสำเร็จ ไม่ใช้ failed attempt เป็นหลักฐานผ่าน.
- แก้ reader ให้นับ logical roots เฉพาะ parent linkage ที่ยืนยันในหน้าเดียวกัน โดยยังเก็บทุกแถวเพื่อตรวจ identity/balance. Parent หาย/กำกวมยัง fail; discovery strict เดิม; unknown over-return ยัง warning. ไม่ตัดบิลย่อย ไม่แก้ยอด และไม่มี migration รอบนี้.
- Source pushed/deployed `aa4d840cf19dab5a34128ecb2ceaa0c7b5f2491e`, branch `codex/opera-refresh`; Worker deployment `91937c0f19994e2d8259645c46572f21`, Workflow version `5c209f5f-cf58-4218-a7fd-1a627429edb6`.
- Full refresh หลังแก้ผ่านทั้ง KAT run `3eba45fa-4f22-41af-a76c-5b9c61339c4d` และ TSK run `a7defcac-b45c-45a1-95af-6e8b77fecd15`. Supabase ล่าสุด: KAT105 accounts/699 Invoice rows, TSK70/104; คำเตือนจำนวนประวัติเหลือ0ทั้งสองโรงแรม. คำเตือนเก่าใน audit history เก็บไว้ ไม่ลบหลักฐาน.
- Build/Typecheckผ่าน;94 unit testsผ่าน; deployed health/unauthorized browser testผ่าน. CI sourceผ่าน: https://github.com/NTHV9/ar-workspace/actions/runs/34253583358 . ไม่เปลี่ยนUI/referencePNGในรอบนี้.
- ข้อค้นพบสำหรับขั้น Billing/Collection: child อาจมียอดไม่ศูนย์แม้ parentเป็นศูนย์ จึงต้องรักษา parent-child context ก่อนเปิดการส่ง ไม่ตีความ child เป็นหนี้ที่ทวงแยกได้จาก balance อย่างเดียว. บันทึกใน DECISIONS_AND_OPEN_ITEMS; รอบนี้ปิดเฉพาะ count warning ไม่อ้างว่า Collection/PDF พร้อม.
- ไม่มี OPERA accounting write, email, Drive operation หรือการอ่านค่า Secret กลับ. Diagnostic workflows คืนเฉพาะ counts/flags ไม่คืนข้อมูลลูกค้าหรือค่าลับ. รายละเอียดหลักฐานและแหล่ง Oracle อยู่ใน OPERA_API_CONTRACT_NOTES.

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

## Checkpoint Statement row boundaries and Preview zoom — 11 กันยายน 2026

- Reproduced ด้วย Statement จากตัวสร้างจริงของระบบและข้อมูล synthetic: แทรกแถวชื่อ2บรรทัดตัดที่230.156ptกลาง continuation; แถวสุดท้ายตัดที่266.156ptกลาง Balance Due rectangle ซึ่งเริ่ม256pt. สาเหตุคือใช้ physical text line เป็นrow และหา boundary จากข้อความถัดไปโดยไม่อ่านกรอบสี
- Implemented: จัด continuation ตามcolumn/style/spacingของแถว, อ่าน filled rectangle/path bounds, ใช้ช่องว่างระหว่างขอบข้อความกับกรอบเป็นจุดแทรก. เลือกชื่อบรรทัด2หรือ3ยังได้ทั้งlogicalrow; ช่องใหม่ใช้column templateเดียว ไม่สร้างช่องซ้ำจากcontinuation. พื้นที่แทรกเผื่อความสูงcellและpadding และกรณีoverlapจริงไม่ตัดผ่านobject
- เครื่องหมาย + ของช่องว่างปรับขนาดตามความสูงcellจริงและใช้ line-height1 เพื่อไม่ล้นแตะกรอบบนจอเล็ก; focused visual/browser checks4casesผ่านหลังปรับ
- Removed Fit page จาก Preview zoom ตามคำยืนยันล่าสุด. Default Fit width; คง numeric zoom, page navigation, Preview acknowledgment และ exact reviewed-byte handoff
- Typecheck/Build ผ่าน; Vitest846tests/94filesผ่าน. ทดสอบ source-generator KAT/TSK ด้วยข้อมูลสมมติ, wrappedชื่อ2/3บรรทัด, เติมช่องใหม่/เพิ่มซ้ำ/ลบ, rectangle pixel continuity, dense Invoice rows, continuation pages, font styles, Undo และ email handoff. Final local browser suite **65 cases ผ่าน** รวมทั้ง reproduction และ regression
- ภาพหลักฐานใหม่ synthetic เท่านั้น: pdf-statement-row-fix-1440/1280.png และ pdf-preview-width-1440/1280.png. ไม่เปลี่ยน reference images หรือเก็บภาพจากลูกค้าเข้าGit
- ไม่มี database migration, OPERA ledger write, email send, file cleanup หรือการเปลี่ยนบริการภายนอกอื่น. Deployed source `9f73266dbe296b72f4ac2a73e46b42bc59acd436`, Worker `8951aa1f-99cd-4d3d-a6c8-84260f0eb58f` ที่ https://ar-workspace.ar-c82.workers.dev ด้วย --keep-vars. Health ยืนยัน SHA ตรงและ database_verified
- Cloudflare browser **30 cases ผ่าน** รวม Statement row insertion/กรอบสีต่อเนื่อง/เครื่องหมาย + อยู่ในcell, Fit width1440×900และ1280×800, exact reviewed-byte email preparation, auth และ Account/Portfolio regression. ใช้ synthetic API/PDF fixtures; ภาพหลักฐานใหม่จากdeployed assetsตรงกับlocal ไม่ส่งอีเมลจริง
- [PR #13](https://github.com/NTHV9/ar-workspace/pull/13) Merge แล้ว `064311358b55314140a570d1faf3a1f104457781` หลัง [CI ผ่าน](https://github.com/NTHV9/ar-workspace/actions/runs/34620937628); merge treeตรงกับsourceที่deploy/test
