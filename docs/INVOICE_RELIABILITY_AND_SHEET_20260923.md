# Continuous register and invoice recovery — 23 September 2026

The owner asked for one Excel-like Invoice Register and an investigation beyond the three failed-invoice screenshots. Horizontal scrolling is explicitly allowed in this register; the separate Account Detail ledger keeps its earlier no-horizontal-scroll layout. Current application data remains authoritative; no old workbook values are imported.

## Register

All existing data/edit columns are in one sheet. Hotel, Invoice and Account stay visible on desktop; phone retains the Invoice anchor. Headers remain visible while scrolling. A synchronized upper scrollbar makes the far-right tracking/note columns reachable without first finding the bottom of the page. Compact report controls leave invoice rows visible immediately on a 1280×720 laptop.

The UI loads bounded 100-row requests into one consistent result, with no user page navigation or column-set tabs. An opaque checksum of the complete filtered result accompanies every page. Changed/duplicate/incomplete page streams are discarded and retried at most three times, never merged into a partially correct sheet. The UI mounts only the visible row window, preserving all loaded records and stable hotel/account/invoice keys. Queries above 50,000 rows require a narrower hotel/account filter.

Bulk visibility uses bounded 100-row commands with retained receipts, progress and retry of the unconfirmed batch. Hiding stays personal and reversible. Billing/reminder/note links, optimistic row revisions, regional access, accounting read-only fields and manual-edit history remain.

## Reproduced invoice failures

1. A long-stay selection sent a 35-day interval to an endpoint limited to 30 days. The live provider returned HTTP 400 with a date-span validation message. Tax reads now use non-overlapping windows of at most 30 calendar dates.
2. Some multi-date tax responses repeated package members across offset pages. The reader now splits a busy date window into smaller date partitions before consuming its later pages. It discards the probe, reconciles child counts to the parent total and still requires unique identities in the final leaves. Single-date paging retains strict completeness checks and bounded whole-read recovery; no duplicate is silently removed.
3. Some invoices contained a direct AR adjustment absent from the reservation's tax ledger. Exact `transactionDetails` reads with `includeGenerates=true` supply the missing AR evidence. This path accepts only complete responses containing exactly the requested roots, no generated/nested postings, a non-deferred Revenue posting, a matching account/invoice/Folio/code, a base-revenue code rather than a VAT/service-charge posting and reconciled debit/credit/posted amounts. Actual posted VAT remains separate; no tax percentage is used to manufacture missing tax.
4. The recorded card-entry failure now has a verified zero balance. It is not a current collectible invoice. A changed balance is reported before missing reservation selectors on stale preparations; zero is never inferred from an API error or missing item.

The [Oracle Cashiering contract](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/csh.json) documents the 30-day/50-record bounds and generated-transaction inclusion. The [AR contract](https://github.com/oracle/hospitality-api-docs/blob/main/rest-api-specs/property/v1/ars.json) supports the verified hotel/account/transaction/invoice posting scope. Runtime behavior was checked through the existing authenticated read-only control plane; public specifications alone were not treated as proof.

## Existing preparations

Earlier failed files retain their recorded outcome and bytes. An unreviewed preparation with unavailable sources can open a new preparation using the same selection, content, layout and purpose. Uncertain, running or reviewed preparations do not offer that shortcut. New command namespaces preserve retry receipts without reusing the old failed job; no old file is overwritten or discarded, and no email or billing event is created.

## Verification scope

- Red/green regressions cover date spans, unstable multi-date package pagination, direct AR evidence and stale balance precedence. Scope, amount, unsupported-tax and deferred-tax counterexamples remain rejected.
- Every recorded positive-balance failed scope found in the audit was re-read successfully, spanning KAT, TLKL and TSAN and including the 76-line mixed-posting case. The zero-balance card entry was separately identified, not forced through invoice generation. Fresh normal-UI preparations produced four ready PDFs across the screenshot scopes and a related AR-adjustment case. Their previews/footers show the reconciled totals, actual non-VAT adjustments and nonzero remaining balances. Private identifiers, API data and customer PDFs stay outside Git.
- Sheet tests cover a 1,500-row result, bounded DOM size, editing the final row without losing scroll position, pinned columns, upper/lower horizontal synchronization, filter/search/sort, and a 230-row hide/restore including an ambiguous batch retry.
- Two old PDF application-route assertions also failed on the deployed pre-sheet UI: they expected a glyph-box height of 12.747 instead of the already-shipped tracked insertion allocation. They now check that the inserted row fits the measured source text, remains compact, fits its editable cells and produces the final preview. No PDF editing runtime or earlier visual baseline was changed to satisfy them.

Final deployment and live evidence are recorded in PROJECT_STATUS.md. This is coverage of the recorded cases and tested contracts, not a claim that every future OPERA variation or provider outage can never fail.
