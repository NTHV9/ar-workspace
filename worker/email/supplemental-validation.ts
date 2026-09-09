import {PDFDocument,PDFDict,PDFArray,PDFName,PDFStream,type PDFObject} from 'pdf-lib';
import {hash} from './crypto';
export const supplementalPixelLimit=8_000_000;
export interface FileInspection {mime:'application/pdf'|'image/png'|'image/jpeg';byte_count:number;sha256:string;pages?:number;width?:number;height?:number}
export function supplementalName(name:string):FileInspection['mime']{
 if(!name||name.length>200||name.trim()!==name||/[\x00-\x1f\x7f/\\]/.test(name)||/[. ]$/.test(name))throw Error('attachment_name_invalid');
 const extension=name.split('.').pop()?.toLowerCase();const mime=extension==='pdf'?'application/pdf':extension==='png'?'image/png':['jpg','jpeg'].includes(extension??'')?'image/jpeg':null;
 if(!mime)throw Error('attachment_unsupported');return mime;
}
const unsafeKeys=new Set(['OpenAction','AA','JS','JavaScript','EmbeddedFiles','EF','XFA','AcroForm','RichMediaContent','RichMediaSettings']);
const unsafeActions=new Set(['JavaScript','Launch','SubmitForm','ImportData','GoToR','GoToE','Rendition','Movie','Sound']);
const unsafeTypes=new Set(['EmbeddedFile','FileAttachment','RichMedia','Movie','Sound','3D']);
function inspectPdfObjects(pdf:PDFDocument){
 let count=0;const seen=new Set<PDFObject>();
 const walk=(object:PDFObject,depth:number)=>{
  if(seen.has(object))return;seen.add(object);if(++count>100000||depth>40)throw Error('attachment_pdf_complexity');
  if(object instanceof PDFStream){walk(object.dict,depth+1);return;}
  if(object instanceof PDFArray){for(const value of object.asArray())walk(value,depth+1);return;}
  if(object instanceof PDFDict){for(const [key,value] of object.entries()){
   const name=key.decodeText();if(unsafeKeys.has(name))throw Error('attachment_active_pdf');
   const resolved=pdf.context.lookup(value);if(resolved instanceof PDFName&&((name==='S'&&unsafeActions.has(resolved.decodeText()))||(['Type','Subtype'].includes(name)&&unsafeTypes.has(resolved.decodeText()))))throw Error('attachment_active_pdf');
   walk(value,depth+1);
  }}
 };
 for(const [,object] of pdf.context.enumerateIndirectObjects())walk(object,0);
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array,start:number,end:number){let c=0xffffffff;for(let i=start;i<end;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
async function inspectPng(bytes:Uint8Array){
 const signature=[137,80,78,71,13,10,26,10];if(bytes.length<33||signature.some((v,i)=>bytes[i]!==v))throw Error('attachment_invalid');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,width=0,height=0,depth=0,color=0,interlace=0,hasData=false,ended=false,dataEnded=false,palette=false;
 const compressed:Uint8Array[]=[];
 while(offset+12<=bytes.length){const length=view.getUint32(offset),type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));if(!/^[A-Za-z]{4}$/.test(type)||offset+length+12>bytes.length)throw Error('attachment_invalid');
  if(offset===8){
   if(type!=='IHDR'||length!==13)throw Error('attachment_invalid');width=view.getUint32(16);height=view.getUint32(20);depth=bytes[24];color=bytes[25];interlace=bytes[28];
   const legal:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!width||!height||!legal[color]?.includes(depth)||bytes[26]!==0||bytes[27]!==0||![0,1].includes(interlace))throw Error('attachment_invalid_image');
   if(width*height>supplementalPixelLimit||width>8192||height>8192)throw Error('attachment_image_too_large');
  }else if(type==='IHDR')throw Error('attachment_invalid_image');
  if(crc32(bytes,offset+4,offset+length+8)!==view.getUint32(offset+length+8))throw Error('attachment_invalid_image');
  if(['acTL','fcTL','fdAT'].includes(type))throw Error('attachment_animated_image');
  if(type[0]===type[0].toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(type))throw Error('attachment_invalid_image');
  if(type==='PLTE'){if(palette||hasData||[0,4].includes(color)||!length||length>768||length%3!==0||color===3&&length/3>2**depth)throw Error('attachment_invalid_image');palette=true;}
  if(type==='IDAT'){if(dataEnded||color===3&&!palette)throw Error('attachment_invalid_image');hasData=true;compressed.push(bytes.subarray(offset+8,offset+length+8));}
  else if(hasData)dataEnded=true;
  offset+=length+12;if(type==='IEND'){if(length!==0||offset!==bytes.length)throw Error('attachment_invalid');ended=true;break;}
 }
 if(!ended||!hasData)throw Error('attachment_invalid');
 const channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];
 const layout=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
 const passes=layout.map(([x,y,dx,dy])=>({width:Math.max(0,Math.ceil((width-x)/dx)),rows:Math.max(0,Math.ceil((height-y)/dy))})).filter(p=>p.width&&p.rows).map(p=>({bytes:Math.ceil(p.width*channels*depth/8)+1,rows:p.rows}));
 const expected=passes.reduce((n,p)=>n+p.bytes*p.rows,0);
 // Count/validate decoded scanlines incrementally. Never let an untrusted PNG
 // inflater allocate an unbounded raster from duplicate headers or compressed data.
 const reader=new Blob(compressed.map(c=>new Uint8Array(c).buffer)).stream().pipeThrough(new DecompressionStream('deflate')).getReader();let total=0,pass=0,row=0,column=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>expected){await reader.cancel();throw Error();}let at=0;while(at<chunk.value.length){if(!passes[pass])throw Error();if(column===0&&chunk.value[at]>4)throw Error();const take=Math.min(chunk.value.length-at,passes[pass].bytes-column);at+=take;column+=take;if(column===passes[pass].bytes){column=0;if(++row===passes[pass].rows){pass++;row=0;}}}}if(total!==expected)throw Error();}
 catch{await reader.cancel().catch(()=>{});throw Error('attachment_invalid_image');}finally{reader.releaseLock();}
 return {width,height};
}
export async function inspectSupplemental(bytes:Uint8Array,name:string,declaredMime:string):Promise<FileInspection>{
 const mime=supplementalName(name);if(!bytes.length||bytes.length>20*1024*1024)throw Error('email_too_large');
 if(declaredMime&&declaredMime!=='application/octet-stream'&&declaredMime!==mime)throw Error('attachment_type_mismatch');
 const base={mime,byte_count:bytes.length,sha256:await hash(bytes)};
 if(mime==='application/pdf'){
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('attachment_invalid');
  let pdf:PDFDocument;try{pdf=await PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});}catch{throw Error('attachment_invalid_pdf');}
  if(pdf.isEncrypted)throw Error('attachment_invalid_pdf');if(!pdf.getPageCount())throw Error('attachment_invalid_pdf');inspectPdfObjects(pdf);return {...base,pages:pdf.getPageCount()};
 }
 if(mime==='image/png')return {...base,...await inspectPng(bytes)};
 const document=await PDFDocument.create();
 if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('attachment_invalid_image');
 try{const image=await document.embedJpg(bytes);if(image.width<1||image.height<1)throw Error('attachment_invalid_image');if(image.width*image.height>supplementalPixelLimit||image.width>8192||image.height>8192)throw Error('attachment_image_too_large');return {...base,width:image.width,height:image.height};}catch(e){if(e instanceof Error&&e.message==='attachment_image_too_large')throw e;throw Error('attachment_invalid_image');}
}
