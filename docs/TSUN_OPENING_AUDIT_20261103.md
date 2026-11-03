# TSUN opening readiness audit - 3 November 2026

Status: readiness snapshot before the owner authorized implementation. Current
implementation/release state is recorded in PROJECT_STATUS and the TSUN plan.
No activation, financial refresh, Sheet write, OPERA posting or email in this audit.
Production health still identifies source4a081f4cc8e96968eccc2a2daa6a920b81209dfe.

## Owner requirements and inspected inputs

- TSUN is now open. Review the owner-provided Folio and Statement templates for
  all seven properties, and determine Aging Master/Google Sheet onboarding work.
- Detailed Aging filenames may use either SUN or TSUN. Normalize both to one
  canonical hotel before duplicate detection; supplying both must not double count.
- Exclude Accruals from imported invoice rows, counts, balances and aging buckets.
- Original inputs remain unchanged in Downloads/Folio, Downloads/Statement and
  the owner-supplied SUN Detailed Aging PDF. No original file was deleted.

## Template inspection

All14 supplied files are XDO/BI Publisher RTF templates, not numbered customer
Invoice/Statement PDFs. TSUN Folio has the same56 directive sequence as WAKL,
TLFO,TLKL,TSAN,TSK; KAT has its separate external-reference/card fields. The five
financial footer expressions remain net-minus-nontaxable, posted VAT, nontaxable,
gross and balance. TSUN Statement matches WAKL's37 directives and CUSTOM_REFERENCE;
the other five use REFERENCE, with two additional sort directives in KAT.

Offline controlled copies were materialized with blank/synthetic data using the
existing bounded RTF helpers and isolated LibreOffice profile. All14 renders have
one Letter page, expected form title and zero unresolved directives. Both contact
sheets and the two TSUN full pages were visually inspected. TSUN has its own logo,
branch/footer and banking block; it must receive separate assets, not another
hotel's reused identity. Originals were not modified and assets stay private.

This establishes template compatibility and visual feasibility, not fresh financial
parity for every existing invoice or pixel equality with the current production
assets. WAKL/TSUN Statement voucher-source equivalence and KAT ordering need explicit
source-backed checks in onboarding qualification; field names alone do not prove
an existing defect. No unsupported field was silently removed.

## Actual Detailed Aging checks

The supplied searchable one-page report identifies The Sun Club Khaolak by
Katathani and business date03-11-26. Independent root rerun of the ignored audit
harness passes11 existing structural checks with0 issues. It contains two A/R
accounts with three numbered invoice rows and a separate Accruals account with
two non-invoice rows. All amounts are in the first aging bucket. Account/detail,
section and Grand Total reconciliation succeeds; Grand Total is a validation
control, not the AR-only import total.

The unmodified production-source converter fails MissingBusinessDateError:
pdf_converter/ar_detailed.py extracts slash-only business/print dates, and
parse_business_date accepts only DD/MM/YY. The actual report uses DD-MM-YY.
Downstream posting-date parsing already accepts hyphens.

Existing _master_ledger_items and summary logic exclude Accruals. A separately
labelled in-memory diagnostic, supplying only the source-verified business date,
passes the existing workbook-byte/account-parser boundary with exactly three
AR rows, zero Accruals rows, valid posting dates and unique canonical TSUN keys.
This is not a successful unmodified conversion or a production fix. The full
aggregate receipt and harness stay ignored; no workbook/customer rows enter Git.

## Onboarding gaps

- Web src/domain/hotels.ts still lists six active hotels and TSUN pre-opening.
  Live database is_supported_hotel('TSUN') is false; no TSUN Invoice/Statement
  template exists. Activation requires region/backend authorization, refresh,
  financial/report scopes, private template assets and regional Gmail checks.
- Web tracker aliases and exact SQL append mappings lack SUN/TSUN. Readers skip
  unknown property labels. Append planning cannot borrow another hotel's account
  alias to bootstrap the first TSUN account.
- Aging Master implementation is the separate aging-master-one-click worktree.
  Its configured Khao Lak input set is SAN/LFS/LFO/WAT/TLK; no SUN/TSUN alias.
  Keep LFS as its existing property. Extend input scan, canonical duplicates,
  property contracts/order, date metadata and master merge qualification.
- The live original native workbook Master_SAN_AR_Tracker was read through its
  existing configured identity. Its combined tab retains33 columns and summary
  contains the five existing property labels, with no SUN/TSUN rows. Keep the same
  workbook identity/link; a new separate Google Sheet is unnecessary.
- Do not manually insert TSUN while old publishing programs remain in use.
  ar_build._merge_with_parsed creates a fresh workbook from recognized current
  properties; a later old-program publication can omit TSUN from the active sheet.
  This does not establish that the missing property would be recorded as paid.

## Proposed implementation and qualification

1. Add strict hyphen/slash metadata dates with invalid-date rejection; synthetic
   tests must reproduce the actual date failure before repair.
2. Admit SUN/TSUN filenames as canonical TSUN, reject duplicate canonical inputs,
   preserve all existing properties, and lock AR-only Accruals exclusion in tests.
3. Add the new hotel's private Invoice/Statement assets and complete web/backend/
   refresh/tracker/SQL mappings, preserving hotel-account identity and access.
4. Test actual TSUN Detailed Aging parsing, existing-hotel regression, complete
   master merge/recalculation, manual tracking retention, summary and inbound/
   confirmed-Sent Sheet contracts before a controlled release. Do not send test
   mail or modify staff dates as part of document validation.
5. Update every Khao Lak master-publishing installation before introducing TSUN
   into the existing production Sheet. Desktop has several executables, including
   1.0.9; installed staff versions and its embedded build are not established by
   source inspection alone. Existing unrelated dirty worktrees remain untouched.

Local audit helpers and render evidence are ignored in .tmp/tsun-opening-audit.
