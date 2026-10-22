# AR account-transfer qualification

## Implemented and tested; deployment pending

Two remaining WAKL invoices had moved to a new AR account, but their direct AR
adjustments retained the original account number. A blanket account-equality
check refused them. The repair admits that mismatch only after proving the
entire transfer relationship; it does not infer identity from names or nearby IDs.

Qualification requires an exact transferred-in destination invoice, one source
account found by its actual account number, and exactly two complete closed
source-history rows with equal positive/negative amounts. Hotel, Invoice, Folio,
reservation, window and dates must agree. Every selected posting must also match
the original source invoice, including IDs, code, date, debit/credit and reference
fields. Incomplete, compressed, partial, ambiguous or changed evidence is refused.

After the native tax print, the reader fetches destination account/invoice,
selected postings, original AR details and source evidence again. The model
validates the retained proof against its current packet. Required invoice/Folio
identity and optional scope/tax facts cannot disappear during that interval.
Native tax parity and existing final source fences remain mandatory; a failed
check does not trigger another print. Ordinary invoices do not perform the extra
transfer lookups. Transferred nested generate graphs remain unqualified.

## Evidence

- Fresh qualified reader/model calls pass for both actual cases. Each source
  original has exactly the same selected postings as the destination (five and
  four lines). Current AR PDFs independently downloaded through OPERA match the
  API native VAT/non-VAT controls.
- Both generated PDFs have one page, matching tax/footer values and Folio
  identity, correct selected-line counts and all text within page bounds. Visual
  review passed. Current outstanding remains the AR API balance. In one case,
  the OPERA printed outstanding is the pre-payment invoice amount; copying that
  field would incorrectly increase the web's remaining debt.
- Final clean release: 2,324 tests / 223 files, TypeScript and production build
  pass. Independent review found a freshness omission, which was reproduced and
  repaired with regression tests. The targeted recheck confirms it is resolved
  with no remaining concrete P0–P2 finding. Both complete actual packets replay
  unchanged after that hardening, without printing again.
- The 87 baseline captured packets retain identical old/new model outcomes
  (43 fully computed, 44 retain their previous missing-control refusal). This is
  a differential check, not a fresh regeneration claim for those 87 cases.

This resolves two further original cases after the separate TSK posted-component
repair. Once this release is deployed, six of the original nine remain
unresolved: four ambiguous native selectors and two Non-VAT cases whose
broader classification repair is not yet release-qualified. The independent
Data API access investigation is documented in
`OPERA_DATA_API_FOLLOWUP_20261022.md`; no new plan or permission was enabled.

Private source packets, native/generated PDFs and comparison outputs remain
outside Git. No accounting, Sheet date or actual sending-history mutation.
