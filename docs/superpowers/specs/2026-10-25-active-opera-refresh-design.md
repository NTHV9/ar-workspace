# Activity-driven OPERA refresh

Owner direction approved in chat on 25 October: check OPERA every five minutes only while in use, batch accounts into fewer Workflow steps, preserve 07:00/19:00 Thai history runs and fast Sheet sync, and show saved data before updating it. Improve the first user's wait without weakening financial verification.

## Approach and implementation choices

Use shared, expiring hotel activity in private PostgreSQL. Keep the existing five-minute cron, including tracker watch renewal/fallback, and gate only its proactive OPERA branch. Daily history/discovery, explicit manual refresh, document-specific live reads and Gmail/Sheet behavior keep their existing semantics. Generic background reads never renew activity.

Browser sends a small authorized regional activity heartbeat once per minute while visible and recently used. Proposed engineering defaults: interaction idle threshold ten minutes; server lease six minutes; client-supplied expiry and actor forbidden. Opening/focusing counts as use. Pointer/keyboard/scroll/touch renew local use; background tabs and long-idle tabs stop. Server verifies the real actor and hotel rights again. Shared freshness and hotel job IDs still prevent duplicate workflows across people/tabs. Backend jobs that need OPERA continue their own scoped reads without keeping all hotels active.

Saved data loads independently of activity/OPERA requests, retaining source times and background publication reloads. Waking after an idle period triggers a stale-on-open check immediately, not after the next five-minute tick. Existing 07:00 preparation helps morning opening; no unapproved fixed prewarm time is added. The first new snapshot still requires complete provider work.

New refresh instances select account batching version 2; existing parameterless instances retain the legacy step sequence. Each new step handles at most ten accounts with three independent account reads at once (previously two). A service-only RPC returns already staged account IDs on retry so an interrupted batch never replaces a validated snapshot with later data. Keep private staging, full pagination, exact identity, lease renewal, peer draining and final full-hotel membership/atomic publication. Durable results contain counts only. Workflow concurrency stays at two, so provider read concurrency rises from at most four to six accounts; no paid capacity added.

Alternatives considered: a fixed daytime window still works while nobody is using the site; active leases avoid that idle work. One step for an entire hotel makes large retries and memory/time bounds worse; groups of ten bound recovery. A fixed extra morning prewarm would require an agreed start time; this change instead reduces actual processing work and uses the retained 07:00 run.

## Verification and limits

Regression coverage: idle cron creates no OPERA job; active hotel subset only; daily six-hotel schedule preserved; tracker fallback runs when OPERA idle; regional/anonymous/Origin/hold/acceptance boundaries; heartbeat visibility, idle, focus, expiry and cleanup; batch failure/retry/replay/privacy/full membership; saved-first browser behavior with held refresh. Qualify SQL privately in a transaction and roll back fixtures. Compare deterministic synthetic time/steps at identical read counts. Run full units, TypeScript, build and focused browser checks, then independent review.

No claim of a 500k monthly guarantee or a fixed OPERA response time. No financial data caches, partial publication, source-check removal, new mail, customer test writes or Sheet timing changes. Deployed/enabled status requires actual readback.
