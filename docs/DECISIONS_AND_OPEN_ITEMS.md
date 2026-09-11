# ข้อสรุปล่าสุด ข้อเสนอ และเรื่องที่ต้องยืนยัน

## ยืนยันล่าสุด — Latest Sent ใน Account Detail (11 กันยายน 2026)

รายการ Billing Required ที่ยังไม่มีบันทึกวันวางบิลและยังไม่มีรอบทวงให้แสดง `No billing sent`. หากมีวันวางบิลแล้วและยังไม่มีรอบทวงให้แสดง `Billed`; Billing Not Required ที่ยังไม่มีรอบทวงคง `No reminders sent`. กรณียังไม่ได้ตั้งกฎใช้ `Billing setup needed` และข้อมูล workflow ไม่พร้อมใช้ `Not available`. ประวัติรอบทวงที่บันทึกไว้ยังมีลำดับก่อนค่าเริ่มต้นเหล่านี้ ไม่ซ่อน/ล้างประวัติเก่าหรือเปลี่ยนวันที่เพื่อปรับข้อความบนจอ

## ยืนยันล่าสุด — Account comparison (11 กันยายน 2026)

เจ้าของต้องการให้ Account เดียวกันอยู่แถวเดียว โดยแยกยอด KAT/TSK/Total. การจับคู่ใช้ Account No. ตรงกันและไม่ซ้ำภายในแต่ละโรงแรม; trim/case-insensitive, คง explicit reporting group หากมี. ถ้าเลขขาดหรือกำกวมให้แยกต่อไป ไม่เดาจากชื่อหรือ internal ID อย่างเดียว. ชื่อที่ต่างกันระหว่างโรงแรมยังค้นหาได้และเลือกเปิด ledger ของแต่ละโรงแรมได้. เป็นการจัดแถวเพื่อรายงานเท่านั้น ไม่เปลี่ยน Hotel + Account identity, บิล, settings หรือข้อมูลใน OPERA

## ยืนยันล่าสุด — ปิดงานที่เหลือทั้งหมด (10 กันยายน 2026)

คำสั่งชุดนี้แทนข้อความเก่าที่ขัดกันในเอกสาร handoff และ checkpoints ก่อนหน้า ไม่ใช่หลักฐานว่าทุกข้อ deploy แล้ว ดูผลจริงใน PROJECT_STATUS และ COMPLETION_PLAN.

- Statement ใช้ renderer ของ AR Workspace เป็นเส้นทางเดียว ไม่ใช้ Statement API และไม่ต้องค้นหา native Statement ต่อเพื่อปิดโครงการ. Invoice/Folio ยังคง OPERA API. ไม่เพิ่ม watermark/ป้ายสร้างโดยระบบ AR ลง PDF; Aging Summary ทั้งบัญชีและรูปแบบที่เจ้าของรับแล้วคงเดิม.
- สถิติแสดงเงินรับที่บันทึกใน OPERA และยอดที่นำไปตัด Invoice แยกกัน. ต้องพิสูจน์วันที่/การจับคู่/กลับรายการจากแหล่งข้อมูลจริง; cumulative invoice payments ไม่ใช่ daily cash และ application snapshot ไม่มีวันที่เหตุการณ์ก็ห้ามเรียกยอด applied today.
- บิลที่เคยยืนยันยอดศูนย์แล้วกลับมาค้างคงวันที่วางบิลและประวัติรอบทวงเดิม พร้อม Needs review ให้คนตรวจ. Missing/API error ไม่ใช่ยอดศูนย์.
- ไฟล์ของแอปทั้ง Supabase และ Drive เก็บต่อ 1 เดือนหลังงานเสร็จแล้วลบ. ต้องคุมโควต้า Supabase และไม่เพิ่มค่าใช้จ่าย/paid add-on. เจ้าของยืนยันเกณฑ์แล้ว: บิลทุกใบที่ผูกกับไฟล์ OPERA ยืนยันยอดศูนย์ และไม่มีงานส่งอีเมล/เอกสารค้าง เริ่มนับหนึ่งเดือนปฏิทิน โดยคงประวัติรายการและการส่ง. ตรวจเกณฑ์ซ้ำก่อนลบ; บิลกลับมาค้าง/ไม่ยืนยันหรือมีงานใหม่ให้ระงับการลบ. Retention เปิดแล้ววันที่ 11 กันยายน 2026 หลังทดสอบ actual provider deletion ในพื้นที่สมมติที่แยกไว้ ดูผลและขอบเขตใน FINAL_ACCEPTANCE_20260911.md.
- เจ้าของอนุมัติให้ทำงานที่เหลือทั้งหมดพร้อม Goal, tests, GitHub Push และ deploy บริการใหม่ที่ยืนยันแล้วต่อเนื่อง. ใช้ข้อมูลสมมติแยกทดสอบและหลักฐานจริงแบบ private; ไม่ต้องส่งลูกค้าจริงเพื่อพิสูจน์ระบบ.

