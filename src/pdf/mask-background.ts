import type {PdfLayer} from './types';
import {sourceStyle,sourceFont} from './source-text';
export function flatMaskBackground(data:Uint8ClampedArray,width:number,height:number,rect:{x:number;y:number;width:number;height:number}):string{
 const left=Math.floor(rect.x)-2,right=Math.ceil(rect.x+rect.width)+2,top=Math.floor(rect.y)-2,bottom=Math.ceil(rect.y+rect.height)+2;
 const colors:number[][]=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  if(x<0||y<0||x>=width||y>=height||x>left+1&&x<right-1&&y>top+1&&y<bottom-1)continue;
  const i=(y*width+x)*4;colors.push([data[i],data[i+1],data[i+2]]);
 }
 if(!colors.length)throw Error('The source background cannot be sampled safely. Restore original text, then use Whiteout and a new text box.');
 const center=[0,1,2].map(c=>[...colors.map(v=>v[c])].sort((a,b)=>a-b)[Math.floor(colors.length/2)]);
 if(colors.some(c=>c.some((v,i)=>Math.abs(v-center[i])>8)))throw Error('The source background contains artwork or nearby content. Restore original text, then use Whiteout and a new text box.');
 return `rgb(${center.join(',')})`;
}
/** Reject every nonbackground source pixel not accounted for by original glyph ink. */
export function assertMaskInterior(data:Uint8ClampedArray,matte:Uint8ClampedArray,width:number,height:number,rect:{x:number;y:number;width:number;height:number},background:string,radius:number,foreground?:string){
 const bg=background.match(/\d+/g)!.map(Number),knownForeground=foreground?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)?.slice(1).map(v=>parseInt(v,16));
 for(let y=Math.max(0,Math.floor(rect.y));y<Math.min(height,Math.ceil(rect.y+rect.height));y++)for(let x=Math.max(0,Math.floor(rect.x));x<Math.min(width,Math.ceil(rect.x+rect.width));x++){
  const i=(y*width+x)*4;if(bg.every((v,c)=>Math.abs(data[i+c]-v)<=8))continue;
  let accounted=false;
  for(let dy=-radius;dy<=radius&&!accounted;dy++)for(let dx=-radius;dx<=radius;dx++){
   const mx=x+dx,my=y+dy;if(mx<0||my<0||mx>=width||my>=height)continue;
   const j=(my*width+mx)*4,alpha=matte[j+3]/255;if(!alpha)continue;
   // Opaque PDF.js source and transparent font canvases use different edge
   // coverage. Test the continuous background-to-original-color segment, rather
   // than requiring one neighboring alpha sample to reproduce the source pixel.
   const fg=knownForeground??[matte[j],matte[j+1],matte[j+2]],delta=fg.map((v,c)=>v-bg[c]);
   const channel=delta.reduce((best,value,c)=>Math.abs(value)>Math.abs(delta[best])?c:best,0);
   if(Math.abs(delta[channel])<1)continue;
   const coverage=(data[i+channel]-bg[channel])/delta[channel];
   if(coverage>=-.03&&coverage<=1.03&&bg.every((v,c)=>Math.abs(data[i+c]-(v+delta[c]*coverage))<=12)){accounted=true;break;}
  }
  if(!accounted)throw Error('The original text area contains artwork or other content. Restore original text, then use Whiteout and a new text box.');
 }
}
/** Nearby rules outside the paint footprint must not prevent editing its text.
 * If the outer ring is mixed, prove a flat surface from every clear interior
 * pixel instead. Original glyph ink is still checked over the entire mask. */
