# OPERA read and refresh increment — 2026-09-08

Owner approved the two-page design and authorized the next increment. Preserve the visual baseline and existing services. Targets remain the confirmed new Worker, Supabase project and GitHub repository in CONNECTION_RUNBOOK.md.

## Order of work
1. Inspect the actual configured binding names without exposing values. Obtain the confirmed OPERA gateway, hotel IDs, authentication scheme and permission to read the named secret source. Do not search legacy credentials without that scope.
2. Use Oracle's public API contracts to implement a new bounded HTTP client: same-origin paths, explicit methods, manual redirect rejection, timeout/body bounds, token handling and no raw payload logging.
3. Test pagination and snapshot validation using synthetic responses: duplicate members, hasMore/count disagreement, empty intermediate pages, partial failure, cross-hotel/account identities, currency and zero-vs-missing.
4. Once credentials are available, probe the real gateway from the actual Worker, inspect response shapes privately, and finalize mappings against evidence. No sample data is written to the live business tables.
5. Add database migrations only after inspecting current tables/data. Persist refresh coordination and apply only complete validated snapshots atomically. Preserve config/history and unknown invoice states.
6. Connect scoped manual and shared on-open refresh, then enable 07:00/19:00 Asia/Bangkok scheduling after a successful real read. Report last success/error per hotel. Scheduled execution never creates drafts or sends email.
7. Probe native Statement/Folio PDFs and exact selected membership once document inputs and permissions are known. No accounting write or automatic renderer fallback.

## Blocking inputs, scoped to real integration
At inspection time the Worker had COMMIT_SHA, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY only. No OPERA settings existed in the workspace environment or Worker. A request for gateway/hotel IDs and permission to read a named secret-storage source is pending. This blocks real OPERA probes, not independent client/validation tests.

## Evidence
Record only endpoint shapes, counts, categorical results and identifiers of new deployments/migrations. Actual customer response bodies and PDFs stay outside Git and public screenshots. Oracle specifications are documentation, not proof of environment-specific completeness.
