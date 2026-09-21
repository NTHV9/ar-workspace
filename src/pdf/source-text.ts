import { wrapText } from './model';
import type { DetectedText, PdfLayer } from './types';

export type SourceTextReference = { sourceId: string; sourcePage: number; runIndex: number; scope?: string };
export type SourceGlyph = { unicode: string; fontChar: string; width: number; isSpace?: boolean; isInFont?: boolean; accent?: unknown; fallbackFont?:string };
export type SourceStyle = { font: string; fontSize: number; bold: boolean; italic: boolean; color: string; baseline: number; hScale: number; charSpacing: number; wordSpacing: number; glyphs: Map<string, SourceGlyph>; sequence: (SourceGlyph | number)[]; supported: boolean; run: DetectedText };
export class SourceFontError extends Error {
 constructor(){super('This source font cannot reproduce the edited characters. Choose a replacement font in formatting, or use characters available in the source document.');this.name='SourceFontError';}
}
const styles = new Map<string, SourceStyle>();
const inkBounds=new WeakMap<SourceStyle,Map<string,{y:number;height:number}>>();
let inkContext:CanvasRenderingContext2D|null=null;
const key = (r: SourceTextReference) => JSON.stringify([r.scope,r.sourceId,r.sourcePage,r.runIndex]);
export function releaseSourceStyles(scope: string) { for(const [k,s] of styles) if(s.run.sourceText?.scope===scope)styles.delete(k); }
export function registerSourceStyle(ref: SourceTextReference, style: SourceStyle) { styles.set(key(ref), style); }
export function sourceStyle(layer: PdfLayer): SourceStyle | undefined {
 const s=layer.sourceText && styles.get(key(layer.sourceText));
 return s && layer.original && s.run.text===layer.original.text && Math.abs(s.run.x-layer.original.x)<.01 && Math.abs(s.run.y-layer.original.y)<.01 ? s : undefined;
}
export function createReplacementLayer(run: DetectedText,id: string): PdfLayer {
  return {id,kind:'replacement',x:run.x,y:run.y,width:run.width,height:run.height,text:run.text,color:run.color??'#000000',fill:'#ffffff',font:'Arial',fontSize:run.fontSize,bold:run.bold??false,italic:run.italic??false,original:{text:run.text,x:run.x,y:run.y,width:run.width,height:run.height},...(run.sourceText?{sourceText:{...run.sourceText}}:{}),...(run.maskOriginal===false?{maskOriginal:false}:{})};
}
/** Merely selecting unchanged native text must not require re-drawing its font. */
export function sourceAppearanceUnchanged(layer:PdfLayer,run:DetectedText,position:{x:number;y:number}|null):boolean{
 const original=layer.original,ref=layer.sourceText,target=run.sourceText;
 return layer.kind==='replacement'&&!!original&&!!ref&&!!target&&!!position&&!layer.deleted&&layer.maskOriginal!==false
  &&ref.sourceId===target.sourceId&&ref.sourcePage===target.sourcePage&&ref.runIndex===target.runIndex
  &&original.text===run.text&&Math.abs(original.x-run.x)<.01&&Math.abs(original.y-run.y)<.01
  &&layer.text===run.text&&Math.abs(layer.x-position.x)<.01&&Math.abs(layer.y-position.y)<.01
  &&Math.abs(layer.fontSize-run.fontSize)<.01&&layer.bold===!!run.bold&&layer.italic===!!run.italic
  &&layer.color.toLowerCase()===(run.color??'#000000').toLowerCase()&&layer.fill.toLowerCase()==='#ffffff'&&layer.width>=run.width-.01&&layer.height>=run.height-.01;
}
export function sourceFont(layer: PdfLayer,s: SourceStyle) {
 // PDF.js already knows whether the loaded face requires synthetic weight/slant.
 const bold=layer.bold===s.run.bold?s.bold:layer.bold,italic=layer.italic===s.run.italic?s.italic:layer.italic;
 return `${italic?'italic':'normal'} ${bold?'bold':'normal'} ${layer.fontSize}px ${s.font}`;
}
export function sourceEditingStyle(layer:PdfLayer) {
 const s=sourceStyle(layer),label=s?.run.fontLabel??layer.font;
 // Unicode caret uses an allowlisted family; PDF glyphs are drawn on canvas.
 const fontFamily=/courier|mono/i.test(label)?'"Courier New", monospace':/times|georgia/i.test(label)?'Georgia, serif':'Arial, sans-serif';
 return {fontFamily,fontSize:layer.fontSize,fontWeight:layer.bold?'bold':'normal',fontStyle:layer.italic?'italic':'normal',lineHeight:1.25,baseline:s?s.baseline*layer.fontSize/s.fontSize:layer.fontSize*.85,hScale:s?.hScale??1};
}
export function validateSourceText(layer:PdfLayer) {
 if(!layer.sourceText||!layer.text.trim())return;
 const metrics=measureLayerText(layer);
 if(metrics.unsupported)throw new SourceFontError();
 if(metrics.height>layer.height+.5||metrics.width>layer.width+.5)throw new Error('The edited text exceeds its box. Enlarge the text box before Preview.');
}
function glyphWidth(g: SourceGlyph,s: SourceStyle,size: number) {return (g.width*size/1000+s.charSpacing+(g.isSpace?s.wordSpacing:0))*s.hScale;}
function wrapAtWords(text:string,width:number,measure:(line:string)=>number):string[]{
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){
  let line='';
  for(const token of paragraph.match(/\s+|\S+/gu)??[]){
   if(line&&measure(line+token)>width&&!/^\s+$/u.test(token)){lines.push(line);line='';}
   for(const char of Array.from(token)){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}
  }
  lines.push(line);
 }
 return lines;
}
export function measureLayerText(layer: PdfLayer): {lines:string[];height:number;width:number;naturalWidth:number;unsupported:boolean} {
 // Clearing text erases its source pixels; no font or glyph is drawn. Source
 // identity/mask ownership is still checked by the document render pipeline.
 if(!layer.text.trim())return {lines:[],height:0,width:0,naturalWidth:0,unsupported:false};
 const s=sourceStyle(layer);
 if(!layer.sourceText){
  const ctx=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  if(ctx)ctx.font=`${layer.italic?'italic ':''}${layer.bold?'bold ':''}${layer.fontSize}px ${layer.font}`;
  const measure=(text:string)=>ctx?ctx.measureText(text).width:text.length*layer.fontSize*.6;
  const lines=wrapText(layer.text,Math.max(layer.width-6,1),measure);
  return {lines,width:Math.max(0,...lines.map(measure))+6,naturalWidth:Math.max(0,...layer.text.split('\n').map(measure))+6,height:2+lines.length*layer.fontSize*1.25,unsupported:false};
 }
 const measure=(line:string)=>s?Array.from(line).reduce((w,c)=>w+(s.glyphs.has(c)?glyphWidth(s.glyphs.get(c)!,s,layer.fontSize):layer.fontSize*.6),0):line.length*layer.fontSize*.6;
 const naturalWidth=layer.text===s?.run.text?s.sequence.reduce<number>((w,g)=>w+(typeof g==='number'?-g*layer.fontSize/1000*s.hScale:glyphWidth(g,s,layer.fontSize)),0):Math.max(0,...layer.text.split('\n').map(measure));
 const lines=naturalWidth<=layer.width+.5?layer.text.split('\n'):wrapAtWords(layer.text,Math.max(layer.width,.1),measure);
 const widths=lines.map(measure);
 if(s && layer.text===s.run.text && lines.length===1)widths[0]=naturalWidth;
 return {lines,width:Math.max(0,...widths),naturalWidth,height:(s?s.baseline*layer.fontSize/s.fontSize:layer.fontSize*.85)+layer.fontSize*.3+(lines.length-1)*layer.fontSize*1.25,unsupported:!s||!s.supported||Array.from(layer.text.replace(/\n/g,'')).some(c=>!s.glyphs.has(c))};
}

