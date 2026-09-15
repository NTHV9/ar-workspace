# Hotel regions implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independently owned tasks, followed by task review and whole-branch review. Do not modify applied migrations or provider resources from a delegated task.

**Goal:** Offer the existing AR functions for Phuket (KAT/TSK) and Khao Lak (TLKL/WAKL/TLFO/TSAN), with correct independent regional totals and property identities.

**Architecture:** Shared typed hotel registry; explicit region in browser/report requests; additive database property support and regional report scoping. Preserve the existing app and defaults, adapt comparisons to ordered hotel lists, keep operational writes strictly one hotel/account.

**Tech Stack:** Existing React/Vite/TypeScript, Cloudflare Workers/Workflows, Supabase Postgres/Auth/private Storage, Gmail/Drive and OPERA.

**Spec:** docs/superpowers/specs/2026-09-15-hotel-regions-design.md

## Global constraints

- Regional keys are `phuket` and `khao-lak`. Exact hotel IDs and order are KAT, TSK / TLKL, WAKL, TLFO, TSAN.
- Khao Lak account settings are independent and start unset. Initial workflow history is not billed/no reminder, without invented dates.
- Preserve current data semantics, owner authorization, dirty-state checks, unique command receipts, preview/ack, transient and monthly retention fences.
- No paid resources, real customer email, OPERA accounting mutation, or private provider/customer data in Git.
- Missing Statement assets or mailbox authorization are explicit readiness states, never Phuket substitutions.

## Task 1: Canonical registry and region semantics

Files: create `src/domain/hotels.ts`, `tests/hotels.test.ts`.

Interfaces:
```ts
export type HotelId = 'KAT'|'TSK'|'TLKL'|'WAKL'|'TLFO'|'TSAN';
export type RegionId = 'phuket'|'khao-lak';
export const HOTEL_IDS: readonly HotelId[];
export const REGION_IDS: readonly RegionId[];
export function isHotelId(value: unknown): value is HotelId;
export function isRegionId(value: unknown): value is RegionId;
export function hotelRegion(hotel: HotelId): RegionId;
export function regionHotels(region: RegionId): readonly HotelId[];
export function regionLabel(region: RegionId): string;
export function hotelInRegion(hotel: unknown, region: RegionId): hotel is HotelId;
export function resolveRegion(params: URLSearchParams): RegionId;
export function reportHotelScope(region: RegionId, hotel: string|null): HotelId|'KhaoLak'|null;
```

- [ ] Write red tests for exact region order, unsupported IDs, old Phuket URLs, explicit Khao Lak properties, and rejected mismatched Hotel/Region.
- [ ] Implement registry functions without provider calls. `reportHotelScope` keeps null for legacy Phuket All and uses reserved report scope `KhaoLak` for four-hotel reports; a reserved scope is never an operational HotelId.
- [ ] Run `node node_modules/vitest/vitest.mjs run tests/hotels.test.ts` and review the public contract before dependent tasks.

## Task 2: Additive SQL property and reporting scope support

Files: one CLI-generated migration in `supabase/migrations/`; `tests/sql/hotel-regions-rollback.sql`; registry scope fixtures as needed. Root owns local replay registration in `scripts/recovery/run-drill.ps1`.

Interfaces: SQL `ar_private.is_supported_hotel(text)`, `ar_private.report_scope_hotels(text)` (null/All/Phuket => KAT/TSK; KhaoLak => four new IDs; exact hotel => one), and `ar_private.hotel_in_report_scope(text,text)`; new `public.ar_dashboard_region_overview(p_actor uuid,p_from date,p_to date,p_type text,p_region text)` returning the existing scope objects with an ordered dynamic hotels array. Existing `ar_dashboard_hotel_overview` remains Phuket-compatible.

- [ ] Inventory live function definitions/constraints read-only, without real row exports. Build an explicit replacement manifest; exclude immutable applied migrations and acceptance-admin static test definitions.
- [ ] Write rollback fixtures with identical account/invoice IDs in different properties. Verify independent workflow/amounts and reject mixed selections; assert Phuket defaults exclude Khao Lak and Khao Lak totals exclude Phuket.
- [ ] Generate migration with the installed Supabase CLI. Expand actual property checks/FKs, update current operational validation and report-scope predicates. Preserve old signatures and privileges unless the new regional overview needs a new signature.
- [ ] Verify all pre-existing suites and new scope fixture on disposable local PostgreSQL; inspect remaining KAT/TSK-only definitions individually. No blanket bypasses or live migration application by a subagent.

