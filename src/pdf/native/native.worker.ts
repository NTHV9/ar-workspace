import init,{inventory,replace} from './wasm/ar_native_text.js';
import {matchNativeLine,type NativeRequest,type NativeLine} from './protocol';
const ready=init();
self.onmessage=async(event:MessageEvent<NativeRequest>)=>{
 try{
  await ready;let bytes=event.data.bytes;const applied:string[]=[];
  try{inventory(bytes,event.data.page);}catch{self.postMessage({bytes:new Uint8Array(),applied,unsupportedPage:true});return;}
  for(const edit of event.data.edits){
   try{const lines=JSON.parse(inventory(bytes,event.data.page)) as NativeLine[],target=matchNativeLine(lines,edit);if(!target)continue;bytes=replace(bytes,event.data.page,JSON.stringify(target.style),edit.text);applied.push(edit.id);}catch{/* Unsupported targets use the checked raster background path. */}
  }
  self.postMessage({bytes,applied}, {transfer:[bytes.buffer]});
 }catch{self.postMessage({applied:[]});}
};
