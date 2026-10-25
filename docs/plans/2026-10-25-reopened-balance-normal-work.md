# Verified reopened balances follow normal collection work

Owner approved removing the automatic Needs review barrier solely caused by a
verified zero-to-nonzero OPERA observation. Apply a system rule, not an Invoice
number override. Preserve current source verification, explicit holds, other
review causes, actual billing/reminder dates, Sent facts and all money.

- RED SQL transitions: verified0→positive creates observation history but no
  automatic review; repeated observations do not duplicate history; missing or
  unknown observations are not verified zero; explicit hold/custom review survive.
- Add an internal audited release of legacy automatic reopened flags, used for
  the scoped migration and subsequent verified nonzero refreshes. Keep the durable
  verified balance ledger and source_reopened transition history.
- Update the old exception fixture for the new policy without removing its hold,
  source, actor, command-replay or actual-Sent protections. Add the focused policy
  regression to normal SQL CI coverage and verify collection/handoff contracts.
- Qualify locally and in the current GitHub workflow before live promotion;
  verify Invoice19127's current balance, dates and history remain intact and it
  follows the normal queue. No email, OPERA ledger write or Sheet write.

Progress: actual source and trigger inspected; one existing automatic flag found.
