import type {PdfLayer,PdfRowEdit} from './types';
type Rect={x:number;y:number;width:number;height:number};
export function inside(a:Rect,b:Rect){return a.x>=b.x-.5&&a.y>=b.y-.5&&a.x+a.width<=b.x+b.width+.5&&a.y+a.height<=b.y+b.height+.5;}
export function overlaps(a:Rect,b:Rect){return a.x<b.x+b.width-.5&&a.x+a.width>b.x+.5&&a.y<b.y+b.height-.5&&a.y+a.height>b.y+.5;}

/** Source coordinates remain immutable; overlays follow the ordered page edits. */
export function mapSourceRect<T extends Rect>(rect:T,edits:PdfRowEdit[]):T|null {
 let r={...rect};
 for(const e of edits){
  if(e.kind==='move'){
   if(inside(r,e)){r={...r,x:r.x+e.dx,y:r.y+e.dy};}
   else if(overlaps(r,e))return null;
  }else if(e.kind==='insert'){
   if(r.y>=e.y-.5)r={...r,y:r.y+e.height};
   else if(r.y+r.height>e.y+.5)return null;
  }else{
   if(r.y>=e.y+e.height-.5)r={...r,y:r.y-e.height};
   else if(r.y+r.height>e.y+.5)return null;
  }
 }
 return r;
}

export function transformLayers(layers:PdfLayer[],edit:PdfRowEdit):PdfLayer[]{
 const result:PdfLayer[]=[];
 for(const layer of layers){
  const next=mapSourceRect(layer,[edit]);
  if(next){result.push(next);continue;}
  if(edit.kind==='delete'&&layer.y>=edit.y-.5&&layer.y+layer.height<=edit.y+edit.height+.5)continue;
  throw Error('The selection crosses a text box or another edit. Select the whole object, or adjust the row boundary.');
 }
 return result;
}

/** Transform only the source raster. Editable layers are painted afterwards. */
export function applySourceRowEdits(canvas:HTMLCanvasElement,edits:PdfRowEdit[],scale:number){
 if(!edits.length)return;
 const ctx=canvas.getContext('2d')!;
 const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
 const scratch=copy.getContext('2d')!;
 try{for(const edit of edits){
  scratch.clearRect(0,0,copy.width,copy.height);scratch.drawImage(canvas,0,0);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#ffffff';
  try{
   if(edit.kind==='move'){
    const x=Math.round(edit.x*scale),y=Math.round(edit.y*scale),w=Math.round(edit.width*scale),h=Math.round(edit.height*scale),dx=Math.round(edit.dx*scale),dy=Math.round(edit.dy*scale);
    if(x<0||y<0||w<1||h<1||x+w>canvas.width||y+h>canvas.height||x+dx<0||y+dy<0||x+dx+w>canvas.width||y+dy+h>canvas.height)throw Error('Keep the moved area inside this page.');
    ctx.fillRect(x,y,w,h);ctx.drawImage(copy,x,y,w,h,x+dx,y+dy,w,h);
   }else{
    const y=Math.round(edit.y*scale),h=Math.round(edit.height*scale);
    if(y<0||h<1||y+h>canvas.height)throw Error('Choose a row inside this page.');
    if(edit.kind==='insert'){
     const pixels=scratch.getImageData(0,canvas.height-h,canvas.width,h).data;
     for(let i=0;i<pixels.length;i+=4)if(pixels[i]<248||pixels[i+1]<248||pixels[i+2]<248)throw Error('There is not enough blank space at the bottom of this page for another row. Remove a row or use another page.');
     ctx.fillRect(0,y,canvas.width,canvas.height-y);
     const remaining=canvas.height-y-h;if(remaining>0)ctx.drawImage(copy,0,y,canvas.width,remaining,0,y+h,canvas.width,remaining);
     // Continue thin vertical rules that actually cross this boundary. Reading
     // both sides excludes row text and avoids inventing a grid on borderless tables.
     const radius=Math.max(1,Math.ceil(scale*2));
     if(y>=radius&&y+radius<copy.height){
      const strip=scratch.getImageData(0,y-radius,copy.width,radius*2+1).data;
      const colorAt=(x:number,n:number)=>{const i=(n*copy.width+x)*4;return [strip[i],strip[i+1],strip[i+2]];};
      let start=-1;
      for(let x=0;x<=copy.width;x++){
       const color=x<copy.width?colorAt(x,radius):[255,255,255];
       const continuous=x<copy.width&&Math.min(...color)<220&&Array.from({length:radius*2+1},(_,n)=>colorAt(x,n)).every(c=>Math.min(...c)<235&&c.every((v,i)=>Math.abs(v-color[i])<35));
       if(continuous&&start<0)start=x;
       if(!continuous&&start>=0){
        if(x-start<=Math.ceil(scale*3)){for(let col=start;col<x;col++){const c=colorAt(col,radius);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(col,y,1,h);}}
        start=-1;
       }
      }
     }
    }else{
     ctx.fillRect(0,y,canvas.width,canvas.height-y);
     const remaining=canvas.height-y-h;if(remaining>0)ctx.drawImage(copy,0,y+h,canvas.width,remaining,0,y,canvas.width,remaining);
    }
   }
  }finally{ctx.restore();}
 }}finally{copy.width=copy.height=0;}
}