/** Vertical painted bounds, rather than caret/descent padding, for row cuts.
 * Unknown source glyphs remain conservative; never guess their visible extent.
 */
export function measureLayerInk(layer:PdfLayer):{y:number;height:number}{
 const layout=measureLayerText(layer),s=sourceStyle(layer);
 const fallback={y:layer.y,height:layout.height};
 if(!layer.text||!s?.supported||layout.unsupported||typeof document==='undefined')return fallback;
 const cache=inkBounds.get(s)??new Map<string,{y:number;height:number}>(),cacheKey=JSON.stringify([layer.text,layer.fontSize,layer.bold,layer.italic]),cached=cache.get(cacheKey);
 if(cached)return {y:layer.y+cached.y,height:cached.height};
 const ctx=inkContext??=document.createElement('canvas').getContext('2d');if(!ctx)return fallback;
 let top=Infinity,bottom=-Infinity;
 for(const [n,line] of layout.lines.entries()){
  const sequence=layer.text===s.run.text&&layout.lines.length===1?s.sequence:Array.from(line).map(c=>s.glyphs.get(c)!);
  for(const glyph of sequence){
   if(typeof glyph==='number'||glyph.isInFont===false||glyph.isSpace)continue;
   // Measure at a larger size to avoid whole-pixel rounding in tiny invoice fonts.
   ctx.font=sourceFont({...layer,fontSize:layer.fontSize*10},glyph.fallbackFont?{...s,font:glyph.fallbackFont}:s);
   const metrics=ctx.measureText(glyph.fontChar),ascent=metrics.actualBoundingBoxAscent/10,descent=metrics.actualBoundingBoxDescent/10;
   if(!Number.isFinite(ascent+descent))return fallback;
   const baseline=layer.y+s.baseline*layer.fontSize/s.fontSize+n*layer.fontSize*1.25;
   top=Math.min(top,baseline-ascent);bottom=Math.max(bottom,baseline+descent);
  }
 }
 if(!Number.isFinite(top+bottom))return fallback;
 const result={y:top-.25,height:bottom-top+.5};
 if(cache.size>=32)cache.clear();cache.set(cacheKey,{y:result.y-layer.y,height:result.height});inkBounds.set(s,cache);return result;
}
export function drawSourceText(ctx: CanvasRenderingContext2D,layer: PdfLayer): boolean {
 if(!layer.sourceText)return false;
 if(!layer.text.trim())return true;
 validateSourceText(layer);const s=sourceStyle(layer)!;
 const metrics=measureLayerText(layer);
 if(metrics.height>layer.height+.5 || metrics.width>layer.width+.5)throw new Error('The edited text exceeds its box. Enlarge the text box before Preview.');
 ctx.font=sourceFont(layer,s);ctx.fillStyle=layer.color;ctx.textBaseline='alphabetic';
 for(const [n,line] of metrics.lines.entries()){
  let x=0; const sequence=layer.text===s.run.text&&metrics.lines.length===1?s.sequence:Array.from(line).map(c=>s.glyphs.get(c)!);
  for(const g of sequence){if(typeof g==='number'){x-=g*layer.fontSize/1000*s.hScale;continue;}
   ctx.save();if(g.fallbackFont)ctx.font=sourceFont(layer,{...s,font:g.fallbackFont});ctx.translate(layer.x+x,layer.y+s.baseline*layer.fontSize/s.fontSize+n*layer.fontSize*1.25);ctx.scale(s.hScale,1);if(g.isInFont!==false)ctx.fillText(g.fontChar,0,0);ctx.restore();x+=glyphWidth(g,s,layer.fontSize);
  }
 }
 return true;
}
