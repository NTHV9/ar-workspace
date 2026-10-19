/** Only bounded error fields or an HTML error heading; never dump upstream bodies. */
export function dataFailureReason(input:unknown,token:string,key:string):string|undefined {
 const messages:string[]=[];
 const visit=(v:unknown,depth=0)=>{
  if(depth>3||messages.length>=8)return;
  if(typeof v==='string'){messages.push(v);return;}
  if(Array.isArray(v)){v.slice(0,3).forEach(x=>visit(x,depth+1));return;}
  if(v&&typeof v==='object')for(const name of ['title','detail','o:errorCode','message','error','description','errors','reason','code'])if(name in v)visit((v as Record<string,unknown>)[name],depth+1);
 };
 if(typeof input==='string'){
  const heading=input.match(/<(?:title|h1)\b[^>]*>([^<]{1,300})<\//i)?.[1];
  if(heading)messages.push(heading);else if(/^[\w .:()-]{1,160}$/.test(input.trim()))messages.push(input.trim());
 }else visit(input);
 const result=messages.join(' · ').replaceAll(token,'[redacted]').replaceAll(key,'[redacted]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/[\u0000-\u001f]/g,' ').slice(0,400);
 return result||undefined;
}

/** The diagnostic query does not use @stream. Never accept an incomplete stream. */
export function dataResponseEnvelopes(text:string,contentType:string):unknown[] {
 if(!/^multipart\/mixed\b/i.test(contentType))return [JSON.parse(text)];
 const boundary=contentType.match(/\bboundary\s*=\s*(?:"([^"\r\n]{1,70})"|([^;\s]{1,70}))/i);
 if(!boundary)throw Error('invalid multipart boundary');
 const chunks=text.trim().split('--'+(boundary[1]??boundary[2]));
 if(chunks[0]!==''||chunks.at(-1)!=='--'||chunks.length>34)throw Error('incomplete multipart');
 const envelopes=chunks.slice(1,-1).map(chunk=>{
  const split=chunk.indexOf('\r\n\r\n');
  if(split<0||!/content-type:\s*application\/json\b/i.test(chunk.slice(0,split)))throw Error('invalid multipart part');
  return JSON.parse(chunk.slice(split+4).trim());
 });
 if(!envelopes.length||envelopes.at(-1)?.hasNext===true||envelopes.some(e=>e?.hasNext===true)&&envelopes.at(-1)?.hasNext!==false||envelopes.some(e=>e?.incremental!==undefined)||envelopes.filter(e=>e?.data!==undefined).length>1)throw Error('unsupported or incomplete stream');
 return envelopes;
}
