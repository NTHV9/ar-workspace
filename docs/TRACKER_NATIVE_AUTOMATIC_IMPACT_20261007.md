# Khao Lak native tracker — ผลกระทบของการควบคุมผู้เขียนแบบอัตโนมัติ

สถานะ: **ออกแบบและประเมินผลกระทบเท่านั้น — ยังไม่อนุมัติ implementation/activation** ตรวจแหล่งอ้างอิงวันที่ 7 ตุลาคม 2026

เจ้าของเลือกให้ออกแบบแบบอัตโนมัติและตรวจผลกระทบก่อนแล้ว จึงไม่ใช่สถานะ “ยังไม่เลือกแนวทางออกแบบ” อีกต่อไป แต่ยังไม่มีอนุมัติเปลี่ยน owner, ACL, provider account, launcher/schedule หรือไฟล์จริง เอกสารนี้ต่อจาก [ข้อเสนอวันที่ 6 ตุลาคม](TRACKER_NATIVE_WRITER_PROPOSAL_20261006.md); รอบที่ให้คนเปิดหน้าต่างงานเองเป็นทางเลือกสำรอง ไม่ใช่แบบอัตโนมัติที่ผ่านการรับรองแล้ว

## คำยืนยันล่าสุด: ไม่ต้องมีผู้คุมรอบงาน

เจ้าของยืนยันเพิ่มเติมว่า **ต้องการอัตโนมัติโดยไม่มีคนเปิด/เฝ้า/อนุมัติแต่ละรอบ** แบบ ACL-window ด้านล่างจึงเป็นข้อเสนอที่ยังไม่เลือก ไม่ใช่คำแนะนำที่ได้รับอนุมัติแล้ว การตรวจข้อขัดแย้งของข้อมูลเป็นกรณีพิเศษยังไม่ได้ถูกยกเลิก แต่ห้ามใช้คนกดเริ่มรอบตามปกติเป็นเงื่อนไขของระบบ

คำว่า **controller ในเอกสารนี้หมายถึงซอฟต์แวร์ ไม่ใช่เจ้าหน้าที่ผู้คุม** ภาพการใช้งานที่ออกแบบคือคนส่งอีเมลตามปกติ → ระบบรับหลักฐาน Sent เข้าคิว → ซอฟต์แวร์จัดจังหวะเขียนและตรวจผลเอง → ทีมเห็นวันที่ในชีต โดยไม่มีปุ่มอนุมัติรอบเพิ่มเติม คำยืนยันล่าสุดไม่ได้แปลว่าเจ้าของปฏิเสธช่วงสิทธิ์ที่ซอฟต์แวร์จัดการอัตโนมัติทุกแบบ; ส่วนการกันผู้เขียนอื่นได้จริงยังต้องพิสูจน์ก่อนเปิดใช้งาน

## แบบควบคุมผู้เขียนที่เคยเสนอและข้อจำกัด

เสนอให้ **สะสมวันที่ Sent จริง แล้วเขียนเป็น batch ในช่วงที่บังคับสิทธิ์ผู้เขียนแยกจากกันได้** ทีมยังกรอก tracking ใน Google Sheet เดิมตามปกตินอกช่วงดังกล่าว ไม่เปลี่ยนให้เว็บเป็นจุดกรอกหลัก ไม่เปลี่ยน file ID, native format, ชื่อแท็บ/คอลัมน์/สูตร และไม่อัปเกรด executable AgingMaster 1.0.6

อย่างไรก็ตาม ยังเสนอว่า “อัตโนมัติได้โดยไม่กระทบงานเดิมเลย” ไม่ได้ เพราะ:

