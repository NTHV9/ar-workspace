import {afterEach, describe, expect, it, vi} from 'vitest';
import worker from '../worker/index';
vi.mock('cloudflare:workers', () => ({WorkerEntrypoint: class {}}));

const origin = 'https://ar.test';
const actor = '4b5a2cb6-ac67-413e-8fa4-246d758e1afa';
const session = 'd88a9a28-7290-4916-93c2-a3f77504ff3a';
const owner = 'c3562047-7f8b-4305-b74a-c00b92465971';
const db = 'https://database.test';
const authorizePath = '/api/ar-gong/authorize';
const redirectUri = 'http://127.0.0.1:45456/callback';
const googleToken = 'x.' + btoa(JSON.stringify({
  sub: actor, session_id: session, amr: [{method: 'oauth'}], app_metadata: {providers: ['google']},
})).replaceAll('=', '') + '.x';

function memoryKv() {
  const records = new Map<string, string>();
  const grantWrites = new Map<string, number>();
  return {
    async get(key: string, options?: {type: string}) {
      const value = records.get(key);
      return value === undefined ? null : options?.type === 'json' ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      if (key.startsWith('grant:')) {
        const now = Date.now();
        if (now - (grantWrites.get(key) ?? 0) < 1000) throw Error('KV PUT failed: 429');
        grantWrites.set(key, now);
      }
      records.set(key, value);
    },
    async delete(key: string) { records.delete(key); },
    async list({prefix = ''}: {prefix?: string} = {}) {
      return {keys: [...records.keys()].filter(key => key.startsWith(prefix)).map(name => ({name})), list_complete: true};
    },
  } as unknown as KVNamespace;
}

function fixture() {
  const env = {AR_GONG_ORIGIN: origin, OAUTH_KV: memoryKv(), AR_GONG_RATE: {limit: async () => ({success: true})}, SUPABASE_URL: db,
    SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SECRET_KEY: 'test-private'};
  const ctx = {waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {}};
  const calls: string[] = [];
  const state = {active: true, phuket: true, contaminated: false};
  const member = {email: 'operator@example.test', administrator: false, regions: ['phuket'], revision: 1, workspaceOwnerId: owner};
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(db);
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') {
      if (new Headers(init?.headers).get('Authorization') !== 'Bearer ' + googleToken) return Response.json({}, {status: 401});
      return Response.json({id: actor, email: member.email, email_confirmed_at: '2026-11-05'});
    }
    const args = JSON.parse(String(init?.body));
    if (url.pathname.endsWith('/ar_access_session_valid')) {
      expect(args).toEqual({p_actor: actor, p_session: session});
      return Response.json(state.active);
    }
    if (url.pathname.endsWith('/ar_access_self')) return Response.json(member);
    if (url.pathname.endsWith('/ar_access_authorize')) {
      expect(args.p_actor).toBe(actor);
      return args.p_hotel === 'KAT' && state.phuket
        ? Response.json({...member, scopeHotels: ['KAT']})
        : Response.json({message: 'access_forbidden'}, {status: 400});
    }
    if (url.pathname.endsWith('/ar_aging_invoice_status')) {
      expect(args.p_actor).toBe(owner);
      expect(args.p_hotel).toBe('KAT');
      return Response.json({
        asOfDate: '2026-11-05', publications: [{hotel: state.contaminated ? 'TSUN' : 'KAT', sourceAt: '2026-11-05T12:00:00Z'}],
        rows: [], accounts: [], summary: {complete: true, count: 2, amount: '450.00', creditAmount: '0.00', billing: [], followup: [], due: [], flags: []}, total: 2, complete: true,
      });
    }
    throw Error('Unexpected database call: ' + url.pathname);
  }));
  const fetchWorker = (path: string, init?: RequestInit) => worker.fetch(new Request(origin + path, init), env, ctx);
  const post = (path: string, body: unknown, extra: HeadersInit = {}) =>
    fetchWorker(path, {method: 'POST', headers: {'Content-Type': 'application/json', ...extra}, body: JSON.stringify(body)});
  const web = {Origin: origin, Authorization: 'Bearer ' + googleToken};

  async function authorize() {
    const registered = await post('/api/ar-gong/register', {
      client_name: 'Test AI', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'none',
    });
    expect(registered.status).toBe(201);
    const {client_id} = await registered.json() as {client_id: string};
    const verifier = 'a'.repeat(64);
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    const query = new URLSearchParams({
      client_id, redirect_uri: redirectUri, scope: 'ar:read', response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', resource: origin + '/mcp', state: 'fixture-state',
    }).toString();
    const start = await fetchWorker(authorizePath + '?' + query);
    expect(start.status).toBe(303);
    const consentPage = new URL(start.headers.get('Location')!);
    expect(consentPage.pathname).toBe('/connect/ar-gong');
    expect(consentPage.searchParams.get('arGong')).toBe(query);
    expect((await post(authorizePath, {action: 'preview', query}, {...web, Origin: 'https://other.test'})).status).toBe(400);
    const preview = await post(authorizePath, {action: 'preview', query}, web);
    expect(preview.status).toBe(200);
    const {handle, clientName, redirectHost} = await preview.json() as {handle: string; clientName: string; redirectHost: string};
    expect({clientName, redirectHost}).toEqual({clientName: 'Test AI', redirectHost: '127.0.0.1'});
    const cookie = preview.headers.get('Set-Cookie')!.split(';')[0];
    const approved = await post(authorizePath, {action: 'allow', handle}, {...web, Cookie: cookie});
    expect(approved.status).toBe(200);
    const {redirectTo} = await approved.json() as {redirectTo: string};
    const target = new URL(redirectTo);
    expect(target.searchParams.get('state')).toBe('fixture-state');
    const token = await fetchWorker('/api/ar-gong/token', {method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', code: target.searchParams.get('code')!, redirect_uri: redirectUri,
      client_id, code_verifier: verifier, resource: origin + '/mcp',
    })});
    expect(token.status).toBe(200);
    return {clientId: client_id, ...await token.json() as {access_token: string; refresh_token: string}};
  }
  return {calls, state, fetchWorker, post, authorize};
}

