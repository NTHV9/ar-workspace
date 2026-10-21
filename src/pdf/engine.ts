import {nativeTextCandidate} from './native/candidate';
import {sourceMaskFill} from './mask-background';
import type {NativeResult} from './native/protocol';
import {validateInvoiceAttachments} from './invoice-attachments';
import {readVoucherFields} from './voucher-metadata';
import {voucherRuns,type VoucherBindings} from './linked-vouchers';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {loadPdf,renderPdfPage} from './pdfjs';
import { PDFDocument } from 'pdf-lib';
import type { DetectedText, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument, PdfExportFile } from './types';
import { deliveryGroups, wrapText } from './model';
import {deliveryFilenames} from './filenames';
import { mapSourceRect, mapSourceTextRect } from './row-layout';
import { extractSourceText, extractSourceImages } from './source-extraction';
import { createReplacementLayer, drawSourceText, releaseSourceStyles, validateSourceText, sourceStyle, sourceAppearanceUnchanged, measureLayerText, measureLayerInk, SourceFontError } from './source-text';
import { pageCanvasHeight, sourceFragments, paginateFlow, type FlowSheet, type SourceFragment } from './flow';
import { replacementForRun, validateDeletedLayer } from './source-edits';
type SourceScope={id:string;unsupportedPages:Set<string>;vouchers:VoucherBindings;sources:PdfSourceDocument[];cache:Map<string,Promise<NativeResult|undefined>>;closed:boolean;abort:AbortController;text:Map<string,Promise<DetectedText[]>>;backgrounds:Map<string,Promise<{canvas:HTMLCanvasElement;scale:number}>>};
const sourceContexts=new WeakMap<PDFDocumentProxy,SourceScope>();
export const voucherBindings=(documents:Map<string,PDFDocumentProxy>)=>new Map([...documents.values()].flatMap(doc=>[...(sourceContexts.get(doc)?.vouchers??new Map())]));
function sourceScope(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>){const doc=documents.get(page.sourceId);return doc?sourceContexts.get(doc):undefined;}
async function candidateFor(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>){
 const scope=sourceScope(page,documents),bytes=scope?.sources.find(s=>s.id===page.sourceId)?.bytes;
 if(!scope||scope.closed||!bytes)return undefined;
 const pageKey=`${page.sourceId}:${page.sourcePage}`;if(scope.unsupportedPages.has(pageKey))return undefined;
 // Register source styles from original bytes before qualifying any candidate.
 if(page.layers.some(l=>l.sourceText))await detectText(page,documents);
 const key=JSON.stringify([page.id,page.layers,page.rowEdits]);let pending=scope.cache.get(key);
 if(!pending){if(scope.cache.size>=3)scope.cache.delete(scope.cache.keys().next().value!);pending=nativeTextCandidate(bytes,page,scope.abort.signal);scope.cache.set(key,pending);}
 const result=await pending;if(!result&&scope.cache.get(key)===pending)scope.cache.delete(key);if(result?.unsupportedPage){scope.unsupportedPages.add(pageKey);return undefined;}return scope.closed?undefined:result;
}
const documentScopes = new WeakMap<Map<string, PDFDocumentProxy>, string>();