- บัญชี `ar@katathani.com` ที่เป็น owner ไม่สามารถถูกกันด้วย ACL ของไฟล์เดียวกันระหว่างที่มนุษย์/desktop/web ใช้ตัวตนนี้ร่วมกันได้ การแยก OAuth client แต่ใช้ Google user เดียวกันไม่แยกสิทธิ์ตามผู้เขียน
- ต้องแยกตัวตนอย่างน้อยในเชิงสิทธิ์ระหว่าง controller ของ native, updater และคนที่กรอกชีต หาก updater กับคนยังเป็น owner/user เดียวกัน การแย่งสิทธิ์ระหว่างสองกลุ่มนี้ยังเป็นข้อตกลงร่วมกัน ไม่ใช่การบังคับจาก Google
- ทีมจะมีช่วงอ่านอย่างเดียว และวันที่ Sent อาจลงชีตหลังเวลาส่งจริง เวลาทำ batch ไม่ใช่วันที่ส่ง; วันธุรกิจยังมาจากหลักฐาน Sent เดิม
- เอกสาร Google ที่ตรวจไม่ให้ข้อรับรองว่าเปลี่ยน ACL แล้วคำขอเขียนที่รับไปก่อนหน้าจะสิ้นสุดภายในกี่วินาที จึงใช้การ downgrade แล้วรอเวลาคงที่หรือเห็น revision นิ่งแทนหลักฐานว่าไม่มีงานค้างไม่ได้

แบบนี้จะตรงคำยืนยันล่าสุดได้เฉพาะเมื่อ controller เริ่มรอบ กันผู้เขียน ตรวจผล และคืนสิทธิ์เองทั้งหมด โดยไม่รอคนยืนยันทุกครั้ง หากพิสูจน์การกันผู้เขียนและจัดการคำขอค้างไม่ได้ ให้คง native outbound เป็น held แม้ส่วน queue และหน้ารายการรอจะทำงานอัตโนมัติได้แล้ว ไม่เรียกการพักคิวอย่างเดียวว่าทำเป้าหมายสำเร็จ

## หลักฐานปัจจุบันกับสิ่งที่ยังไม่ทราบ

| หัวข้อ | หลักฐานที่มี | สิ่งที่ยังต้องตรวจแบบอ่านอย่างเดียว |
|---|---|---|
| ไฟล์เป้าหมาย | `Master_SAN_AR_Tracker` เป็น native file เดิม; exact ID อยู่ใน private configuration | ID/MIME/parents/owner/ACL ล่าสุดก่อนเสนอรายการเปลี่ยนจริง |
| ผู้เขียน | Inventory วันที่ 6 ตุลาคมมี owner 1, user writers 12, domain writer 1 | permission IDs, inheritance/effective access, group paths และความเปลี่ยนแปลงหลัง inventory; ข้อมูล connector ที่ normalize แล้วยังไม่ใช่ restoration manifest |
| แหล่ง tracking | Sheet → เว็บเปิดใช้แล้ว; OPERA ยังเป็นแหล่งยอดเงิน | ไม่มีการเปลี่ยน authority ของ Account credit/billing rules หรือ reported received ให้เป็นการปิดหนี้ |
| Native concurrency | positive cell write ในไฟล์จำลองผ่าน แต่หลังแก้ค่าแข่งกัน Drive v2 JSON ETag ไม่เปลี่ยน จึงหยุดก่อน stale request | ยังไม่มี native content-generation validator ที่ผ่าน; ไม่ได้พิสูจน์ว่า Sheets v4 ละเลย `If-Match` |
| ผู้เขียนรายวัน | 1.0.6 เป็น executable ที่เจ้าของใช้อยู่และต้องคงเดิม | ทุกเครื่อง/shortcut/schedule/ผู้เริ่มงาน, ตัวตน Drive ที่แต่ละ instance ใช้, งานที่กำลังทำ และการเข้าสู่บัญชี updater แยกโดยไม่เปลี่ยน binary ทำได้หรือไม่ |
| การทดสอบล่าสุด | isolated Billing-R SQL/service/provider E2E และ cleanup ผ่านจริงบน XLSX จำลอง | ไม่ใช่ native exclusivity proof, original-business writeback proof หรือการส่ง Follow 1–3 จริงสามฉบับ |

ไม่ระบุชื่อเจ้าหน้าที่, permission IDs, recipient หรือ credentials ในเอกสารนี้ ไม่ติดต่อหรือสั่งงานแชท Detail One Shot และไม่รันโปรแกรม updater เพื่อทดสอบกับต้นฉบับในขั้นออกแบบนี้ [หลักฐานระบบที่ทำแล้ว](TRACKER_SYNC_VALIDATION_20261006.md)

## ขอบเขตที่ Google รับรอง

