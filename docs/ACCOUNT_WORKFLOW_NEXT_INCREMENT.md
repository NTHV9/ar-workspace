# Account configuration and workflow — proposed next increment

Status: Account Settings and historical workflow editing implemented/deployed on 2026-09-09. See ACCOUNT_SETTINGS_VERIFICATION.md. Email Composer/Gmail handoff and queue UI remain subsequent work. This increment does not redefine the earlier native-Statement API Goal.

## First deliverable

Extend Account Detail → Overview with per-Hotel, per-Account billing configuration: Required / Not Required / Not configured, nullable Credit Term, and separate Billing and Collection To/CC/BCC lists. Never infer recipients from OPERA. Keep missing term distinct from zero days. Read and save through the authenticated Worker and Supabase member authorization.

Use the existing new-project ar_account_settings table after inspecting hosted schema and rows. Add revision-based concurrency protection and retain effective configuration history before deriving invoice workflow dates. A stale edit must not overwrite another saved revision. Customer recipient values remain private and never enter fixtures or Git.

## Confirmed treatment of existing invoices

Owner confirmed that historical Credit Term matches the current term and explicitly approved applying both Credit Term and Billing Required/Not Required to existing invoices. Initial configuration therefore covers existing open invoices without assigned terms and subsequent arrivals. Keep the assigned terms per invoice; later default changes do not silently recalculate established dates. Owner subsequently chose the initial workflow defaults **Not billed / No reminders sent**, including existing invoices, with editable historical corrections later. This is an owner-selected initialization default, not proof supplied by OPERA. Do not invent billing/send dates or actual-send events. Required invoices await the actual first billing date; Not Required invoices can use their verified OPERA base date plus assigned term. Recording imported history must not count as activity sent today. Billing Required itself remains unconfigured until set; it is distinct from Not billed.

## Following deliverable

Implement invoice-specific billing facts and Billing / Collection queue according to PRODUCT_SPEC sections9–10 and collection-queue-v2.png. Required Due Date uses first actual billing date; Not Required uses the OPERA base date. Draft/PDF creation never establishes billing. Calendar days, Follow1 on the day after due, actual-send progression, and immediate Urgent after Final follow the owner's confirmed rules. Missing facts remain visible as unavailable or unconfigured.

External billing needs a deliberate entry with date, channel and reference. Do not manufacture such events for real Invoices during tests. Gmail sending and Drive archive remain separate integration work requiring confirmed targets and a one-time private test recipient.

## Verification and delivery

Test authorization, cross-Hotel isolation, null versus zero term, input validation, concurrent saves, no recipient fallback, and immutable established dates. Use synthetic UI fixtures at1440×900 and1280×800. Verify hosted reads and transaction-rollback persistence before any real configuration changes; only owner-entered business values may be saved as real settings. Build/typecheck/tests, public-repository data scan, push to NTHV9/ar-workspace, deploy ar-workspace, and update PROJECT_STATUS with actual results.

No changes to OPERA accounting, legacy resources, paid services, recipient defaults or email delivery are implied by this increment.
