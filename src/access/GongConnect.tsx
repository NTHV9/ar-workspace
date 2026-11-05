import {useEffect, useState} from 'react';
import {createClient, type Session, type SupabaseClient} from '@supabase/supabase-js';
import {beginGoogleSignIn, tabAuthOptions} from '../access/tab-session';

const storageKey = 'ar-gong-pending';
const endpoint = '/api/ar-gong/authorize';
interface Pending { query: string; until: number }
interface Consent {handle: string; clientName: string; redirectHost: string; redirectIsLoopback: boolean}

export function gongConnectionRequest(): Pending | null {
  const url = new URL(location.href);
  const query = url.pathname === '/connect/ar-gong' ? url.searchParams.get('arGong') : null;
  if (query !== null) {
    url.searchParams.delete('arGong');
    history.replaceState(history.state, '', url);
    if (!query || query.length > 4096) return null;
    const pending = {query, until: Date.now() + 10 * 60_000};
    sessionStorage.setItem(storageKey, JSON.stringify(pending));
    return pending;
  }
  if (!url.searchParams.has('code')) return null;
  try {
    const pending = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Pending | null;
    if (pending && pending.until > Date.now() && typeof pending.query === 'string' && pending.query.length <= 4096) return pending;
  } catch { /* Ignore expired or malformed connection state. */ }
  sessionStorage.removeItem(storageKey);
  return null;
}

export function GongConnect({pending}: {pending: Pending}) {
  const [client, setClient] = useState<SupabaseClient>();
  const [session, setSession] = useState<Session | null>();
  const [consent, setConsent] = useState<Consent>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    void (async () => {
      const available = await fetch('/api/ar-gong/availability', {cache: 'no-store'});
      if (!available.ok) throw Error();
      const config = await fetch('/api/config', {cache: 'no-store'});
      if (!config.ok) throw Error();
      const {supabaseUrl, publishableKey, googleEnabled} = await config.json() as {supabaseUrl?: string; publishableKey?: string; googleEnabled?: boolean};
      if (!supabaseUrl || !publishableKey || !googleEnabled) throw Error();
      if (!active) return;
      const auth = createClient(supabaseUrl, publishableKey, {auth: tabAuthOptions(supabaseUrl)});
      setClient(auth);
      cleanup = auth.auth.onAuthStateChange((_event, current) => {
        if (active) setSession(current);
      }).data.subscription.unsubscribe;
      const {data} = await auth.auth.getSession();
      if (active) {
        sessionStorage.removeItem(storageKey);
        setSession(data.session);
      }
    })().catch(() => { if (active) setError('Connection unavailable. Start again from your AI app.'); });
    return () => { active = false; cleanup?.(); };
  }, []);

  async function connect(action: 'google' | 'preview' | 'allow' | 'deny') {
    setBusy(true);
    setError('');
    try {
      if (Date.now() >= pending.until) throw Error();
      if (action === 'google') {
        if (!client) throw Error();
        sessionStorage.setItem(storageKey, JSON.stringify(pending));
        beginGoogleSignIn();
        const result = await client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: location.origin, queryParams: {prompt: 'select_account'}}});
        if (result.error) throw result.error;
        return;
      }
      if (!session || (action !== 'preview' && !consent)) throw Error();
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store',
        headers: {Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json'},
        body: JSON.stringify(action === 'preview' ? {action, query: pending.query} : {action, handle: consent?.handle}),
      });
      if (!response.ok) throw Error();
      const result = await response.json() as Consent & {redirectTo?: string};
      if (action === 'preview') setConsent(result as Consent);
      else {
        if (typeof result.redirectTo !== 'string') throw Error();
        const redirect = new URL(result.redirectTo);
        if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' &&
            (['localhost', '[::1]'].includes(redirect.hostname) || /^127(?:\.\d{1,3}){3}$/.test(redirect.hostname)))) throw Error();
        sessionStorage.removeItem(storageKey);
        location.replace(redirect.href);
        return;
      }
    } catch {
      setError('Could not connect AR_Gong. Start again from your AI app and sign in with an approved AR account.');
    }
    setBusy(false);
  }

  return <main style={{maxWidth: '36rem', margin: '4rem auto', padding: '1rem'}}>
    <h1>Connect AR_Gong</h1>
    <p>Allow an AI app to read saved AR data for the hotels you can access.</p>
    {error && <p role="alert">{error}</p>}
    {session && <p>Signed in as {session.user.email}</p>}
    {consent ? <>
      <p><strong>{consent.clientName}</strong> requests read access. The connection returns to <strong>{consent.redirectHost}</strong>.</p>
      {consent.redirectIsLoopback && <p>This destination is on your device. Continue only if you started this connection in a trusted app.</p>}
      <button disabled={busy} onClick={() => void connect('allow')}>Allow read access</button>{' '}
      <button disabled={busy} onClick={() => void connect('deny')}>Deny</button>
    </> : session
      ? <button disabled={busy} onClick={() => void connect('preview')}>Review connection</button>
      : <button disabled={busy || !client || session === undefined} onClick={() => void connect('google')}>Sign in with Google</button>}
  </main>;
}
