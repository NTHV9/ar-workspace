import {LoaderCircle} from 'lucide-react';
import './sign-in.css';

function GoogleMark(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59A5.99 5.99 0 0 1 12 5.95Z"/></svg>;}

export function SignInScreen({loading,busy,error,enabled,signedIn,onGoogle,onRetry,onSignOut}:{loading:boolean;busy:boolean;error:string;enabled:boolean;signedIn:boolean;onGoogle:()=>void;onRetry:()=>void;onSignOut:()=>void}){
 return <main className="sign-in-screen"><section className="sign-in-card" aria-labelledby="sign-in-title">
  <img className="sign-in-logo" src="/katathani-collection.svg" alt="Katathani Collection" width="88" height="88"/>
  <h1 id="sign-in-title">Katathani AR</h1>
  <p className="sign-in-intro">Sign in to your collection workspace.</p>
  {loading?<p className="sign-in-progress" role="status"><LoaderCircle size={20}/>{signedIn?'Verifying your access…':'Preparing sign-in…'}</p>:<>
   {error&&<p className="sign-in-error" role="alert">{error}</p>}
   {signedIn?<div className="sign-in-actions"><button onClick={onSignOut}>Sign in again</button><button onClick={onRetry}>Retry</button></div>:<button className="sign-in-google" disabled={!enabled||busy} onClick={onGoogle}>{busy?<LoaderCircle className="sign-in-spinner" size={20}/>:<GoogleMark/>}{busy?'Opening Google…':'Sign in with Google'}</button>}
   {!signedIn&&!enabled&&<button className="sign-in-retry" onClick={onRetry}>Retry connection</button>}
  </>}
  <p className="sign-in-help">Use your approved Google account.</p>
 </section><footer>Katathani Collection</footer></main>;
}