## ยืนยันล่าสุด — ชีท Agent และ Billing Type (10 กันยายน 2026)

เจ้าของให้ใช้ Credit Term/ผู้รับ Billing/Collection จากชีทที่ส่งมา ทุกแถว Billing Required; By Emailคือวางบิลทางอีเมล และBy SystemคือวางบิลในระบบของAccount. ยืนยันให้ใช้ทั้งKAT/TSKที่Account No.ตรงกัน แยกledgerตามเดิม. Importแล้ว104บัญชี/721eligibleinvoice workflowsโดยไม่เดาวันวางบิลหรือรอบทวง;รายละเอียดBILLING_CHANNEL_IMPORT.md. ช่องที่เป็นPortal/คำแนะนำไม่ถูกนำไปเป็นEmail To และไม่คัดลอกCollection emailมาแทนBillingที่ขาด

## วิธีอ่าน

ยืนยัน 10 กันยายน 2026: ใช้คำเต็ม **Follow-up 1, Follow-up 2, Follow-up 3** บนหน้าจอ คิวงาน และหน้าส่งอีเมล การเปลี่ยนชื่อแสดงผลไม่เขียนทับค่าประวัติเดิมในฐานข้อมูล

คำยืนยันล่าสุดเพิ่มเติม: บิลค้างเดิมให้เริ่มต้น **Not billed / No reminders sent** และเจ้าของแก้ประวัติย้อนหลังภายหลังได้ เป็น default ที่เจ้าของเลือก ไม่ใช่หลักฐานจาก OPERA ไม่สร้างวันที่วางบิล/วันที่ส่งหรือ actual-send events สมมติ และไม่ถือว่า Billing Required ถูกตั้งค่าแล้วเพียงเพราะสถานะเป็น Not billed

ยืนยันล่าสุด: Credit Term ในอดีตตรงกับปัจจุบัน และเจ้าของให้ทั้ง Credit Term และ Billing Required/Not Required มีผลกับบิลค้างเดิมด้วย การตั้งครั้งแรกครอบคลุมบิลเก่าที่ยังไม่มีกฎและบิลใหม่ ไม่เดาวันที่วางบิลครั้งแรกหรือรอบทวงเดิม; Required รอ actual first billing date, Not Required ใช้ OPERA base date + term การเปลี่ยน default ครั้งถัดไปไม่แก้ due/history ที่กำหนดไว้แล้วโดยอัตโนมัติ

ยืนยันเพิ่มเติม 9 กันยายน 2026: Statement แบบ Selected-only คง Aging ทั้งบัญชีตาม OPERA เจ้าของยืนยันล่าสุดให้คงหัวข้อ **Aging Summary** และ **Balance Due** เดิม ไม่เติม Entire Account/Selected Invoices ลงหัวข้อ แก้เฉพาะแนวหัวคอลัมน์ Debit/Credit/Balance ให้ตรงขอบขวาของตัวเลข