## Task 3: Worker validators, readers and regional report adapters

Files: `worker/index.ts`, `worker/opera/client.ts`, `worker/opera/probe.ts`, `worker/refresh/workflow.ts`, `worker/financial/*`, `worker/dashboard/*`, `worker/reports/*`, `worker/settings/*`, `worker/billing/*`, `worker/remittance/*`, `worker/accounts/*`, `worker/documents/*`, and focused API unit tests. Exclude font assets and synthetic acceptance hard limits.

- [ ] Replace duplicated operational hotel allowlists/types with `isHotelId`/`HotelId`. Keep selected Hotel equal to the source/request Hotel at every identity gate.
- [ ] Accept validated regional report scope; adapt `region + optional hotel` to the SQL contract without permitting region strings in single-property write routes. Account filter requires an exact hotel.
- [ ] Add regional overview endpoint behavior, ordered four-hotel response validation and wrong-region response rejection. Preserve legacy no-region Phuket response shape/call path.
- [ ] Regionalize report options/refresh requests and ensure all six known properties can run through the same bounded workflow. Keep startup enabling separate from code support.
- [ ] Run existing API tests plus new four-property, invalid-region, owner and wrong-hotel cases. Root reviews and applies migrations/deployment only after integration.

## Task 4: Browser regional navigation and dynamic comparisons

Files: `src/App.tsx`, `src/Portfolio.tsx`, `src/AccountDetail.tsx`, `src/domain/portfolio.ts`, `src/dashboard/*`, `src/CollectionQueue.tsx`, `src/reports/*`, `src/remittance/*`, relevant CSS and browser fixtures/tests.

- [ ] Add regional selector and ordered hotel controls. Wrap page state in selected region, reset incompatible account/selection context through current dirty guards and retain date/view preferences.
- [ ] Generalize `Comparison` with per-hotel amounts while preserving existing kat/tsk fields for compatibility; render the selected region's columns, totals and hotel contribution. Group matching Account No. only within region.
- [ ] Propagate region in all regional reads, options, drill links and Back state. Keep Document/Email one hotel and account.
- [ ] Generalize Current Aging and HotelSplit to 2/4 hotel rows and dynamic names/colors. Keep all six ranges and Net open last visible at supported desktop widths.
- [ ] Add six-hotel fixtures and test all page scopes, sorting, unknown/credits/child cases, mobile widths and dirty region switches; preserve original visual references.

## Task 5: Hotel document and sender readiness

Files: statement template loading/configuration and associated readiness UI; Gmail region configuration only if the owner's sender choice requires it.

- [ ] Verify the authoritative hotel assets privately before registration; render synthetic selected-only examples for each available hotel and compare logo/footer/bank details.
- [ ] Keep missing templates as explicit setup errors and prohibit cross-hotel assets. Existing Phuket templates must remain byte-identical.
- [ ] Honor the owner's mailbox answer. Do not infer authorization to a second mailbox from general app access. Preserve current sender behavior until the correct path is ready.
- [ ] Test actual source PDF identity with allowed provider reads and document generation scope; any email test must use the conversation-authorized recipient ephemerally.

## Task 6: Controlled enabling, quota and final regression

- [ ] Measure current quota headroom and bound initial read/import. Do not increase paid capacity or remove existing safety margins.
- [ ] Apply reviewed additive migration, enable the confirmed hotel IDs and verify each source independently. Preserve atomic publication and all old history.
- [ ] Run typecheck/build, relevant unit/browser suites and full SQL replay. Exercise Phuket as regression and Khao Lak as the new functional scope. Record qualitative/private provider results separately from synthetic evidence.
- [ ] Independent whole-branch review; repair findings. Commit/Push/PR/CI/merge and verified deployment under the user's existing work authorization. Update PROJECT_STATUS with no real customer financial details.

## Execution ledger

- Baseline: `9d0c1f3`, isolated worktree `.tmp/khao-lak-regions`, branch `codex/khao-lak-regions`.
- Ruling: existing Phuket functionality/design is the approved implementation reference; no new visual-design approval round is needed. Separate Khao Lak settings is explicitly confirmed.
- Ruling: no-region browser/report compatibility stays Phuket; schedules use all enabled operational hotel IDs, not an implicit mixed-region dashboard.
- Required owner inputs requested: mailbox choice; authoritative Statement asset locations. Continue independent registry/data/UI tasks while these remain unanswered.
