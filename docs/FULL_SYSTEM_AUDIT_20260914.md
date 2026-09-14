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

## Findings being repaired

1. Remittances can restore an old hotel's filters and selected notice after the global hotel changes while another page is open.
2. Full-app reproduction narrowed Collections to an unmount during global refresh: selections are lost, and a subsequent failed read loses the previous queue. Preserve the mounted queue and refresh from catalog changes while retaining valid user context.
3. Browser Back can unmount the email composer without propagating its unsaved/busy state to the app navigation guard.
4. The retired acceptance harness requires scoped reactivation and updates for payment mapping v3, newer dashboard captures, transient document cleanup and closeout. These are test-harness compatibility gaps; they are not reported as failures of real OPERA or Gmail.

## Remaining acceptance matrix

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

Do not mark this audit complete until the remaining matrix and final verification are recorded with their actual limitations.