ยืนยันล่าสุด 9 กันยายน 2026: เจ้าของอนุมัติต่อ Statement จากระบบเข้า PDF Workspace และกำหนดข้อความภาษาอังกฤษ **Generate in AR Workspace** ไม่ใช้คำว่า “สร้างจากแม่แบบ” บนตัวเลือก ยังไม่เพิ่มป้ายสร้างโดยระบบ AR ลง PDF และไม่เปิด automatic fallback ดูผลจริงใน WORKSPACE_STATEMENT_INTEGRATION.md

อัปเดต 9 กันยายน 2026: เจ้าของรับทิศทางหน้าตา Statement trial และให้ PDF ตัวอย่างเพิ่มเติมสำหรับเทียบ หลักฐาน TSK ที่เปิดดูใช้ The Shore ตรงกับ RTF เดิม จึงไม่ต้องเปลี่ยนโลโก้จากการคาดเดา การรับหน้าตายังไม่ใช่การรับรองความเหมือน 100% หรือการเปิดใช้ renderer บน Cloudflare

- ยืนยัน: เจ้าของสั่งหรือยืนยันชัดในแชท
- ข้อเสนอ: ผู้ช่วยเสนอแนวทาง ไม่มีเหตุให้ถือว่าเจ้าของล็อกทุกค่าตัวเลข
- ต้องพิสูจน์: ข้อเท็จจริง Provider/ตัวอย่างที่ไม่พอให้รับรองทั้งระบบ

เอกสารนี้ไม่ใช่ audit สถานะ Repository ปัจจุบัน และไม่อ้างว่าทุกฟีเจอร์ทำแล้ว

## A. เรื่องที่แทนคำอธิบายก่อนหน้า

| เรื่อง | ไม่ใช้ข้อเสนอเก่าที่ขัดกัน | ใช้ล่าสุด |
|---|---|---|
| วิธีสร้าง | Refactor/reuse code เดิม/ย้าย Cloud Run มา | เขียนใหม่ทั้งหมด แยกโครงการ ไม่สืบ runtime/schema/gates เก่า |
| Frontend | บังคับ Next.js | ไม่ล็อก Next.js; React/Vite เป็นข้อเสนอ; HTML/CSS ยังใช้ |
| ดีไซน์ | ปรับตามหน้าปัจจุบัน/ตามความสะดวก UI library | อิง PNG 7 หน้า + คำอธิบาย Codex ที่ต้องนำมาเพิ่ม |
| Cloud | Google Cloud Run/Cloud SQL/Scheduler | Cloudflare/Supabase; Gmail/Drive ยังอยู่ |
| OPERA | เขียนบัญชีผ่านเว็บใน phase ถัดไป | ไม่อยู่ในงานใหม่; อนุญาตเฉพาะผลด้านเอกสาร/print history |
| Refresh | ทุกชั่วโมง/15 นาที/7 โมงครั้งเดียว | 07:00, 19:00, manual, on-open แบบไม่ซ้ำ |
| Current API | Account เฉพาะ header แล้วอ่าน items แยกทุกครั้ง | Account 5 fetch instructions เป็นหลักเมื่อผ่านการพิสูจน์ |
| History | ลบ InvoicePayments ทั้งหมด | เก็บใช้รวม zero balances/history/verification/stats |
| unBilled | สถานะวางบิลของเว็บ | ไม่ใช่; สถานะวางบิลจาก actual send/external billing |
| Zero | ต้องมีหลายเหตุปิดใน UI | Invoice Balance=0 ที่ยืนยัน → CLEARED เดียว |
| การเก็บข้อมูล | ลบทุกอย่างเมื่อ zero หรือเก็บ detailed snapshots 5 ปี | latest+config+events ย่อ+daily summary; ล้างข้อมูลหนักตามนโยบาย |
| Due Required | transactionDate+term เสมอ | actual first billing date+term |
| Due Not Required | ไม่มีฐานแน่นอน | OPERA base date+term |
| วันพบครั้งแรก | KPI/คอลัมน์ที่ผู้ใช้ต้องเห็น | ไม่ต้อง ใช้ OPERA bill date; capture time ทางเทคนิคยังได้ |
| รอบ | Friendly/Follow1/Follow2/Final | เพิ่ม Follow3 และ Urgent หลัง Final |
| รอบนับ | สะสมบิลเดิมซ้ำทุก stage | latest sent stage กลุ่มเดียวต่อ open Invoice |
| Reply/Remittance | auto paid/auto pause indefinitely | ข้อมูลประกอบ ไม่ reset/close/ซ่อนงานเอง |
| Draft/Send | draft-only ไม่มี Send Now | Draft และ Send Now โดยคน ไม่มี auto-send |
| Draft KPI | นับการสร้าง Draft หลายครั้งเป็นงาน | นับ actual sent; technical mapping ไม่ใช่ KPI |
| คน/SLA | วัดคนเตรียมคนส่ง/รอเอกสาร/Draft ค้าง/เป้าทีม | ดูวันจริง billing/overdue/last follow เท่านั้น |
| Email | OPERA suggested/fallback | ตั้งผู้รับเองตาม Hotel/Account/purpose |
| PDF | silent System fallback | native OPERA ปกติ; renderer เก็บไว้แยก ไม่ auto-fallback |
| package | Combined/Separate 2 แบบ | เพิ่ม Statement separate+invoice bundle |
| URL | path เดิมแคบ หรือเปิด arbitrary URL ทั้งหมด | trusted configurable sources + credential isolation |
| caps | ยก fixed caps เดิมทั้งหมดมา หรือไร้ limit ทุกชนิด | เลิก arbitrary product caps แต่คุม runtime/provider แบบตั้งค่าได้ |
| Login | password อย่างเดียวหรือหลาย user เริ่มต้น | Google+User/Password เฉพาะ ar@katathani.com ก่อน |
| Drive tests | test folder แยกที่ต้องย้ายภายหลัง | ใช้ folder จริงที่ยืนยัน mark+delete exact test file IDs |
| Backup | RPO 15m / paid PITR / legacy restore authority | ตาม Supabase included daily backup ไม่มี add-on โดยไม่อนุมัติ |
| Agent | รวมข้าม Hotel เป็นบัญชีเดียว operational | แยกบัญชีโรงแรม มี report group และ KAT/TSK/Total |
| Currency | multi-currency feature | THB เท่านั้น ไม่แปลง currency แปลกเอง |
| สถิติ | billing today เป็น subset ของ arrivals today | บิลเข้า/วางวันนี้/ยังไม่วางทั้งหมดเป็น independent metrics |

