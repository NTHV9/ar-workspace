# Katathani AR Collection System

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Owner-confirmed React + Vite + TypeScript; Cloudflare Workers hosts web and backend; Supabase PostgreSQL, Auth and private Storage.

## Users and purpose
Katathani AR staff review hotel receivables and prepare billing and collection work. OPERA owns accounting values. Access follows the current backend-enforced user and role policy; a new browser tab or new visit still requires sign-in.

## Capabilities and constraints
The authoritative requirements are docs/PRODUCT_SPEC.md and docs/DECISIONS_AND_OPEN_ITEMS.md, with later owner decisions taking precedence. The implemented workspace covers Dashboard/Period and Aging, Hotel + Account invoice work, Collections, Invoice Register and external billing, Remittances, document preparation/PDF editing, email/templates, account/access settings, and Storage/operations. This scope description is not deployment or provider-validation evidence; docs/PROJECT_STATUS.md records those states separately.

Amounts are THB and each ledger stays scoped to Hotel + Account. Current balances, selected-period activity, latest actually sent reminder stage and remittance-reported amounts have distinct meanings. Unknown source data is not zero, and replies or remittance notices do not confirm settlement. OPERA balances remain authoritative; document edits and manual tracking do not change them.

Document preparation is transient, with freely editable PDFs, Undo and Preview, without mandatory all-pages viewing or an acknowledgment checkbox. Exact reviewed-byte and revision checks remain required. Save message preserves workspace edits; Create Gmail draft and Review & send now remain explicit human actions. Recipients are configured per Account and purpose, with no OPERA-email fallback and no automatic sending.

Temporary reviewed bytes remain available until confirmed Sent or explicit discard; pending Draft and uncertain sends remain protected. Older tracked files, Drive archives and remittance/supplemental evidence keep their separate one-calendar-month-after-completion policy and existing eligibility checks. Business history remains available. Navigation preserves the current tab's session and unsaved-work protections without weakening fresh-tab authentication.

No legacy code reuse or accounting writes. Synthetic review data must be separate from live data. Secrets, provider credentials and customer payloads remain outside the repository and browser bundle.

## Brand commitments
English UI, Thai owner communication. Preserve the seven approved PNG references and CODEX_DESIGN_NOTES, the navy/cool-white/blue/teal identity, and self-hosted Plus Jakarta Sans. Desktop/laptop first, with usable compact layouts. Preserve the comparison and ledger workflows while applying later approved surface refinements; DESIGN.md and .impeccable/surfaces/ record their visual rules.

## Evidence on hand
Seven original PNGs and handoff documents in references/. No private customer payloads, production PDF samples or provider credentials in the repository.
