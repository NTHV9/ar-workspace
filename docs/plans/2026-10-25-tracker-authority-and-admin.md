# Tracker credit, identity and admin visibility

Owner approved all four policies and deployment after testing on 25 October 2026.

## Contract
- Empty S takes the current effective Account credit rule; valid nonempty employee S overrides this invoice only. Clearing S removes the override and restores the Account rule. Only S may be filled; never R/U/V/W or T.
- T remains independently calculated in the workbook; exclude it from synchronization and differences, including historical pending differences.
- A mismatching Account may be reconciled only from a unique verified same-hotel Invoice + Folio + posting-date tuple. Multiple provider rows/candidates, partial evidence and unverified source remain held. Preserve mail evidence and old-account history; no copying recipients or sending mail.
- Retire pending warnings only for current exact source-confirmed zero invoices, and obsolete identity warnings after a safe current match. Missing/failed API responses never establish zero. Keep audit history.
- Non-admin status response and UI show last successful synchronization only. Restrict detail and mutation routes at the backend, including conflict pagination and Picker. Existing region authorization remains mandatory.

## Execution
1. Add behavior tests first: credit blank/fill/edit/clear, settings propagation, account move and ambiguity, warning retirement, limited member status and no detail/mutation access.
2. Add SQL authority/provenance and narrowly scoped credit-fill journal; extend providers to allow validated numeric S changes alongside unchanged date-only behavior. Freeze intent before native mutation; uncertain writes use readback without blind retries. Fresh-check blank cells and identity; retain XLSX CAS.
3. Add conservative transfer matching to SQL snapshot and frontend/domain matcher, retire stale confirmed-zero/due warnings with audit state, and preserve date authority.
4. Add backend status projection and administrator guards and matching UI; test member render and actual routes.
5. Run full unit/type/build and all disposable tracker SQL fixtures; run relevant real-browser scenarios and review the complete diff. Apply migration, deploy combined latest code, verify health/version and read-only live outcomes. No real email or intentional date changes.

## Review focus
- A concurrent Sheet edit/clear cannot be overwritten by credit filling or requeued old date commands.
- Credit auto-fill echoes must not become invoice overrides; explicit overrides survive Account settings changes.
- Reassigned Account must never be inferred from Invoice number alone or merge old Sent history.
- Historical/missing rows are not automatically financial zero.
- Hiding UI without removing backend data access is insufficient.

## Progress
- Planning, implementation, qualification, deployment and final readback: complete.
- Final release bca1209 / Worker 19ec17ec-a9c3-439b-ac9c-7b6724675624; 55 live
  asset hashes match. All 725 initial S fills are written, no credit/date intent
  remains pending or uncertain, and 2,016 source-date rows plus 143 Sent records
  retain their before/after fingerprints. Tests: 4,623 unit cases, 40 browser
  cases, 131 migration replay and 21 rollback fixtures; fresh review clean.
- Fresh reviews found and fixed echo continuity, source candidate ambiguity,
  current identity retirement, Preview parity, uncertain post-upload readback and
  native fresh-read tuple races; all have behavior regression coverage.
- Ruling: nonempty employee S equal to the Account default remains an explicit
  override unless uninterrupted actual fill provenance proves an echo.
- Ruling: closed warnings require durable exact verified-zero evidence and current
  verified/cleared source state. Current rows need validated identity; archived
  rows must not contradict an identity warning. Historical zero proof does not
  expire after 15 minutes. Missing source or unknown cached zero remains held.
- Ruling: partial Folio competitors count whether their nonzero balance is
  verified or unverified; the chosen target must still confirm supplied Folio.
- SQL and provider/access work used separate scoped implementers and fresh final
  review; the parent integrated and verified the whole change before deployment.
