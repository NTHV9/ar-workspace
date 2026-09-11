import { wrapText } from './model';
import type { DetectedText, PdfLayer } from './types';

export type SourceTextReference = { sourceId: string; sourcePage: number; runIndex: number; scope?: string };
export type SourceGlyph = { unicode: string; fontChar: string; width: number; isSpace?: boolean; isInFont?: boolean; accent?: unknown };
export type SourceStyle = { font: string; fontSize: number; bold: boolean; italic: boolean; color: string; baseline: number; hScale: number; charSpacing: number; wordSpacing: number; glyphs: Map<string, SourceGlyph>; sequence: (SourceGlyph | number)[]; supported: boolean; run: DetectedText };
const styles = new Map<string, SourceStyle>();
const key = (r: SourceTextReference) => JSON.stringify([r.scope,r.sourceId,r.sourcePage,r.runIndex]);
export function releaseSourceStyles(scope: string) { for(const [k,s] of styles) if(s.run.sourceText?.scope===scope)styles.delete(k); }
export function registerSourceStyle(ref: SourceTextReference, style: SourceStyle) { styles.set(key(ref), style); }
export function sourceStyle(layer: PdfLayer): SourceStyle | undefined {
 const s=layer.sourceText && styles.get(key(layer.sourceText));
 return s && layer.original && s.run.text===layer.original.text && Math.abs(s.run.x-layer.original.x)<.01 && Math.abs(s.run.y-layer.original.y)<.01 ? s : undefined;
}
export function createReplacementLayer(run: DetectedText,id: string): PdfLayer {
 return {id,kind:'replacement',x:run.x,y:run.y,width:run.width,height:run.height,text:run.text,color:run.color??'#000000',fill:'#ffffff',font:'Arial',fontSize:run.fontSize,bold:run.bold??false,italic:run.italic??false,original:{text:run.text,x:run.x,y:run.y,width:run.width,height:run.height},...(run.sourceText?{sourceText:{...run.sourceText}}:{})};
}
export function sourceFont(layer: PdfLayer,s: SourceStyle) {
 // PDF.js already knows whether the loaded face requires synthetic weight/slant.
 const bold=layer.bold===s.run.bold?s.bold:layer.bold,italic=layer.italic===s.run.italic?s.italic:layer.italic;
 return `${italic?'italic':'normal'} ${bold?'bold':'normal'} ${layer.fontSize}px ${s.font}`;
}
function glyphWidth(g: SourceGlyph,s: SourceStyle,size: number) {return (g.width*size/1000+s.charSpacing+(g.isSpace?s.wordSpacing:0))*s.hScale;}
export function measureLayerText(layer: PdfLayer): {lines:string[];height:number;width:number;unsupported:boolean} {
 const s=sourceStyle(layer);
 if(!layer.sourceText){
  const ctx=typeof document==='undefined'?null:document.createElement('canvas').getContext('2d');
  if(ctx)ctx.font=`${layer.italic?'italic ':''}${layer.bold?'bold ':''}${layer.fontSize}px ${layer.font}`;
  const measure=(text:string)=>ctx?ctx.measureText(text).width:text.length*layer.fontSize*.6;
  const lines=wrapText(layer.text,Math.max(layer.width-6,1),measure);
  return {lines,width:Math.max(0,...layer.text.split('\n').map(measure))+6,height:2+lines.length*layer.fontSize*1.25,unsupported:false};
 }
 const lines=layer.text.split('\n');
 const widths=lines.map(line=>s?Array.from(line).reduce((w,c)=>w+(s.glyphs.has(c)?glyphWidth(s.glyphs.get(c)!,s,layer.fontSize):layer.fontSize*.6),0):line.length*layer.fontSize*.6);
 if(s && layer.text===s.run.text)widths[0]=s.sequence.reduce<number>((w,g)=>w+(typeof g==='number'?-g*layer.fontSize/1000*s.hScale:glyphWidth(g,s,layer.fontSize)),0);
 return {lines,width:Math.max(0,...widths),height:(s?s.baseline*layer.fontSize/s.fontSize:layer.fontSize*.85)+layer.fontSize*.3+(lines.length-1)*layer.fontSize*1.25,unsupported:!s||!s.supported||Array.from(layer.text.replace(/\n/g,'')).some(c=>!s.glyphs.has(c))};
}
export function drawSourceText(ctx: CanvasRenderingContext2D,layer: PdfLayer): boolean {
 if(!layer.sourceText)return false;
 const s=sourceStyle(layer);if(!s||measureLayerText(layer).unsupported)throw new Error('This source font cannot reproduce the edited characters. Choose a replacement font in formatting, or use characters available in the source document.');
 const metrics=measureLayerText(layer);
 if(metrics.height>layer.height+.5 || metrics.width>layer.width+.5)throw new Error('The edited text exceeds its box. Enlarge the text box before Preview.');
 ctx.font=sourceFont(layer,s);ctx.fillStyle=layer.color;ctx.textBaseline='alphabetic';
 for(const [n,line] of metrics.lines.entries()){
  let x=0; const sequence=layer.text===s.run.text?s.sequence:Array.from(line).map(c=>s.glyphs.get(c)!);
  for(const g of sequence){if(typeof g==='number'){x-=g*layer.fontSize/1000*s.hScale;continue;}
   ctx.save();ctx.translate(layer.x+x,layer.y+s.baseline*layer.fontSize/s.fontSize+n*layer.fontSize*1.25);ctx.scale(s.hScale,1);if(g.isInFont!==false)ctx.fillText(g.fontChar,0,0);ctx.restore();x+=glyphWidth(g,s,layer.fontSize);
  }
 }
 return true;
}
