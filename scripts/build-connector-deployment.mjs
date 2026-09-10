// Cloudflare connector deployment fallback when Wrangler has no local OAuth session.
// Only public build assets are embedded. Secrets are runtime bindings, never build input.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const assets = {};
function walk(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) walk(file);
    else assets['/' + relative('dist', file).replaceAll('\\','/')] = { type: types[extname(file)] ?? 'application/octet-stream', data: gzipSync(readFileSync(file)).toString('base64') };
  }
}
walk('dist'); mkdirSync('dist-worker', { recursive: true });
writeFileSync('dist-worker/assets.js', `export default ${JSON.stringify(assets)};`);
writeFileSync('dist-worker/entry.js', `import worker from '../worker/index.ts';
export { ArRefreshWorkflow } from '../worker/refresh/workflow.ts';
import assets from './assets.js';
export default { scheduled:worker.scheduled, async fetch(request, env) {
 const ASSETS={async fetch(req) {
  const url=new URL(req.url); const asset=assets[url.pathname] ?? (url.pathname.startsWith('/assets/') ? null : assets['/index.html']);
  if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.data),x=>x.charCodeAt(0));
  const body=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  // Google Picker validates the restricted browser key against the app origin.
  // Cross-origin requests must identify that origin without exposing paths or queries.
  return new Response(req.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'}});
 }}; return worker.fetch(request,{...env,ASSETS});
}};`);
await build({entryPoints:['dist-worker/entry.js'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],outfile:'dist-worker/deploy.js',minify:true});
console.log(`Prepared ${Object.keys(assets).length} public assets for connector deployment.`);
