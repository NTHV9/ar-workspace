# TSUN coordinated onboarding

Owner authorization: 3 November 2026, proceed with all three audited parts:
Aging Master, the existing Khao Lak Google Sheet, and the AR web application.
The prior readiness audit is the agreed scope; no new product redesign.

## Intent and constraints

TSUN becomes an operational Khao Lak hotel with independent hotel/account keys.
SUN and TSUN Detailed Aging filename aliases normalize to canonical TSUN before
duplicate detection. Both files in a run are one duplicate hotel, never two inputs.
Retain the existing LFS property separately. Require the newly complete regional
input set so missing hotel input cannot silently remove a live property.

Only A/R Ledger is imported. Accruals remain excluded from rows, invoice counts,
balances and aging buckets. The supplied actual report independently verifies
three numbered AR rows and the existing section exclusion. Admit strict DD-MM-YY
and DD/MM/YY business/print dates, retaining invalid-date and source checks.

Keep the original regional Google Sheet identity/link and staff tracking. Changes
must preserve all existing hotel rows, formulas, dates and manual settings. First
TSUN rows must be introduced by a qualified coordinated publisher, with fresh
source identity/version checks and readback; no blind row append or cross-hotel
alias fallback. Existing regional read/write and confirmed-Sent rules continue.
No real email send, fabricated billing date or OPERA ledger posting for testing.

The owner additionally requires explicit comparison of bank account details,
hotel logo and bottom address for all seven properties against supplied RTFs and
production assets. TSUN receives its own private assets. Any actual incumbent
mismatch is reported and source-qualified before correction. No asset/customer
JSON/PDF or credentials enter Git/public bundles.

## Chosen approach

Extend current shared registries/adapters and publish one coordinated release.
Keep the existing Khao Lak workbook; a separate Sheet would split staff workflows
and duplicate settings. A Sheet-only change is rejected because the old publisher
rebuilds from its known input set and can omit TSUN on its next publication.
Preserve the existing application stack, access model, THB-only accounting and
transient preparation/send/cleanup behavior. No new paid service or schedule.

## Delivery and validation

Use existing isolated linked worktrees. The web starts from qualified4a081f4;
only unrelated documentation is dirty. Aging Master has pre-existing production
source changes and untracked helpers; preserve them and record a before-change
manifest so task edits can be reviewed independently. Do not stage those unrelated
changes silently or replace a newer production helper with an older Git version.

Run baseline tests, observe focused regressions RED, implement narrowly, then run
full tests. Qualify actual TSUN input privately and all existing property contracts.
Check synthetic Invoice/Statement PDF visuals and template financial/static fields.
Run web GitHub qualification before database/runtime activation. Build a qualified
Windows publisher executable and deliver it alongside explicit version metadata.
Inspect incumbent-publisher coexistence before the production Sheet bootstrap;
hold publication if an old process or uncertain write makes overwrite unsafe.
Use exact authorized source/target identities and preserve before/after business
fingerprints. Separate implemented/tested/deployed/enabled state in the ledger.

Technical rulings are the implementer's: canonical Sheet property label TSUN;
regional hotel scope remains Khao Lak; existing metadata-only role/credential
bindings are reused subject to exact provider checks. New code should not require
Preview to send, change prior jobs, or resend historical mail.
