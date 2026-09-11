# Versioned collection policy foundation

**Goal:** Configurable global collection rounds with immutable historical interpretation and no automatic sending.
**Authority:** COMPLETION_PLAN C3, PRODUCT_SPEC §10, COMPLETION_WORKFLOW_AUDIT WF-1. Root owns UI/routing/template/settings integration and migration application.

## Contract and decisions

`CollectionPolicy` is `{version,rounds}`. Each ordered round is `{key,label,anchor:'due'|'previous_sent',offsetDays,terminal,active}`. Existing keys `Friendly`, `Follow 1`, `Follow 2`, `Follow 3`, `Final` remain unchanged. New keys use `round_<stable-id>`. Keys are never removed from later policy versions; retiring means `active:false`. Active labels are distinct; the active sequence starts with one or more increasing due-date offsets, followed by previous-actual-send offsets. Exactly the last active round is terminal. These structural rules prevent a missing date anchor or contradictory terminal sequence. The operational bound is 100 definitions and offsets -365..3650 for due anchors / 0..3650 for previous-send anchors.

Default version 1 preserves Friendly due−7, Follow 1 due+1, remaining rounds prior actual sent+7. An overdue invoice with no prior reminder can begin at the latest eligible due-anchored round, but time never skips a previous-sent-anchored unsent round.

`StageSnapshot` pins `{policyVersion,key,label,anchor,offsetDays,terminal,position,earlierKeys}` at claim. `earlierKeys` describes earlier positions in that policy, not proof those rounds were actually sent. It prevents a reordered older round from automatically restarting progression. Future progression follows active rounds after the latest key (retired tombstone position included), omitting earlier captured positions. A captured terminal send remains urgent immediately even if the active policy later changes. A formerly nonterminal send is not converted to terminal by a later edit. Missing/ambiguous progression gives Needs review. Legacy keys without a snapshot use the immutable version-1 definitions, never the newest label/terminal flag.

API: `GET /api/collection-policy` → active policy; `GET /api/collection-policy/history?page=0&limit=20` → immutable versions; `PUT /api/collection-policy` `{commandId,revision,confirmed:true,reason,rounds}` → published version; `GET /api/collection-policy/commands/:id` → recorded command result/unknown receipt. Writes are global to the approved workspace, actor-checked, CAS and idempotent.

Collection handoff input must carry `policyVersion` in `p_expected`, corresponding to the policy shown in the send review. SQL rereads/locks the active head, validates an active stage and pins its definition. Missing version is accepted only for legacy stage keys while untouched default version 1 is active, preserving existing default callers during integration; after any policy edit it fails closed. Exact existing claims retain their original result. Policy edits are permitted while messages are pending because captured message interpretation is immutable.

## Tasks

- [x] Add failing shared validation/progression/API tests.
- [x] Implement shared policy contracts and optional policy/snapshot progression; preserve existing default tests and exception guards.
- [x] Implement authenticated read/history/publish/command Worker API.
- [x] Generate an additive migration with Supabase CLI; seed default policy, retain key registry, immutable versions/commands, expand workflow stage constraint without clearing data.
- [x] Replace only the deepest current new-app claim helper’s fixed stage check; preserve outer exceptions/thread/By System guards. Pin policy/stage evidence at claim and actual sent update/history.
- [x] Write synthetic rollback acceptance for old/default/custom/retired stages, policy changes during pending handoff, historical terminal/labels, CAS/replay, ownership and guard preservation.
- [x] Run focused tests/typecheck and hand off root integration. Do not apply migration, call providers, commit or deploy.

## Root integration seams

Queue must load policy once, pass `null` for a failed load (Needs review), and pass the active policy to `nextCollectionAction`. The optional omitted argument preserves legacy default behavior only. Use active stage definitions for menu/order/labels; use captured snapshot for historical labels/terminal badges. Exceptions take precedence for actionability, while `urgent` remains an independent flag for a historically terminal invoice that is held or needs review.

