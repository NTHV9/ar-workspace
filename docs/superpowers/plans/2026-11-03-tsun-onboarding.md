# TSUN Coordinated Onboarding Implementation Plan

> Implement with superpowers:subagent-driven-development for the independent
> publisher and web support tasks; root integrates private assets and delivery.

**Goal:** Enable TSUN across Aging Master, the original Khao Lak Sheet and AR web.
**Architecture:** Add canonical TSUN to current hotel/property contracts, preserve
the six/five incumbent scopes, and qualify the existing regional synchronization.
**Stack:** Existing Python/Windows publisher, TypeScript/Cloudflare, Supabase,
Google Drive/Sheets; no new provider resources or paid subscriptions.
**Spec:** ../specs/2026-11-03-tsun-onboarding-design.md

## Global constraints

- Exclude Accruals; SUN/TSUN aliases deduplicate as TSUN; LFS is unchanged.
- Keep original workbook identity, account/hotel isolation, staff dates/formulas,
  confirmed-Sent/no-resend and transient PDF lifecycle.
- Read/verify exact source and target versions before any external write.
- No real mail or OPERA ledger action. No secrets/private assets/customer data in Git.
- Preserve unrelated dirty source/docs, using a baseline manifest for review.

## Review focus

- Both alias filenames, ambiguous duplicate inputs and wrong-hotel report headers.
- Hyphen/slash dates, invalid dates and source section total reconciliation.
- Missing/empty/new property inputs and old publisher omission of new rows.
- Same account/invoice names across hotels and first-hotel bootstrap aliases.
- Seven property bank/logo/bottom identity; incumbent assets remain source-qualified.

## Tasks

- [x] 0. Freeze source baselines; baseline suites; create task ledger/preflight.
- [ ] 1. Aging Master: failing tests for TSUN aliases, required set, strict dates,
      duplicates and AR-only Accrual exclusion; update current adapters/contracts;
      full suite and actual input qualification; build/deliver a new Windows EXE.
      Primary files: regions.py, input_scan.py, pdf_converter/ar_detailed.py,
      master_builder.py, account_parser.py/adapters if required; packaging tests.
- [x] 2. Web/DB/tracker: failing tests for TSUN operational and regional scope,
      aliases, first-account append identity and access isolation; implement all
      registry/refresh/mail/SQL mappings in an additive migration; full tests/SQL.
      Primary files: src/domain/hotels.ts, worker/tracker-sync/*,
      worker refresh/opera/financial scopes, new supabase migration and fixtures.
- [x] 3. Private templates: compare incumbent bank/logo/bottom with source RTFs;
      build TSUN assets with verified field positions; synthetic/model rendering
      and real read-only TSUN invoice checks; validate voucher-source mapping.
- [ ] 4. Independent reviews of each task and complete release; local full checks,
      CI qualification, exact migration/private asset/runtime installation.
- [ ] 5. Qualify first TSUN Sheet publication from fresh source without disturbing
      incumbent rows/tracking; readback all expected identities/totals/columns,
      inbound web and synthetic writeback contracts. Preserve business fingerprints.
- [ ] 6. Final state/delivery/status documentation and owned temporary cleanup.

## Ledger

2026-11-03: Owner authorized all3 parts after the readiness audit and explicitly
required all7 bank/logo/bottom comparisons. Audit context and source paths remain
in TSUN_OPENING_AUDIT_20261103.md. Existing web branch has only unrelated dirty
docs; Aging Master source is dirty from earlier production work and must be
reviewed against its captured working baseline, not blindly reset to Git HEAD.
Ruling: explicit proceed authorization adopts the audited approach; no redundant
design-approval round. Existing linked worktrees are reused under worktree skill.

Checkpoint: local web5052/9,typecheck/build; SQL156/55+concurrency; CFO43 andactiveTSUN6 allPASS. FullindependentreviewREADY. Masterfinal1002/8afterP2fix, corrected1.1.0buildpending. Owner explicitlydelegatesinitialliveSheetpublicationtostaffusingcomplete6-inputsetafterdistributing1.1; noSUN-onlywrite. All7bank/logo/bottomcomparisonscomplete; existingassetsunchanged,newTSUNfooterstrayliteralcleanedonlyderivedasset. PrivateARread/model/rendercovers3ARStatementrows,2folioInvoices;1nonfolioCreditInvoiceheld. GitHub/runtime/asset/EXEdeliverypending.
