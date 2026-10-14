# Live PDF → Gmail Draft → web send verification

Completed 13 October 2026. Application source `21b0e7dc1804ed39a4bcc9db698fcbd3366f8bfb`; final Worker `3c29eb75-bb1e-4e9c-bbe4-308d361499d9`, acceptance disabled. The owner's existing customer Draft was not sent by this test.

## Actual flow

The owner-bound isolated workspace used one synthetic Account and three synthetic Invoices. The current app source adapter supplied fictional OPERA responses; actual Cloudflare workflows, Supabase private storage and Gmail were used. Two invoices were selected through the UI and a Statement plus two Invoice PDFs were generated. Their normal monetary and identity checks remained enabled.

In the actual PDF Workspace, the operator edited Statement text, renamed the combined output and imported a newly generated one-page image-only PDF. The final output has four pages. The scan was visibly nonblank, and the final edited Statement was rendered and inspected. The package was downloaded through the normal reviewed-file path, then handed to Email preparation.

The downloaded reviewed file and stored export were identical: 670,765 bytes, SHA-256 `3b0274e558f21b739b2b5eb3d7b263249ee6cfd08c4e60fdba3e0c00dabc8d60`. The one-time recipient was entered only into the isolated draft, with no CC/BCC or Account default contact. A real Gmail Draft was created. The primary Review & send now button remained available while Create Gmail draft was disabled. After reviewing the confirmation screen, one explicit send consumed that same Draft through `drafts.send`.

Gmail Sent evidence was verified at **17:34:44 ICT**. Verification included recipients, message and attachment bytes. The persisted expected attachment hash matches the downloaded reviewed file. One isolated delivery exists, in Draft mode with a one-time send claim and verified Sent; no replacement message/delivery was created by the app. The recipient inbox was not independently inspected.

## Isolation and cleanup

- Original business tables contained zero Accounts, Sent events and tracker outbox rows for the synthetic Account before cleanup.
- Five test Storage objects were confined to the exact registered document job; all five were removed through scoped retention with zero deletion errors/uncertainties.
- The synthetic source was changed to zero and its refresh completed normally. No OPERA ledger write occurred.
- The exact verified-empty owned Drive folder and test bucket were removed through the existing closeout path. Both isolated schemas were retired; final readback confirms zero test buckets/objects, zero active/prepared scenarios, and still zero real Sent events/tracker writes for the fixture.
- The scenario allowance was settled by the guarded retirement procedure. No paid service or capacity increase occurred. Acceptance was disabled again and health reports database verified / OPERA connected.
- Only minimal sealed technical Sent receipts remain for duplicate/recovery reconciliation; no synthetic billing history remains in the business tables. The authorized recipient's received email and local PDF evidence were not deleted.

## Compatibility issues found while testing

The retired acceptance scaffolding needed requalification: its 100 MiB database precondition was obsolete relative to the already configured 1 GiB allowance; Invoice template headers and the current synthetic posting reader were missing. The existing scenario reservation and 20% safety margin remain. The live test also required one synthetic operator row in the isolated membership table so trusted staff-header checks could pass; no real staff membership/signature was modified.

Closeout still demanded a historical Drive archive receipt even when all work was transient and no archive was used. Migration `20261013120000` limits that requirement to scenarios with legacy/archive work. A rollback test on the exact isolated state verified that an outstanding retention item still blocks closure, while the completed transient-only state can close. The immutable deleted-item guard also correctly refused an attempted rollback-test state reversal; the test instead used a fresh rollback-only waiting item. Actual provider folder ownership, identity and emptiness checks are unchanged. Independent review found no blocker.

## Draft-send feature verification

The feature preserves the existing delivery, uses a durable single dispatch claim, verifies the current Gmail draft against reviewed content, and supplies the reviewed MIME with the existing Draft ID. It does not retry an uncertain send or recreate a missing Draft. Sent verification uses the new provider message ID. Current region, signature, hold/reopen, workflow revision, collection policy and complete-recipient/message checks remain.

Focused Worker/evidence tests, local SQL replay/receipt/history tests and the current-component browser test passed. An independent review found missing empty-To/subject/body parity, which was corrected and regression-tested before deployment. Full unit verification passed 1,897 cases before those three additional cases; those additions and TypeScript passed separately. A final 22-case focused run passed. The SQL replay test is sequential; the two-request Worker concurrency test mocks the atomic database claim. Actual-provider evidence above establishes one normal full-flow Draft send, not every provider failure mode.