## B. สิ่งที่ยืนยันแล้ว ไม่ต้องถามซ้ำโดยไม่มีเหตุ

สร้างใหม่ทั้งหมด; โครง Cloudflare/Supabase; OPERA accounting read only with document-side-effect permission; PDF ต้นทาง OPERA และ editor อิสระ; กล่องงาน/allowlist เริ่ม ar@katathani.com; Google+Password login; มี Send Now; no auto-send; Follow3; Urgent หลัง Final; daily backup ตาม plan ไม่เพิ่ม PITR; ใช้ Drive folder จริง; บิลเข้า/วางวันนี้/current backlog แยก; Account Type ในสถิติ; Remittance ความหมายรอเงิน/ตัดยอด; เก็บ safeguards ที่ตกลงแล้ว

## C. ข้อเสนอที่ยังไม่ควรเปลี่ยนเป็นข้อบังคับถาวร

1. React + Vite + TypeScript เป็นชุดเครื่องมือที่เสนอ ไม่ใช่เจ้าของให้ UI ต้องใช้ framework ใดแลกกับการผิดแบบ
2. เกณฑ์ on-open stale 30 นาที เป็นค่าเริ่มต้นที่เสนอ ปรับ/ยืนยันใน plan
3. Follow1 เริ่มวันถัดจาก Due Date และ calendar-day timing เป็นการตีความที่เสนอ ยืนยันถ้าเจ้าของต้องการวันครบกำหนดเอง
4. Urgent ทันทีหลัง Final เป็นข้อเสนอที่ตอบความต้องการให้เห็นงาน ไม่กำหนดระยะรอเพิ่มเอง
5. Supabase private Storage เป็นพื้นที่พักไฟล์ที่เสนอ ต้องวัดความเหมาะสม ไม่ต้องเพิ่ม persistent archive ทุกต้นฉบับ
6. เก็บต้นฉบับคู่ edited PDF เฉพาะงานแก้เป็นข้อเสนอ ยังไม่บังคับ duplicate originals ทุกงาน
7. จุดจับ daily AR snapshot (รอบเช้าหรือเย็น) และการเก็บสองจุดในวันเดียว ยังไม่ได้ล็อก ห้ามเอา snapshot 07:00 มาเรียกยอดปิดวัน
8. Retention ของ events, detailed rows, temp files ยังไม่ระบุวัน ไม่สร้างกฎ 5 ปี/30 วัน/90 วันเอง
9. Username แยกจาก Email ไม่ได้ร้องขอชัด เสนอใช้ email เป็น User สำหรับ Password
10. การทำ dedicated new private GitHub repo เป็นข้อเสนอ handoff ยังไม่ได้สร้าง

