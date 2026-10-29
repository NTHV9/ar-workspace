# Workflow retention and qualified terminal cleanup

> Execute inline using superpowers:executing-plans; independent scoped review before release.

User-authorized policy: successful Cloudflare Workflow state lasts 1 day; errored state lasts 7 days. Clean only unnecessary old terminal instances. Preserve active work, business records, prepared bytes, provider credentials and mail duplicate guards.

## Decisions

- Configure all four existing Workflow bindings explicitly; keep concurrency, schedules, resource names and global observability unchanged. No periodic cleanup endpoint or extra cloud resource.
- Use a read-only paginated provider inventory and current source registry proof for a one-off exact-ID cleanup. Complete must be older than 24 hours by ended_on; errored older than 7 days. Missing dates, unknown statuses/identities, all active states and current tracker wake IDs are excluded.
- Only known terminal refresh/reconcile/financial registry rows, retired tracker IDs, or closed preparations without pending/generating files qualify. Unknown source rows remain held. Keep all database rows, mail claims and stored bytes.
- Before creation, an old document dispatch is reconciliation-only: after 23 hours from database creation (one-hour margin before minimum provider retention), never recreate its Workflow ID. This lower bound is safe because provider completion cannot precede job creation. Existing active Workflow continues; status lookup failures stay unresolved, without creating/rendering/sending. Fresh jobs retain ambiguous-create join behavior. Invalid/future creation timestamps fail closed.
- Cleanup starts dry-run. Revalidate provider identity/version/status/end time and fresh bounded registry evidence before exact batches, abort on incomplete pagination, duplicate IDs, stale proof or changed records. No latest alias, restart, terminate, Gmail POST, or database mutation.

## Tasks

- [ ] Add failing tests for binding retention, actual document dispatch after expired/terminal/active/unknown instances across both queues, and safe cleanup boundaries/revalidation/privacy.
- [ ] Implement retention config, minimal document age fence and a focused maintenance planner/executor with injected provider ports.
- [ ] Verify focused/full unit, typecheck/build and relevant integration contracts; obtain independent review; run required GitHub checks.
- [ ] Freeze and deploy exact qualified Worker preserving bindings/assets/variables. Confirm all four effective retention values and active workflows.
- [ ] Build source-qualified dry-run manifest from live inventory, apply exact safe batches only, verify sent/date/history and active-work invariants. Record counts, held reasons, provider timing limits and release evidence without customer data.

## Review focus

Exact 24h/7d completion boundaries; active/unknown/invalid/future states; stale/malformed source proof; cross-workflow identity and scheduled companion mapping; duplicate/truncated pagination; lost-delete response must not restart or send; expired document IDs cannot create; fresh/active jobs and frozen ready/uncertain bytes stay unchanged.
