interface Env { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; COMMIT_SHA?: string; ASSETS?: { fetch(request: Request): Promise<Response> } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function upstream(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) throw new Error('upstream_redirect_rejected');
    return response;
  }
  finally { clearTimeout(timer); }
}
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (path === '/api/config') {
    let googleEnabled = false;
    if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
      try {
        const response = await upstream(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
        if (response.ok) googleEnabled = (await response.json() as {external?:{google?:boolean}}).external?.google === true;
      } catch { /* Configuration stays fail-closed; no provider error details reach the client. */ }
    }
    return json({ supabaseUrl: env.SUPABASE_URL ?? null, publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? null, googleEnabled });
  }
  if (path === '/api/health') {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ status: 'unavailable', supabase: 'not_configured', opera: 'not_connected', commit: env.COMMIT_SHA ?? 'development' }, 503);
    try {
      const response = await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/ar_health`, { method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
      const healthy = response.ok && await response.json() === 'ar-workspace-v1';
      return json({ status: healthy ? 'ok' : 'unavailable', supabase: healthy ? 'database_verified' : 'unavailable', opera: 'not_connected', commit: env.COMMIT_SHA ?? 'development' }, healthy ? 200 : 503);
    } catch { return json({ status: 'unavailable', supabase: 'unavailable', opera: 'not_connected' }, 503); }
  }
  if (path !== '/api/portfolio' && !/^\/api\/accounts\/[^/]+\/[^/]+$/.test(path)) return json({ error: 'not_found' }, 404);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: 'supabase_unavailable' }, 503);
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization };
  try {
    const auth = await upstream(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
    if (!auth.ok) return json({ error: auth.status >= 500 ? 'auth_unavailable' : 'unauthorized' }, auth.status >= 500 ? 503 : 401);
    const user = await auth.json() as { email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
    if (user.email?.toLowerCase() !== 'ar@katathani.com' || !user.email_confirmed_at || user.is_anonymous) return json({ error: 'forbidden' }, 403);
    const allRows = async (table: string, query: string) => {
      const result: unknown[] = [];
      for (let offset = 0; ; offset += 500) {
        const response = await upstream(`${env.SUPABASE_URL}/rest/v1/${table}?${query}&limit=500&offset=${offset}`, { headers });
        if (!response.ok) throw new Error('database_unavailable');
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('invalid_response');
        result.push(...page); if (page.length < 500) return result;
      }
    };
    if (path === '/api/portfolio') return json({ accounts: await allRows('ar_accounts', 'select=*&order=hotel,id'), source: 'opera', status: 'not_connected' });
    const [, , , hotel, id] = path.split('/');
    const query = `hotel=eq.${encodeURIComponent(decodeURIComponent(hotel))}&account_id=eq.${encodeURIComponent(decodeURIComponent(id))}`;
    return json({ invoices: await allRows('ar_invoices', `select=*&${query}&order=id`), source: 'opera', status: 'not_connected' });
  } catch { return json({ error: 'supabase_unavailable' }, 503); }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Application assets unavailable', { status: 503 });
  },
};