## D. ข้อมูลที่ยังต้องรับเข้ามา

- PNG ต้นฉบับทั้ง 7 และคำอธิบายดีไซน์จากแชท Codex เดิม (ชุดนี้มีเพียง manifest)
- ตำแหน่ง repo/folder ใหม่ที่เจ้าของเลือก และสิทธิ์ให้ Codex อ่าน reference-only source
- Cloudflare account/project, domain/origin และ Supabase target project ที่ถูกต้อง ไม่มี project IDs ในชุดนี้
- OAuth redirect URLs, Google project/client ที่ใช้, บัญชีกล่องงานที่อนุญาต
- Drive/Shared Drive folder ID จริง ไม่ใช่การเดาจากชื่อ
- Credential OPERA ที่ปลอดภัยและ permission เอกสารของแต่ละ Hotel
- ผู้รับทดสอบแบบครั้งเดียว: ไม่บันทึกในเอกสารนี้ อ่านจากบริบทที่เจ้าของให้เฉพาะตอนทดสอบ
- หลักฐาน API/PDF จริง: รับไว้ private อย่านำ customer data เข้า Git

## E. ข้อมูลต้องพิสูจน์ ไม่ใช่แค่ถาม preference

- Current getAccount membership ครบในบัญชีใหญ่/เครดิต/partial หรือมีการจำกัดผลลัพธ์
- Account discovery ที่ไม่พลาด net-zero Accounts และบิลเกิด-ปิดระหว่างรอบ เพื่อสถิติบิลเข้า
- invoicePayments pagination, date filter semantics, paid/receipt/application fields และ zero-balance coverage
- Statement selected-only และ return path ที่ได้ PDF จริง ไม่ถือ POST success เป็น PDF success
- Invoice/Folio selector: billNumber, folioNo, invoiceNo, window number/internal ID ต้องพิสูจน์ไม่ map ตามชื่อคล้าย
- เนื้อหา Aging/Total ของ Statement selected-only เป็น scope ใด
- Native PDF layout จากโรงแรมตรง reference แค่ไหน; library/SDK ที่ทำ free editing ตามที่เจ้าของต้องการ
- Gmail identity linking, send evidence, post-handoff edits, recipient overrides ในโหมด test
- Supabase built-in backup entitlement/restore path และสิ่งที่ไม่ครอบคลุมก่อนอ้างว่ากู้ทั้งระบบได้
- Cloudflare CPU/memory/file streaming compatibility จริง ไม่รับรอง unlimited resource

## F. เรื่องธุรกิจที่เหลือให้กำหนดเมื่อถึงงานนั้น

