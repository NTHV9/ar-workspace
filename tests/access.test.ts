import { describe, expect, it } from 'vitest';
import { handleApi } from '../worker/index';

describe('protected Worker API', () => {
  it('rejects unauthenticated portfolio access before contacting a provider', async () => {
    const response = await handleApi(new Request('https://app.test/api/portfolio'), {});
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
