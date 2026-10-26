# Templates access for active workspace staff

> Execute inline using the existing isolated checkout; request an independent final review.

## Request and design

The owner explicitly requests that all application users can open and edit Templates.
Use the existing shared workspace library, not separate personal copies. Active,
authorized staff in either region may read, create, edit and archive templates.
Keep authenticated membership checks, canonical workspace ownership, mutation audit,
same-origin protections, content validation and optimistic revision conflicts.
Changes apply to future template use, without rewriting prepared or sent messages.
Storage, user administration and collection-policy changes remain administrator-only.
This is a focused access change; no database migration, resource creation, real
template edit, mail send or financial-data write is required.

Baseline: receipt9884873 / live applicationb4921fc, including qualified PDF area tools.
Preserve unrelated project-audit working changes. Global/parent safety instructions
remain in force; the owner's specific permission change replaces the former
administrator-only Templates rule and does not broaden other administration.

## One implementation and review boundary

- [x] Add failing access-intent and real-dispatcher tests for both regional staff,
  canonical-owner forwarding, inactive/rejected membership and revision conflicts.
- [x] Add browser tests proving staff navigation/deep-link, creation, subject/body
  editing, save/reload, archive and conflict retention, without mail or admin access.
- [x] Admit only exact UUID template PUT requests with no query parameters; retain
  existing handler validation and deny other operations by default.
- [x] Expose Templates navigation/page and Save template to authorized staff.
  Reuse current template UI, library, revision and dirty-navigation protection.
- [x] Run focused RED/GREEN, full units/build, affected browser tests and independent
  review; fix actionable findings, then same-source GitHub qualification.
- [x] Publish current tested source to the existing Worker, verify health/assets,
  record PROJECT_STATUS and a customer-free receipt, and remove owned scratch files.

## Files

Production: src/App.tsx (navigation/page gate), src/email/TemplateLibrary.tsx (Save),
worker/access/scope.ts (explicit PUT admission). Tests: tests/access-scope.test.ts,
tests/regional-access-worker.test.ts, tests/browser/email-preferences.spec.ts.
Existing database authorization already validates active membership and resolves
the canonical workspace owner; no direct table/RPC grants are added.
