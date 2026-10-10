# TSUN pre-opening

Owner confirmed TSUN is preparing to open. OPERA property configuration was read on 10 October 2026 through an administrator-only diagnostic using existing credentials. Verified property code `TSUN`, name **The Sun Club Khaolak by Katathani**, and currency **THB**. OPERA Business Date was `2026-11-01`; this is not an approved opening/activation date. Aging basis returned `ART`.

The first AR Account page was empty without explicit total/continuation metadata. This is not evidence of a verified zero ledger. No Account/Invoice financial records, recipients, or templates were imported.

## Current release

- Show TSUN as a disabled **Pre-opening** hotel in the Khao Lak header, with its full name accessible by label/title.
- Keep six operational hotels and four operational Khao Lak hotels. All current/historical report scopes, schedules, settings, mailbox routing and financial values remain unchanged.
- No automatic activation, date-based activation, or zero-value TSUN financial columns.
- The temporary fixed-property read-only diagnostic is removed by the normal release. No email sent or OPERA accounting changes made.

## Activation work retained, not enabled

Private preparation is retained under `.tmp/tsun-hotel/`: `activation-frontend.patch`, the proposed migration 113 and backend activation materials. These are future candidates, not production migrations or proof of live operation. Revalidate them against the current code/catalog before reuse.

Activation requires verified complete AR discovery/publication, a decision on reporting coverage before the first TSUN snapshot, TSUN-specific document assets, and Account Type defaults. Use the existing Khao Lak sender, retain explicit Account overrides, and do not infer Account recipients or hotel banking/tax details from another hotel. The candidate must append TSUN after the existing six IDs to retain advisory lock ordinals. Activate frontend, database and runtime hotel scopes together after checks pass.
