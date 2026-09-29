# Refresh publication timeout — 29 September 2026

## Evidence and cause

The KAT refresh that failed at 10:53 ICT reached `verify-membership-and-publish` and returned `provider_unavailable_database_ar_publish_refresh`. The matching Supabase Postgres log at 10:53:29 identifies `public.ar_publish_refresh` and `canceling statement due to statement timeout`. This is separate from OPERA's native-folio HTTP 400.

Read-only configuration inspection found an 8-second authenticator statement timeout and no override on the publication RPC. Successful calls in `pg_stat_statements` had reached 7,919.82 ms. Billing-quota headroom does not remove that query deadline. The detailed payload from the failed job had already been cleaned up, so reproduction used synthetic data, not a claim to replay the original customer packet.

## Feedback loop and measured probes

A local, loopback-only PostgreSQL 17 schema replay applied the existing 89 migrations and passed 42 rollback fixtures. A synthetic complete KAT publication with 105 Accounts and 5,250 invoices reproduced the same statement timeout twice at 8,015 and 8,002 ms. The smaller 1,575-invoice case completed at 1,875 ms; 3,675 invoices completed at 5,282 ms.

The ranked checks were per-invoice write overhead, the subsequent Dashboard capture, and concurrent lock contention. In an isolated profiling transaction with a longer **local-only** timeout, the original complete publication took 9,705 ms: about 6,840 ms in the publication/wrapper phase and 2,854 ms in capture. A read-only production plan of the current KAT Dashboard invoice view took 25 ms and used hash joins. The cold synthetic view plan had different estimates, so its capture timing is not presented as a measurement of production capture. No lock wait was found in the inspected logs for the original 10:53 event; later lock messages were not assumed to be its cause.

Changing only invoice insertion from individual statements to one upsert per Account made the original 8-second local reproduction pass at 7,131 ms, with subsequent measurements around 7.2–7.7 seconds. These local measurements establish improvement, not a universal latency guarantee.

## Change

Migration `20260929054500_ar_publish_batch_invoices`:

- Verifies the original private function-body fingerprint before making the narrow rewrite, and verifies the resulting fingerprint. The same already-applied definition is accepted for safe replay; unexpected definitions fail closed.
- Uses `INSERT … SELECT … ON CONFLICT` per Account. Existing casts, fields, row triggers, hotel lock, completeness checks, missing/cleared handling, publication timestamps, quality records, replay behavior and capture wrappers remain.
- Sets a bounded **15-second timeout only on `public.ar_publish_refresh`**. This remains below the Worker's existing 20-second RPC transport deadline. Role/global timeouts, lock timeouts, permissions and the refresh schedule are unchanged.
- Reloads PostgREST's schema metadata. PostgREST hoists the function setting to the request transaction; this is not an attempt to reset an already-running SQL timer inside the function. See [Supabase function timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) and [PostgREST hoisted function settings](https://docs.postgrest.org/en/v13/references/transactions.html#hoisted-function-settings).

## Verification boundary

The committed `tests/sql/refresh-publish-batch-rollback.sql` exercises the real complete publication, checks all 5,250 invoices became verified, checks completion and private execute permissions, and rolls back. Its 15-second budget matches the new request setting; the separate pre-fix diagnostic used the old 8-second budget. The post-change fresh replay passed 90 migrations and 43 rollback fixtures. Temporary profiling notices existed only in rolled-back local functions; they are not in the deployed migration.

Hosted application and a new real KAT refresh are verified separately in PROJECT_STATUS. No provider credentials or customer payloads are part of this regression. No paid capacity, OPERA accounting operation, native-folio setting, automatic email or faster refresh schedule is introduced by this fix.
