# Unattended completion batch — 10 September 2026

Approved scope: the owner approved email templates/editing, verified activity history/statistics, laptop/mobile usability, and integration/security/regression work while away. This is the implementation plan and progress ledger for that batch; existing PRODUCT_SPEC, DECISIONS_AND_OPEN_ITEMS and original PNGs remain authoritative.

## Design and constraints

- Keep the established React/Vite/Worker/Supabase architecture and approved luminous interface. Work on the existing codex/opera-refresh branch in the owner-named workspace.
- Templates are explicitly selected, versioned subject/message defaults. Applying one changes only the unsaved message. Saving a template never changes historical messages, invoice stages or due dates.
- Use a constrained rich document representation with escaped output, bounded content and explicit links; generate both plain text and HTML. Stored/sent snapshots include the exact rich representation. Reject ambiguous or changed sent evidence rather than recording history.
- Reports separate current positive receivables/latest stage from verified sent activity by actual Thai date. Diagnostics, Drafts and manual history corrections are not actual sends. Historical amounts come from immutable send snapshots, not today's balance. Unproven cash/daily arrival/remittance metrics remain clearly unavailable.
- Preserve per-hotel identities, complete pagination, backend allowlist/owner checks, private data access and no-duplicate delivery guards.
- No real recipient defaults, per-account terms, customer sends, permanent cleanup or additional provider permissions are required for this batch. Synthetic tests remain outside business data; production reads/SQL rollback verification are authorized.

## Tasks and ownership

- [x] Email templates + rich editing: shared bounded document model, revisioned template storage/RPCs, composer template picker/version editor, MIME + sent-evidence checks, unit/browser/SQL verification. Root owns worker/email, src/EmailComposer, new email components and email migration.
- [x] Activity/report surface: own worker/reports, src/reports, report migrations/tests. Export handler for root to connect under /api/reports and a Reports component for root to route. Current metrics and verified send rows each have complete filters/drilldown and source explanations.
- [x] Laptop/mobile regression: inspect original mobile and supporting references and existing page CSS; add focused responsive fixes/tests without changing root's email files or reports files. No prototype replacement.
- [x] Integration: wire routes/navigation, inspect migration collisions/data before apply, verify RLS/anonymous denial, run build/typecheck/unit/browser/SQL checks, inspect desktop/laptop/mobile screenshots.
- [x] Release: independent security/spec review, scan explicit Git staging for private content, check public remote, commit/push, deploy Worker and Workflow preserving all bindings/cron, verify deployed SHA + live routes, update PROJECT_STATUS and detailed evidence report.

## Initial interface review

| Tasks | Shared boundary | Decision |
|---|---|---|
| Email and reports | Existing immutable mail delivery/event records | Reports read known snapshots; rich fields only extend snapshots and do not change financial evidence. |
| Reports and integration | Worker auth routing and App navigation | Root alone edits worker/index.ts and src/App.tsx. Report module accepts the already authorized actor. |
| Responsive and email/reports | Global CSS may affect all surfaces | Responsive work is scoped to existing shell/Portfolio/Account/Collections. New surfaces receive their own styles and integration tests. |
| All tasks | Git/database/deployment | Root alone applies migrations, stages/commits/pushes/deploys. No parallel external mutations. |

## Progress

- Plan created from owner-approved scope. No additional business decisions are inferred.

- Implemented templates, rich body snapshots, activity/current reports and responsive UI; independent review found and fixed active-mode formatting loss and multilingual request-size mismatch. Serialized rich JSON is capped at 450 KB to fit PostgreSQL JSONB spacing and template metadata.
- Applied additive migrations ar_email_templates_rich (20260909205357), ar_activity_reports (20260909205630), ar_sent_evidence_immutability (20260909210914). Template/report SQL rollback checks passed; database still has 0 business sent events, 0 saved templates and 2 pre-existing diagnostic sent records before live release validation.
- Build/typecheck and 259 unit tests passed before the final size regression was added (new focused tests passing); report browser 5, responsive browser 9 and rich editor browser 9 passed. Initial concurrent browser test server termination caused connection-refused failures; one persistent Vite server now serves all tests. Final suites will run against Cloudflare after release.
- Owner explicitly renewed authorization for a one-time diagnostic recipient in chat. The recipient remains outside source, documents and stored defaults. New rich diagnostic has exact retry-intent binding and uses only a synthetic PDF.
- Final keyboard integration test exposed a selectionchange timing race; rich editor agent is fixing and adding a deterministic regression before release. Root retains responsibility for staged-content scan, push/deployment and live verification.

- Source released as39ae325; all56 Cloudflare browser checks passed, six template v1 entries saved/read through live UI, rich diagnostic verified SENT04:19:49ICT with one synthetic PDF. No business events, history dates/stages or recipient defaults were introduced.
- Final navigation review found report context lost after Account/back. Reproduced failure, added user-scoped metadata-only ReportContext, and passed all6 related browser tests. Followup source125e366 deployed, public health SHA matches; final Cloudflare suite now80 total browser cases (57 deployed +23 editor harness). Detailed result in UNATTENDED_COMPLETION.md.

- Final evidence: source125e366, Worker08d9cbb89be6446f9ed8384b88d353e3, Workflow0e5acf8c-d5ee-4ad7-85ad-a02a32b590dc. All57 deployed browser cases verified; last broad run55pass/2timeout, targeted trace rechecks4/4pass. No assertions/timeouts disabled. Remaining provider/business-input work listed explicitly in completion report.
