# Full system audit — 14 September 2026

Status: in progress. The owner authorized a detailed audit of all pages, synthetic data creation, defect fixes and live test email to the conversation-supplied recipient. The recipient is ephemeral and is not recorded in this document or permanent configuration.

## Scope and authority

- Production: the existing Cloudflare Worker and Supabase project. Baseline source is `2339c57` (runtime `6f8c123`); branch `codex/full-system-audit`.
- Preserve the latest business definitions: Bill Date new-invoice cohort including zero/credits; nonzero non-child signed outstanding/Aging; positive-only Billing/Due/Follow-Up work; current Aging and historical closing dates remain separate.
- Use the existing isolated acceptance mechanism for synthetic business mutations. Current OPERA ledger and real Account settings/contacts are outside the mutation scope. No paid services, broad permission grants or production restore.
- Gmail/Drive tests use real adapters and exact scenario objects. Browser regression fixtures and OPERA simulation are reported separately from live provider evidence. Original design references and prior evidence are retained.

## Initial verification

- Typecheck and all 1,041 unit tests / 108 files passed.
- Full browser suite: 364 passed; one old compression test expected visible disabled child rows, conflicting with the owner's newer instruction to hide child rows. Updated that assertion and retained unverified-row/selection/amount checks; both compression cases pass on deployed assets. This was an obsolete test expectation, not a product regression.
- Initial local synthetic database dump/restore passed the runner's historical 33-migration / 3-fixture baseline. This does not validate the latest 74-migration schema: the runner requires explicit additional migration names. Full latest-schema replay is still required. Run `private/recovery/run-f8a193bf746746b7896abf1f25cb8438`; server stopped; dump SHA256 `e794d2ebffb6ab80fe5d540974a7282ae5718536ac7a850fffc70a445a172af6`; no provider requests or live export.
- Live Supabase preflight: 78,490,771 database bytes; 19,036,387 stored bytes / 135 working objects; no active acceptance scenario, namespaces or test bucket. Existing quota protections remain active.
- Security advisors: no WARN/ERROR; 55 INFO notices for private RLS tables with deliberately no client policy. Zero anonymous EXECUTE grants on public AR security-definer functions. Owner retains the email and Google identities.

## Initial defects repaired

1. Remittances can restore an old hotel's filters and selected notice after the global hotel changes while another page is open.
2. Full-app reproduction narrowed Collections to an unmount during global refresh: selections are lost, and a subsequent failed read loses the previous queue. Preserve the mounted queue and refresh from catalog changes while retaining valid user context.
3. Browser Back can unmount the email composer without propagating its unsaved/busy state to the app navigation guard.
4. The retired acceptance harness requires scoped reactivation and updates for payment mapping v3, newer dashboard captures, transient document cleanup and closeout. These are test-harness compatibility gaps; they are not reported as failures of real OPERA or Gmail.

## Verified audit results

The final signed-in acceptance run uses one isolated synthetic KAT Account, three invoices (1,000 / 2,000 / 3,000 THB), and an empty TSK ledger. Real customer Account settings and OPERA balances were not changed. The recipient is supplied only from the authorized conversation.

- Actual Gmail: three messages reached verified Sent: Billing for two invoices, a Friendly Gmail Draft manually sent from Gmail in the existing conversation, and Follow-up 1 for the third invoice. Draft creation alone left the reminder count at zero. The user's incoming reply was read inside the app. The Friendly message retained all three separately reviewed PDFs. Native Gmail changed its Draft message identifier; the existing manual match checked recipients, subject, body and complete attachment hashes before recording Sent, without resending.
- Documents: combined PDF, Statement plus invoice bundle, and Statement plus individual invoices all rendered and were reviewed. Selected-only Statement totals (3,000 THB) and whole-account Aging (6,000, then 5,500 THB after partial payment) remained distinct. Source text formatting, direct edits, line removal/addition, deletion/undo and final preview were checked. Browser regressions additionally cover rows, line/area dragging, page order/deletion and export consistency. Supplemental two-page PDF upload and all-page preview passed.
- External billing: By System blocks Billing email handoff while Collection remains available. The portal opened. A synthetic 1 August external billing record established the third invoice's first billing/Due date and appeared in August activity, without sending email.
- Remittance: one notice / one Hotel / one Account, uploaded evidence, allocations of 5,000, reported total corrected from 6,000 to 6,500, unallocated 1,500, void and restore, and immutable history all verified. The notice and reply did not close invoices.
- Balances: source partial payment changed one invoice from 1,000 to 500; Portfolio, Account, Dashboard and Aging agreed on three open invoices / 5,500 THB. Friendly current exposure was 2,500 while actual amount at send remained 3,000. Hold produced one held invoice / 500 THB and filtered correctly in Aging/Collections.
- Reopen: source refresh confirmed the invoice at zero, then its reopening to 1,000 produced Needs review and retained first billing date, Due date, Friendly and its actual send date. Hold release and reopen acknowledgement were separate commands. Notes/dispute were cleared through the scoped application command after the test, retaining seven revisions of status history. Final source refresh confirmed all three invoices as cleared at zero.
- Payment cohort: normal financial refresh against the synthetic OPERA adapter published three invoice links / 6,000 THB in the payment-date period; KAT 6,000, TSK verified zero. Recorded credits and currently allocated amounts both 6,000; unallocated/debit corrections zero. These are simulated source facts through the real backend, not a write to OPERA or proof of actual customer payments.
- Bill Date cohort: August showed two new invoices / original 3,000 THB after both had current open zero. Drill-down retained the correct 4 and 24 August dates. A past closing-date snapshot that did not exist remained unavailable instead of substituting today's zero balances.
- Drive: a separately created legacy-format acceptance job exercised the retained archive policy. Two reviewed PDFs uploaded to the exact restricted synthetic folder and both passed provider readback. This compatibility test did not restore central Documents or saved editor projects for new preparations.