- ผลตรวจ compressed Invoice วันที่8ก.ย.: history อาจส่ง parent ที่ยอดศูนย์พร้อม child ที่ยังแสดงยอดไม่ศูนย์ และ child มี parentInvoiceNo. ก่อนเปิด Billing/Collection ต้องรักษา parent-child context และไม่ถือ child เป็นหนี้ที่ส่งทวงแยกได้จาก balance เพียงช่องเดียว; payment ของ compressed invoice อยู่ที่ parent ตาม Oracle. รอบแก้ history count ไม่เปลี่ยนยอดหรือเคลียร์ child โดยเดา.
  - 9ก.ย. implemented/tested: เก็บ parent context, generated selection guard และ UIบล็อกchild/unknown; ข้อมูลจริง16childถูกปฏิเสธทั้งหมด. ขั้น Billing/Sendในอนาคตต้องใช้server guardซ้ำและตรวจเงื่อนไขส่งอื่นด้วย ไม่ถือ browser selectionเป็นสิทธิ์ส่ง.
- ส่งวางบิลเดิมก่อนเริ่มแอปจะ import/บันทึกภายนอกอย่างไร เพื่อไม่ขึ้นว่าทุกบิลเก่ายังไม่เคยวาง
- เงินรับกี่ใบ/บาท: ยืนยันว่าใช้ received money, allocated money, หรือทั้งสองแสดงแยก และปฏิบัติกับ reversal/unallocated receipt อย่างไร
- ยอดบิลเข้าประจำวัน: original vs current invoice amount เมื่อเกิด adjustment ภายหลัง ต้องตั้ง label และเก็บหลักฐานให้เหมาะ
- Bill reopen: รักษารอบ/วันที่วางเดิมหรือให้คนกำหนดใหม่ ไม่ทำอัตโนมัติโดยเดา
- บิลเครดิต negative open: แสดงยอดเครดิตแยก ไม่เอามาปน count ของใบที่ต้องทวง positive invoice
- Remittance allocation ไม่ครบ/มี partial settlement: แสดง unknown remainder ไม่คำนวณยอดรอรับจากการจับคู่เงินเอง
- Group mapping ของ Agent ที่ Account Type ต่างกันข้ามโรงแรม ต้องเก็บค่า per hotel ไม่ force normalize

## G. สิ่งที่ไม่ควรเรียกว่า blocked ทั้งโครงการ

การขาด production PDF selector เป็น blocker เฉพาะเส้นทาง official documents ไม่กันการทำ auth/portfolio ตามสเปก การขาด Credit Term ไม่กันอ่าน Account การยังไม่มีคำอธิบาย Codex เก่าเป็น blocker การยืนยันหน้าตาสุดท้าย ไม่ใช่เหตุให้เดาภาพขึ้นมาแทน

อย่ายก legacy failed CI/Google Cloud release receipt มาเป็น gate ของ app ใหม่ แต่ถ้ามี failure ใน tests ที่เขียนเพื่อกฎใหม่ ต้องแก้ตามจริงไม่ข้ามเพื่อให้รายงานผ่าน


## ยืนยันล่าสุด — ทดลอง System-rendered Statement จาก RTF (9 กันยายน 2026)

เจ้าของอนุมัติทดลองสร้างStatementจากkat_statement.rtf/tsk_statement.rtf ด้วยระบบเราและไม่เพิ่มป้ายสร้างโดยระบบARบนPDF. เป็นtrialที่อนุมัติแยก ไม่เปิดautomaticfallbackและไม่อ้างnativeOPERAหรือ100%ก่อนพิสูจน์. ผลทดลองยังมีความต่างlayout/pagination;TSKRTFแสดงTheShoreและรอคำยืนยันตราโรงแรม. รายละเอียดSTATEMENT_RTF_RENDER_TRIAL.md.

### ยืนยันความหมายวันที่รายงาน — 11 กันยายน 2026

เจ้าของย้ำว่ายึด OPERA เป็นหลัก: สถิติรายการรับชำระใช้ `transactionDate` ของ Payment จาก OPERA ไม่ใช้วันที่เว็บ Refresh/ตรวจพบยอดศูนย์แทน. เวลาตรวจพบศูนย์เป็นประวัติการตรวจสอบแยกต่างหาก และไม่ถือเป็นหลักฐานวันเงินเข้าธนาคารหรือ application event date. ชุดจริง TSK ที่นำเข้ามี Payment dates ครบ แต่ Invoice closeDate ไม่มีให้ จึงไม่สร้างวันปิดยอดจากการอนุมาน.
