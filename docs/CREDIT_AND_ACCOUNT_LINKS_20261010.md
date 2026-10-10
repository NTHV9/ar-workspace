# Credits and Account settings navigation

The owner requests two read-only entry points: clicking Dashboard Credits to inspect its contents, and clicking Account names in Settings to inspect the exact Hotel/Account.

## Credits

The existing Credits figure counts verified negative invoice inventory, not separate native Account Aging credits. The label and amount now open the existing Account-first comparison, then signed credit items with their original Invoice/Folio identities. The filter is `metric=credit`; negative DRF entries remain financial credits even though DRF has no operational billing work. No synthetic invoice identity or new credit amount is introduced. Billing/reminder action columns do not appear in this credit detail view.

Migration 112 updates the three protected balance readers with this read-only filter and keeps existing scope/actor validation. Unsigned historical captures lack credit coverage and return unavailable, not a trusted empty list. Current and signed historical reads retain verification and child-exclusion rules. Existing Dashboard metrics and amounts are unchanged; cache generation advances.

SQL SHA-256: `a6a10590c5a8769899a9855941015a97b418f6d1b85cc1f0073037c99da944f1`. Local rollback tests cover signed current/history, DRF, positive/zero/child exclusion and unknown coverage, restoring 110 tables plus function/view definitions and permissions. Actual Supabase candidate comparison confirms all six hotels' existing credit summaries equal both Account and item drills, with financial/settings/history fingerprints unchanged. One candidate transaction conflicted with a concurrent update and aborted; the subsequent complete rollback test passed. Exact tested migration applied.

## Account names in Settings

Account-name buttons are distinct from bulk-selection checkboxes and use exact Hotel/Account IDs. The destination opens the Account settings tab in the allowed destination region; no name-based lookup or fabricated Account fallback. Returning restores view-only filters, sorting, hotel/type choices and selection against a freshly loaded catalog. Context is scoped to the user/access session; old previews, revisions, edits and pending commands are not restored.

Unsaved changes retain the existing cancel/discard decision. The new links and Settings tabs are disabled during busy/uncertain bulk saves; existing global sign-out and navigation behavior remains intact. Merely opening or returning does not save Account settings.

## Verification

TypeScript/static builds pass. Credits: 53 focused tests and two browser cases. Settings navigation: 19 focused tests and all 15 bulk-settings browser cases, including duplicate identities across hotels, cross-region administration, staff scope, dirty cancellation/discard, Browser Back and fresh revisions. Desktop/mobile Settings screenshots inspected; original tracked baselines restored. Astra independently reviewed both changes with no blocking findings. Deployment/live verification is recorded in PROJECT_STATUS. No email or accounting action performed.
