# Hotel-region rollout — 15 September 2026

Status: implementation and independent review passed; schema and private templates applied, Worker rollout pending.

The owner's new scope is Phuket (KAT/TSK) and Khao Lak (TLKL/WAKL/TLFO/TSAN), preserving the existing workspace functions and separate Hotel + Account identities. Khao Lak settings start independently and are not imported from Phuket.

## Implemented and tested

- Shared registry, regional selector, 2/4 hotel comparisons and compatible old Phuket URLs. Dates/view preferences survive region changes; incompatible Account/item selection resets through existing dirty-work guards.
- All six Aging ranges and Net open remain available with per-property rows and totals. Dashboard, Portfolio, Collections, Reports and Remittance options/readers share the selected regional scope.
- Worker validators use exact known property IDs; region strings never become operational hotel IDs. Legacy no-region reads stay Phuket. Source identity, source error/zero distinctions and single-property document/email/retention fences remain.
- One additive SQL migration expands the inventoried property constraints/functions. Independent review found no blocker; all 77 migrations and 32 registered rollback suites passed in a disposable local database. No live database or provider action from delegated work.
- Unit baseline 1,059 passed; current integrated implementation 1,086 tests / 111 files, TypeScript and Vite build passed. UI suite 43 browser cases passed. Review found and repaired an old-region refresh completion race and clipped Phuket desktop navigation; independent re-review passed both directions and all seven navigation controls.

## Statement templates

Four owner-supplied RTFs were materialized into blank/synthetic private copies with the existing offline tooling; originals remained unchanged. Static header/closing/footer assets are kept outside Git, with independent hotel identity and hashes. WAKL's shorter header was clipped/padded before its existing account captions so the generated Statement does not repeat those captions.

The existing renderer generated eight synthetic PDFs (one and 45 invoices for each hotel), totaling 12 pages. All pages were visually inspected; unique synthetic invoice/reference membership, totals, full-account Aging, repeated headers/page numbering and bounds checks passed. No Phuket bank/logo was substituted. WAKL's XDO CUSTOM_REFERENCE was mapped only in the offline synthetic trial; this is not a claim about an additional live OPERA field.

## Remaining release evidence

- Final review also found and repaired regional financial-status completion and job-only/Gmail-return region restoration. All review blockers are resolved, with source/actor/late-response and dirty-editor regression checks retained.
- Root verification: 1,090 unit tests / 111 files, TypeScript/build, and full local SyntheticRestore of 77 migrations / 32 registered suites passed. The new job-route edge passed two red-to-green cases and the broader document/token checks.
- Applied migration `20260915050519_ar_hotel_regions` (renamed to the provider-issued version; SQL bytes unchanged, SHA256 `fb1b44ccaa02cd29bb729e3cd07d37c0a4f2c8593e3f9874dd768be2b5baf80a`). Live scope/privilege checks passed; client roles cannot execute the new data RPCs directly.
- Privately registered all four hotel asset sets with in-database PNG checksum verification. KAT/TSK template fingerprints stayed unchanged. Existing Storage usage stayed unchanged; database remains within its configured headroom. No paid capacity was added.
- Check quota headroom, enable the four known source IDs and verify each OPERA property independently without exposing customer data in public evidence.
- Confirm source PDF readiness and protected file lifecycle, recheck Phuket, and complete CI/deployment/merge.
- Mailbox choice is still open; the existing connection is retained without authorizing a new Google account. Account recipient/rule setup remains an explicit Khao Lak task.

Source and artifact references contain no real customer financial totals, names, addresses or one-time test recipient.
