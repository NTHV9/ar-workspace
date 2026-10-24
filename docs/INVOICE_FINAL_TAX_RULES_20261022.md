# Shared AR adjustment and direct NonVAT qualification

## Implemented, tested, deployed and enabled

Source `b743e2e5865cc65419f923f60f5e8bf6246ce125`, Worker
`a14f853c-9f0c-4ea4-bb80-e62fa54b9453`. Production health/database and six anonymous
protected routes pass. All 42 runtime bindings match the previous release except
COMMIT_SHA; tracker push/writeback remain enabled. Existing reviewed documents
are not silently rewritten; new preparations use the repaired source rules.

The owner delegated the source-policy choice in favor of correct automatic
generation, confirmed that rules must apply by source shape/code rather than
Invoice number, and identified Airport Transportation and Taxi Service as the
NonVAT components of the remaining mixed invoice. The owner also verified that
TSAN 6002 currently has Non Taxable unchecked. No OPERA setting was changed.

### Missing AR adjustment VAT

Original posted VAT remains authoritative. Only when native PDF selection is
ambiguous by Folio window may a separately certified current-rule path qualify
missing AR-only adjustments. It reads OPERA's actual charge calculator and
complete unchanged parent/leaf definitions, then rereads the full source packet
and all definitions. This is current-rule evidence, not historical posted VAT.

Every original charge component must already have explicit VAT7 covering its
whole inclusive amount; every missing adjustment must independently satisfy that
same condition through OPERA's calculator. Taxless/mixed NonVAT components,
partial VAT bases, separately posted receipt groups, unsupported posted graphs
and foreign-account posting exceptions cannot use this path. Actual Payment rows
remain separate from charge VAT. Provider/auth failures, changed sources and bad
PDFs do not trigger this alternative. Native-eligible paths retain their controls.

### Direct NonVAT in an embedded posted-tax invoice

The posted-generate proof now admits direct NonVAT rows only with complete row
identity/amount/date/currency coverage, no posted generates, net equal to gross,
unchanged code metadata and matching effective calculations before/after the
source reread. The calculator must return exactly the same signed base amount
and total, with no extra charge. Calls are deduplicated by code/signed amount,
bounded to 40 pairs, and read four concurrently.

Classification additionally requires either explicit OPERA nonTaxable=true or
the named owner-confirmed TSAN 6002 Taxi Service policy. That policy verifies
hotel, code, exact description (optional trailing star), Revenue/Others/MISC,
nonTaxable=false, taxInclusive=false, no configured generates/associated codes,
and all row/effective-calculation checks. Airport uses OPERA's explicit flag.
No Invoice number or individual amount is hardcoded. This is a transparent
transaction-code policy, not a claim that OPERA's current flag is true.

An unchecked Non Taxable flag is not evidence that VAT7 was actually generated.
Fresh OPERA calculations for both transport codes returned only the base amount.
However, food-code counterexamples also return base-only calculations while their
native NonVAT aggregate is zero. Therefore neither a zero calculator result nor
missing generates alone can qualify a code. Unknown codes remain unqualified.
The report template binds its NonVAT display to TOTAL_NON_TAXABLE from report
data; its full historical classification algorithm is not claimed reverse-engineered.

## Verification

- Fresh actual Worker `readInvoiceModel` succeeds for all three final cases.
  It performs zero native print calls for them. The two adjustment cases retain
  exact native VAT totals; the mixed case retains 11,000 THB NonVAT and its
  independent posted VAT. Effective-calculation hardening leaves all financial
  fields and selected lines unchanged from the independently checked first run.
- Generated PDFs have 1, 1 and 2 pages. Independent extraction confirms Folio,
  debit, credit, gross, before-VAT, VAT, NonVAT and printed-balance values against
  the original current AR PDFs. Every page was rendered with PDFium and visually
  reviewed; no text exceeds page bounds. No claim of identical pixel layout or
  identical zero-net transfer-history rows is made.
- Regression across the earlier six cases: five still-open cases pass fresh
  live reads; one now has an explicit zero AR balance and full applied payment.
  Its stale positive selection correctly rejects. Its prior qualified reference
  and tests remain valid evidence for the repaired source shape; it was not
  forced back into collection or counted as a new generated PDF.
- Captured 87-case differential against the deployed printed-balance release:
  43 models compute identically, 44 retain identical previous missing-control
  refusals. No new financial/model delta; not a fresh 87-invoice generation claim.
- Full suite: 2,535 tests / 231 files, TypeScript, production build and diff check
  pass. Independent targeted reviews found no remaining P0–P2; final calculator
  extension review ran 164 tests / seven files. Tests cover unknown codes,
  omitted versus malformed taxes, signed cancellation, missing/extra calculator
  charges, tiny amount mismatches, partial VAT bases and changed source/rules.

The original nine source patterns are qualified within these explicit policies.
New source shapes or tax configurations are not universally certified: unsupported
or contradictory evidence still refuses. The earlier actual PDF Workspace UI and
uploaded-original preservation evidence is unchanged; no editor code changed in
this release. No live email, ledger, Sheet dates, sending history, permissions,
subscription or cost changes. Private evidence remains outside Git.

## References

- [Oracle: transaction generates and inheritance](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_admin_financial_transaction_management_tax_generates.htm)
- [Oracle: configuring generates](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_admin_financial_transaction_management_configuring_generates.htm)
