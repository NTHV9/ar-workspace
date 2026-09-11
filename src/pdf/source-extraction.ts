import { OPS, Util, type PDFPageProxy } from 'pdfjs-dist';
import type { DetectedText, PdfProjectPage } from './types';
import { registerSourceStyle, type SourceGlyph, type SourceStyle } from './source-text';
import { StandardFontEmbedder, StandardFonts } from 'pdf-lib';
type Font = {composite?:boolean;toUnicode?:{_map?:string[]};toFontChar?:number[];widths?:Record<number,number>;defaultWidth?:number;loadedName?:string;fallbackName?:string;name?:string;bold?:boolean;black?:boolean;italic?:boolean;disableFontFace?:boolean;isType3Font?:boolean;vertical?:boolean;systemFontInfo?:{css?:string}};
export async function extractSourceImages(pdfPage:PDFPageProxy){
 const ops=await pdfPage.getOperatorList(),viewport=pdfPage.getViewport({scale:1}),stack:number[][]=[],rects:{x:number;y:number;width:number;height:number}[]=[];
 let ctm=[1,0,0,1,0,0];
 for(let i=0;i<ops.fnArray.length;i++){
  const op=ops.fnArray[i],a=ops.argsArray[i];
  if(op===OPS.save)stack.push([...ctm]);else if(op===OPS.restore)ctm=stack.pop()??ctm;else if(op===OPS.transform)ctm=Util.transform(ctm,a);
  else if(op===OPS.paintImageXObject||op===OPS.paintInlineImageXObject||op===OPS.paintImageMaskXObject){
   const m=Util.transform(viewport.transform,ctm),points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
   const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));rects.push({x,y,width:Math.max(...points.map(p=>p[0]))-x,height:Math.max(...points.map(p=>p[1]))-y});
  }
 }
 return rects;
}
export async function extractSourceText(page: PdfProjectPage,pdfPage: PDFPageProxy,scope: string): Promise<DetectedText[]> {
 const viewport=pdfPage.getViewport({scale:1}),content=await pdfPage.getTextContent(),ops=await pdfPage.getOperatorList();
 let state={fontId:'',fontSize:0,ctm:[1,0,0,1,0,0],tm:[1,0,0,1,0,0],x:0,y:0,lineX:0,lineY:0,leading:0,rise:0,color:'#000000',charSpacing:0,wordSpacing:0,hScale:1,mode:0,simpleFill:true,alpha:1};const stack:typeof state[]=[];
 const chunks:{text:string;state:typeof state;sequence:(SourceGlyph|number)[];x:number;y:number}[]=[],fontGlyphs=new Map<string,Map<string,SourceGlyph>>();
 for(let i=0;i<ops.fnArray.length;i++){
  const op=ops.fnArray[i],a=ops.argsArray[i];
  if(op===OPS.save)stack.push({...state});else if(op===OPS.restore)state=stack.pop()??state;
  else if(op===OPS.transform)state.ctm=Util.transform(state.ctm,a);
  else if(op===OPS.beginText){state.tm=[1,0,0,1,0,0];state.x=state.y=state.lineX=state.lineY=0;}
  else if(op===OPS.setTextMatrix){state.tm=[...a[0]];state.x=state.y=state.lineX=state.lineY=0;}
  else if(op===OPS.moveText){state.x=state.lineX+=a[0];state.y=state.lineY+=a[1];}
  else if(op===OPS.setLeading)state.leading=-a[0];
  else if(op===OPS.nextLine){state.x=state.lineX;state.y=state.lineY+=state.leading;}
  else if(op===OPS.setTextRise)state.rise=a[0];
  else if(op===OPS.setFont){state.fontId=a[0];state.fontSize=a[1];}else if(op===OPS.setFillRGBColor){state.color=a[0];state.simpleFill=true;}
  else if(op===OPS.setFillColorN)state.simpleFill=false;
  else if(op===OPS.setGState){for(const [name,value] of a[0])if(name==='ca')state.alpha=value;}
  else if(op===OPS.setCharSpacing)state.charSpacing=a[0];else if(op===OPS.setWordSpacing)state.wordSpacing=a[0];else if(op===OPS.setHScale)state.hScale=a[0]/100;else if(op===OPS.setTextRenderingMode)state.mode=a[0];
  else if(op===OPS.showText){const sequence=a[0] as (SourceGlyph|number)[];const map=fontGlyphs.get(state.fontId)??new Map<string,SourceGlyph>();fontGlyphs.set(state.fontId,map);
   for(const g of sequence)if(typeof g!=='number'&&g.unicode.length===1&&!g.accent&&(g.isInFont!==false||g.unicode===' '))map.set(g.unicode,g);
   const matrix=Util.transform(viewport.transform,Util.transform(state.ctm,state.tm)),x=matrix[0]*state.x+matrix[2]*(state.y+state.rise)+matrix[4],y=matrix[1]*state.x+matrix[3]*(state.y+state.rise)+matrix[5];
   chunks.push({x,y,text:sequence.filter((g):g is SourceGlyph=>typeof g!=='number').map(g=>g.unicode).join(''),state:{...state},sequence});
   state.x+=sequence.reduce<number>((w,g)=>w+(typeof g==='number'?-g*state.fontSize/1000:g.width*state.fontSize/1000+state.charSpacing+(g.isSpace?state.wordSpacing:0)),0)*state.hScale;
  }
 }

 return content.items.flatMap((item,runIndex)=>{
  if(!('str'in item)||!item.str.trim())return [];
  const tx=Util.transform(viewport.transform,item.transform),height=Math.hypot(tx[2],tx[3]),style=content.styles[item.fontName];
  // Match text AND its physical source position. PDF.js can trim whitespace or
  // split one showText operator; repeated labels must never consume a later run.
  let chunk: typeof chunks[number] | undefined;
  let bestDistance=1;
  for(const candidate of chunks){
    if(candidate.state.fontId!==item.fontName)continue;
    let offset=0,advance=0;
    for(let i=0;i<candidate.sequence.length;i++){
      const g=candidate.sequence[i];
      if(typeof g==='number'){advance-=g*candidate.state.fontSize/1000;continue;}
      if(candidate.text.startsWith(item.str,offset)){
        const matrix=Util.transform(viewport.transform,Util.transform(candidate.state.ctm,candidate.state.tm));
        const x=candidate.x+advance*candidate.state.hScale*matrix[0],y=candidate.y+advance*candidate.state.hScale*matrix[1],distance=Math.hypot(x-tx[4],y-tx[5]);
        if(distance<bestDistance){
          const sequence:(SourceGlyph|number)[]=[];let length=0;
          for(let j=i;j<candidate.sequence.length && length<item.str.length;j++){const part=candidate.sequence[j];sequence.push(part);if(typeof part!=='number')length+=part.unicode.length;}
          if(length===item.str.length){chunk={...candidate,x,y,sequence,text:item.str};bestDistance=distance;}
        }
      }
      offset+=g.unicode.length;advance+=g.width*candidate.state.fontSize/1000+candidate.state.charSpacing+(g.isSpace?candidate.state.wordSpacing:0);
    }
  }
  let font:Font={};try{font=pdfPage.commonObjs.get(item.fontName) as Font;}catch{/* Unsupported fonts remain unavailable. */}
  const glyphMap=fontGlyphs.get(item.fontName)??new Map<string,SourceGlyph>();
  // Base14 WinAnsi is an authoritative encoding, including glyphs not yet used
  // on this page. Never infer a custom embedded/subset font's character map.
  if(!font.composite && /^(Helvetica|Times|Courier)(-|$)/.test(font.name??'') && Object.values(StandardFonts).includes(font.name as StandardFonts)){
    const standard=StandardFontEmbedder.for(font.name as Parameters<typeof StandardFontEmbedder.for>[0]);
    for(const unicode of standard.encoding.supportedCodePoints){
      const value=String.fromCodePoint(unicode),code=standard.encoding.encodeUnicodeCodePoint(unicode).code;
      const mapped=font.toFontChar?.[code];
      const explicit=font.toUnicode?._map?.[code];
      const width=font.widths?.[code]??standard.widthOfTextAtSize(value,1000);
      if((explicit===undefined||explicit===value) && !glyphMap.has(value) && Number.isInteger(mapped) && mapped!>=0 && mapped!<=0x10ffff && Number.isFinite(width) && width>=0 && width<100000) glyphMap.set(value,{unicode:value,fontChar:String.fromCodePoint(mapped!),width,isSpace:code===32,isInFont:true});
    }
  }
  // Non-composite fonts expose direct character-code widths and Unicode mapping.
  // Composite CID widths need CMap resolution, so their unobserved glyphs remain unavailable.
  if(!font.composite && font.toUnicode?._map && font.toFontChar) {
    for(const [code,value] of Object.entries(font.toUnicode._map).slice(0,65536)) {
      const n=Number(code),mapped=font.toFontChar[n],width=font.widths?.[n]??font.defaultWidth;
      if(typeof value==='string' && Array.from(value).length===1 && Number.isInteger(mapped) && mapped>=0 && mapped<=0x10ffff && typeof width==='number' && Number.isFinite(width) && width>=0 && width<100000 && !glyphMap.has(value))glyphMap.set(value,{unicode:value,fontChar:String.fromCodePoint(mapped),width,isSpace:n===32,isInFont:true});
    }
  }
  const rotated=Math.abs(tx[1])>.1||Math.abs(tx[2])>.1||tx[0]<=0;
  const bold=/bold|black|heavy/i.test(font.name??'')||!!font.bold||!!font.black,italic=/italic|oblique/i.test(font.name??'')||!!font.italic;
  const ref={sourceId:page.sourceId,sourcePage:page.sourcePage!,runIndex,scope},baseline=height*(style?.ascent??.85);
  const run:DetectedText={text:item.str,x:tx[4],y:tx[5]-baseline,width:Math.max(item.width,2),height:Math.max(height*1.15,baseline+height*.3),fontSize:height,rotated,color:chunk?.state.color??'#000000',bold,italic,fontLabel:font.name??style?.fontFamily??'Unknown source font',sourceText:ref};
  const supported=!!chunk&&!rotated&&!font.disableFontFace&&!font.isType3Font&&!font.vertical&&chunk.state.mode===0&&chunk.state.simpleFill&&chunk.state.alpha===1&&/^#[0-9a-f]{6}$/i.test(run.color!);run.unsupported=!supported;
  // Runtime font values come from this PDF's PDF.js font loader, never persisted CSS.
  const typeface=font.systemFontInfo?.css??`"${font.loadedName??'sans-serif'}", ${font.fallbackName??'sans-serif'}`;
  const rawWidth=chunk?.sequence.reduce<number>((w,g)=>w+(typeof g==='number'?-g*height/1000:g.width*height/1000+chunk.state.charSpacing+(g.isSpace?chunk.state.wordSpacing:0)),0)??0;
  const horizontalScale=rawWidth>0?item.width/rawWidth:1;
  const runtime:SourceStyle={font:typeface,fontSize:height,bold:!!font.bold||!!font.black,italic:!!font.italic,color:run.color!,baseline,hScale:horizontalScale,charSpacing:chunk?.state.charSpacing??0,wordSpacing:chunk?.state.wordSpacing??0,glyphs:glyphMap,sequence:chunk?.sequence??[],supported,run};
  registerSourceStyle(ref,runtime);return [run];
 });
}