## Additional defects repaired during live acceptance

5. First-time sent messages had no conversation/reply entry point unless a parent thread had been selected before sending. The account view now derives an exact thread from verified Sent evidence, with owner/account/revision and Gmail message checks; closed transient files are not read.
6. External billing review labeled an internal transaction ID as Invoice. It now uses the selected Invoice/Folio identity, with an explicit Item ID fallback when metadata is absent.
7. A Gmail Draft message ID replaced by native Gmail yielded a generic service error. A precise 404 now keeps the existing delivery in review-required and guides the user to verified manual matching. Missing mail is never treated as Sent and does not authorize a resend. Other provider errors retain their existing behavior.
8. A reopened sent/Draft composer lost its selected collection-stage display. It now displays the captured stage/label, including retired custom rounds. Legacy default Follow 1/2/3 labels in period activity display the full Follow-up names; custom historical wording remains intact.
9. A tab opened before deployment could turn blank when navigating to a newly requested, obsolete lazy-module URL. Recoverable panel boundaries keep the app navigation available and offer a manual reload. There is no automatic reload, write replay or bypass of existing unsaved-change checks. Four browser regressions reproduce failed module requests on desktop/mobile and verify recovery, navigation and preserved filters.

## Verification evidence

- Latest completed unit run: **1,059 tests / 108 files passed**; TypeScript and production build passed. The existing large-bundle advisory remains; PDF modules are loaded on demand.
- Full browser run before the last Draft recovery/label additions: **385 passed**. The next 389-case run passed 388 and hit one 5-second initial PDF-harness load timeout before any editing assertion. The unchanged case then passed three consecutive isolated repeats. The final full run including deployment-rollover recovery is pending; do not sum overlapping runs or describe the earlier run as wholly green.
- Latest complete local synthetic restore: **76 migrations / 31 SQL suites passed**, run `private/recovery/run-05c84a12718242e2b15f72ba7fa0bf62`, stopped local server. Dump 965,136 bytes, SHA256 `c7fa1e1496c9235ba964dec889dd61041fa836c891f41d0aeb9fb08f7e97a09e`. Zero provider requests and no live export. Two provision/retire cycles required a larger lock table only in the disposable local PostgreSQL process; hosted settings were not changed.
- Runtime candidate `fdcada926af4d1d509a771ccbee64dd89737b6ef`, Worker `d4194117-193c-4f3c-90cb-abc35329f006`; health/database verified and all 19 anonymous boundary requests rejected. Acceptance remains temporarily enabled pending exact-object cleanup.
- Existing synthetic visual references were preserved. Fresh test screenshots were inspected separately, not substituted to make assertions pass.

## Acceptance coverage and closeout

| Area | Required evidence |
|---|---|
| Auth / navigation | Unauthorized routes, Google session, Back/dirty/busy guards, keyboard and mobile |
| Portfolio / Account | KAT/TSK grouping, filters/sort/selection, settings, terms, credit/child/unknown handling |
| Dashboard | Period dates/cohorts, signed totals, hotel splits, all Aging buckets/status facets and invoice drills |
| Collections / Reports | Refresh publication, Billing/Follow-Up stages, actual-sent history, holds/reopen, external billing |
| Documents / PDF | Fresh selection-only Statement/Invoice, all arrangements, edits/rows/lines/pages/formatting, preview/export consistency |
| Email / Templates | Unsaved state, supplemental files, template editing, live Draft/Send/evidence/thread paths, recipient guard |
| Remittances | Hotel/account scope, allocations, evidence, corrections/void/restore, no ledger closure |
| Storage / Operations | Real private upload/readback, quota reservations, uncertain outcomes, retention/transient cleanup, recovery status |
| Closeout | Exact test-object removal, scenario exit/retirement, acceptance disabled, production health and final deployment/CI |

The matrix combines real signed-in/provider checks with synthetic browser and SQL regressions. Follow-up 2/3/Final, custom/retired policy rounds, failure/uncertainty and unauthorized cases are covered by regression fixtures rather than additional real mail. No customer emails, OPERA accounting writes, production recovery restore, password reset, or paid add-on were required.

### Exact test cleanup — 15 September, 00:03 ICT

- Twelve transient sources/exports were removed after verified Sent. Nine Supabase files and two Drive files remained while the completion criteria were unmet. A synthetic dispute correctly blocked monthly retention even after zero balances; after explicit resolution, due dates were exactly one calendar month after eligibility.
- Advanced only the disposable retention clock by 31 days. All **21 Supabase objects and 2 Drive objects** were deleted and provider absence verified. The original restricted parent folder and production files were preserved. Remittance moved out of Pending at zero and remained one notice / three linked invoices / reported 6,500 / verified linked open zero in All records before cleanup.
- The sealed scenario contains three minimal Sent receipts; recipient hash and fixture were erased. Its empty dedicated Drive folder and private Storage bucket were removed. Both temporary schemas were dropped via the reviewed admin helper, all application-role acceptance/helper grants revoked, and the global budget reservation settled. Managed egress upper bound was 4,058,212 bytes.
- Post-retirement: zero active scenarios, zero temporary namespaces, zero test buckets/objects, zero application-role acceptance grants. Production Storage remained **19,036,387 bytes**, equal to preflight; physical database size **78,957,715 bytes**. No paid capacity was added. Security/performance advisors have INFO only, no WARN/ERROR; existing private-table RLS/no-policy and indexing advisories remain informational.
- Final acceptance flag disablement, deployment/CI/merge, final browser suite and production smoke remain pending.
