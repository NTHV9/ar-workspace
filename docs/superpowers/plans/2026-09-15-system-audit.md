# Full system regression audit

Owner requested another complete audit after the regional/UI changes, with actual bugs fixed. Base: `7b35287ac8719f1b862495f7c026e800112a69c6`.

- [ ] Run all unit tests, production build/public-asset validation, all deployed-UI browser suites and all local editor harnesses. Record failures before making changes; distinguish stale assertions from production defects without discarding behavioral checks or reference images.
- [ ] Replay all schema migrations and registered synthetic rollback fixtures in the disposable local PostgreSQL runtime. Verify no live data/provider access is used by the recovery drill.
- [ ] Review live health/auth boundaries and metadata-only provider/refresh/queue/storage state. Reconcile current six-hotel source counts with application readers where possible. Keep customer payloads, tokens and native PDFs private.
- [ ] Conduct independent bounded reviews of source/region/date/workflow paths and document/PDF/email paths. Use focused reproductions for findings and repair relevant defects.
- [ ] Verify fixed paths, review code, deploy and complete CI/merge if changes are needed. Publish a clear coverage/results report distinguishing fixture-backed tests from live observations and any genuinely untested external actions.

Scope boundaries: no OPERA accounting writes, no customer email recipients, no paid capacity, no Snapshot retention change. Do not recreate retired acceptance resources merely to repeat previously verified external sends. Existing authorized test-only context can be used if a real provider action is necessary to diagnose a concrete issue, but never embed its recipient in code or docs.
