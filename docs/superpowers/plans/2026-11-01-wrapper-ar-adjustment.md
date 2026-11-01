# Posted wrapper with a later same-account AR adjustment

> Execute inline using superpowers:executing-plans; obtain a fresh code review before release.

**Goal:** Support a complete invoice containing independently posted package VAT and a later negative same-account AR adjustment, preserving all source, amount and tax verification.

**Architecture:** Add one bounded composed source-claims profile. Derive missing selected AR roots from the complete current AR response, verify their original account/invoice/folio/money identity, and corroborate the adjustment's current inclusive rules with paired OPERA calculator responses. Existing posted-wrapper verification remains unchanged and runs only on the independently derived reservation region. The complete original source is fenced before/after; every selected root is covered once. Calculator amounts are projections, never fabricated posted tax identities.

**Stack:** Existing TypeScript AR reader, source-claim verifier, money projection verifier and renderer; no new permanent service, schedule, schema or financial ledger write.

**Spec:** Current AR-only source policy and owner's request to investigate the failing Invoice. OPERA UI read access is separately authorized and its invoice/rebate readback is complete. Original package source and later AR adjustment are independently observed; no native/Guest reader or fallback is authorized.

## Constraints and review focus

- Keep the original selected gross amounts and posted wrapper VAT; do not infer missing source rows or silently skip the later adjustment.
- New profile is bounded to negative manual Lodging/RM adjustments posted after the invoice date, same current Account/Hotel/Invoice/Folio, no transfer/deferred/descendant/reference ambiguities.
- Verify paired parent/leaf metadata and both calculator reads against the original signed gross using the existing calculation verifier. No tax-formula replacement or historical-rule claim.
- Derive region ownership from independently verified raw roots; evidence has no caller-controlled exclusion IDs. Reject aliases in both directions, missing/extra/duplicate roots, wrong Hotel/Account, unsupported metadata and changing source.
- Existing wrapper-only, AR-only, POS, transferred, zero-VAT and uncertain mail/file guards remain unchanged. No real mail, Sheet dates or OPERA ledger changes.
- No raw customer JSON/PDF, credentials or one-off diagnostic tokens in Git, public assets or tracked logs. Private source captures are temporary and must be removed after verification.

## Tasks

- [x] Read-only exact failure inventory and private AR source capture; deterministic replay reproduces the original error.
- [x] Isolate failure: selected current AR adjustment is not a reservation posting; the wrapper-only ownership gate requires it there. Read its explicit inclusive current metadata/calculator without generating or printing a document.
- [x] Write synthetic reader/verifier regressions for a wrapper plus current AR rebate, including adversarial identity/amount/ownership cases; observe RED.
- [x] Add a narrow composed proof/read strategy and integrate it before the existing wrapper-only branch. Keep existing proofs and formulas intact.
- [x] Replay exact private source and verify a fresh paired live read; inspect OPERA UI if accessible and compare renderer totals/rows.
- [ ] Run focused/full units, typecheck/build and existing source policy tests; independent review and required GitHub qualification before release.
- [ ] Deploy qualified source, verify the repaired case without editing employee work or sending mail, update status and remove owned temporary captures/tokens.

## Ledger

- Base d828523684958dea1767a11e5c63bcc15a1f424c, isolated existing worktree; branch codex/wrapper-ar-adjustment-20261101. Existing unrelated dirty documents are preserved.
- Production remains on the base commit. Scoped authenticated remote previews inherited existing backend bindings through Wrangler's remote-development API; local proxy adapter avoided a Windows runtime crash. No credential values were extracted, no production settings changed, and the preview sessions were torn down after each bounded read.
- The private replay command reproduces the precise original failure. Captures, command paths and real identifiers remain outside Git.

Checkpoint:89 focused tests/typecheck pass; recorded private source is now admitted with unchanged selected gross/current balance. Actual OPERA UI confirms the mixed rebate case. UI control then stopped automatically on browser-URL policy verification; no further UI action attempted. Fresh paired live read, review/full/GitHub/release are still pending.

Local release qualification:5,032 units/9 existing skips,typecheck/build pass. Independent re-review READY,289 tests (42 new +247 existing). Both review findings were independently reproduced RED and fixed. Source captures pass a fresh paired48-call AR-only read, no Guest/native calls, and2 calculator calls only for the selected AR rebate. Real-model PDF is1 page with all10 source rows and validated monetary text. No native PDF/footer comparison is claimed; OPERA UI confirms rows/current balance.92 frontend outputs match the qualified base exactly. Await GitHub before any production change.
