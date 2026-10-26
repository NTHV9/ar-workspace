# Provider quota warnings

Status: proposed design for the owner-approved behavior, 26 October 2026. No application, database, provider configuration or deployment change is made by this document. Source baseline reviewed: `29cf51e`; reported live application source: `dc21e31667145f36b31a770d470f3e9b61f1063a`.

## Owner decisions

- Show Cloudflare and Supabase separately, against their actual included provider allowances and applicable provider billing periods.
- Administrator-configurable **Alert at %**, initially Cloudflare **80%** and Supabase **50%**. Show used / actual full included provider quota; the alert percentage is a separate setting, never a reduced quota denominator. Persist changes with atomic revision conflicts. This supersedes the earlier proposal of 80% for both.
- At the warning threshold and at/above 100%, keep counting and warn. The application must not suspend employee work because of quota usage.
- Quota details and alerts are **administrator-only**, for the existing authenticated `ar@katathani.com` administrator. Staff must receive neither quota alerts nor provider billing payloads.
- Use an in-web administrator banner and Storage details. No new email notification mechanism. Leave the existing Cloudflare USD 10 provider alert unchanged.
- Do not change provider spend caps, subscriptions, paid plans, retention or deletion policies. Provider enforcement remains outside application control; do not promise that an exhausted provider will always accept a request.
- Preserve authorization, content/MIME and per-file size validation, SHA checks, immutable object receipts, atomic admission/concurrency, no-duplicate dispatch, uncertainty/reconciliation and recovery write holds.

## Current implementation and required correction

`worker/operations/budget.ts` exposes application allowances, not actual Cloudflare or Supabase included quotas. The configured production limits are 1 GiB files, 2 GiB managed transfers and 2 GiB database, with 20% reserved margin. `assessOperationBudget` is only a projection; the authoritative SQL helper is `ar_private.operations_budget_admit`.

`20260910213926_ar_operation_budgets.sql` rejects missing/stale/wrong-period measurements, exceeded allowances and external headroom. The reserve/start RPCs hold the singleton lock and preserve immutable reservation identities. `20260910213931_ar_storage_budget_integration.sql` calls admission for reads/writes and installs `operations_database_guard` on business/staging tables. The guard raises `budget_database_exceeded` before inserts; a later migration also attaches it to financial payment mapping inserts/updates. Removing UI copy alone cannot satisfy the request.

`ar_operations_budget_current` creates an **application calendar month in Asia/Bangkok** and resets the managed-transfer baseline to zero for that application period. This is legitimate only as a scoped internal diagnostic, never as total provider egress. Local `storage.objects` size and `pg_database_size` likewise cannot be relabeled as provider-billed GB-month or provisioned database disk.

`ar_operations_budget_finish` records an estimate overrun and is the only discovered writer of `blocked=true`. An estimate overrun is not proof of corrupted content. Preserve historical overrun/blocked evidence as an administrator advisory, ignore the legacy flag in admission and stop setting a new blocking state on finish. Actual file-length, SHA, immutable-object and source-identity failures remain hard validation. Preserve the independent manual `OPERATIONS_WRITE_HOLD`; never reset existing reservations or merely rename a quota-derived blanket hold as an integrity requirement.

The optional period-summary cache currently skips cache writes when the old database budget is unavailable/exceeded. It still returns the computed business result. Retain its bounded cache/resource behavior in this scope and do not describe it as employee quota suspension. Cache policy can be revised separately; do not remove unrelated safety checks to satisfy a text search for old limit names.

## Provider evidence and unresolved integration

The coordinating investigation verified Cloudflare billing and usage through the read-only provider UI. Keep actual account usage amounts, account identifiers and snapshot payloads private and outside Git. Verify product/SKU, scope and period timezone before normalizing private snapshots; rounded text stays approximate rather than becoming an invented exact count. Cost is separate from resource entitlements and the existing USD 10 alert.

The coordinating investigation verified Supabase Pro usage, entitlements and cycle through the provider UI. Keep exact account observations in private snapshots. Organization-pooled usage must not be labeled project-only. Cached and uncached egress are separate metrics. Provider database disk is provisioned disk, not local `pg_database_size`. Future announced log products are not current billable metrics. The current provider Spend Cap stays unchanged.