export function verifiedMaskBackground(data:Uint8ClampedArray,matte:Uint8ClampedArray,width:number,height:number,rect:{x:number;y:number;width:number;height:number},radius:number,foreground?:string):string{
 let background:string;
 try{background=flatMaskBackground(data,width,height,rect);}catch{
  const colors:number[][]=[];
  for(let y=Math.max(0,Math.floor(rect.y));y<Math.min(height,Math.ceil(rect.y+rect.height));y++)for(let x=Math.max(0,Math.floor(rect.x));x<Math.min(width,Math.ceil(rect.x+rect.width));x++){
   let glyph=false;
   for(let dy=-radius;dy<=radius&&!glyph;dy++)for(let dx=-radius;dx<=radius;dx++){
    const mx=x+dx,my=y+dy;if(mx>=0&&my>=0&&mx<width&&my<height&&matte[(my*width+mx)*4+3]){glyph=true;break;}
   }
   if(!glyph){const i=(y*width+x)*4;colors.push([data[i],data[i+1],data[i+2]]);}
  }
  if(colors.length<4)throw Error('The source background cannot be verified safely. Restore original text, then use Whiteout and a new text box.');
  const center=[0,1,2].map(c=>colors.map(v=>v[c]).sort((a,b)=>a-b)[Math.floor(colors.length/2)]);
  if(colors.some(c=>c.some((v,i)=>Math.abs(v-center[i])>8)))throw Error('The source background contains artwork or nearby content. Restore original text, then use Whiteout and a new text box.');
  background=`rgb(${center.join(',')})`;
 }
 assertMaskInterior(data,matte,width,height,rect,background,radius,foreground);
 return background;
}
export function sourceMaskFill(source:HTMLCanvasElement,scale:number,layer:PdfLayer,mask:{x:number;y:number;width:number;height:number;sourceX?:number;sourceY?:number;sourceHeight?:number;sourceLayer?:PdfLayer}):string{
 if(!layer.original||layer.maskOriginal===false)return layer.fill;
 // The user can still request an explicit colored mask. Automatic masks preserve
 // a verified flat source surface; mixed artwork requires an explicit decision.
 if(layer.fill.toLowerCase()!=='#ffffff')return layer.fill;
 const ctx=source.getContext('2d')!,r=layer.original;
 // Read a small source-space rectangle, never a whole 300-DPI page per layer.
 // Binding supplies source coordinates before any column/row/layer move.
 const rect={x:(mask.sourceX??r.x-1)*scale,y:(mask.sourceY??r.y-1)*scale,width:mask.width*scale,height:(mask.sourceHeight??mask.height)*scale};
 const x=Math.max(0,Math.floor(rect.x)-4),y=Math.max(0,Math.floor(rect.y)-4);
 const width=Math.min(source.width-x,Math.ceil(rect.x+rect.width)+4-x),height=Math.min(source.height-y,Math.ceil(rect.y+rect.height)+4-y);
 if(width<1||height<1)throw Error('The source background is outside the page. Restore this edit before Preview.');
 const pixels=ctx.getImageData(x,y,width,height);
 const local={...rect,x:rect.x-x,y:rect.y-y};
 const original=mask.sourceLayer,style=original&&sourceStyle(original);
 if(!original||!style||style.run.rotated||(!style.maskRuns&&style.sequence.filter(g=>typeof g!=='number').map(g=>g.unicode).join('')!==original.text))throw Error('The original text background cannot be verified safely. Restore original text, then use Whiteout and a new text box.');
 const matte=document.createElement('canvas');matte.width=width;matte.height=height;
 try{
  const context=matte.getContext('2d')!;context.scale(scale,scale);context.translate(-x/scale,-y/scale);
  // Draw only the original observed glyph sequence. This never invents missing
  // characters or approves the edited font; the interior comparison still must
  // match every nonbackground pixel of the actual PDF.js source raster.
  context.textBaseline='alphabetic';
  const originals=style.maskRuns??[{run:style.run,style}];
  for(const observed of originals){
   const face=observed.style;if(!face?.supported||face.run.rotated||face.sequence.filter(g=>typeof g!=='number').map(g=>g.unicode).join('')!==observed.run.text)throw Error('The original glyph background could not be verified.');
   let advance=0;context.fillStyle=face.color;
   for(const glyph of face.sequence){
    if(typeof glyph==='number'){advance-=glyph*face.fontSize/1000*face.hScale;continue;}
    if(glyph.accent)throw Error('The original glyph background cannot be verified safely. Restore original text, then use Whiteout and a new text box.');
    context.save();context.font=sourceFont({...original,fontSize:observed.run.fontSize,bold:!!observed.run.bold,italic:!!observed.run.italic},glyph.fallbackFont?{...face,font:glyph.fallbackFont}:face);context.translate(observed.run.x+advance,observed.run.y+face.baseline);context.scale(face.hScale,1);if(glyph.isInFont!==false)context.fillText(glyph.fontChar,0,0);context.restore();
    advance+=(glyph.width*face.fontSize/1000+face.charSpacing+(glyph.isSpace?face.wordSpacing:0))*face.hScale;
   }
  }
  return verifiedMaskBackground(pixels.data,context.getImageData(0,0,width,height).data,width,height,local,Math.ceil(scale*.75),style.color);
 }finally{matte.width=matte.height=0;}
}
