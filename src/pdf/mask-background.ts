import type {PdfLayer} from './types';
export function flatMaskBackground(data:Uint8ClampedArray,width:number,height:number,rect:{x:number;y:number;width:number;height:number}):string{
 const left=Math.floor(rect.x)-2,right=Math.ceil(rect.x+rect.width)+2,top=Math.floor(rect.y)-2,bottom=Math.ceil(rect.y+rect.height)+2;
 const colors:number[][]=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  if(x<0||y<0||x>=width||y>=height||x>left+1&&x<right-1&&y>top+1&&y<bottom-1)continue;
  const i=(y*width+x)*4;colors.push([data[i],data[i+1],data[i+2]]);
 }
 if(!colors.length)throw Error('The source background cannot be sampled safely. Move this edit to a clear area or use an explicit whiteout.');
 const center=[0,1,2].map(c=>[...colors.map(v=>v[c])].sort((a,b)=>a-b)[Math.floor(colors.length/2)]);
 if(colors.some(c=>c.some((v,i)=>Math.abs(v-center[i])>8)))throw Error('The source background contains artwork or nearby content. Use a smaller selection or an explicit whiteout before replacing this text.');
 return `rgb(${center.join(',')})`;
}
export function sourceMaskFill(source:HTMLCanvasElement,scale:number,layer:PdfLayer,mask:{x:number;y:number;width:number;height:number;sourceX?:number;sourceY?:number}):string{
 if(!layer.original||layer.maskOriginal===false)return layer.fill;
 // The user can still request an explicit colored mask. Automatic masks preserve
 // a verified flat source surface; mixed artwork requires an explicit decision.
 if(layer.fill.toLowerCase()!=='#ffffff')return layer.fill;
 const ctx=source.getContext('2d')!,r=layer.original;
 // Read a small source-space rectangle, never a whole 300-DPI page per layer.
 // Binding supplies source coordinates before any column/row/layer move.
 const rect={x:(mask.sourceX??r.x-1)*scale,y:(mask.sourceY??r.y-1)*scale,width:mask.width*scale,height:mask.height*scale};
 const x=Math.max(0,Math.floor(rect.x)-4),y=Math.max(0,Math.floor(rect.y)-4);
 const width=Math.min(source.width-x,Math.ceil(rect.x+rect.width)+4-x),height=Math.min(source.height-y,Math.ceil(rect.y+rect.height)+4-y);
 if(width<1||height<1)throw Error('The source background is outside the page. Restore this edit before Preview.');
 const pixels=ctx.getImageData(x,y,width,height);
 return flatMaskBackground(pixels.data,width,height,{...rect,x:rect.x-x,y:rect.y-y});
}
