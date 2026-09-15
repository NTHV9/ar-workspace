import {createReplacementLayer,registerSourceStyle,sourceStyle} from './source-text';
import type {DetectedText} from './types';

interface LocalDigits {font:string;advances:number[]}
let localFace:Promise<LocalDigits|null>|undefined;
function localArialBold():Promise<LocalDigits|null>{
 return localFace??= (async()=>{
  if(typeof FontFace==='undefined'||typeof document==='undefined')return null;
  try{
   // No generic fallback or font download: load the installed, explicitly named face.
   const face=await new FontFace('ARVoucherArialBold','local("Arial Bold"), local("Arial-BoldMT")').load();
   document.fonts.add(face);const ctx=document.createElement('canvas').getContext('2d');if(!ctx)return null;
   const font='"ARVoucherArialBold"';ctx.font=`1000px ${font}`;
   return {font,advances:Array.from('0123456789',digit=>ctx.measureText(digit).width)};
  }catch{return null;}
 })();
}
/** Some OPERA Arial Bold subsets omit unused digits. Keep their original glyphs
 * and use the installed same face only for missing digits, with source advances. */
export async function completeVoucherDigits(run:DetectedText,load:()=>Promise<LocalDigits|null>=localArialBold):Promise<void>{
 if(run.field!=='voucher-number'||!run.sourceText||!/^Arial[ ,\-]*Bold(?:MT)?$/i.test((run.fontLabel??'').replace(/^[A-Z]{6}\+/,'')))return;
 const style=sourceStyle(createReplacementLayer(run,'voucher-digits'));if(!style?.supported)return;
 const digits=Array.from('0123456789'),missing=digits.filter(d=>!style.glyphs.has(d));if(!missing.length)return;
 const known=digits.flatMap(d=>style.glyphs.has(d)?[style.glyphs.get(d)!]:[]);
 const width=known[0]?.width;
 if(known.length<2||!Number.isFinite(width)||width<=0||known.some(g=>g.width!==width||g.isInFont===false))return;
 const local=await load();if(!local||local.advances.length!==10||local.advances.some(advance=>!Number.isFinite(advance)||Math.abs(advance-width)>1))return;
 const glyphs=new Map(style.glyphs);
 for(const digit of missing)glyphs.set(digit,{unicode:digit,fontChar:digit,width,isInFont:true,fallbackFont:local.font});
 registerSourceStyle(run.sourceText,{...style,glyphs});
}