export async function loadSources(sources: PdfSourceDocument[]): Promise<{ documents: Map<string, PDFDocumentProxy>; project: PdfProject; dispose: () => void }> {
  const documents = new Map<string, PDFDocumentProxy>();const vouchers:VoucherBindings=new Map();
  const scope = crypto.randomUUID(); documentScopes.set(documents, scope);
  const nativeScope:SourceScope={id:scope,unsupportedPages:new Set<string>(),vouchers,sources,cache:new Map<string,Promise<NativeResult|undefined>>(),closed:false,abort:new AbortController(),text:new Map<string,Promise<DetectedText[]>>(),backgrounds:new Map<string,Promise<{canvas:HTMLCanvasElement;scale:number}>>()};
  const tasks: { destroy: () => Promise<void> }[] = [];
  const pages: PdfProjectPage[] = [];
  try {
    for (const source of sources) {
      if (documents.has(source.id)) throw new Error('Duplicate document identity. Reopen this job.');
      const task = loadPdf(source.bytes.slice(),{fontExtraProperties:true}); tasks.push(task); const doc = await task.promise;
      documents.set(source.id, doc);sourceContexts.set(doc,nativeScope);const metadata=await PDFDocument.load(source.bytes).catch(()=>null);
      for (let n = 1; n <= doc.numPages; n++) {
        const fields=(metadata&&source.kind!=='attachment'?readVoucherFields(metadata.getPage(n-1)):[]).filter(f=>(!source.invoiceId||f.invoiceId===source.invoiceId)&&(!source.invoiceIds||source.invoiceIds.includes(f.invoiceId)));vouchers.set(`${source.id}:${n}`,fields);
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        pages.push({ id: `${source.id}:${n}`, sourceId: source.id, sourcePage: n, width: viewport.width, height: viewport.height, layers: [] });
      }
    }
    return { documents, dispose: () => { nativeScope.closed=true;nativeScope.abort.abort();nativeScope.cache.clear();nativeScope.text.clear();for(const pending of nativeScope.backgrounds.values())void pending.then(({canvas})=>{canvas.width=canvas.height=0;});nativeScope.backgrounds.clear();releaseSourceStyles(scope); for (const task of tasks) void task.destroy(); }, project: { version: 1, pages, content: sources.some(s => s.kind === 'statement') ? (sources.some(s => s.kind === 'invoice') ? 'both' : 'statement') : 'invoices', delivery: 'combined' } };
  } catch (error) { for (const task of tasks) void task.destroy(); throw error; }
}

export async function detectText(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>): Promise<DetectedText[]> {
  if (!page.sourcePage) return [];
  const scope=sourceScope(page,documents),key=`${page.sourceId}:${page.sourcePage}`;
  let pending=scope?.text.get(key);
  if(!pending){pending=(async()=>{const pdfPage=await documents.get(page.sourceId)!.getPage(page.sourcePage!);return voucherRuns(await extractSourceText(page,pdfPage,scope?.id??documentScopes.get(documents)??'unregistered'),voucherBindings(documents).get(key)??[]);})();scope?.text.set(key,pending);}
  try{return await pending;}catch(error){scope?.text.delete(key);throw error;}
}

