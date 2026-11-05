import OAuthProvider, {AuthorizationError, insufficientScope, type OAuthHelpers, type OAuthResourceContext} from '@cloudflare/workers-oauth-provider';
import {administratorEmail, parseAccess} from '../../src/access/model';
import {googleSession} from '../access/session';
import {boundedBody} from '../email/shared';
import {backendRpc, type RefreshEnv} from '../refresh/backend';
import {gongTools, readScope, uuid, type GongIdentity} from './tools';

const authorizePath = '/api/ar-gong/authorize';
const resourcePath = '/mcp';
const paths = new Set([
  authorizePath, '/api/ar-gong/token', '/api/ar-gong/register', resourcePath,
  '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]);

export interface GongEnv extends RefreshEnv {
  AR_GONG_ORIGIN?: string;
  OAUTH_KV?: KVNamespace;
  AR_GONG_RATE?: {limit(input: {key: string}): Promise<{success: boolean}>};
  OAUTH_PROVIDER?: OAuthHelpers;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const json = (value: unknown, status = 200, headers = new Headers()) => {
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  return Response.json(value, {status, headers});
};

async function identify(request: Request, env: GongEnv): Promise<GongIdentity | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  const response = await fetch(new URL('/auth/v1/user', url), {
    headers: {Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY},
    redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const user = await response.json() as {id?: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean};
  if (!user.id || !uuid.test(user.id) || !user.email || !user.email_confirmed_at || user.is_anonymous) return null;
  if (!await googleSession(env, authorization, user.id)) return null;
  const claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
  const administrator = user.email.toLowerCase() === administratorEmail;
  if (!administrator) {
    const member = await backendRpc(env, 'ar_access_self', {p_actor: user.id});
    if (!member || parseAccess(member).email?.toLowerCase() !== user.email.toLowerCase()) return null;
  }
  return {actor: user.id, session: claims.session_id, administrator};
}

async function authorize(request: Request, env: GongEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== authorizePath) return json({error: 'not_found'}, 404);
  const oauth = env.OAUTH_PROVIDER;
  if (!oauth) return json({error: 'authorization_unavailable'}, 503);
  try {
    if (request.method === 'GET') {
      if (url.search.length > 4096) return json({error: 'invalid_request'}, 400);
      await oauth.parseAuthRequest(request);
      const connect = new URL('/', url.origin);
      connect.searchParams.set('arGong', url.search.slice(1));
      return new Response(null, {status: 303, headers: {Location: connect.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}});
    }
    if (request.method !== 'POST' || request.headers.get('Origin') !== url.origin ||
        request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' || url.search) {
      return json({error: 'invalid_request'}, 400);
    }
    const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await boundedBody(request, 8192)));
    const identity = await identify(request, env);
    if (!identity) return json({error: 'access_denied'}, 403);
    if (body?.action === 'preview' && typeof body.query === 'string' && body.query.length <= 4096) {
      const original = new URL(authorizePath, url.origin);
      original.search = body.query;
      const parsed = await oauth.parseAuthRequest(new Request(original));
      if (!parsed.codeChallenge || parsed.codeChallengeMethod !== 'S256' ||
          parsed.scope.some(scope => scope !== readScope && scope !== 'offline_access')) {
        return json({error: 'invalid_scope_or_pkce'}, 400);
      }
      const description = await oauth.describeConsent(parsed);
      const consent = await oauth.beginConsent(parsed);
      return json({
        handle: consent.handle, clientName: description.clientName.slice(0, 120),
        redirectHost: description.redirectHost, redirectIsLoopback: description.redirectIsLoopback,
      }, 200, consent.headers);
    }
    if (typeof body?.handle !== 'string' || body.handle.length > 512) return json({error: 'invalid_request'}, 400);
    if (body.action === 'deny') {
      const denied = await oauth.denyConsent(request, body.handle);
      return json({redirectTo: denied.redirectTo}, 200, denied.headers);
    }
    if (body.action !== 'allow') return json({error: 'invalid_request'}, 400);
    const consent = await oauth.approveConsent(request, body.handle, {scope: [readScope]});
    const result = await oauth.completeAuthorization({
      request: consent.request, userId: identity.actor, metadata: {}, scope: [readScope], props: identity,
    });
    return json({redirectTo: result.redirectTo}, 200, consent.headers);
  } catch (error) {
    if (request.method === 'GET' && error instanceof AuthorizationError && error.redirectTo) {
      return new Response(null, {status: 303, headers: {Location: error.redirectTo, 'Cache-Control': 'no-store'}});
    }
    return json({error: 'authorization_unavailable'}, 400);
  }
}

export function isGongPath(path: string) { return paths.has(path); }

export async function handleGong(request: Request, env: GongEnv, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (!env.OAUTH_KV || env.AR_GONG_ORIGIN !== url.origin || url.protocol !== 'https:' || !ctx) return json({error: 'not_found'}, 404);
  if (!env.AR_GONG_RATE) return json({error: 'not_found'}, 404);
  if (url.pathname.startsWith('/api/ar-gong/')) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await env.AR_GONG_RATE.limit({key: 'oauth:' + ip})).success) {
      return json({error: 'rate_limited'}, 429, new Headers({'Retry-After': '60'}));
    }
  }
  const resource = new URL(resourcePath, url.origin).href;
  const provider = new OAuthProvider<GongEnv>({
    apiRoute: resourcePath,
    apiHandler: {
      async fetch(req, bindings, context) {
        const {auth, props} = context as OAuthResourceContext<GongIdentity>;
        if (!auth.scope.includes(readScope)) return insufficientScope(auth, [readScope]);
        if (!props || auth.userId !== props.actor || auth.audience !== resource) return json({error: 'access_denied'}, 403);
        if (!(await bindings.AR_GONG_RATE!.limit({key: 'tools:' + props.actor})).success) {
          return json({error: 'rate_limited'}, 429, new Headers({'Retry-After': '60'}));
        }
        const response = await gongTools(req, bindings, props);
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        return new Response(response.body, {status: response.status, headers});
      },
    },
    defaultHandler: {fetch: authorize},
    authorizeEndpoint: authorizePath,
    tokenEndpoint: '/api/ar-gong/token',
    clientRegistrationEndpoint: '/api/ar-gong/register',
    clientIdMetadataDocumentEnabled: false,
    scopesSupported: [readScope, 'offline_access'],
    requiredScopes: [readScope],
    resourceMetadata: {resource, authorization_servers: [url.origin]},
    accessTokenTTL: 900,
    refreshTokenTTL: 86400,
    cookiePrefix: '__Host-ar-gong-',
  });
  return provider.fetch(request, env, ctx);
}
