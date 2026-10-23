# AR-only migration — development checkpoint

Owner-selected workflow: GPT-6 Astra / High plans and independently reviews;
GPT-6.1 Sol / Medium implements bounded tasks. Existing verified work is retained,
not rewritten solely because model roles changed.

## Production

Unchanged: source `6fdf0ae9a91f1f269bf0b51c5dbd0d071b98f380`. Production still has
the legacy Folio-dependent paths. The owner-approved removal is **not deployed**.
The archived split-footer prototype is not part of this migration.

## Stage one — implemented locally

- A separate AR-only reader exposes an explicit capability allowlist. It does not
  expose `folioReport` or `folioTypeName`, rejects native PDF control fields, and
  has no Guest-report fallback.
- Posted VAT7 and the already-qualified full-VAT current-adjustment profile use
  distinct proof kinds. Unsupported tax structures remain named development gaps.
- Only verified unique selected-posting order is normalized. All row fields,
  source, pagination, amount and identity checks remain; legacy proof behavior
  is unchanged.
- Regression: 234 files / 2,604 tests and typecheck pass.
- Recorded-source replay: **1,138 monetary matches, 264 unqualified**, zero
  forbidden report calls and zero mismatches among admitted models. These are
  development results, not release readiness or a reduction in the full scope.

The remaining development groups include direct POS VAT, direct NonVAT, embedded
service/tax arrangements, posted AR generate graphs and transfers. Raw calculator
success is not accepted as proof: the earlier bare calculation had four wrong
results even though it returned a model.

## Next

The posted-generate graph stage is implemented locally by Sol: 236 files /
2,656 tests, typecheck and build pass. Replay now admits 1,139 exact monetary
matches with 263 unqualified, zero mismatches and zero forbidden report calls.
The newly admitted case preserves source line content and tax identity.
Astra independent review passed with no actionable P0-P2 findings; all 139
focused tests also passed in the independent rerun. Paired current POS metadata capture covers
187 hotel/code pairs without errors or changes; historical membership remains
a separate proof requirement for the next task. Production
cutover remains held until the replacement is qualified against the full scope;
mass refusal is not an acceptable substitute for the requested automatic behavior.

Private replay and source-category evidence stays under ignored
`.tmp/invoice-parity-20261022/`. No customer files, credentials or raw records are
included here. No emails, ledger changes, Sheet date changes or new paid/access
configuration occurred in this stage.

## Direct POS stage — implemented locally, independently reviewed

Task 2B now passes 2,699 full regression tests and 182 independently rerun focused
tests, typecheck and build. Initial duplicate-identity and incomplete-check-closure
findings were reproduced, repaired and re-reviewed. Final replay admits 1,185 of
1,402 cases with no money mismatches or Guest calls; all prior admitted cases are
preserved. The other 217 remain development gaps, including 19 absent metadata
captures that must not be described as actual API failures.

This replay supplements recorded Invoice source with stable current POS role
metadata. Fresh complete provider intervals and the remaining proof profiles are
still needed before cutover. Production remains unchanged.

## Explicit NonVAT stage — locally qualified

Task 2C passed 2,779 full regression tests, 289 focused tests, typecheck/build,
and independent review. Nested/deferred/package/reference-linked postings remain
unsupported by this direct profile. Final full replay: 1,202 exact AR matches,
200 unqualified, zero monetary mismatches or forbidden report calls.

Seventeen fresh provider-backed models match all seven native AR fields and pass
the final verifier with unchanged lines/tax identity. Two additional cohort cases
produced no model; one initially unstable pagination read succeeded on retry.
No production cutover occurred. Complete findings and next proof boundaries are
in `AR_ONLY_REMAINING_AUDIT_20261023.md`.

## Net-base wrapper stage — locally qualified

Task 2D1 passed 2,839 regression tests, independent review, typecheck/build and
full replay: 1,212 matched / 190 unqualified. All 1,202 prior matches are retained.
Ten fresh packets and their ten generated PDFs agree with native AR in all 70
footer values; VAT details are checked independently, not only gross. Separate
pre-existing visible text/reference differences in five PDFs remain open.
See `AR_ONLY_NET_VAT_VALIDATION_20261023.md`. Production remains unchanged.

## POS follow-up checkpoint

2E1 is independently reviewed with 28 fresh cases and 28 generated PDFs matching
all 196 monetary reference fields. Recorded corpus: 1,240 / 1,402. Canonical AR
reference replaces remark fallback; description semantics still need evidence.
2E2 mapped-fee implementation/review/tests pass and initial replay is 1,271 / 1,402
with all prior matches retained; fresh qualification is outstanding. Production
remains unchanged. See PROJECT_STATUS for the fresh UI reference attempt, which
produced a completed batch but no successfully retrieved new PDF and is not a
new-reference parity pass.
