# Account-type defaults and Khao Lak recipient configuration

## Owner decisions

Latest clarification: defaults apply at Account Type level; an existing explicit Account setting wins, including CCR. Across all six hotels, CCR defaults to Not required / 3 days. CON, EMP, NMK and REN default to Not required / 30 days. REN with a billing email uses Required as an explicit Account setting. Type-derived settings retain the previously requested Setup needed indication until individually configured.

DRF is balance-only: retain money, Aging and historical evidence; no new billing or collection work. Queue exclusion does not remove report inventory. Recorded Billed/Final history stays visible while unsent rows show Balance only. New preparation, business email handoff and external billing are rejected from the server-held Account type; existing delivery replay and Sent reconciliation remain available.

## Actual configuration changes

- Applied 30 hotel/type defaults using the existing preview and atomic bulk-settings commands. CCR: six defaults, 34 type-derived Account changes, 16 explicit Accounts protected. Other four types: 24 defaults, 35 type-derived changes, six explicit Accounts protected. Exact before/after fingerprint confirms all 22 pre-existing explicit settings unchanged.
- Read the owner-supplied Khao Lak agent workbook without modifying it. Four-hotel OPERA refresh completed 12:51–12:52 ICT on 9 October; all Account identity/name/number/type fields match the prepared source roster. Account numbers are hotel-scoped. Cross-property matches use verified source identity rather than blindly copying one number to every hotel.
- Workbook has 54 data rows matching 179 hotel-specific Accounts. Imported 53 rows / 176 Accounts through preview and atomic settings commands, preserving Phuket settings, invoice money and business Sent records within the transaction. Exact readback matches all imported recipient, billing-channel, instruction and credit-term fields. Email delimiter formatting was normalized through the existing strict parser; blank recipients remain blank without an OPERA/email fallback.
- The owner subsequently confirms the DEDUCT DEPOSIT row does not require billing. Its remaining three Accounts are now explicitly Not required / 30 days, with no billing channel, the source deposit instruction and source reminder recipients retained. Preview/apply/readback succeeded, completing all 54 workbook rows / 179 hotel-specific Accounts. Missing reminder recipients and non-URL portal instructions remain visible source limitations, not fabricated addresses or links.
- Private workbook extraction, source roster, row-to-hotel matching and readback evidence are kept under ignored `.tmp/khao-account-import/`. No customer recipients or source data are added to Git, and no email is sent by this configuration task.

## DRF verification

Migration 109 SHA-256 `14858277274185c4bf33c3f4bad590f4c249680d5cbd314784f4ee7a5b641a9b` passed synthetic SQL rollback locally with all 110 tables plus function/view definitions and permissions restored. Actual Supabase candidate rollback preserved Account/Invoice financial rows, settings, workflow/history and document/email records. Migration applied: all 12 DRF Accounts and 53 Invoice records retained, zero DRF collection-queue rows, service-only email preflight verified. Financial report inventory remains separate from queue eligibility; management operational cohorts exclude DRF and summary-cache generation advances.

TypeScript and full 189-file / 1,823-test suite pass; final history-label correction passes 49 focused unit tests and three browser cases. Browser review verifies balance/history visibility and absent new billing/collection actions. Astra review fixes for current report preservation, management cohorts, Aging facet validation and recorded Latest sent labels are complete, with no remaining blocking findings in scope. Worker deployment is recorded in PROJECT_STATUS.
