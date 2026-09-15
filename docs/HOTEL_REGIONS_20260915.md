# Phuket and Khao Lak rollout — 15 September 2026

Implemented, deployed and enabled: Phuket contains KAT/TSK; Khao Lak contains TLKL/WAKL/TLFO/TSAN. The existing workspace functions and appearance are retained, with regional navigation and separate Hotel + Account identities. Khao Lak account settings start independently; no Phuket rules or recipients were copied.

## Scope and validation

- Regional Dashboard, Portfolio, Account, Collections, Reports, Remittance options and operational readers support the selected region. Aging retains all six ranges, per-hotel comparisons, invoice counts and Net open last. Old URLs and no-region report calls remain Phuket.
- Exact operational hotel IDs stay distinct from regional report selectors. Document, email, invoice, history and retention ownership boundaries remain intact.
- Independent reviews caught and repaired an old-region refresh completion race, clipped desktop navigation, global financial-status interference, and document-job/Gmail-return region restoration. Dirty editor, token rotation and late-response protections have regression coverage.
- A hotel without an initial publication now shows unavailable rather than zero. Partial Portfolio totals are labeled; previously published values remain visible during a later failed refresh.

## Live OPERA and documents

All six property refreshes completed successfully. Current Dashboard invoice counts and signed balances matched the saved source invoices for each hotel and both regional scopes; Aging counts also matched. Credit entries remain included and child invoices remain excluded.

The initial TLFO import exposed a signed-credit variant in OPERA Summary. It is accepted only after explicit Summary THB, exact Summary addition, an explicit matching Account balance, conventional Aging totalOutstanding, and exact debit/credit/total reconciliation across every Aging bucket. Omitted component currency codes inherit the verified enclosing THB as in the existing normalizer; foreign or empty codes still fail. History membership, pagination, source identity and zero confirmation remain unchanged. The complete live TLFO import passed those checks after the correction. Diagnostics expose only categorical signs, equations and counts.

Four owner-supplied RTF templates were converted privately using existing offline tools. Original files and KAT/TSK template fingerprints remained unchanged. Each hotel's logo, closing block and banking details were checked; no Phuket assets were substituted. Eight synthetic PDFs (one and 45 invoices per hotel), totaling 12 pages, passed layout, identity, totals and bounds checks.

Live private Statement plus native Invoice preparation succeeded for every new hotel and the outputs were opened and visually inspected. One additional TSAN trial was correctly blocked because OPERA changed the selected balance to zero during the test; the refreshed source confirmed that change. A new eligible selection succeeded. No billing history, real recipients or OPERA financial transactions were edited, and no email was sent in this rollout. Exact test preparation/file IDs are recorded privately; all test preparations were explicitly discarded for normal cleanup.

## Evidence and deployment

- Final unit suite: **1,113 tests / 113 files passed**; TypeScript and production build passed. Independent focused source checks also passed.
- Full deployed browser run: 409 passed and four old refresh-command expectations failed because the new request explicitly includes region. Exact expectations were corrected, and all four reran successfully. The expanded local regional suite passed 58 cases; final deployed regional/refresh/Aging checks passed 27 cases. Original visual baselines were preserved.
- Disposable local SyntheticRestore: **77 migrations / 32 registered SQL suites passed**, without a live database export.
- Applied migration `20260915050519_ar_hotel_regions`, SHA256 `fb1b44ccaa02cd29bb729e3cd07d37c0a4f2c8593e3f9874dd768be2b5baf80a`. Its bytes are immutable. Scope and service-only RPC grant checks passed.
- Four private template sets registered with PNG checksum checks. Existing quota guards and concurrency limits remain; no paid capacity was added. Security/performance advisor checks found no WARN/ERROR.
- Deployed runtime `228ab836f110cf2ac22a5258a6643b53de190aab`, Worker `59c2643b-8569-4058-a646-f62a35a33d5f`. Health/database and 19 anonymous boundaries passed. All six source IDs are enabled; acceptance remains disabled. Existing refresh and cleanup schedules remain.
- Integration: [PR #33](https://github.com/NTHV9/ar-workspace/pull/33); final release closeout is recorded in PROJECT_STATUS.
- PR33 merged as `1fc9a60ffb2ea16791c30137bfe6dffa08503d68` after both CI runs passed on exact head `98940ce`. All eight test objects were deleted through the normal retention lifecycle; exact IDs checked absent and Storage returned to its prior level.
- One late combined Period read failed. The private actual RPC completed in under two seconds and passed the exact Worker/frontend checks. A subsequently traced request returned HTTP200 and populated the view without a functional change; the original failure remains intermittent with unproven cause. Temporary instrumentation and private payloads were removed. Clean runtime `338fc7c95234aa85d220d0778da96aff3dfa24e7`, Worker `97ef2b31-59a5-4f63-8eb4-188ad636d3f5`, has the same application source as PR33 and passed health/database/anonymous checks.

## Operator setup

Billing Required, Credit Term, Billing Type and recipients for Khao Lak must be entered in each Account's Overview settings before normal billing use. The existing Gmail connection is retained. No separate Khao Lak mailbox has been specified or authorized, and no new OAuth access was created.

Public evidence intentionally excludes customer records, real financial totals, banking assets and temporary test recipients.
