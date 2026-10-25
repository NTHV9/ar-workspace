# Permanent AR-only invoice generation cutover

The owner-authorized Goal includes switching the application after qualification. Parent has approved implementation now; deployment remains gated on final body qualification, complete recorded retention, tests and operational checks. Main Sol implements; Astra reviews.

## New generation route

`workspaceInvoice` must call `readArOnlyInvoiceModel` exclusively. Remove the legacy reader import and native-print callback from this route. A source, rule, ownership, metadata, template or renderer failure must propagate through the existing document error path; it must never call Guest `folioReports`, `getNativeInvoicePdf`, a native-tax-control reader or a legacy financial reader as a fallback. Do not introduce a feature flag that silently restores that route.

All new invoice preparations reach this generator through the existing source/template snapshot. Preview, download, exports and mail attachments continue using their existing prepared/reviewed bytes; they must not independently regenerate from another source. Statement generation remains unchanged.

## Historical jobs and retention

New command creation already defaults to workspace source. Keep the current database source/template immutability and same-command idempotency. Do not rewrite any old job's source, manifest, template version, review, exports or file hashes, and do not add a database migration merely for this code cutover.

For a pending invoice whose immutable `invoice_source` is `native` or missing, retain the normal atomic claim and return an explicit `document_invoice_source_retired` unavailable result before constructing or calling an OPERA invoice provider. Unknown source values remain invalid. Do not silently reinterpret the historical source as workspace, pick a replacement template, create another job or fetch a Guest report. The existing human new-preparation path may create a new command from a still-valid selection under its existing eligibility/ownership rules.

Already-ready files are not generation candidates. Existing reviewed exports, Gmail drafts, uncertain outcomes, running-source fences and historical artifacts keep their original bytes and identifiers. No automatic regeneration, deletion, source migration or replay of uncertain native printing. Preserve the existing claim, no-automatic-retry, peer-drain, reconciliation, storage write, retention and review handoff semantics. Removing the native-print callback must not reinterpret an existing uncertain/generating file as safely repeatable or create a new retry path.

## Obsolete workflow diagnostics

Retire these legacy invoice/report diagnostic payloads at an early explicit policy boundary, before provider or acceptance-environment effects: `pdfProbe`, `invoiceContractJob`, `invoiceGuestProbe`, `invoiceModelProbe`, `invoiceRenderProbe`, `invoiceTaxRulesProbe`, `invoiceLedgerProbe`, `invoiceReadAudit`, and `folioTypeProbe`. Remove their now-unreachable workflow blocks/imports. They are obsolete operational entry points, not preserved invoice artifacts.

Keep ordinary account/aging HTTP diagnostics, financial refresh/history, statement, document, mail reconciliation and maintenance paths unchanged. The HTTP OPERA probe does not supply `savePdf`; its metadata-only behavior may remain. The legacy report branch in `probeOpera` is reachable only with that callback, so retiring workflow `pdfProbe` removes the runtime printing caller without gratuitous changes to safe HTTP output. Verify this through actual callers and tests rather than a text-search count alone.

Historical helper code/tests may remain for bounded regression evidence if unreachable from deployed generation and diagnostic routes. The deployed graph must have no active Guest/folio report generation caller, including default/undefined historical source handling.

## Required verification

- Generator tests exercise the real wrapper and prove the AR-only reader is selected and failures propagate with zero legacy calls.
- Job tests cover workspace success/failure, native and missing-source retirement, invalid source, immutable source/version, preserved ready/reviewed/draft/uncertain artifacts, atomic claims and no new printing callback/retry. Pending legacy refusal must have zero invoice-provider/renderer/storage effects.
- Workflow policy tests cover every retired flag, including combined payloads, before provider effects; ordinary workflow and safe HTTP probe controls remain valid.
- Trace preparation, stored-file preview/download and attachment/export paths to show one new-generation route and immutable reviewed-byte reuse. Keep current authorization, hotel/account scope and idempotency tests.
- Run appropriate focused tests, typecheck/build and the final combined suite once concurrent edits are stable. Recheck the complete retained invoice set and actual seven-field/native-body acceptance with explicitly accepted semantic wording differences; never alter native baselines to pass.

Before deployment, parent inspects actual in-flight document/workflow state read-only. Do not assume a deployment replaces already-running legacy callbacks. If a native print may already be dispatched, preserve its uncertain/history boundary and resolve the operational cutover without cancelling or replaying it implicitly. Pending snapshots need no data migration. Existing stored artifacts remain available under unchanged ownership/retention rules.

Report implemented, tested, deployed and enabled separately. This plan authorizes code preparation and tests, not premature deployment or any email/accounting/Sheet/history/resource mutation.

## Final owner acceptance clarification

On 24 October the owner confirmed that amounts and item wording/meaning are the acceptance requirements; exact line grouping and layout are not required. The explicitly accepted accommodation wording pair and the identified API payment label without unavailable masked-card detail remain documented semantic exceptions. A verified line-wrap difference is layout-only. Do not add further layout/grouping work after these criteria pass. Financial identity, ownership, all seven monetary fields and no-Guest-source requirements remain unchanged.
