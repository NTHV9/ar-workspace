# Recreate documents during cleanup of an exited preparation

Owner reports WAKL/TRAVCO two selected invoices: after one PDF preparation and Exit, a new Create document job fails with retention_busy. Keep the silent Exit behavior already released at eb3df7405cd41afb1dd02629d495b65eff2908a2. No automatic create, send, replay or Sheet writes.

Evidence: actual PG17/152 migrations regression fails at ar_document_create_v5 with a new command while an old explicitly exited file is claimed/armed. The otherwise identical unclaimed control succeeds. Distinct commands and fresh job/storage namespaces rule out command reuse and shared output bytes in this minimal reproduction.

- [x] Reproduce actual create/Exit/enroll/claim/arm/recreate chain in isolated local PG17; no production mutations. Reuse an attested stopped synthetic cluster, create one disposable database, stop/drop it after qualification.
- [ ] Preserve shared advisory mutex and exact-key rejection. Exempt broad invoice-overlap only when immutable same-owner Supabase object/key/target/reference proof belongs to a fully released transient preparation. Ordinary/legacy/Drive/incomplete cleanup and rebinds stay protected.
- [ ] Test claimed and unknown cleanup, fresh generation/review/email opening, old-key rebind rejection, immutable Exit, current-job/ordinary cleanup protection and idempotency. Independent scoped review; full local SQL/tests and required GitHub checks.
- [ ] Apply only the exact qualified additive migration, verify actual fresh repeated preparation without sending or Sheet writes; cleanup exact disposable files; preserve business facts and resources. Update PROJECT_STATUS.

The three earlier retired queued metadata jobs remain deferred separately. No owner-wide cleanup or forced provider replay is authorized by this repair.