afterEach(() => vi.unstubAllGlobals());

describe('AR_Gong OAuth and read isolation', () => {
  it('starts disabled without an explicit origin and KV binding', async () => {
    const response = await worker.fetch(new Request(origin + '/mcp'), {});
    expect(response.status).toBe(404);
  });

  it('runs PKCE consent, reads only authorized properties and rejects revoked access and web writes', async () => {
    const {calls, state, fetchWorker, post, authorize} = fixture();
    const anon = await fetchWorker('/mcp');
    expect(anon.status).toBe(401);
    expect(anon.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    const {access_token: token, refresh_token, clientId} = await authorize();
    const headers = {Authorization: 'Bearer ' + token, Accept: 'application/json, text/event-stream'};
    const rpc = (method: string, params?: unknown) => post('/mcp', {jsonrpc: '2.0', id: 1, method, params}, headers);
    const list = await rpc('tools/list');
    expect(list.status).toBe(200);
    const catalog = await list.json() as {result: {tools: {name: string; annotations: {readOnlyHint: boolean}}[]}};
    expect(catalog.result.tools.map(tool => tool.name)).toEqual(['get_current_aging', 'list_open_accounts', 'list_invoice_status', 'get_sheet_sync_status', 'get_pdf_job_status']);
    expect(catalog.result.tools.every(tool => tool.annotations.readOnlyHint)).toBe(true);
    const aging = (hotel: string) => rpc('tools/call', {name: 'get_current_aging', arguments: {hotel}});
    expect(await (await aging('KAT')).json()).toMatchObject({result: {structuredContent: {
      hotel: 'KAT', currency: 'THB', sourceAt: '2026-11-05T12:00:00Z', complete: true, summary: {count: 2, amount: '450.00'},
    }}});
    const reads = () => calls.filter(path => path.endsWith('/ar_aging_invoice_status')).length;
    expect(await (await aging('TSUN')).json()).toMatchObject({result: {isError: true, structuredContent: {error: 'access_forbidden'}}});
    expect(reads()).toBe(1);
    state.contaminated = true;
    expect(await (await aging('KAT')).json()).toMatchObject({result: {isError: true, structuredContent: {error: 'data_unavailable'}}});
    state.phuket = false;
    expect(await (await aging('KAT')).json()).toMatchObject({result: {isError: true, structuredContent: {error: 'access_forbidden'}}});
    state.active = false;
    expect((await aging('KAT')).status).toBe(401);
    expect((await rpc('tools/list')).status).toBe(401);
    const renewed = await fetchWorker('/api/ar-gong/token', {method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token, client_id: clientId, resource: origin + '/mcp',
    })});
    expect(renewed.status).toBe(400);
    expect(await renewed.json()).toMatchObject({error: 'invalid_grant'});
    expect(reads()).toBe(2);
    expect((await post('/api/refresh', {hotel: 'KAT'}, headers)).status).toBe(401);
    expect((await post('/api/documents', {hotel: 'KAT'}, headers)).status).toBe(401);
    expect((await post('/api/email/open', {hotel: 'KAT'}, headers)).status).toBe(401);
  });
});
