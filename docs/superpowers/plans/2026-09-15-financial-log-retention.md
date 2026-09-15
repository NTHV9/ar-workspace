# One-month technical financial log retention

Owner approval: retain the detailed financial change log for one calendar month from its recorded timestamp; Snapshot retention is explicitly deferred. This authorizes only expired rows of `ar_private.financial_changes`, not invoices, payments, applications, billing/reminder/Sent history, or files.

1. Add an additive migration with an Asia/Bangkok calendar-month expiry function and indexed expiry. Use a private transaction-bound cleanup claim so normal updates/deletes remain forbidden; allow only the bounded service-only pruning RPC to delete expired exact row IDs. No caller-controlled cutoff.
2. Store one bounded maintenance status row. Test month ends, leap years, timestamp/time-zone independence, batching/idempotence, unauthorized calls, immutable updates/recent deletes, claim cleanup, and preservation of business/snapshot tables.
3. Add a Worker wrapper controlled by `FINANCIAL_LOG_RETENTION_ENABLED` and existing write hold. Reuse the 15-minute maintenance schedule, independently of Gmail/file outcomes, with one batch of at most 1,000 rows. Preserve the existing twice-daily OPERA schedule and all Snapshot/file retention behavior.
4. Independently review; replay all migrations and registered SQL fixtures in the disposable local PostgreSQL runtime. Run relevant Worker tests, full unit suite and build.
5. Apply reviewed schema, enable the flag, verify a real no-expiry run and metadata-only scope checks, inspect advisors, complete CI/deployment/merge and update PROJECT_STATUS. No current logs are old enough to delete; no immediate size reduction is claimed.

Root owns migration/provider operations and integration. A bounded Worker implementer may edit only the maintenance wrapper, schedule and related tests/configuration; reviewers do not mutate providers.
