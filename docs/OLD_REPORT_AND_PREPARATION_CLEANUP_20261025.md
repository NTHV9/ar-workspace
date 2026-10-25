# Obsolete reports and confirmed-unused preparations cleanup plan

> Execute with superpowers:executing-plans; independent SQL/backup scopes use
> dispatching-parallel-agents. This is a plan, not a deletion receipt.

**Goal:** Stop all report-only history writes and safely remove approved obsolete
report data and unused working copies after verified recovery backups.

**Architecture:** Retire only daily-copy writers and their current-read timestamp
enrichment, retaining atomic publication and canonical money/dates/evidence.
Export immutable per-row database payloads with hashes to ignored private local
archives before a guarded report-table purge. Back up exact preparation bytes
through an Admin-only, owned-object receipt endpoint; record explicit unused
dispositions rather than reclassifying legacy jobs. Managed retention alone
performs exact object deletion with its existing hash, claim and absence proof.

**Tech stack:** Existing Cloudflare Worker, Supabase/PostgreSQL, React/Vite,
fflate, private local recovery files. No paid backup or new provider access.

**Spec:** Owner approval in this conversation: stop unused daily/history work;
delete report-only history and confirmed-unused old preparations; keep actual
Sent/billing/reminder and zero/source/tax evidence and Sheet dates. The owner
explicitly confirms no old PDF preparation is currently being edited.

## Constraints

- No real mail, resend, OPERA accounting write or Sheet date overwrite.
- Keep canonical current views, verified balances/zero_since/source_reopened,
  first actual billing/due/stage facts, provider attempts and actual Sent evidence.
- Preserve every pending/uncertain generation/upload/mail and any shared,
  Drive/remittance/business-file hold. Never infer zero from missing/error.
- No customer JSON/PDF, secret or one-time recipient in Git/bundles/tracked logs.
  Data and byte archives live only in ignored private recovery storage.
- Exact IDs + owner + revision/fingerprint + bytes/SHA + reference checks govern
  approval and deletion. No raw SQL deletion of storage.objects metadata.
- Legacy lifecycle and original business/job identities stay immutable; explicit
  unused receipts are separate. General business-file month retention stays.
- Backup data must be complete and verified before any corresponding data purge.

## Steps and ownership

1. [ ] Retire daily_ar and dashboard_daily writers and current-reader enrichment;
   SQL RED/GREEN current publication, stages, dates, freshness and zero safety.
2. [ ] Export only proven report-only datasets with stable pages/row hashes and
   counts; verify local archives and source identity. Purge only that exact set.
3. [ ] Freeze the private confirmed-unused preparation manifest, excluding any
   provider/history/pending/shared/held/unsafe object. Recheck before disposition.
4. [ ] Admin-only exact-owned-object backup read + private inventory ZIP utility;
   cover superseded exports/projects, failed/partial backup and ACL/receipt cases.
5. [ ] Verify all backed-up object lengths/SHA and database metadata, then retire
   eligible exact jobs through guarded receipts. Keep protected exceptions.
6. [ ] Run existing managed cleanup and verify exact object absence/tombstones,
   old text scrub, blocked resume and preserved business/date fingerprints.
7. [ ] Qualify complete changes and same-head GitHub checks; deploy only current
   qualified runtime; record enabled/purged/skipped/remaining and backup receipts.

## Review focus

- Current source data and freshness must work with empty retired daily tables.
- A provider attempt or new revision after preview must block retirement.
- Legacy cannot be silently converted or fabricated as ready/Sent.
- Skipped/shared/supplemental and uncertain work must retain bytes/evidence.
- A byte/hash mismatch must prevent both usable backup completion and deletion.
- Backups must cover superseded versions and preserve numeric JSON text exactly.