No Cloudflare billing/analytics or Supabase Management credential is configured in the Worker. The existing Supabase service secret is not a Management credential. The parent inspected the public Supabase OpenAPI at `https://api.supabase.com/api/v1-json` and found no supported organization billing-usage/cycle endpoint. Do not invent one, scrape dashboard internal endpoints or reuse browser credentials. Cloudflare documents `GET /accounts/{account_id}/billable-usage` with Billing Read; a new scoped credential still requires explicit authorization.

Smallest viable implementation: a private, versioned **verified snapshot** source with explicit source/as-of/period/scope and unknown fields, consumed through the same normalized contract that a later qualified read-only adapter will supply. A dashboard-derived snapshot must say “Verified snapshot,” never “Live.” No raw dashboard response, token or customer data goes into Git. Automatic refresh can be enabled only after endpoint capabilities, supported token scope, resource scope, units and billing-period mapping are verified. Missing credentials block automated freshness, not application work or the warn-only correction.

The settled initial release uses verified private snapshots for both providers, labeled “Last verified.” Task 1 can proceed independently now. Cloudflare automatic reads can follow after qualified scoped credential authorization; Supabase remains a verified snapshot until a supported source exists. If a snapshot cannot be loaded, show “Unavailable — provider usage not connected” with no percentage. Never ship synthetic fixture values as production defaults.

## Data and warning contract

Keep provider telemetry independent from the existing operation ledger. Add a small shared model with these fields:

```ts
type ProviderId = 'cloudflare' | 'supabase';
type UsageUnit = 'count' | 'ms' | 'bytes' | 'GB' | 'GB-month';
type UsageState = 'available' | 'stale' | 'unavailable';
type QuotaSeverity = 'normal' | 'warning' | 'exceeded' | 'unknown';
interface ProviderQuotaMetric {
  id: string; label: string; product: string; unit: UsageUnit;
  used: number | null; included: number | null;
  scope: 'account' | 'organization' | 'project'; scopeLabel: string;
  periodStart: string | null; periodEnd: string | null;
  periodLabel: string; periodBasis: 'billing-cycle' | 'instantaneous' | 'unknown';
  observedAt: string | null; verifiedAt: string; staleAfter: string;
  source: 'provider_api' | 'provider_snapshot'; sourceLabel: string;
  precision: 'exact' | 'rounded'; state: UsageState;
}
interface ProviderUsage {
  provider: ProviderId; planLabel: string | null;
  warningPercent: number; settingsRevision: number; metrics: ProviderQuotaMetric[];
}
interface ProviderUsageResponse { providers: ProviderUsage[] }
```

Use `periodStart` inclusive and `periodEnd` exclusive only when exact provider boundaries/timezone are verified. Otherwise keep them null and display the verified human period label without invented midnight instants. Instantaneous capacity has no monthly reset; GB-month retains its time-weighted unit. Do not apply the byte formatter to counts, milliseconds or GB-month. Decimal GB and binary GiB are different and must be labeled accurately.

For matching known units and `included > 0`, percent = `used / included * 100`, always using the full actual included quota. At `>=100`, severity is exceeded; otherwise at `>=warningPercent`, warning; otherwise normal. Administrator Alert at % accepts an integer 1–100, defaults to CF80/SB50, and saves against settingsRevision atomically; a stale revision yields conflict without overwriting a newer value or discarding the user's unsaved input. Unknown numerator/denominator or nonpositive denominator yields no percentage and unknown severity. Percentages may exceed 100%; a visual bar may cap width but its text shows the real percentage. Approximate observations retain an approximation marker. Partial/stale coverage remains visible. Local diagnostics use source `local_measurement` and never enter provider percentage calculations.

Stale data retain last-known values/as-of and stale wording. A fresh failed fetch does not replace known usage with zero or update observedAt. Once a verified billing cycle ends, do not carry its usage into a new current cycle; show it as the previous snapshot until new evidence arrives. API arrival time and provider observation time remain separate. Snapshot validity is explicit through staleAfter, chosen from the verified source cadence, not a universal assertion that every provider meter is live.

## Backend and UI shape

