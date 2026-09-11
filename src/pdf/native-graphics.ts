import {OPS,Util,type PDFDocumentProxy} from 'pdfjs-dist';
import type {PdfProjectPage} from './types';
export type GraphicTarget={id:string;x:number;y:number;width:number;height:number};

/** Extract thin painted path bounds; arbitrary groups use explicit area selection. */
export async function detectLines(page:PdfProjectPage,documents:Map<string,PDFDocumentProxy>):Promise<GraphicTarget[]>{
 if(!page.sourcePage)return [];
 const source=await documents.get(page.sourceId)!.getPage(page.sourcePage),ops=await source.getOperatorList();
 let matrix=source.getViewport({scale:1}).transform,lineWidth=1;
 const stack:{matrix:number[];lineWidth:number}[]=[],lines:GraphicTarget[]=[];
 for(let i=0;i<ops.fnArray.length;i++){
  const op=ops.fnArray[i],args=ops.argsArray[i];
  if(op===OPS.save||op===OPS.paintFormXObjectBegin){stack.push({matrix:[...matrix],lineWidth});if(op===OPS.paintFormXObjectBegin&&args[0])matrix=Util.transform(matrix,args[0]);}
  else if(op===OPS.restore||op===OPS.paintFormXObjectEnd){const before=stack.pop();if(before){matrix=before.matrix;lineWidth=before.lineWidth;}}
  else if(op===OPS.transform)matrix=Util.transform(matrix,args);
  else if(op===OPS.setLineWidth)lineWidth=args[0];
  else if(op===OPS.constructPath&&args[2]?.length===4){
   const b=args[2] as number[];
   const corners=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
   const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
   if(!Number.isFinite(w+h)||Math.max(w,h)<8||Math.min(w,h)>3)continue;
   const pad=Math.max(.75,Math.abs(lineWidth)*Math.max(Math.hypot(matrix[0],matrix[1]),Math.hypot(matrix[2],matrix[3]))/2+.25);
   const x=Math.max(0,Math.min(...xs)-pad),y=Math.max(0,Math.min(...ys)-pad),right=Math.min(page.width,Math.max(...xs)+pad),bottom=Math.min(page.height,Math.max(...ys)+pad);
   if(right>x&&bottom>y)lines.push({id:'path-'+i,x,y,width:right-x,height:bottom-y});
  }
  if(lines.length>=500)break;
 }
 return lines;
}
