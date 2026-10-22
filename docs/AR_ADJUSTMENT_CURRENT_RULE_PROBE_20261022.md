# Current-rule AR adjustment probe — not enabled

The owner asked to continue investigating without requiring Oracle contact and
clarified printed Invoice versus Statement amounts. The printed-balance repair
is separately deployed. This note records a possible tax-source policy change,
not an enabled runtime fallback or completion of the remaining source cases.

## New evidence

- Downloaded an exact current WAKL AR report as XML through the ordinary OPERA UI.
  After the owner completed the browser download confirmation, the final XML
  parsed completely and matched the selected Invoice and its independent PDF.
  It contains exact account and AR transaction parameters as well as Folio/window
  identity, charge gross, taxable net, VAT, Non-VAT and printed balance.
- The report's seven displayed rows include a zero-net pair of City Ledger
  transfer lines. Its selected AR posting source has five charge/adjustment rows.
  These are distinct representations; the extra pair must not become taxable
  revenue or a duplicate receivable.
- The runtime report parameters bind exact account/Invoice/AR-transaction
  identity. The public MED Folio Report contract does not expose those same
  explicit selectors. A scoped stored-folio probe using the XML's observed
  internal window returned no file or download URL; no selector was accepted.
- Direct AR adjustment details report Window 1 while the historical Invoice
  postings use Window 2. A bounded NetVat read of the observed adjustment window
  and exact posting day returned zero rows for both affected adjustments. This
  disproves that changing the window alone fixes the missing tax evidence.
- Fresh parent-code configuration and OPERA charge simulations for both
  adjustments were read, with identical before/after definitions. Both parent
  codes explicitly specify inclusive tax and non-taxable=false. One generates
  VAT; the other generates service and VAT on net plus service.
- Actual posted VAT from the selected original ledger rows plus the corresponding
  current OPERA adjustment simulation, rounded once per invoice, matches both
  independently printed native VAT totals. The WAKL rebate simulation's unrounded
  base amount also equals the XML's DIRECT_NET_AMOUNT at full returned precision.

These matches establish a tested current-rule candidate for these examples.
They do not prove that current rules always equal rules at historical posting
time. No simulated tax was relabelled as directly retrieved historical VAT.

## Pending source-policy choice

Asked the owner whether to permit calculation from current OPERA code rules only
when full Invoice coverage establishes inclusive VAT 7% throughout and no
Non-VAT component, or continue requiring original recorded tax totals exclusively.
Dependent runtime implementation is pending that answer. No financial gate was
relaxed, and the mixed Non-VAT case is not covered by this proposed fallback.

Private XML/RTF/JSON/PDF evidence remains outside Git. The task's XML analysis
copy removes authentication/runtime/destination parameters while retaining the
explicit nonsecret identity/source fields; the owner's original download is
unchanged. No ledger, Sheet date, sending history, permission, subscription or
cost was changed. Native report creation affects only the authorized printing
metadata.
