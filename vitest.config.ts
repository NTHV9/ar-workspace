import { defineConfig } from 'vitest/config';
export default defineConfig({test:{server:{deps:{inline:['@cloudflare/workers-oauth-provider']}},include:['tests/*.test.ts','tests/*.test.tsx']}});