type TextMask={x:number;y:number;width:number;height:number;sourceX:number;sourceY:number;sourceHeight?:number;sourceLayer?:PdfLayer};
async function drawLayer(ctx: CanvasRenderingContext2D, layer: PdfLayer, mask?:TextMask) {
  validateDeletedLayer(layer);
  if (!layer.deleted) validateSourceText(layer);
  ctx.save();
  try {
  if (mask) { ctx.fillStyle = layer.fill; ctx.fillRect(mask.x,mask.y,mask.width,mask.height); }
  if (layer.deleted) return;
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
export class PdfLayerEditError extends Error {
 readonly kind:'source-font'|'layer';
 constructor(readonly pageId:string,readonly layerId:string,error:unknown){
  super(error instanceof Error?error.message:'This edit could not be rendered.');this.name='PdfLayerEditError';
  this.kind=error instanceof SourceFontError?'source-font':'layer';
 }
}
function rebindSourceLayer(page:PdfProjectPage,layer:PdfLayer,runs:DetectedText[]){
 validateDeletedLayer(layer);
 if(layer.formField&&!runs.some(run=>run.field===layer.formField!.type&&run.sourceText?.runIndex===layer.formField!.runIndex))throw Error('Document field no longer matches this source. Reopen the original.');
 if(!layer.sourceText&&!layer.deleted)return undefined;
 const ref=layer.sourceText;
 const run=ref?runs.find(r=>r.sourceText?.runIndex===ref.runIndex):runs.find(r=>layer.original&&r.text===layer.original.text&&Math.abs(r.x-layer.original.x)<.01&&Math.abs(r.y-layer.original.y)<.01);
 if(ref&&(ref.sourceId!==page.sourceId||ref.sourcePage!==page.sourcePage)||!run||!layer.original||run.text!==layer.original.text||Math.abs(run.x-layer.original.x)>.01||Math.abs(run.y-layer.original.y)>.01)throw Error('Source text no longer matches this document. Reopen the original.');
 if(run.sourceText)layer.sourceText={...run.sourceText};return run;
}
/** Rebind only source identity/fonts; unfinished geometry remains editable. */
export async function rebindProjectSources(project:PdfProject,documents:Map<string,PDFDocumentProxy>){
 for(const page of project.pages){
  if(!page.layers.some(l=>l.sourceText||l.deleted||l.formField))continue;
  const runs=await detectText(page,documents);for(const layer of page.layers)rebindSourceLayer(page,layer,runs);
 }
}
async function bindLayers(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>,tolerant=false,applied:ReadonlySet<string>=new Set()){
 const issues:RenderIssue[]=[],valid:PdfLayer[]=[],masks=new Map<string,TextMask>();
 const runs=page.layers.some(l=>l.original||l.sourceText||l.deleted!==undefined||l.formField)?await detectText(page,documents):[];
 for(const layer of page.layers){try{
  const run=rebindSourceLayer(page,layer,runs);
  if(layer.sourceText||layer.deleted){
   if(!run)throw Error('Source text could not be restored.');
   const alreadyReplaced=valid.some(previous=>replacementForRun({...page,layers:[previous]},run));
   if(!alreadyReplaced&&sourceAppearanceUnchanged(layer,run,mapSourceTextRect(run,page.rowEdits??[],sourceStyle(layer)?.baseline)))continue;
  }
  if(!layer.deleted)validateSourceText(layer);
  if(!layer.sourceText&&['text','replacement','note','stamp'].includes(layer.kind)&&layer.text){const metrics=measureLayerText(layer);if(metrics.height>layer.height+.5||metrics.width>layer.width+.5)throw Error('The edited text exceeds its box. Enlarge the text box before Preview.');}
  if(applied.has(layer.id))continue;
  if(layer.original&&layer.maskOriginal!==false){
   const original=layer.original,run=runs.find(r=>r.text===original.text&&Math.abs(r.x-original.x)<.01&&Math.abs(r.y-original.y)<.01);
   const native=run?createReplacementLayer(run,'mask'):undefined;
   const mapped=mapSourceTextRect(original,page.rowEdits??[],native?sourceStyle(native)?.baseline:sourceStyle(layer)?.baseline);
   if(!mapped)throw Error('The original text area was removed or split. Restore the row or discard this edit.');
   // Hit targets include font descent/padding. Mask only the original ink so
   // clearing or replacing a word cannot shave the next tightly spaced line.
   const ink=native&&sourceStyle(native)?.supported&&!measureLayerText(native).unsupported?measureLayerInk(native):{y:original.y-1,height:original.height+2};
   masks.set(layer.id,{x:mapped.x-1,y:mapped.y+ink.y-original.y,width:mapped.width+2,height:ink.height,sourceX:original.x-1,sourceY:ink.y,sourceHeight:ink.height,sourceLayer:native});
  }
  const mask=masks.get(layer.id);
  if(mask)for(const [index,edit] of (page.rowEdits??[]).entries())if(edit.kind==='move'&&edit.dy<0&&edit.id.startsWith(`rh:${layer.id}:`)){
   const destination=mapSourceRect({x:edit.x+edit.dx,y:edit.y+edit.dy,width:edit.width,height:edit.height},(page.rowEdits??[]).slice(index+1));
   if(!destination)throw Error('The header spacing changed after this edit. Restore the field before moving it again.');
   if(destination.x<=mask.x&&destination.x+destination.width>=mask.x+mask.width&&destination.y>mask.y&&destination.y<mask.y+mask.height)mask.height=destination.y-mask.y;
  }
  valid.push(layer);
 }catch(error){if(!tolerant)throw new PdfLayerEditError(page.id,layer.id,error);issues.push({layerId:layer.id,message:error instanceof Error?error.message:'This edit could not be rendered.'});}}
 return {valid,issues,masks};
}
async function sourceRaster(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>,scale:number,candidate?:NativeResult,inspection=false){
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(page.width*scale);canvas.height=Math.ceil(page.height*scale);
 const ctx=canvas.getContext('2d',{alpha:inspection})!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
 if(page.sourcePage){const task=candidate?loadPdf(candidate.bytes.slice(),{fontExtraProperties:true}):undefined;try{const doc=task?await task.promise:documents.get(page.sourceId)!;const source=await doc.getPage(page.sourcePage);await renderPdfPage(source,{canvas,canvasContext:ctx,viewport:source.getViewport({scale}),background:'#ffffff'}).promise;}finally{if(task)await task.destroy();}}
 return canvas;
}
async function maskInspection(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>){
 const scope=sourceScope(page,documents),key=`${page.sourceId}:${page.sourcePage}`;
 let pending=scope?.backgrounds.get(key);
 if(!pending){const scale=Math.min(1.5,Math.sqrt(4_000_000/(page.width*page.height)));pending=sourceRaster(page,documents,scale,undefined,true).then(canvas=>({canvas,scale}));
  // Keep at most two immutable inspection canvases. Evicted pending canvases
  // remain owned by their current render and can be reclaimed after that call.
  if(scope&&scope.backgrounds.size>=2)scope.backgrounds.delete(scope.backgrounds.keys().next().value!);scope?.backgrounds.set(key,pending);
 }
 return pending;
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
function hasLayerInk(layer:PdfLayer){
 return !layer.deleted&&(['image','shape','whiteout','note','stamp'].includes(layer.kind)||!!layer.text.trim());
}
function paintedExtent(page:PdfProjectPage,source:HTMLCanvasElement,scale:number,layers:PdfLayer[],textMasks:Map<string,TextMask>){
 const pixels=source.getContext('2d')!.getImageData(0,0,source.width,source.height).data;
 const masks=[...textMasks.values()];
 let bottom=Math.max(page.height,...layers.filter(hasLayerInk).map(l=>l.y+l.height));
 for(const f of sourceFragments(page)){
  if(f.y+f.height<=bottom)continue;
  const left=Math.max(0,Math.floor(f.sx*scale)),right=Math.min(source.width,Math.ceil((f.sx+f.width)*scale));
  outer:for(let y=Math.min(source.height-1,Math.ceil((f.sy+f.height)*scale)-1);y>=Math.max(0,Math.floor(f.sy*scale));y--){
   if(f.y+(y+1)/scale-f.sy<=bottom)break;
   const mappedY=f.y+(y+.5)/scale-f.sy;
   const lineMasks=masks.filter(mask=>mappedY>=mask.y&&mappedY<mask.y+mask.height);
   for(let x=left;x<right;x++){const i=(y*source.width+x)*4;if(pixels[i]<254||pixels[i+1]<254||pixels[i+2]<254){
    const mappedX=f.x+(x+.5)/scale-f.sx;
    if(lineMasks.some(mask=>mappedX>=mask.x&&mappedX<mask.x+mask.width))continue;
    bottom=Math.max(bottom,f.y+(y+1)/scale-f.sy);break outer;
   }}
  }
 }
 for(const rule of continuedRules(page,source,scale))bottom=Math.max(bottom,rule.y+rule.height);
 return bottom;
}
async function paintSheet(page:PdfProjectPage,source:HTMLCanvasElement,canvas:HTMLCanvasElement,scale:number,sourceScale:number,sheet:FlowSheet,layers:PdfLayer[],masks:Map<string,TextMask>,tolerant:boolean,issues:RenderIssue[],physicalHeight=sheet.height,inspection?:{canvas:HTMLCanvasElement;scale:number}){
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
  try{const mask=masks.get(layer.id);const fill=mask?sourceMaskFill(inspection?.canvas??source,inspection?.scale??sourceScale,layer,mask):layer.fill;await drawLayer(ctx,{...layer,fill},mask);}catch(error){if(!tolerant)throw new PdfLayerEditError(page.id,layer.id,error);issues.push({layerId:layer.id,message:error instanceof Error?error.message:'This edit could not be rendered.'});}
 }
 ctx.restore();
}
export async function renderPage(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>, canvas: HTMLCanvasElement, scale = 1.5, options:RenderOptions={}) {
 const height=pageCanvasHeight(page);scale=Math.min(scale,Math.sqrt(20_000_000/(page.width*height)));
 const candidate=await candidateFor(page,documents);
 const {valid,issues,masks}=await bindLayers(page,documents,options.tolerant,new Set(candidate?.applied));
 const source=await sourceRaster(page,documents,scale,candidate),inspection=masks.size?await maskInspection(page,documents):undefined;
 try{await paintSheet(page,source,canvas,scale,scale,{top:0,height},valid,masks,!!options.tolerant,issues,height,inspection);}finally{source.width=source.height=0;}
 return {issues,scale};
}

export async function exportProject(project: PdfProject, sources: PdfSourceDocument[], documents: Map<string, PDFDocumentProxy>): Promise<PdfExportFile[]> {
  validateInvoiceAttachments(project,sources,true);
  const groups = deliveryGroups(project, sources);
  const filenames=deliveryFilenames(project,groups);
  if (!groups.length) throw new Error('No pages selected for export.');
  const native = new Map<string, PDFDocument>();
  const files: PdfExportFile[] = [];
  for (const [index, group] of groups.entries()) {
    const output = await PDFDocument.create();
    for (const page of group.pages) {
      const candidate=await candidateFor(page,documents);
      const {valid,masks}=await bindLayers(page,documents,false,new Set(candidate?.applied));
      if (valid.some(layer=>hasLayerInk(layer)||!!layer.original&&layer.maskOriginal!==false) || page.rowEdits?.length || page.sourcePage === null) {
        // Only a new opaque bitmap is copied into edited pages. No source streams,
        // hidden OCR/text, annotations or attachments are retained on those pages.
        const runs=await detectText(page,documents);
        const images=page.sourcePage?await extractSourceImages(await documents.get(page.sourceId)!.getPage(page.sourcePage)):[];
        const renderedIds=new Set(valid.map(l=>l.id));
        const protectedAreas=[...images.flatMap(r=>{const mapped=mapSourceRect(r,page.rowEdits??[]);return mapped?[mapped]:[];}),...runs.flatMap(r=>{const replacement=replacementForRun(page,r);if(replacement&&renderedIds.has(replacement.id))return [];const mapped=mapSourceTextRect(r,page.rowEdits??[]);return mapped?[mapped]:[];}),...valid.flatMap(l=>!hasLayerInk(l)?[]:['image','shape','whiteout','note','stamp'].includes(l.kind)?[l]:measureLayerText(l).lines.flatMap((line,n)=>line.trim()?[{y:l.y+n*l.fontSize*1.25,height:l.fontSize*1.25}]:[]))];
        const scale=Math.min(300/72,Math.sqrt(20_000_000/(page.width*page.height)));
        const source=await sourceRaster(page,documents,scale,candidate),canvas=document.createElement('canvas'),inspection=masks.size?await maskInspection(page,documents):undefined;
        const sheets=paginateFlow({...page,rowEdits:[],flowHeight:paintedExtent(page,source,scale,valid,masks)},protectedAreas);
        try{for(const sheet of sheets){
          await paintSheet(page,source,canvas,scale,scale,sheet,valid,masks,false,[],page.height,inspection);
          const png=await output.embedPng(canvas.toDataURL('image/png'));
          output.addPage([page.width,page.height]).drawImage(png,{x:0,y:0,width:page.width,height:page.height});
        }}finally{source.width=source.height=canvas.width=canvas.height=0;}

      } else {
        if (!candidate&&!native.has(page.sourceId)) native.set(page.sourceId, await PDFDocument.load(sources.find(s => s.id === page.sourceId)!.bytes));
        const input=candidate?await PDFDocument.load(candidate.bytes):native.get(page.sourceId)!;
        const [copy] = await output.copyPages(input, [page.sourcePage - 1]); output.addPage(copy);
      }
    }
    files.push({ name: filenames[index], bytes: await output.save() });
  }
  return files;
}
