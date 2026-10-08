import {pdfFilename} from '../pdf/filenames';
export interface GeneratedName {storageKey:string;name:string}
/** Names describe a draft snapshot, never replace stored bytes. */
export function generatedNames(value:unknown,original?:Map<string,string>,validate=true):GeneratedName[]{
 if(!Array.isArray(value)||value.length>50)throw Error('email_generated_names_invalid');
 const keys=new Set<string>(),names=new Set<string>();
 return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==2||Object.keys(item).some(k=>!['storageKey','name'].includes(k))||typeof item.storageKey!=='string'||!item.storageKey||item.storageKey.length>1024||typeof item.name!=='string'||!item.name||item.name.length>200)throw Error('email_generated_names_invalid');
  let name:string;try{name=!validate||original?.get(item.storageKey)===item.name?item.name:pdfFilename(item.name);}catch{throw Error('email_generated_names_invalid');}
  const folded=name.normalize('NFC').toLowerCase();if(keys.has(item.storageKey)||names.has(folded))throw Error('email_generated_names_invalid');
  keys.add(item.storageKey);names.add(folded);return {storageKey:item.storageKey,name};
 });
}
