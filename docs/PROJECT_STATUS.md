# สถานะโครงการใหม่

## Checkpoint ล่าสุด — 9 กันยายน 2026: พบ Statement PDF จากหน้า OPERA จริง

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
