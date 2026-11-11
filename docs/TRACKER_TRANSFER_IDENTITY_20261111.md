# Automatic transferred-invoice Sheet identity - 11 November 2026

After the existing OPERA refresh and tracker snapshot reconcile an invoice to a
different Account, a new private journal freezes the old Sheet identity and
current destination. Admission requires a fresh verified same-hotel source, an
exact invoice/Folio/posting-date tuple, a unique match and the latest recorded
Account transfer. Existing destination Account aliases are reused.

One bounded batch updates B/C/AG and the generated Agent layout. The full row
moves with its staff data and formula semantics. Source/destination subtotals
are rebuilt, including a first destination group or removal of an empty source
subtotal. Shared Excel formulas are expanded before row movement. Filter,
validation and named-filter bounds follow the new ledger size. Whole-ledger
KEY lookups on the live urgent tab follow the new key; historical/log copies
retain their original identities. Unknown layouts, positional dependencies,
anchored drawings, concurrent preimage changes and duplicate identities hold.

The ordinary date writer remains restricted to its existing columns. XLSX
transfers use the original strong Drive v2 ETag conditional upload and exact
readback. Native Sheets uses the existing guarded best-effort policy and one
atomic batch. Before any provider mutation the journal is durable. A lost
response or interrupted attempt remains readback-only, including a check that
grouping is correct. A later transfer of the same logical invoice waits for an earlier uncertain
publication to resolve. No mail boundary is called.

The same release integrates the owner-approved primary/first-AR fallback from
688a726 and fixes its two obsolete strict-address tests. The original AR_Gong KV
binding is tracked so a standard deployment retains that existing connection.
Aging Master source and executable are unchanged.

Validation includes lossless workbook preservation, grouped/new/empty-source
cases, shared formula rebasing, native atomic row operations, live urgent
lookups, CAS refusal/lost response, durable service admission and SQL rollback
coverage of all seven properties. A private read-only real-file dry run verified
all 1,117 current ledger rows, followed by the owner-authorized exact grouping
repair of the identified invoice with conditional upload and full readback.
Final local, CI and deployment receipts are recorded in PROJECT_STATUS.

Real-volume preflight reproduced a statement timeout in transfer admission. An
EXPLAIN showed policy matching executed 31,008 times before discarding rows
without any Account transfer. Materializing the latest reassigned-row scope
reduced the same read-only query to three policy checks and about 9 ms, with
the same two eligible results. No timeout or eligibility guard was relaxed.