Sheet protection ไม่กันเจ้าของ และ editor ยังอัปโหลดเวอร์ชันใหม่ได้ จึงไม่ใช่ตัวล็อก whole-workbook updater ส่วน Apps Script LockService กันเฉพาะ code sections ที่ร่วมใช้ lock เดียวกัน ไม่ครอบคลุมคนแก้ชีตหรือโปรแกรม desktop ที่ไม่เข้าร่วม [Google protection](https://support.google.com/docs/answer/1218656), [owner behavior](https://developers.google.com/apps-script/reference/spreadsheet/protection#canedit), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service)

Sheets batchUpdate ใช้เปลี่ยนหลายเซลล์พร้อมกันได้ แต่ atomic batch ไม่เท่ากับ conditional update เทียบ generation เดิม และ Google ระบุข้อจำกัดเมื่อมี collaborator จึงยังต้องมีการกันผู้เขียนภายนอก [Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)

การเปลี่ยน permission ใช้ file เดิมได้ แต่ inherited permission ลดที่ลูกโดยตรงไม่ได้ และหลาย permission mutations บนไฟล์เดียวกันต้องไม่แข่งกันเอง ดังนั้น controller ต้องตรวจ effective access และทำขั้นตอนสิทธิ์แบบลำดับเดียว ไม่อ้างว่า batch ACL เป็น transaction เดียวทั้งหมด [Drive sharing/inheritance](https://developers.google.com/workspace/drive/api/guides/manage-sharing)

## ทางเลือกและผลกระทบ

| ทางเลือก | ผลต่อทีมและ 1.0.6 | ข้อสรุป |
|---|---|---|
| A. Controller แยกตัวตน + สิทธิ์สลับตามช่วงงาน | ทีมกรอกชีตเดิมนอกช่วง read-only; ต้องแยก updater principal, ควบคุมทุก launcher และมี owner ที่ไม่ใช้กับงานมนุษย์/desktop ปกติ | **ยังไม่เลือก** ต้องเป็นการเริ่ม/จบอัตโนมัติทั้งหมดจึงตรงคำยืนยันล่าสุด; ยังต้องพิสูจน์ account/launcher compatibility และ in-flight handoff |
| B. คง owner/บัญชีร่วมเดิม แล้วใช้เวลาเงียบ/DB lease/Apps Script lock | เปลี่ยนงานน้อย แต่คนหรือ desktop ในบัญชีเดียวกันยังเขียนข้าม lock ได้ | ไม่ผ่านเกณฑ์ automatic conflict-safe; ทำได้เพียง controlled pilot ที่ยอมรับข้อจำกัดชัดเจน |
| C. บังคับทุกการแก้ผ่านเว็บหรือ write gateway เดียว | การกรอก Sheet โดยตรงและการ upload ของ 1.0.6 ต้องเปลี่ยนวิธีทำงานอย่างมาก | ไม่เลือกใน scope นี้ เพราะขัดกับ Sheet manual tracking เป็นแหล่งหลัก; ไม่ทำเงียบ ๆ |

การย้ายไป shared drive ไม่ใช่ทางลัดที่เสนอในรอบนี้ เพราะเปลี่ยน inheritance/manager authority และต้องตรวจ compatibility เพิ่ม โดยยังไม่ตอบปัญหาผู้มีสิทธิ์สูงที่ข้าม controller

### ทางเลือกที่ไม่ต้องมีคนคุม: ตรวจจาก API และผลกระทบ

ตารางนี้เป็น **การวิเคราะห์เอกสารและแบบระบบ ยังไม่ได้ทดสอบทางเลือกเหล่านี้กับบริการจริง** หลักฐาน native ที่ทดสอบแล้วมีเพียง positive write และการหยุดเมื่อ JSON entity ETag ไม่เปลี่ยนหลัง competitor แก้เซลล์ ไม่ได้ส่ง stale request ของ Sheets v4 จึงยังสรุปไม่ได้ว่า API นั้นละเลย `If-Match`

| วิธี | ช่วยอะไร | สิ่งที่ยังไม่แก้ / ผลกระทบต่อข้อกำหนด |
|---|---|---|
| FindReplace แบบตรงทั้งเซลล์ใน R/U/V/W | แทนค่าเฉพาะเซลล์ที่ตรงกับข้อความเดิมใน range ที่กำหนด | ไม่มีเงื่อนไขร่วมว่า AG/Hotel/Account ของแถวนั้นยังเป็น Invoice เดิม; หากสลับแถวแล้ววันที่เท่ากันหรือว่างเหมือนกัน อาจโดนอีก Invoice ต้องพิสูจน์ blank/date typing/locale ด้วย ไม่ใช่ CAS ของแถว |
| batchUpdate หลายคำสั่ง | รวมการเปลี่ยนใน request ให้สำเร็จพร้อมกัน | ไม่มี request-body `writeControl`/`requiredRevisionId`; FindReplace ใน AG แล้วเขียน R ไม่ได้ผูกจำนวน match เป็นเงื่อนไขให้คำสั่งถัดไป จึงไม่สร้าง assertion ของ identity โดยอัตโนมัติ |
| DataFilter + developer metadata | ระบุตำแหน่งผ่าน metadata แทนการจำเลขแถว | DataFilter เลือก A1/grid/metadata ไม่ได้เลือกด้วยค่า AG พร้อม expected-old-date; metadata ต้องเพิ่มในต้นฉบับและต้องพิสูจน์คงอยู่หลัง 1.0.6 import ใหม่ จึงขัดกับข้อห้าม metadata ปัจจุบัน และยังไม่กันการแก้ค่าพร้อมกัน |
| Event log แยก + สูตรคำนวณวันที่ในต้นฉบับ | งาน Sent เก็บตาม canonical invoice/event ID; สูตรหา Invoice ใหม่เมื่อแถวย้าย จึงลดการเขียนทับแบบเจาะแถว | ต้องอนุมัติเปลี่ยนสูตร R/U/V/W/วิธีกรอกวันที่ หรือเพิ่มที่เก็บ manual values; ต้องพิสูจน์ updater ไม่ทับสูตร/สิทธิ์เชื่อมข้อมูล แค่สร้าง log แยกยังไม่ทำให้วันที่ลงเซลล์เดิม |
| Controller/launcher อัตโนมัติ + ตัวตนแยก | คิวทำงานและคืนสิทธิ์เองได้โดยไม่ใช้คนกดต่อรอบ; คง binary 1.0.6 ได้เป็นเป้าหมาย | ต้องเปลี่ยนวิธีเปิด updater/บัญชีผู้เขียน ควบคุมทุก instance และ owner session; การกันงานค้างและ offline edits ยังเป็น feasibility gate ไม่ใช่สิ่งที่พิสูจน์แล้ว |

[FindReplace request](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#FindReplaceRequest) ระบุการค้นหาและแทนค่าในเซลล์; [response](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/response#FindReplaceResponse) คืนจำนวนที่เปลี่ยน **หลังทำงาน** การไม่มีช่องให้ตั้ง expected match count/เงื่อนไขข้ามเซลล์เป็นข้อจำกัดที่อนุมานจาก schema ไม่ใช่ผล live concurrency test. [Batch schema/atomicity](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [DataFilter](https://developers.google.com/workspace/sheets/api/reference/rest/v4/DataFilter), [metadata location behavior](https://developers.google.com/workspace/sheets/api/guides/metadata)

**ทางเดินอัตโนมัติที่ยังควรประเมินต่อมีสองแบบ:**

1. **คง workbook และ executable:** ใช้ automatic launcher/controller ครอบทั้งวงจรของ updater และคิว AR แยกตัวตนผู้เขียนจริง มีช่วงที่ทีมอ่านอย่างเดียวแบบอัตโนมัติ ไม่มีคนเปิดรอบ การถือ DB lease ใช้กันเฉพาะงานของเรา; สิทธิ์ Google และนโยบาย owner ต้องกันผู้เขียนที่ไม่ได้ร่วม lease ด้วย ต้องพิสูจน์ handoff โดยไม่พึ่งคำยืนยันจากคนก่อนเสนอ activation หากมีเพียง quiet-period polling แบบนี้ยังไม่ผ่าน
2. **คงการกรอก manual ใน Sheet แต่ปรับการแสดงผลวันที่:** แยก manual facts กับ immutable Sent facts แล้วสร้าง effective R/U/V/W ด้วย canonical key และกติกา first billing/stage ที่ชัดเจน แนวนี้ออกแบบให้ไม่มีการแย่งเขียนวันที่จากสองฝ่ายได้ แต่ต้องยอมให้เปลี่ยนสูตร/พื้นที่รับ manual facts และสัญญาการ publish ของ updater หาก 1.0.6 ไม่รักษาสิ่งเหล่านี้ จะต้องปรับ updater หรือเปลี่ยนช่องทาง publish ซึ่งอยู่นอกข้อกำหนดปัจจุบัน ห้ามอ้างว่าทำได้โดยคงทุกอย่างเดิมก่อนทดสอบ

Event log ควรมี durable unique event key และ reconciliation; [append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append) ไม่ได้ให้ application idempotency key จึงไม่ถือว่าลองซ้ำหลัง timeout แล้วปลอดจาก duplicate โดยตัวมันเอง หากใช้ [IMPORTRANGE](https://support.google.com/docs/answer/3093340) ต้องอนุมัติการเชื่อมไฟล์/ผลด้านการเข้าถึงและเวลา refresh ด้วย ไม่สร้างไฟล์ใหม่หรือเพิ่มสูตรในรอบออกแบบนี้

**ข้อสรุปเฉพาะหลักฐานที่มี:** ยังไม่มีวิธีที่ผ่านการพิสูจน์ว่าคงพร้อมกันได้ทั้ง original structure/formulas, direct human edits ในทุกเวลา, owner ร่วมเดิม, 1.0.6 ที่ไม่ร่วมควบคุมผู้เขียน และ automatic conflict-safe writeback การเปลี่ยนอย่างน้อยส่วนที่ทำให้ผู้เขียนร่วมสัญญาเดียวกัน หรือเปลี่ยนวิธีเก็บ/แสดงวันที่ เป็นทางเลือกออกแบบ ไม่ใช่ข้อสรุปว่า Google native ทุกวิธีทำไม่ได้ งานถัดไปที่อนุญาตตอนนี้คือจัดทำ impact/compatibility matrix ของสองแบบนี้จากหลักฐานอ่านอย่างเดียว แล้วให้เจ้าของอนุมัติ **การเปลี่ยน setup ครั้งเดียว** ที่จำเป็นก่อน implementation; ไม่ขอให้มีผู้คุมตามปกติทุก batch และยังคงให้ตรวจข้อขัดแย้งจริงเป็นกรณีพิเศษได้

### ตัวตนและสิทธิ์ที่แบบ A ต้องมี

| ตัวตน/บทบาท | ช่วงทีมกรอก Sheet | ช่วง updater ทำงาน | ช่วงลงวันที่จาก AR |
|---|---|---|---|
| คนกรอก Sheet รวม domain/user grants และบัญชี ar ที่ใช้โดยคน | writer ตามรายการที่อนุมัติ | reader | reader |
| Updater principal ที่ไม่ได้ใช้กับคน | reader | writer เฉพาะ instance ที่ controller อนุญาต | reader |
| Native writer principal | ไม่ส่ง content writes | ไม่ส่ง content writes | writer สำหรับ R/U/V/W ที่ได้รับคิว |
| Controlled owner / ACL controller | ควบคุมสิทธิ์ ไม่ใช้แก้งานปกติ | ควบคุมสิทธิ์ | ควบคุมสิทธิ์ |

ตารางนี้เป็น **นโยบายที่เสนอ** ไม่ใช่สิทธิ์ที่ตั้งแล้ว Owner ยังคงมีอำนาจ override เสมอ จึงต้องควบคุม credential/session ของ owner และกำหนด emergency access ที่หยุด automation ก่อนใช้ หากใช้ owner เป็น native writer ด้วย ต้องไม่มี human/desktop session ปกติของบัญชีนั้น และต้องอนุมัติการรวมบทบาทนี้โดยชัดเจน

ฝั่ง AR จะต้องแยก native provider credential profile สำหรับไฟล์/region นี้ออกจากการล็อกอินเว็บและ Gmail โดยไม่เปลี่ยนตัวตนของบริการ Phuket/เก็บไฟล์เดิม ไม่คัดลอก token จากโปรแกรม desktop และไม่เปิด domain-wide delegation การเพิ่มบัญชีหรือ grant เป็นขั้นตอนใหม่ที่ต้องระบุ exact account/file/scopes ก่อนอนุมัติ; `drive.file` เป็น scope ที่ API permission รองรับ แต่ความสามารถกับบัญชีและไฟล์จริงยังต้องตรวจ ไม่สมมติว่ามีสิทธิ์พร้อมแล้ว [Permission scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create)

การโอน My Drive ownership ภายใน Workspace ต้องเป็นบัญชีในองค์กรเดียวกันตามเงื่อนไข Google; เจ้าของเดิมจะกลายเป็น writer และ service account ไม่สามารถรับ ownership ได้ตามข้อจำกัด storage quota จึงยังไม่เลือกหรือสร้างบัญชีใหม่ในเอกสารนี้ [Ownership transfer](https://developers.google.com/workspace/drive/api/guides/transfer-file)

ต้องเสนอ exact owner/permission changes แยกก่อนลงมือ หากใช้ ownership transfer ต้องคง parents โดยไม่เลือกย้ายไป root ใหม่ และต้องแจ้งว่าการโอนมี notification ที่ปิดไม่ได้ ไม่ถือว่าการอนุมัติอีเมลทดสอบครั้งก่อนครอบคลุม notification นี้ [Permission creation/transfer options](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create)

หาก domain writer หรือสิทธิ์อื่น inherited มาจาก parent ที่ใช้ร่วมกับไฟล์อื่น ห้ามลดสิทธิ์ parent เพียงเพื่อทำให้ tracker นี้ผ่าน ต้องเสนอผลกระทบใหม่ หรือถือว่าแบบ A ยังทำไม่ได้ การเปลี่ยน `writersCanShare` เพื่อให้ controller เป็นผู้จัดการ ACL รายเดียวก็เป็นผลกระทบที่ต้องอนุมัติ ไม่ใช่ค่าเดิมที่สมมติว่ามีแล้ว [File permission management](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)

## ขั้นตอนควบคุมที่เสนอ

1. **Queue:** บันทึกเฉพาะ R first actual billing / U-V-W Follow 1–3 จาก confirmed Sent ของ invoices ที่เลือก Friendly/Final และ draft/uncertain ไม่สร้างวันที่ปลอม ไม่มี auto-email
2. **Request window:** รวม batch ในช่วงเวลาที่เจ้าของตกลง เก็บ run/lease, selected Sent IDs, before-values และรายการ ACL ที่จะเปลี่ยนใน DB ส่วนตัว ไม่เพิ่มแท็บ คอลัมน์ protection หรือ metadata ลง Sheet
3. **Fence launches:** ตัวเรียกงานภายนอก 1.0.6 ขอสิทธิ์จาก controller ก่อนเริ่มตลอดวงจร download → merge → recalc → upload → readback ต้องครอบคลุมทุกเครื่อง/shortcut/schedule ไม่แก้ binary แต่การติดตั้ง launcher/เปลี่ยนบัญชีเป็นงานเพิ่มที่ยังไม่ได้อนุมัติ
4. **Drain then exclude:** รอ updater เดิมจบและยืนยันผลก่อน ไม่ suspend แล้วกลับมา upload candidate เก่า ปรับ effective writers เป็น reader ตามรายการที่อนุมัติทีละขั้น พร้อม readback; ห้ามเขียนวันที่ถ้ายังมีผู้เขียนที่กันไม่ได้หรือคำขอเก่ายังไม่ทราบผล
5. **Verify authority:** ตรวจ owner, effective ACL ทุกหน้า, permission paths และสถานะ instance ให้ตรงกับ window หลักฐาน “อ่านค่าเดิมสองครั้ง” เป็นเพียงการสังเกต ไม่ใช่หลักฐานว่าคำขอเก่าหมดแล้ว
6. **Write dates:** resolve ชื่อแท็บ/schema/row identity ใหม่ทุก batch เพราะ updater อาจสร้าง sheet IDs ใหม่ ใช้ Hotel + Account + Invoice และ folio/date corroboration เขียนเฉพาะค่าของเซลล์ R/U/V/W เดิม ห้าม whole-file native upload หรือเขียน S/T/AA/ยอดเงิน
7. **Verify result:** ตรวจ actual-day/first-date floor, A-only/selected-only scope, สูตร รูปแบบ note/comment และส่วนอื่นที่ต้องคงเดิม หาก timeout ให้ uncertain; อ่านกลับก่อนตัดสิน ไม่ส่งอีเมลหรือเขียนซ้ำ
8. **Release:** คืนเฉพาะ permission entries ที่ controller เปลี่ยนและยังตรงกับ expected state หากมี admin/owner เปลี่ยน ACL แทรกให้หยุดและส่งให้คนตรวจ ไม่ restore ACL ทั้งชุดทับการเปลี่ยนที่ไม่เกี่ยวข้อง
9. **Next updater cycle:** เริ่ม 1.0.6 จากต้นฉบับล่าสุดหลัง handoff แล้วตรวจ publication ถัดไป วันที่ที่ถูกย้อนต้องเป็น conflict ให้ตรวจ ไม่ force-insert อัตโนมัติ; guards 98/99 ป้องกันการรับวันที่ย้อนอย่างเงียบ ๆ แต่ไม่ได้ทำให้ผู้เขียนภายนอกหยุดเขียน

สถานะที่เสนอคือ `queued → fencing → exclusive-ready → writing → verified → restoring → released` และ `uncertain/recovery` ที่ห้ามข้ามไป released จากเวลาหมดอายุเพียงอย่างเดียว หาก controller ล่มขณะทีมเป็น reader ทีมอาจแก้งานไม่ได้จนกู้ผลสำเร็จ ต้องมีผู้รับผิดชอบและ runbook; เป้าหมายหน้าต่างสั้นไม่ใช่การรับประกันเวลาหยุดสูงสุด

## Feasibility gates และ acceptance ก่อนเปิดอัตโนมัติ

| Gate | เกณฑ์ผ่านที่ต้องเห็นจริง | ถ้าไม่ผ่าน |
|---|---|---|
| ตัวตน | owner ไม่ถูกใช้โดยคน/updater ปกติ; updater ไม่ใช้ principal เดียวกับคนที่มี writer อยู่ | คง held หรือกลับไป controlled pilot ที่อนุมัติแยก |
| 1.0.6 | binary hash/target ID เดิม; ใช้ updater principal แยกได้; wrapper คุมทุกจุดเริ่มและงานค้างโดยไม่เปลี่ยน source-processing behavior | ห้ามอ้างว่าใช้แบบ enforced โดยไม่เปลี่ยนงาน; ไม่บังคับอัปเกรดเงียบ ๆ |
| Effective permissions | exact permission IDs/roles/parents/inheritance ครบ; ปิด user/domain/group writer paths ได้โดยไม่กระทบไฟล์อื่น | ห้ามลดสิทธิ์กว้างหรือสมมติ direct ACL เพียงพอ |
| Handoff | ทดสอบ delayed upload, permission propagation, browser save ค้าง/offline reconnect, owner emergency access และสอง controller พร้อมกัน บน fixture ที่อนุมัติใหม่ | ไม่มี native auto-enable หากยังพิสูจน์ drain/exclusion ไม่ได้ |
| ความคงเดิม | ID/native format/tab/columns/formulas/comments/protections เดิม; เปลี่ยนเฉพาะ selected R/U/V/W และไม่ทำให้หนี้เป็นศูนย์ | หยุดก่อนต้นฉบับ ไม่แก้ format เพื่อให้ test ผ่าน |
| Queue/unknown | replay ไม่เพิ่ม send/write; crash ทุกช่วง ACL/content write ไม่ทำให้ปล่อยผู้เขียนขณะผลค้าง; recovery ใช้ exact IDs/values | เก็บ technical evidence และให้คนกู้ ไม่ลบหลักฐานเพื่อปิดงาน |
| งานคน | ทีมกลับมาแก้ tracking ใน Sheet ได้จริงหลัง release; unsaved work ไม่หาย; สถานะ read-only/queued/uncertain เข้าใจได้ | ปรับรอบ/ขั้นตอนก่อนอนุมัติการใช้งานจริง |
| Daily persistence | หลัง 1.0.6 รอบถัดไป วันที่ยังอยู่หรือแสดง conflict ที่เข้าถึงได้; financial/settings/Sent truth ไม่เปลี่ยน | ยังไม่ผ่าน original workflow acceptance |

การทดสอบจำนวนจำกัดไม่ใช่ข้อรับรองจาก Google ว่า ACL เป็น CAS ต้องระบุความเชื่อมั่นที่ได้และขอบเขต owner/admin bypass ตามจริง โดยเฉพาะหากยังไม่มีหลักฐานรับรองคำขอที่รับไปก่อนการลดสิทธิ์ หากต้องใช้คนยืนยันว่าทุก client บันทึกเสร็จและปิดงานทุกครั้ง ต้องเรียกแบบนั้นว่า controlled operation ไม่ใช่ unattended automation

## Recovery, ค่าใช้จ่าย และการอนุมัติครั้งถัดไป

**Recovery:** ปิดการรับ native write jobs ใหม่ก่อน เก็บ Sent/outbox และผลที่ไม่แน่ชัดไว้; ไม่ restore workbook ทั้งไฟล์ เมื่อยืนยันว่าไม่มี request ค้างจึงคืน exact ACL ตาม manifest ที่อนุมัติ การโอน owner คืนเป็นอีก sensitive action ซึ่งอาจมี notification/ข้อจำกัดองค์กร ไม่สัญญาว่าย้อนกลับได้โดยอัตโนมัติหรือไม่มีผลข้างเคียง

**ค่าใช้จ่าย:** ไม่มี paid add-on/บัญชีใหม่/เพิ่ม quota ที่อนุมัติแล้ว ต้องตรวจว่ามีบัญชี Workspace ที่แยกบทบาทได้และสิทธิ์ใช้งานครบหรือไม่ ประมาณภาระจากจำนวน permission entries ที่เปลี่ยนจริง: ราว `2 × N` role updates ต่อ window บวกการอ่านยืนยัน ไม่ใช่ N ตามจำนวนชื่อคนอย่างเดียว เสนอจำกัดจำนวน windows/batch และใช้ budget เดิมของ Cloudflare/Supabase เอกสาร Drive/Sheets ณ วันที่ตรวจระบุ standard API use ไม่มีค่าใช้จ่ายเพิ่ม แต่ระบุแผนคิดเงินเมื่อเกิน quota ในช่วงปลายปี 2026 จึงห้ามรับรอง “ฟรีทุกกรณี” หรือเปิด billing/quota เพิ่มเอง [Drive limits/pricing](https://developers.google.com/workspace/drive/api/guides/limits), [Sheets limits/pricing](https://developers.google.com/workspace/sheets/api/limits)

**สิ่งที่ทำต่อได้ในขอบเขตออกแบบ:** จัดทำ exact read-only ACL/owner/path manifest, inventory จุดเริ่ม 1.0.6, ตรวจ account/ownership eligibility และกำหนด loss/uncertainty tests โดยไม่เปิด credential store ไม่คัดลอก token ไม่ติดต่ออีกแชท และไม่เปลี่ยนทรัพยากรจริง

**แพ็กที่ต้องให้เจ้าของอนุมัติก่อนลงมือ:** บัญชีจริงของ owner/controller/updater, รายการสิทธิ์ที่จะเปลี่ยนและวิธีคืน, notification recipients/ผลของ ownership transfer, launcher/schedule ที่จะปรับ, ช่วง read-only/เวลาหน่วงที่ทีมยอมรับ, emergency recovery owner, ขอบเขต fixture tests และค่าใช้จ่ายถ้ามี หากเงื่อนไขเหล่านี้ไม่ผ่าน ให้รายงานว่าแบบอัตโนมัติยังไม่ feasible ภายใต้ข้อจำกัดที่เหลือ ไม่ลดเป้าหมายเป็น inbound-only แล้วประกาศสำเร็จ

Original native outbound ยังไม่เปิดใช้ เอกสารนี้ไม่อนุญาตเปลี่ยน permissions/ownership หรือส่งอีเมลธุรกิจ/อีเมลทดสอบเพิ่ม และไม่เปลี่ยนข้อเท็จจริงว่า isolated XLSX Billing-R proof ไม่ใช่ original native/business writeback acceptance
