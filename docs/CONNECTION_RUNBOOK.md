# First-increment connections

## Confirmed targets
- GitHub: NTHV9/ar-workspace (public), branch codex/first-increment.
- Cloudflare account: c82e3ca0932179eba19918aee28a9845; Worker: ar-workspace; URL: https://ar-workspace.ar-c82.workers.dev.
- Supabase: ar-workspace, jmyvpurzmoiecpydjrci, organization ar-katathani, Singapore. Pro organization; creation tool quoted $0/month additional cost.

## Deployment
Normal local authenticated path: pnpm build, then pnpm exec wrangler deploy. Wrangler local OAuth is not configured in this session. The Cloudflare connector is authorized and was used instead. scripts/build-connector-deployment.mjs packages only compressed public build assets into a Worker module; credential bindings are supplied separately through the authenticated connector. No secret is embedded in the module. This fallback incurs Worker handling for static requests; migrating to Wrangler Static Assets after CLI authorization can reduce that overhead without changing UI or business logic.

Before each release: build, typecheck, unit tests, inspect staged files, verify target remote, commit/push, deploy with COMMIT_SHA binding, verify /api/health commit and run deployed browser tests. No automatic deployment workflow is enabled yet; GitHub Actions runs build/typecheck/tests.

## Supabase/Auth
Migration ar_foundation creates ar_accounts, ar_invoices, ar_account_settings with read-only member RLS; ar_private.is_member verifies the current authenticated user against the confirmed approved email; an auth.users insert trigger rejects other accounts. Public signup and anonymous sign-in are disabled; email confirmation remains on. No business sample data is seeded.

The private ar-working-files bucket has member read policy only. Upload/delete operations await the document workflow.

Site URL and exact allowed redirect: https://ar-workspace.ar-c82.workers.dev.
Google callback: https://jmyvpurzmoiecpydjrci.supabase.co/auth/v1/callback.
New Google OAuth client ar-workspace is separate from the two existing clients. Owner entered the client credential directly in the provider dashboard. The app requests email/profile for login, not Gmail/Drive scopes. No existing OAuth client was edited.

SUPABASE_PUBLISHABLE_KEY is a public API identifier, not an admin credential. Backend forwards the user's verified token to PostgREST so RLS remains effective. No service-role key is required for this first read-only UI. The health RPC returns a schema version only, not financial data.

## OPERA, Gmail and documents
Not connected/enabled. Required before OPERA read tests: confirmed environment/base URL, real KAT/TSK hotel identifiers, supported authentication grant and authorized secret-storage location for its credentials/application key. Configure through Worker secret storage; never put values in chat, source, build vars, screenshots or tracked logs.

Once access is provided, test discovery/current/history membership and native PDF selection on the real Worker before enabling the workflows. Gmail delivery requires separate mailbox authorization; Google Login does not establish Gmail delivery. No customer email, Drive upload/deletion, or OPERA accounting action has been performed.

Refresh defaults are confirmed at 30 minutes on open and 07:00/19:00 Asia/Bangkok. OPERA refresh scheduling and shared-job coordination are not enabled before the adapter exists. “Reload saved data” reads Supabase and is not represented as an OPERA refresh.
