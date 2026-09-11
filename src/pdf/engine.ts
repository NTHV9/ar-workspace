import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import type { DetectedText, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument, PdfExportFile } from './types';
import { deliveryGroups, wrapText } from './model';
import { mapSourceRect, mapSourceTextRect } from './row-layout';
import { extractSourceText, extractSourceImages } from './source-extraction';
import { drawSourceText, releaseSourceStyles, validateSourceText, sourceStyle, measureLayerText } from './source-text';
import { pageCanvasHeight, sourceFragments, paginateFlow, type FlowSheet, type SourceFragment } from './flow';
GlobalWorkerOptions.workerSrc = workerUrl;
const documentScopes = new WeakMap<Map<string, PDFDocumentProxy>, string>();

export async function loadSources(sources: PdfSourceDocument[]): Promise<{ documents: Map<string, PDFDocumentProxy>; project: PdfProject; dispose: () => void }> {
  const documents = new Map<string, PDFDocumentProxy>();
  const scope = crypto.randomUUID(); documentScopes.set(documents, scope);
  const tasks: { destroy: () => Promise<void> }[] = [];
  const pages: PdfProjectPage[] = [];
  try {
    for (const source of sources) {
      if (documents.has(source.id)) throw new Error('Duplicate document identity. Reopen this job.');
      const task = getDocument({ data: source.bytes.slice(), fontExtraProperties: true }); tasks.push(task); const doc = await task.promise;
      documents.set(source.id, doc);
      for (let n = 1; n <= doc.numPages; n++) {
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        pages.push({ id: `${source.id}:${n}`, sourceId: source.id, sourcePage: n, width: viewport.width, height: viewport.height, layers: [] });
      }
    }
    return { documents, dispose: () => { releaseSourceStyles(scope); for (const task of tasks) void task.destroy(); }, project: { version: 1, pages, content: sources.some(s => s.kind === 'statement') ? (sources.some(s => s.kind === 'invoice') ? 'both' : 'statement') : 'invoices', delivery: 'combined' } };
  } catch (error) { for (const task of tasks) void task.destroy(); throw error; }
}

export async function detectText(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>): Promise<DetectedText[]> {
  if (!page.sourcePage) return [];
  const pdfPage = await documents.get(page.sourceId)!.getPage(page.sourcePage);
  return extractSourceText(page, pdfPage, documentScopes.get(documents) ?? 'unregistered');
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: PdfLayer, page: PdfProjectPage) {
  validateSourceText(layer);
  ctx.save();
  try {
  const mask = layer.original && layer.maskOriginal !== false ? mapSourceTextRect(layer.original, page.rowEdits ?? [], sourceStyle(layer)?.baseline) : null;
  if (mask) { const o = mask; ctx.fillStyle = layer.fill; ctx.fillRect(o.x - 1, o.y - 1, o.width + 2, o.height + 2); }
  const { x, y, width, height } = layer;
  if (['shape', 'whiteout', 'note', 'stamp'].includes(layer.kind)) {
    ctx.fillStyle = layer.fill; ctx.fillRect(x, y, width, height);
    if (layer.kind === 'shape' || layer.kind === 'stamp') { ctx.strokeStyle = layer.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2); }
  }
  if (layer.kind === 'image' && layer.image) {
    const img = new Image(); img.src = layer.image; await img.decode(); ctx.drawImage(img, x, y, width, height);
  } else if (!['shape', 'whiteout'].includes(layer.kind)) {
    if (drawSourceText(ctx, layer)) return;
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.font = `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${layer.fontSize}px ${layer.font}`;
    ctx.fillStyle = layer.color; ctx.textBaseline = 'top';
    wrapText(layer.text, Math.max(width - 6, 1), text => ctx.measureText(text).width).forEach((line, n) => ctx.fillText(line, x + 3, y + 2 + n * layer.fontSize * 1.25));
  }
  } finally { ctx.restore(); }
}

