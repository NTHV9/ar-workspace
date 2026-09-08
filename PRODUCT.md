# Katathani AR Collection System

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Owner-confirmed React + Vite + TypeScript; Cloudflare Workers hosts web and backend; Supabase PostgreSQL, Auth and private Storage.

## Users and purpose
Katathani AR staff review hotel receivables and prepare billing and collection work. OPERA owns accounting values. Initial authorized application user is ar@katathani.com.

## Capabilities and constraints
The authoritative requirements are docs/PRODUCT_SPEC.md and docs/DECISIONS_AND_OPEN_ITEMS.md, supplemented by the owner's 2026-09-08 implementation authorization. This first increment delivers live infrastructure, access control, Portfolio and Account Detail. No automatic sends, no legacy code reuse, no accounting writes. Synthetic review data must be separate from live data.

## Brand commitments
English UI, Thai owner communication. Preserve the seven approved PNG references and CODEX_DESIGN_NOTES. Portfolio is a comparative matrix, not a replacement dashboard design. Desktop/laptop first.

## Evidence on hand
Seven original PNGs and handoff documents in references/. No private customer payloads, production PDF samples or provider credentials in the repository.
