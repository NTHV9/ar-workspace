# Roomier Period analysis implementation plan

User clarification: redesign the composition because Khao Lak is too dense; this is not a color-only table parity task.

Design: keep region totals in concise KPI/activity cards. Move hotel breakdowns out of small cards into full-width matrices with hotel rows and metric columns. Use one payment matrix containing the aggregate row and hotel rows. Give closing Billing and Follow-Up separate full-width sections with comparable hotel rows. The same composition accommodates two or four hotels; individual hotel/account mode keeps its simple current summary. Mobile stacks each hotel into a labeled two-column block.

Constraints: reuse existing overview source, hotelMeasures/paymentMeasures, source uncertainty/credit handling, date controls and onDetail callbacks. No changes to queries, calculations, financial membership, account identity, billing semantics, Snapshot/Log/file retention or paid capacity. Preserve original visual references.

- [x] Implement a reusable `PeriodHotelMatrix` presentation with exact hotel/column identity, count/amount units, optional aggregate row, and forwarded drill actions. Unit verification covers unknown, zero/credit, hotel ordering and no fabricated fallback.
- [x] Recompose PeriodBalances/PeriodActivity comparison mode, remove duplicated small HotelSplit blocks, retain all metrics/actions and add scoped composition CSS.
- [x] Add regional browser checks: matrices visible for both regions, scope/date-preserving drill and filters, no duplicate source reads, desktop/mobile bounds, failed/partial data. Run existing period/hotel/date/credit regressions and inspect before/after captures.
- [ ] Review, resolve concrete findings, build/deploy, verify production assets/health/auth, merge after CI and update PROJECT_STATUS.
