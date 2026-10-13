# Functional system audit — 13 October 2026

The owner authorized whole-system functional testing and repairs, including synthetic email to the recipient supplied in the conversation without business billing/reminder history. This audit covers application behavior and service integration; it does not claim completion of the separate Cloudflare security-audit pipeline.

The final signature instruction is to retain the existing implementation. It already uses the Phuket format/logo, personal staff name/title and the Invoice hotel's workplace. No signature source, saved profile or template was changed.

## Confirmed defects and repairs

| Finding | Repair | Regression evidence |
|---|---|---|
| Dashboard comparison still split same-name/type Khao Accounts when one hotel had multiple ledgers, and could align different Account Types by name | Group Khao by exact normalized name + type, retain all original members in each hotel cell, and offer an explicit ledger chooser. Preserve Phuket behavior | Signed/unknown totals, underlying Account counts, search, zero/negative members, duplicate numbers, exact drill identity, stale-picker closure and desktop/mobile checks |
| Simultaneous Gmail refreshes could make the losing request falsely require reconnection | After a lost revision check, validate and reuse only the newer stored credential for the same owner/mailbox/scope/refresh identity; verify its live Gmail profile | Both regional races pass. Reconnect, wrong mailbox/profile, expired credential and changed scope/revision stay rejected. No losing token returned or additional credential write |
| Remittance filters showed indistinguishable same-hotel Account names; duplicate numbers also remained ambiguous in the editor | Display Account No.; add exact Account ID when missing or duplicated. Keep original Hotel + Account option values | Desktop/mobile selection of different numbers, duplicate numbers and missing numbers reaches each exact ledger; source identities remain unchanged |

No schema migration, financial-data correction, original-sheet write, sender change or TSUN activation is part of these repairs.

## Local verification

- Baseline: 1,836 unit tests passed. Final source: **1,852 unit tests passed**. TypeScript and production builds pass; the existing large-chunk warning remains informational.
- Employee-role audit: 115 distinct browser cases passed across scoped runs. Coverage includes regional access/revocation, Aging exact identity, Collections selection and document intent, Register autosave/large lists/uncertain commands, settings dirty-state preservation, PDF review/scan pixels/filenames/Download/Email handoff, Remittance, templates and report links.
- Dashboard: 43 existing CFO cases plus two new desktop/mobile grouped-ledger cases passed. The strengthened new cases select zero, negative and single-member ledgers independently and verify focus/reload behavior.
- Original signature: 45 focused unit cases and six desktop/mobile browser cases passed. No signature change was needed.
- Remittance repair: 95 focused unit checks, the existing nine browser cases and two new desktop/mobile identity cases passed. The longer labels initially clipped the mobile editor; a narrow grid/select width guard fixes the reproduced overflow. New identity cases are enrolled in the maintained smoke configuration together with the new Dashboard cases. Employee coverage including these two new cases is 117 distinct browser cases.
- Astra independently reviewed all three repairs without blocking findings. Implementation used Sol Medium as requested. Synthetic desktop/mobile screenshots were inspected; original visual baselines were not overwritten.

Initial test failures caused by stale static assets and retired authentication fixtures were separated from product findings. Current isolated builds and current-tab employee sessions were used for the qualified reruns. This report does not certify every archived browser test.

## Actual service observations before release

- Google login succeeds. Dashboard, Aging, Collections, Register/Reports, Remittances, Templates, Storage and Settings load on the signed-in application. These checks did not save customer work.
- Six unauthenticated data endpoints reject access with HTTP 401. Employee boundaries and session renewal are separately tested with fictional roles/data; no real employee grant was changed.
- Current Aging publication is complete for all six operational hotels: 175 Phuket Accounts and 238 Khao Lak Accounts, with no unresolved membership in the sampled publication. Register reports zero unverified rows. This is publication coverage, not a new invoice-by-invoice comparison against customer PDFs.
- Fresh OPERA probes return HTTP 200 / `read_verified` for all six hotels. The existing native-Folio history restriction remains: KAT/TLKL/WAKL/TLFO return provider 400 `OPERAWS-FOF00404`; the sampled TSK/TSAN selectors are unavailable. No native printing or OPERA accounting write was requested.
- Both regional Gmail mailboxes are connected with Sent-reading capability. Drive is connected. Both original tracker integrations are enabled, available, recently checked and have zero queued writes at observation.
- Tracker differences remain for review: Phuket 6,880 pending field differences (6,878 references, one identity, one other); Khao Lak 1,682 (1,592 references, 72 identity, 14 date, four other). These are not queued writes or proof that sync failed. Reference terms/due dates do not overwrite website rules. The sampled Khao date reasons are concurrent/unmapped edits and invalid source fields. Values were not guessed or overwritten. Preserved differences may include rows no longer present in the sheet.
- Operations queue document failures/partial results sampled here date from September; pending reviewed preparations predate the current audit. No newly failed document generation was established from those historical receipts. Draft/uncertain records were retained.
- Stored working files, transfers and application database allowance remain below their configured limits. No paid setting or cleanup policy was changed.
- Actual synthetic Statement font proof downloads successfully (one page, 8,271 bytes); rendered Thai/English text was visually inspected using the PDF skill. This is a renderer proof, not a timed customer multi-Invoice package.

Single authenticated network samples: Dashboard 511–681 ms, Collections 379–397 ms, Register 287–293 ms and Aging membership 1.54–2.13 seconds. These are observations, not percentiles or a before/after speedup claim. Avoidable Gmail refresh failure is fixed; no speculative database/index change was made without new evidence.

## Release and synthetic email verification

Local repairs are implemented and tested. Deployment, exact-source health, signed-in verification and actual synthetic email results are recorded below once completed. Test commands use private stable IDs and technical receipts to prevent duplicate sends; they never count as actual customer billing/reminder activity. The recipient is not retained in this repository.
