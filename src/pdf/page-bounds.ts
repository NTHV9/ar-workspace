import {pageCanvasHeight} from './flow';
import type {PdfLayer,PdfProjectPage} from './types';

/** Geometry is in logical page coordinates, including allocated continuation pages. */
export function layerOnPage(page:PdfProjectPage,layer:PdfLayer):boolean {
 const {x,y,width,height}=layer;
 return [x,y,width,height].every(Number.isFinite)&&width>0&&height>0&&x>=-.01&&y>=-.01&&x+width<=page.width+.01&&y+height<=pageCanvasHeight({...page,layers:[]})+.01;
}

/** Normal editing stops at the edge instead of creating an invisible edit. */
export function fitLayerOnPage(page:PdfProjectPage,layer:PdfLayer):PdfLayer {
 const bottom=pageCanvasHeight({...page,layers:[]}),ratio=layer.kind==='image'?Math.min(1,page.width/layer.width,bottom/layer.height):1;
 const width=Math.min(page.width,Math.max(.1,layer.width*ratio)),height=Math.min(bottom,Math.max(.1,layer.height*ratio));
 return {...layer,width,height,x:Math.max(0,Math.min(page.width-width,layer.x)),y:Math.max(0,Math.min(bottom-height,layer.y))};
}
