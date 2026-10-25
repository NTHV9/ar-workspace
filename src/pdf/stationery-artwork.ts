import {sourceFragments} from './flow';
import type {PdfProjectPage} from './types';
export type StationeryArtwork={sourceId:string;sourcePage:number;pageWidth:number;pageHeight:number;width:number;height:number;scale:number;pixels:Uint8Array;release?:()=>void};
type Rect={x:number;y:number;width:number;height:number};
/** No erased-text exemptions: every original pixel in the requested footprint is checked. */
export function assertStationeryBlank(page:PdfProjectPage,rect:Rect,proof:StationeryArtwork):void{
 if(proof.sourceId!==page.sourceId||proof.sourcePage!==page.sourcePage||proof.pageWidth!==page.width||proof.pageHeight!==page.height||!Number.isFinite(proof.scale)||proof.scale<=0||proof.pixels.length!==proof.width*proof.height||rect.x<0||rect.y<0||rect.x+rect.width>page.width||rect.y+rect.height>page.height)throw Error('The stationery artwork region has not been verified.');
 let covered=0;
 for(const fragment of sourceFragments(page)){
  const x=Math.max(rect.x,fragment.x),y=Math.max(rect.y,fragment.y),right=Math.min(rect.x+rect.width,fragment.x+fragment.width),bottom=Math.min(rect.y+rect.height,fragment.y+fragment.height);
  if(right<=x||bottom<=y)continue;covered+=(right-x)*(bottom-y);
  const sx=fragment.sx+x-fragment.x,sy=fragment.sy+y-fragment.y,ex=sx+right-x,ey=sy+bottom-y;
  if(sx<0||sy<0||ex*proof.scale>proof.width||ey*proof.scale>proof.height)throw Error('The stationery artwork region is outside the verified header.');
  for(let py=Math.floor(sy*proof.scale);py<Math.ceil(ey*proof.scale);py++)for(let px=Math.floor(sx*proof.scale);px<Math.ceil(ex*proof.scale);px++)if(proof.pixels[py*proof.width+px])throw Error('The stationery text would move or cover artwork. Choose a blank area first.');
 }
 // Source-free space created by prior moves/inserts is blank; overlays remain
 // subject to the separate text/object collision checks in reflowStationery.
 if(!Number.isFinite(covered))throw Error('The stationery artwork region has not been verified.');
}
export function stationeryAllocation(width:number,height:number,scale:number,headerHeight:number,sourceBytes:number):number{
 return Math.ceil(width*scale)*Math.ceil(height*scale)*4+Math.ceil(width*scale)*Math.ceil(headerHeight*scale)*5+sourceBytes*2;
}
