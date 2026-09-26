import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {readdirSync} from 'node:fs';
// Build synthetic harnesses separately; they never enter the deployment bundle.
const pages=readdirSync('tests/browser',{recursive:true}).filter(p=>String(p).endsWith('.html')).map(p=>resolve('tests/browser',String(p)));
export default defineConfig({plugins:[react()],build:{outDir:'.tmp/browser-site',rolldownOptions:{input:[resolve('index.html'),...pages]}}});
