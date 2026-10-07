import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {pdfDecoderAssets} from './vite.pdf-assets.ts';
export default defineConfig({
  plugins: [react(),pdfDecoderAssets()],
  server: { watch: { ignored: ['**/private/**', '**/.cache/**'] } },
  build: { sourcemap: false },
});
