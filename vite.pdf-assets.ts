import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import type {Plugin} from 'vite';

/** Ship decoders with the exact installed worker, with no CDN dependency. */
export function pdfDecoderAssets():Plugin {
 const root=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
 const {version}=JSON.parse(readFileSync(join(root,'package.json'),'utf8')) as {version:string};
 const prefix=`pdfjs/${version}/wasm/`;
 const files=readdirSync(join(root,'wasm'));
 return {name:'pdf-decoder-assets',
  configureServer(server){server.middlewares.use((req,res,next)=>{
   const path=(req.url??'').split('?')[0];
   if(!path.startsWith('/'+prefix))return next();
   const name=path.slice(prefix.length+1);if(!files.includes(name)){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'text/javascript':'text/plain');
   res.end(readFileSync(join(root,'wasm',name)));
  });},
  generateBundle(){for(const name of files)this.emitFile({type:'asset',fileName:prefix+name,source:readFileSync(join(root,'wasm',name))});}
 };
}
