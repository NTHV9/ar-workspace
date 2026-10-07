import type {PdfProject} from './types';

export type DeliveryGroup = {id:string;name:string};
/** Names are local to this preparation. Original source files are never renamed. */
export function pdfFilename(input:string):string {
  if(input.trim()!==input || /[\x00-\x1f\x7f<>:"/\\|?*]/.test(input) || input.includes('..')) throw Error('Use a filename without paths, control characters or <>:"/\\|?*.');
  const stem=input.replace(/\.pdf$/i,'');
  if(!stem || /[. ]$/.test(stem) || /\.pdf$/i.test(stem)) throw Error('Enter a name with one .pdf extension.');
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) throw Error('Choose a different name; this name is reserved.');
  const name=/\.pdf$/i.test(input)?input:stem+'.pdf';
  if(name.length>200) throw Error('Use a filename of 200 characters or fewer, including .pdf.');
  return name;
}
/** Provider labels may contain punctuation that is unsuitable for an output name.
 * Clean generated defaults only; never silently rewrite a user's chosen name. */
export function defaultPdfFilename(group:DeliveryGroup,index:number):string {
  let stem=group.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,100).replace(/\.{2,}/g,'.').replace(/^[. ]+|[. ]+$/g,'');
  while(/\.pdf$/i.test(stem))stem=stem.slice(0,-4).replace(/[. ]+$/g,'');
  return pdfFilename(`${String(index+1).padStart(2,'0')}-${stem||'Documents'}.pdf`);
}
export function deliveryFilenames(project:PdfProject,groups:DeliveryGroup[]):string[] {
  const names=groups.map((group,index)=>pdfFilename(project.outputNames?.[group.id]??defaultPdfFilename(group,index)));
  const seen=new Set<string>();
  for(const name of names){const key=name.normalize('NFC').toLowerCase();if(seen.has(key))throw Error('Each output PDF needs a different filename.');seen.add(key);}
  return names;
}
