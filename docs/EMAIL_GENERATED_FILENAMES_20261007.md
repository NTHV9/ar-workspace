# Generated PDF filenames in Email preparation

Status: implemented and tested; migration 105 applied. Worker deployment pending.

## Behavior

Generated package exposes editable PDF filenames. Changes join the existing message dirty state and persist through Save message. Unsaved filename changes cannot silently download under an old name or proceed to handoff; errors retain typed names and message content. Reopening, confirmation, download and MIME use the saved names. Unicode and omitted .pdf extensions are supported, with validation for unsafe/reserved/oversized/colliding names. Unchanged legacy punctuation remains usable.

Only `name` in the existing draft export snapshot changes. PDF bytes, SHA-256, byte counts, storage keys, order and the reviewed DocumentJob package remain identical. No reupload, PDF rerender, original package rename or retention change is required.

## Atomic and authorization contract

Save accepts an optional complete storage-key/name list; omitted input preserves names for old clients. The new service-only v3 writer locks the draft, verifies the current package/lifecycle/revision, checks the full existing generated key set and validates name changes before delegating content writes to the unchanged v2 writer. Content plus names increments revision once; names-only once; no-op saves do not increment.

Invalid, inactive, unready or cross-region supplied staff identities fail closed; trusted headerless service calls remain supported. Current claimed handoffs and older unresolved handoffs block renaming, including legacy created/uncertain attempts. Existing thread, signature, template and regional restrictions remain. MIME/Sent verification continues to match exact filenames, sizes and hashes; it is not relaxed.

Downloads check a supplied revision before reading storage and emit a safe ASCII fallback plus UTF-8 filename header. Existing filename punctuation is preserved on reads; strict new-name rules do not disable legitimate old downloads.

## Verification

- Full units: **1,717 tests / 181 files** pass; parent independently runs 16 relevant API/name/MIME/Sent cases and TypeScript.
- Standard smoke configuration now includes Email Composer. Parent runs **27 browser cases** across Email Composer, signatures/preferences and staff controls. Tests cover editing/save/reopen, confirmation, exact download, error/conflict retention, desktop/mobile, existing expiry messaging and human-triggered handoff behavior, with synthetic APIs only.
- Local SQL installation/behavior rollback preserves all app tables, auth users and the function catalog. Cases include allowed Phuket staff, headerless service, unknown/malformed/inactive/unready/cross-region staff, invalid key/name/metadata input, rename-only/content-plus-name/no-op, source package and non-name export preservation, and claimed/uncertain/closed/stale failures.
- Actual PostgreSQL guarded repeatable-read DDL + synthetic behavior rollback passes. Savepoint rollback preserves draft, document-job and delivery fingerprints, auth-user and Sent counts, and the current v2 definition. The new writer is absent after the outer rollback; the exact tested migration 105 is then applied.
- Astra source review approves after correcting the invalid-staff-header path. Desktop/mobile synthetic captures are inspected; Impeccable returns advisories only. Existing evidence overwrites are retained privately and tracked evidence restored.

No real email, Gmail draft, customer filename edit, storage mutation or provider call is made by verification. Existing PDFs and actual Sent history remain unchanged. Migration installation enables the capability; ordinary user Save invokes it.
