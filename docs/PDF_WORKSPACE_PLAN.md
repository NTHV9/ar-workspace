# PDF workspace implementation plan — 2026-09-09

Authority: PRODUCT_SPEC sections15–16, DECISIONS_AND_OPEN_ITEMS, approved pdf-workspace-v1.png and latest owner authorization. Goal is blocked pending the native Statement execution/download contract after three consecutive goal-turn audits. Work in the explicitly requested workspace and existing dedicated codex/opera-refresh branch; only root commits/deploys/applies migrations. No customer payload/secret/media in Git. No email or legacy changes.

## Tasks and acceptance

1. Establish native selected Statement PDF transport. Read Oracle official contracts and report parameters; perform bounded read-only discovery. Generation/printing side effects are owner-authorized but require durable no-duplicate command handling before write-like report requests. Reject extra/missing selected Invoice identities or account-wide totals presented as selected. A report descriptor is not PDF bytes.
2. Implement document job schema/API and native invoice acquisition using proved reservation folio history + contextual getFolioReport. One Hotel+Account, server-side collection guard, immutable selected manifest/order, private files and owner RLS. Ambiguous generation must not automatically repeat. Originals/edited drafts stay private; no automatic retention interval or cleanup.
3. Implement client PDF editor in independent src/pdf modules, matching reference proportions. Props contract below. Tools: original detected-text run replacement, text/font/style/color/position, note/stamp/shape/image, page add/delete/reorder, undo/redo, Preview, final acknowledgment. Explicitly describe limits: fixed-page PDF editing; no promise of Word-wide automatic paragraph reflow. Original text replacement masks original pixels before edited-page raster export; do not call an overlay rectangle a true redaction by itself.
4. Assemble 3 content modes and3 delivery layouts, preserve multi-page Invoice grouping/order. Unedited source pages may remain native; edited pages export as opaque rendered pages so removed text cannot remain extractable. Test extraction and rendered output with synthetic PDFs.
5. Integrate Account Detail selection → document job → Workspace → private save/download/final Preview. No email handoff pretending it is enabled. No generated sample data fallback. Missing native source produces an explicit unavailable state while independent document work remains accessible.
6. Spec/security/code review, real native PDF/selected-only tests, synthetic visual comparisons1440×900 and smaller laptop, build/typecheck/unit/browser tests. Push/deploy/status update and deliver review links. Do not mark Goal complete unless required native and editor work actually passes; report remaining external blockers honestly.

## Editor interface

Export PdfWorkspace from src/pdf/PdfWorkspace.tsx. Props: documents: PdfSourceDocument[]; accountName:string; hotel:string; selectedCount:number; onClose:()=>void; onSave?:(files:PdfExportFile[],project:PdfProject)=>Promise<void>. Types exported from src/pdf/types.ts. PdfSourceDocument={id:string,name:string,kind:'statement'|'invoice',invoiceId?:string,bytes:Uint8Array}; PdfExportFile={name:string,bytes:Uint8Array}. PdfProject serializable (no tokens/source PDF bytes), stores pages/layers/history-relevant edit data as needed. Root adapts integration and persistence. Workspace fetches no customer data by itself. Synthetic demo only if passed explicit synthetic documents.

## Rulings / progress

- Ruling: keep work in owner's named workspace and dedicated feature branch; do not create a second checkout or delete existing files. Owner authorization supersedes generic skill suggestions for new worktree/cleanup.
- Ruling: active document jobs retain original+edited private files for review; retention duration/Drive archive awaits confirmed policy, no invented30/90-day timer.
- Ruling: implement original text-run replacement and box wrapping with explicit fixed-page limits, plus true flattened removal on edited pages. No paid SDK and no claim of unrestricted Word document reflow.
- Ruling: user will be asleep; continue independently. Missing Gmail/Drive grants/recipient do not block editor and native PDF work. No sends.
- Task1: native Statement still incomplete. Tenant allReports exactmatches found; no renderer/bytes contract. Owner async question pending. Do not invent transport or markGoalcomplete.
- Task2: implemented/applied; private jobs/receipts/owner policies and interruptionfence tested81isolatedSQL assertions plus hostedtests. RealKAT/TSK generation passed; Both-modepartialhonest.
- Task3–4: editor/assembly implemented and tested; fixed-page original-run replacement andflattening limits explicit. NoWordparagraph/page reflowclaim. Draftrecovery/preview/async protections passed.
- Task5: realKAT browsercreate→native→draft→reopen→reviewedsave passed; TSKnative2pageInvoice preserved; sourceARamountsunchanged.
- Task6: sourcee34439c pushed/deployed;124unit,full25browser tests passed (including13editor tests). SyntheticCloudflare1440/1280imageschecked; scopedreviewfindingsresolved. GoalpartialuntilnativeStatementtransport isproved.
