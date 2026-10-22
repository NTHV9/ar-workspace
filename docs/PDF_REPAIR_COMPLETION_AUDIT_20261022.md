# PDF/Invoice repair goal — completion audit

The goal is **not complete**. Production source is
`32f42163aa667340d456e0857f9256bdf5a50ddd`, Worker
`486b2e70-e49a-4266-8063-02878efe4446`. Six of the original nine source cases have
qualified shared repairs; three still lack an automatically usable exact source.

| Requirement | Evidence inspected | Assessment |
|---|---|---|
| Resolve all nine remaining source cases automatically, without per-invoice overrides | Posted-generate, transfer, embedded/native reports and current source modules | **Incomplete: 6/9 resolved.** Three refuse rather than use ambiguous or missing evidence. |
| Prefer actual OPERA tax amounts | Posted VAT graphs and native full-footer qualification; fresh current AR prints | Implemented for qualified shapes. Direct Data API is unavailable. Remaining exact automatic source is missing. |
| Preserve the earlier 87-case repair | Captured packet differential: 87 identical outcomes; existing actual 87 PDF/render evidence | Preserved in the checked model differential. 43 packets compute in both; 44 retain their previous missing-control refusal. Not a fresh 87-invoice generation claim. |
| Exercise real PDF Workspace workflows with actual private bills | `PDF_WORKSPACE_TEXT_AND_ROWS_20261022.md` and ignored UI exports | Real React/PDF UI passed text/amount, add/delete/Undo/Redo, account switching, Preview/download, multiline Voucher and all-account email transition. Provider calls were isolated; no live Gmail delivery claim. |
| Keep external uploads unchanged by default | `PDF_CURRENT_CORPUS_AUDIT_20261021.md` | Three actual uploads/eight pages, all delivery modes, 24 external-page pixel comparisons passed. No new automatic rewrite behavior. |
| No accounting, billing/Sheet dates, sending-history, access or cost changes | Runtime diff, scoped diagnostic/UI actions and deployment binding comparison | No such changes in this goal's repairs. Authorized native print metadata is the documented exception. |
| Preserve private source/credentials | Clean qualified Git state and ignored diagnostic artifacts | No customer PDFs/JSON or test recipient committed. Ephemeral remote session stopped and its nonce/session files removed. |
| Qualified deployment and honest reporting | 2,442 tests/227 files, typecheck/build, scoped independent review, production health/database and six anonymous boundaries | Deployed/enabled; all 42 bindings unchanged except COMMIT_SHA. Three unresolved cases remain explicitly documented. |

## Remaining evidence gap

One remaining invoice has fully covered Revenue/Payment rows but taxless direct
charges whose historical exemption is absent from available Property responses.
Current code flags contradict its current AR Non-VAT reference, so they cannot
replace that evidence. Two other invoices contain AR-only adjustments without
posted tax breakdowns. All three share Folio selectors with other AR invoices.

Independent current AR PDFs are now available for all three, but they were
obtained through the authenticated OPERA UI. They are reference evidence, not a
production per-invoice override or automatic backend integration. The final WAKL
reference confirms that printed outstanding can retain the invoice charge total
despite an applied payment; the API's current balance must remain authoritative.

The inspected Property schema does not establish an exact reusable current-AR
report selector. Stored-folio probes for two scoped histories returned no file;
another stopped at a payment-transaction identity mismatch. The UI report uses
its session viewer, which is not proven callable through the app's Property API
credentials. No user session was transferred into the app.

Completion needs a documented, callable exact AR source or historical posted
tax/exemption fields for these cases. Purchasing or enabling another plan, copying
browser credentials, manually injecting each invoice's totals, or removing the
identity check would not satisfy the authorized goal.
