import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../worker/index';

describe('protected Worker API', () => {
  it('requires login for private PDF bytes and expected document identity',async()=>{
    for(const extension of ['pdf','json'])expect((await handleApi(new Request(`https://app.test/api/pdf-validation/00000000-0000-4000-8000-000000000000/KAT/${extension}`),{})).status).toBe(401);
  });
  afterEach(()=>vi.unstubAllGlobals());
  const env = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY:'synthetic-test-key' };
  it('rejects provider redirects without following them with credentials', async()=>{
    let redirect: RequestRedirect | undefined;
    vi.stubGlobal('fetch', async (_url:string, options:RequestInit)=>{
      redirect=options.redirect;
      return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});
    });
    expect((await handleApi(new Request('https://app.test/api/health'),env)).status).toBe(503);
    expect(redirect).toBe('manual');
  });
  it('rejects a provider-verified identity outside the allowlist', async()=>{
    vi.stubGlobal('fetch',async()=>Response.json({email:'other@example.test',email_confirmed_at:'2026-09-08'}));
    expect((await handleApi(new Request('https://app.test/api/portfolio',{headers:{Authorization:'Bearer synthetic'}}),env)).status).toBe(403);
  });
  it('rejects unverified allowlisted email', async()=>{
    vi.stubGlobal('fetch',async()=>Response.json({email:'ar@katathani.com'}));
    expect((await handleApi(new Request('https://app.test/api/portfolio',{headers:{Authorization:'Bearer synthetic'}}),env)).status).toBe(403);
  });
  it('rejects unauthenticated portfolio access before contacting a provider', async () => {
    const response = await handleApi(new Request('https://app.test/api/portfolio'), {});
    expect(response.status).toBe(401);
  });
  it('protects real OPERA probes with the same backend authentication',async()=>{
    const response=await handleApi(new Request('https://app.test/api/opera/probe?hotel=KAT',{method:'POST'}),{});
    expect(response.status).toBe(401);
  });
  it('does not substitute demo data for an unconfigured service', async () => {
    const response = await handleApi(new Request('https://app.test/api/portfolio', { headers: { Authorization: 'Bearer invalid' } }), {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'supabase_unavailable' });
  });
  it('does not serve an HTML fallback for unknown API routes', async () => {
    expect((await handleApi(new Request('https://app.test/api/unknown'), {})).status).toBe(404);
  });
});
