# Current Aging invoice counts and status details

**Goal:** Add outstanding Invoice counts and actionable status details to the existing Current Aging page without redesigning its overview, chart, filters or full-width table.

**Architecture:** A service-only grouped current-source read supplies per-account/bucket counts. A bounded paginated detail read supplies exact selected invoices and independent status facets. The frontend combines summary cells only within the existing hotel/account identities and matching source publications. No new historical snapshots or file storage are introduced.

**Tech stack:** Existing React/TypeScript UI, Cloudflare Worker, Supabase Postgres.

**Approved direction:** Owner approved implementation after reviewing the actual website screenshot on 13 September. Preserve current page typography, source percentages, KAT / TSK / Total order and Net open last. Add count links below amounts; amount/name navigation retains the existing drill path. Count links open an in-flow detail section below the table, without squeezing it.

## Definitions and constraints

- Count each verified positive Hotel + Account + root Invoice once. Do not count compressed child rows, zero balances or credits as outstanding invoices.
- Source Aging money remains authoritative and signed. Invoice-derived positive balances are a separate measure; do not force reconciliation or manufacture zero/complete counts.
- Billing status, latest actual Follow-Up and Due date are independent dimensions. Their categories partition the eligible invoices within each dimension; do not add the three dimensions together.
- Billing: Not billed, Billed, Billing not required, Setup needed / unavailable. By System is billed only after recorded actual billing.
- Follow-Up: No Follow-Up sent, Friendly, Follow-Up 1/2/3, Final and preserved configured/historical labels. Drafts do not advance a stage.
- Due: Not yet due, Due today, Past Due date, Awaiting billing, Unavailable. Use today's Thai calendar date for this current-only view.
- Preserve On hold and Needs review flags separately from the three dimensions.
- Unknown membership, schema, publication or invoice coverage must remain visible. A reload or hotel/account change must not display another scope's prior results.
- Keep auth/owner checks, safe bounded queries, read-only OPERA use, no automatic email, no paid resources and existing quota protections.

## Work

- [x] Implement and test a grouped service-only SQL read plus strict Worker request/response contract. Verify complete population, parent-child exclusions, credits, unknowns, source timestamp alignment, scope and pagination.
- [x] Implement frontend parsing and aggregation, with loading/error/source-mismatch handling; add count links to desktop/mobile Aging cells.
- [x] Implement an in-flow detail section with Billing / Follow-Up / Due views, amounts/counts/percentages and exact invoice rows. Preserve filters, page boundaries and return navigation.
- [x] Add synthetic browser coverage for unchanged layout, all-range fit, KAT/TSK/Total, status overlap, filtered invoice links and error/reload behavior.
- [x] Run appropriate local SQL/unit/browser checks and independent review, apply the verified migration, deploy with existing bindings, verify protected reads and actual production UI assets, merge after CI and update PROJECT_STATUS.

Only synthetic data and screenshots enter the public repository. Live verification reports aggregates and booleans; no customer payloads, recipients or credentials are published.

Completed: both migrations applied and verified; 898 unit tests, 27 local browser cases, 12 deployed browser cases, and 67-migration/24-suite isolated SQL replay passed. Real signed-in UI confirmed the new read path. PR #21 merged after CI; see PROJECT_STATUS for source/version and scoped evidence.