export type RenderIssue={layerId:string;message:string};
export type RenderOptions={tolerant?:boolean};
async function bindLayers(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>,tolerant=false){
 const issues:RenderIssue[]=[],valid:PdfLayer[]=[];
 const runs=page.layers.some(l=>l.sourceText)?await detectText(page,documents):[];
 for(const layer of page.layers){try{
  if(layer.sourceText){
   const run=runs.find(r=>r.sourceText?.runIndex===layer.sourceText?.runIndex);
   if(layer.sourceText.sourceId!==page.sourceId||layer.sourceText.sourcePage!==page.sourcePage||!run||!layer.original||run.text!==layer.original.text||Math.abs(run.x-layer.original.x)>.01||Math.abs(run.y-layer.original.y)>.01)throw Error('Source text no longer matches this document. Reopen the original.');
   layer.sourceText={...run.sourceText!};
  }
  validateSourceText(layer);
  if(!layer.sourceText&&['text','replacement','note','stamp'].includes(layer.kind)&&layer.text){const metrics=measureLayerText(layer);if(metrics.height>layer.height+.5||metrics.width>layer.width+.5)throw Error('The edited text exceeds its box. Enlarge the text box before Preview.');}
  if(layer.original&&layer.maskOriginal!==false&&!mapSourceTextRect(layer.original,page.rowEdits??[],sourceStyle(layer)?.baseline))throw Error('The original text area was removed or split. Restore the row or discard this edit.');
  valid.push(layer);
 }catch(error){if(!tolerant)throw error;issues.push({layerId:layer.id,message:error instanceof Error?error.message:'This edit could not be rendered.'});}}
 return {valid,issues};
}
async function sourceRaster(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>,scale:number){
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(page.width*scale);canvas.height=Math.ceil(page.height*scale);
 const ctx=canvas.getContext('2d',{alpha:false})!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 if(page.sourcePage){const source=await documents.get(page.sourceId)!.getPage(page.sourcePage);await source.render({canvas,canvasContext:ctx,viewport:source.getViewport({scale}),background:'#ffffff'}).promise;}
 return canvas;
}
function continuedRules(page:PdfProjectPage,source:HTMLCanvasElement,scale:number):SourceFragment[]{
 const result:SourceFragment[]=[],edits=page.rowEdits??[],ctx=source.getContext('2d')!,radius=Math.max(1,Math.ceil(scale*2));
 for(const [index,edit] of edits.entries()){
  if(edit.kind!=='insert')continue;
  const before=sourceFragments({...page,rowEdits:edits.slice(0,index)}),rules:SourceFragment[]=[];
  for(const f of before){
   if(f.y>edit.y-2||f.y+f.height<edit.y+2)continue;
   const sx=Math.max(0,Math.round(f.sx*scale)),sy=Math.round((f.sy+edit.y-f.y)*scale),w=Math.min(source.width-sx,Math.round(f.width*scale));
   if(w<1||sy-radius<0||sy+radius>=source.height)continue;
   const pixels=ctx.getImageData(sx,sy-radius,w,radius*2+1).data;
   const colorAt=(x:number,y:number)=>{const i=(y*w+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
   let start=-1;
   for(let x=0;x<=w;x++){
    const color=x<w?colorAt(x,radius):[255,255,255];
    const continuous=x<w&&Math.min(...color)<220&&Array.from({length:radius*2+1},(_,n)=>colorAt(x,n)).every(c=>Math.min(...c)<235&&c.every((v,i)=>Math.abs(v-color[i])<35));
    if(continuous&&start<0)start=x;
    if(!continuous&&start>=0){if(x-start<=Math.ceil(scale*3)){for(let col=start;col<x;col++)rules.push({x:f.x+col/scale,y:edit.y,width:1/scale,height:edit.height,sx:0,sy:0,fill:`rgb(${colorAt(col,radius).join(',')})`});}start=-1;}
   }
  }
  result.push(...sourceFragments({...page,rowEdits:edits.slice(index+1)},rules));
 }
 return result;
}
function paintedExtent(page:PdfProjectPage,source:HTMLCanvasElement,scale:number,layers:PdfLayer[]){
 const pixels=source.getContext('2d')!.getImageData(0,0,source.width,source.height).data;
 let bottom=Math.max(page.height,...layers.map(l=>l.y+l.height));
 for(const f of sourceFragments(page)){
  if(f.y+f.height<=bottom)continue;
  const left=Math.max(0,Math.floor(f.sx*scale)),right=Math.min(source.width,Math.ceil((f.sx+f.width)*scale));
  outer:for(let y=Math.min(source.height-1,Math.ceil((f.sy+f.height)*scale)-1);y>=Math.max(0,Math.floor(f.sy*scale));y--){
   if(f.y+(y+1)/scale-f.sy<=bottom)break;
   for(let x=left;x<right;x++){const i=(y*source.width+x)*4;if(pixels[i]<254||pixels[i+1]<254||pixels[i+2]<254){bottom=Math.max(bottom,f.y+(y+1)/scale-f.sy);break outer;}}
  }
 }
 for(const rule of continuedRules(page,source,scale))bottom=Math.max(bottom,rule.y+rule.height);
 return bottom;
}
async function paintSheet(page:PdfProjectPage,source:HTMLCanvasElement,canvas:HTMLCanvasElement,scale:number,sourceScale:number,sheet:FlowSheet,layers:PdfLayer[],tolerant:boolean,issues:RenderIssue[],physicalHeight=sheet.height){
 canvas.width=Math.ceil(page.width*scale);canvas.height=Math.ceil(physicalHeight*scale);
 const ctx=canvas.getContext('2d',{alpha:false})!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.save();ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,page.width,sheet.height);ctx.clip();ctx.translate(0,-sheet.top);
 for(const f of sourceFragments(page)){
  const top=Math.max(f.y,sheet.top),bottom=Math.min(f.y+f.height,sheet.top+sheet.height);if(bottom<=top)continue;
  ctx.drawImage(source,f.sx*sourceScale,(f.sy+top-f.y)*sourceScale,f.width*sourceScale,(bottom-top)*sourceScale,f.x,top,f.width,bottom-top);
 }
 for(const rule of continuedRules(page,source,sourceScale)){ctx.fillStyle=rule.fill!;ctx.fillRect(rule.x,rule.y,rule.width,rule.height);}
 for(const layer of layers){
  // Each layer is validated before its original pixels are covered.
  try{await drawLayer(ctx,layer,page);}catch(error){if(!tolerant)throw error;issues.push({layerId:layer.id,message:error instanceof Error?error.message:'This edit could not be rendered.'});}
 }
 ctx.restore();
}
export async function renderPage(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>, canvas: HTMLCanvasElement, scale = 1.5, options:RenderOptions={}) {
 const height=pageCanvasHeight(page);scale=Math.min(scale,Math.sqrt(20_000_000/(page.width*height)));
 const {valid,issues}=await bindLayers(page,documents,options.tolerant);
 const source=await sourceRaster(page,documents,scale);
 try{await paintSheet(page,source,canvas,scale,scale,{top:0,height},valid,!!options.tolerant,issues);}finally{source.width=source.height=0;}
 return {issues};
}

export async function exportProject(project: PdfProject, sources: PdfSourceDocument[], documents: Map<string, PDFDocumentProxy>): Promise<PdfExportFile[]> {
  const groups = deliveryGroups(project, sources);
  if (!groups.length) throw new Error('No pages selected for export.');
  const native = new Map<string, PDFDocument>();
  const files: PdfExportFile[] = [];
  for (const [index, group] of groups.entries()) {
    const output = await PDFDocument.create();
    for (const page of group.pages) {
      if (page.layers.length || page.rowEdits?.length || page.sourcePage === null) {
        // Only a new opaque bitmap is copied into edited pages. No source streams,
        // hidden OCR/text, annotations or attachments are retained on those pages.
        const {valid}=await bindLayers(page,documents);
        const runs=await detectText(page,documents);
        const images=page.sourcePage?await extractSourceImages(await documents.get(page.sourceId)!.getPage(page.sourcePage)):[];
        const protectedAreas=[...images.flatMap(r=>{const mapped=mapSourceRect(r,page.rowEdits??[]);return mapped?[mapped]:[];}),...runs.flatMap(r=>{const mapped=mapSourceTextRect(r,page.rowEdits??[]);return mapped?[mapped]:[];}),...valid.flatMap(l=>l.kind==='image'?[l]:measureLayerText(l).lines.map((_,n)=>({y:l.y+n*l.fontSize*1.25,height:l.fontSize*1.25})))];
        const scale=Math.min(300/72,Math.sqrt(20_000_000/(page.width*page.height)));
        const source=await sourceRaster(page,documents,scale),canvas=document.createElement('canvas');
        const sheets=paginateFlow({...page,rowEdits:[],flowHeight:paintedExtent(page,source,scale,valid)},protectedAreas);
        try{for(const sheet of sheets){
          await paintSheet(page,source,canvas,scale,scale,sheet,valid,false,[],page.height);
          const png=await output.embedPng(canvas.toDataURL('image/png'));
          output.addPage([page.width,page.height]).drawImage(png,{x:0,y:0,width:page.width,height:page.height});
        }}finally{source.width=source.height=canvas.width=canvas.height=0;}

      } else {
        if (!native.has(page.sourceId)) native.set(page.sourceId, await PDFDocument.load(sources.find(s => s.id === page.sourceId)!.bytes));
        const [copy] = await output.copyPages(native.get(page.sourceId)!, [page.sourcePage - 1]); output.addPage(copy);
      }
    }
    files.push({ name: `${String(index + 1).padStart(2, '0')}-${group.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100)}.pdf`, bytes: await output.save() });
  }
  return files;
}
