# Regional Portfolio overview implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent model work and review; preserve existing production readers.

**Goal:** Ship the owner-approved local Portfolio preview for both Phuket (KAT, TSK) and Khao Lak (TLKL, WAKL, TLFO, TSAN).
**Architecture:** A pure overview projection consumes the existing Account catalog. A scoped component renders the total strip, regional hotel cards, source Aging matrix and separate freshness labels. Existing Account tables/readers remain; invoice drill uses the existing protected Aging breakdown.
**Tech stack:** Existing React/TypeScript/CSS. No dependencies or provider/schema changes.
**Spec:** Owner approval of prototype branch `codex/portfolio-layout-preview` (`7c06d01`), including Phuket. Original references remain intact.

- [x] Build `src/domain/portfolio-overview.ts` with unit regressions for region/hotel scope, partial/verified zero, signed balances, source range identity and missing/mismatched buckets. No synthetic data outside explicit review mode.
- [x] Build `src/PortfolioOverview.tsx` and scoped CSS matching the accepted prototype. Wire into Portfolio/App while retaining account table filters/sorting/navigation. Hotel cards show each regional contribution, total strip and Aging use selected hotel. Reuse existing publication-checked AgingInvoiceBreakdown for live cell drills; review mode does not fetch live invoices.
- [x] Add browser regressions for both regions, card selection, exact amounts, Aging drill, empty/partial/credit, source ranges, 1440/1280/mobile. Run existing Portfolio/regional regressions and full units/type/build. Inspect new screenshots; keep original baseline files unchanged.
- [x] Independent review, resolve concrete findings, deploy, verify production bundle/health/auth boundaries, update PROJECT_STATUS. Integration follows PR40 after its final CI.

Ruling: Retain a six-column scaffold for wholly unknown Aging, using unavailable cells; never substitute fabricated zero amounts. If actual source ranges differ, render their distinct definitions rather than merging labels. Mobile may scroll the matrix; desktop standard six ranges must fit.
Ruling: Hotel cards retain regional comparison values while an individual hotel is selected, matching the accepted preview; selected scope is explicit in the total strip and Aging table. Preserve signed values and keep chart widths bounded.
