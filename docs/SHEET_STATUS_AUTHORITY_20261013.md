# Sheet-controlled current dates — 13 October 2026

Owner-approved change: verified Sheet R (billing) and U/V/W (Follow-up 1–3) determine current status, including corrections and blanks. Friendly/Final and unmapped reminder stages retain web-send evidence. Actual mail receipts/activity remain immutable; monetary values remain OPERA-owned and terms/requirements remain Account/Account Type settings.

## Reported failures and outcomes

- A reported TSAN document failed because the correctly matched OPERA profile contained four blank postal lines and a country. The resolver previously treated that verified empty address as unavailable. It now accepts an explicitly typed, selected empty address without guessing data. Both real Statement and Invoice sources were regenerated successfully and the rendered Invoice inspected; no customer email was sent.
- A reported test billing had a successful earlier writeback but the latest verified Sheet R was blank. The old confirmed-Sent floor kept the web billed. Fresh source adoption now clears its current billing and billing-required due date. The original delivery remains evidence of what was sent.
- Another reported TLKL row had a Sheet billing date but no Account No. It was held as missing identity. The new fallback requires nonblank Invoice/Folio and a valid exact transaction date, matching one verified candidate in the same hotel. The original blank Sheet Account No. is preserved. Actual Dashboard readback now shows its Sheet billing date and removes it from unbilled.

The exact identities and screenshots are retained privately. Neither source row nor a customer payload is stored in this report.

## Implementation

Migration `20261013130000` introduces a private per-field current-date projection. Row existence distinguishes verified blank from an unobserved/invalid field. Only fresh validated snapshots adopt authority; cached values are not backfilled. Current workflow, due dates, Dashboard and current report projections follow it, while actual-send activity remains separate.

New outbound intents freeze their own dates and authority generation. R preserves the earliest billing date within the current generation; U/V/W coalesce newer actual follow-ups. Initial adoption does not discard a newly captured first send. Superseded unattempted intents cannot be resurrected by historical bootstrap or conflict resolution. Native uncertain writes remain read-only and preserve newer follow-up intents through snapshot-before-reconciliation ordering. An older Phuket uncertain generation remains durable but is excluded from automatic retry; technical uncertainty is not falsely declared resolved.

Missing Account No. handling is consistent in matching, normalization and both provider writers. A nonblank wrong Account No., incomplete corroborating tuple, duplicate match or changed identity stays held. Writers never fill or alter the blank identity cell. Other Sheet fields keep their existing merge rules, including reference-only S/T.

## Verification and release

- Address regressions and models passed; actual selected Statement/Invoice generation returned ready with null errors.
- Full unit run: **1,922 tests / 193 files** passed; TypeScript passed.
- SQL behavioral tests passed against owned loopback clones with repository definitions and inspected production-format definitions. Cases include clear/correct/reimport, current stage fallback, first send before first source observation, earliest billing coalescing, native unknown-result ordering, superseded Phuket uncertainty and publication receipts.
- Independent Astra review found and verified repairs for three ordering/resurrection edge cases before application.
- Production migration preflight was rolled back before final application. An SQL Editor CRLF conversion initially caused the definition-match guard to stop safely; exact LF source comparison then passed. No drift guard was removed to force application.
- Worker **59cda9a0-bcf8-4e96-8ffc-618bf7736270**, source **8486ff7**, deployed. Fresh manual source checks for both Khao Lak and Phuket returned HTTP 200 / checked.
- Actual current Dashboard API and UI verify the reported test invoice is unbilled with null billing/due dates, and the other invoice is billed on **12 October 2026**, with its Account term producing due **11 November 2026**. Both responses are complete/current and original balances are unchanged.

No emails, OPERA accounting writes, sheet layout/formula/File-ID changes or paid resource changes occurred in this repair. Automatic synchronization remains on its existing schedule. Invalid or ambiguous source rows still require review; this does not claim every unrelated Sheet discrepancy is resolved.
