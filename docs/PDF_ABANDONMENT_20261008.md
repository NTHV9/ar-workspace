# Discard unused PDF preparations

Status: implemented, tested and deployed on 2026-10-08; migration 106 applied.

Explicit departure from a transient PDF preparation requests abandonment instead of merely hiding the editor. A settled, unprotected job closes immediately and starts exact-job temporary-file cleanup in the Worker background. Pending generation or admitted uploads keep a durable discard request until they settle; scheduled cleanup retries when necessary. Moving from PDF review to email is continued work and does not abandon the preparation.

Gmail Drafts and unconfirmed sends are preserved without setting an abandonment marker. Unknown generation and upload outcomes are not treated as completed operations. Marked preparations are read-only and reject new review, upload and email work; admitted original generation and upload receipt registration can finish safely. Closed jobs no longer appear as unfinished document work in Operations.

Cleanup only selects exact owned original/export receipts for the selected closed transient job and reuses the existing identity/hash/reference checks. Each immediate pass is bounded to ten objects; retries clear remaining eligible files. Business history, legacy files, Drive and remittance policies are unchanged. No age-based purge of old ready jobs is introduced. Refresh, React unmount, tab visibility and internal composer transitions are not deletion events. Abrupt browser closure without an acknowledged departure is not guaranteed to request deletion.

## Verification

- Backend: 56 focused API/schedule/acceptance/access cases and TypeScript pass.
- Local PostgreSQL tests cover idempotent abandonment, owner checks, running generation, exact candidates, closed Operations filtering, old unmarked work, pending uploads, uncertain generation, protected Draft/unknown send, pending-discard write fences and admitted receipt completion. Full rollback preserves tables and function catalog.
- Actual PostgreSQL migration and synthetic behavior execute under repeatable-read rollback. Document jobs/files, email drafts/deliveries/Sent events and storage-object fingerprints are unchanged after removing synthetic fixtures. The tested migration is then applied. No real provider file is deleted by this verification.
- Astra reviews the scoped implementation, including pending-discard read-only protection and navigation interception. No broad purge of existing preparations is performed.
- Thirteen focused browser cases pass: explicit exit and retry, navigation/Back/sign-out waiting for abandonment, read-only pending state, preserved email transitions, reload, failed identity-read escape, reprepare and existing download/edit behavior. TypeScript and browser build pass. Parent inspects the new synthetic retry screenshot; original evidence remains unchanged. Impeccable returns nine advisories and no warnings for the changed surfaces.

## Deployment

Source `625729f7611ee838b737d75918856ed09d3e44fb` deployed as Worker `d5d1fcbc-abac-425a-b1c5-76bc8994a3c1`. Health verifies the exact source, database and OPERA connectivity; bindings are unchanged apart from the source commit, retention stays enabled, and schedules are retained. New RPCs are service-only and use empty search paths. [PR 123](https://github.com/NTHV9/ar-workspace/pull/123) is attached and unmerged. This deployment enables cleanup upon future explicit departure; it does not certify that all previously abandoned files have been purged.