Composer must fetch/render policy, retain its version in reviewed send context, pass `policyVersion` into send/draft API and backend expected snapshot, and accept registered custom stage keys. Root’s Worker delivery preflight should validate with the same shared policy and version, while SQL remains authoritative. Templates/history editing must use registry-backed keys and preserve retired keys for historical reads. New custom history entries need a captured policy snapshot; the migration provides a workflow trigger for an explicitly changed stage when no snapshot is supplied.

Root must expose the new workflow/event snapshot columns in read projections, use them for historical labels/terminal behavior, and map `email_policy_revision_conflict` to a review-required 409. Do not fetch the current policy inside SENT reconciliation to reinterpret an already claimed message.


## Completed foundation and exact integration

- CLI-created draft: `supabase/migrations/20260910145824_ar_collection_policy.sql`. No hosted migration or provider write was performed by this subtask.
- Shared validation/API/default progression suite: **34 tests passed** across `tests/policy.test.ts`, `tests/policy-api.test.ts` and `tests/collection-queue.test.ts`. A mismatched historical snapshot does not manufacture terminal urgency. Whole-workspace typecheck passed again at 21:55 ICT after the parallel modules were available.
- Local PostgreSQL **17.11 SchemaReplay passed** at **21:52 ICT**, loopback port 55433: 38 migrations and seven rollback fixtures, including `policy-rollback.sql`, invoice exceptions, account workspace, threads, remittance, Drive and Statement policy. The marked server was verified stopped; no provider requests, live export or physical backup restore. Private run receipt: `private/recovery/run-327b4d5fa98b47f6b433d0906bda53b4/result.json`. Policy migration SHA-256 at this run: `24d56b929bd1edb7f3b56c656736fe12d4385ae9d2fdeb582e8994205496f827`.
- `scripts/recovery/run-drill.ps1` gained only the matching conditional that includes `policy-rollback.sql` when `ar_collection_policy` is requested. The portable runtime was already installed; no installer was rerun.

Read projection fields:

| Source | Fields |
|---|---|
| `ar_invoice_workflow` and its `ar_collection_rows.workflow` JSON | `last_reminder_policy_version`, `last_reminder_stage_snapshot` |
| `ar_private.mail_deliveries` | `collection_policy_version`, `stage_snapshot` |
| `public.ar_sent_events` | `collection_policy_version`, `stage_snapshot` |

`StageSnapshot` is `{policyVersion,key,label,anchor,offsetDays,terminal,position,earlierKeys}`. `ar_collection_rows` is replaced with the same columns and `security_invoker=true`, adding only those two workflow JSON keys. Root report/account readers should expose the corresponding captured fields instead of looking up a historical label or terminal flag in the newest policy. Existing pre-policy rows are not rewritten.

`ar_workflow_history_save` keeps its existing arguments. Its stage validator is changed to the retained key registry; a workflow trigger captures the current definition on an explicit stage change. Date-only corrections preserve an existing snapshot, or use immutable default-v1 evidence for a same-stage legacy row. No extra history-save argument is required.

`ar_template_save` also keeps its signature. Root should add transient `policyVersion` to `p_content` after normal template-content parsing (or extract it before parsing then reattach for the RPC). The wrapper removes that field before storage, requires registered stages and active definitions for non-archived collection templates, and permits registered retired stages only for archived content. After policy v1 it requires the matching reviewed current version. Exact existing-content/no-op retries still return their original template version even after a policy change. Root maps `template_policy_revision_conflict` and `template_stage_retired` to actionable 409 messages. The archived read/version history remains unchanged.

For new collection handoffs, root adds `policyVersion` to `p_expected` and uses `readPolicyForHandoff` for early feedback; the database is the final check. Existing immutable claims bypass current-policy revalidation and SENT copies their captured definition. Root must finish Composer/Template/History UI and Worker consumers before enabling policy publication beyond seeded default v1. Copying an earlier policy for editing must retain any later registered keys as retired definitions, not remove them.


Root integration and hosted SQL verification are recorded in COLLECTION_POLICY_VERIFICATION.md. Policy head remains version1; synthetic tests rolled back.