1. Keep `OPERATIONS_BUDGET_ENABLED=true` and the operation ledger. Replace quota-based SQL denial with count-and-continue behavior; do not bypass reservation RPCs or Storage verification.
2. Admission continues rejecting invalid input, untrusted actor, concurrency exhaustion, conflicting identity, unsafe release, actual content-integrity failures and the independent manual recovery hold. Missing/stale quota measurements, exceeded configured allowances/headroom and old estimate-overrun blocked flags are advisory only. Keep counting even if provider telemetry is absent.
3. Replace the database quota trigger function so it no longer raises for allowance usage. Retain actual database size measurement on the existing bounded status path; do not add a telemetry write for every insert or a trigger that can block business work when its own telemetry write fails. Existing business validation triggers remain unchanged.
4. Provide `GET /api/operations/provider-usage` and `PUT /api/operations/provider-alerts` through existing administrator operations authorization. Authenticate the **real request actor before workspace-owner remapping**. PUT accepts only `{provider, warningPercent, expectedRevision, commandId}` with origin validation, deterministic idempotent replay and atomic revision conflict; no provider resource or quota amount is editable. Private service-only RPCs independently verify administrator identity and revoke public/anon/authenticated execution. No browser snapshot-write endpoint is needed.
5. The endpoint returns only normalized quota data and safe source labels, never credentials, provider raw responses or internal provider account IDs. Provider source failure remains isolated from storage reconciliation and employee operations. Unknown provider telemetry can return HTTP 200 with explicit unavailable state; auth failures stay 401/403.
6. An administrator-only banner near the existing application notices shows provider warnings and links to Storage. A single administrator client read refreshes on sign-in, tab focus or explicit check using bounded freshness/deduplication; no per-tab Workflow polling or new scheduled job is necessary for a snapshot-backed version. Sign-out/identity change clears cached data and aborts in-flight reads. Staff mount no provider-usage reader.
7. Storage has distinct Cloudflare and Supabase sections with units, included quota, period/scope/source/as-of, warning threshold and stale/unknown coverage. Below them, retain app measurements and managed-file transfer diagnostic counts clearly labeled “Application diagnostics — not provider billing.” Remove the misleading old 1/2/2-GiB cap/headroom display. Retain unconfirmed-upload reconciliation and retention UI.
8. Administrator copy interpolates the saved alert percentage: “Cloudflare usage has reached the 80% warning level. Work continues.” / “Supabase usage has reached the 50% warning level. Work continues.” Show the editable Alert at % separately beneath used/full included quota. At full quota: “Included quota exceeded. Usage continues to be counted; the app has not paused work.” Provider errors remain honest and never trigger automatic spend-cap/plan changes.

## Acceptance and rollout

- Exact threshold boundary cases: Cloudflare 79.99%, 80%, 100%, >100%; Supabase 49.99%, 50%, 100%, >100%; no worker request is quota-denied at these points.
- SQL proofs cover reservation/start/read charge/write begin and actual business insert/update above the former caps. Unknown, stale, expired-cycle and null measurements also admit valid work while preserving counts.
- Keep tests for duplicate starts, deterministic upload ID, SHA/MIME/object-size conflict, changed object receipts, uncertain upload readback without another POST, unsafe release, four-operation concurrency, authorization and manual recovery holds. Prior estimate overrun remains recorded but admits subsequent valid work. Test administrator percentage saves, invalid ranges, idempotent retries, revision conflicts and staff write denial.
- Provider tests prove null differs from zero, provider cycles differ from the app calendar month, pooled scope is visible, GB-month differs from bytes, stale/partial failure preserves evidence, and missing credentials do not break employee operations.
- Staff endpoint denial and absence of quota UI/network calls are tested in both regions. Administrator banner and Storage are checked at 1440×900, 1280×800 and 390×844 using synthetic evidence; do not replace design references just to pass tests.
- Add a forward migration; do not edit applied migrations or rewrite historical reservation states/charges. Test the entire migration chain and SQL fixtures before production application. Confirm existing blocked provenance and unchanged reservation/recovery receipts read-only.
- Release the backward-compatible SQL change first, then Worker/UI; old Worker calls must still preserve tracking safely during the interval. Verify immutable runtime bindings before/after deployment, given the documented historical `--keep-vars` incident. No unapproved token, plan or billing mutation.
- Roll back the Worker/UI if needed while retaining warn-only SQL and the ledger; do not silently restore quota suspension. A forward repair is preferred over resetting reservations or database data.
- Update `DECISIONS_AND_OPEN_ITEMS.md` and `PROJECT_STATUS.md` during implementation/release with separate proposed/implemented/tested/deployed/enabled states and customer-free evidence. This planning assignment changes only the design and implementation-plan documents.
