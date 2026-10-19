export type NativeLine={index:number;style:{text:string;rect:number[];baseline:number[];font:string;baseFont:string;size:number;bold:boolean;italic:boolean;color:number[];decodable:boolean;visualOrder:boolean}};
export type NativeRequest={bytes:Uint8Array;page:number;edits:{id:string;expectedText:string;text:string;x:number;baseline:number;fontSize:number;fontLabel:string;color:string;bold:boolean;italic:boolean}[]};
export type NativeResult={bytes:Uint8Array;applied:string[]};
export function matchNativeLine(lines:NativeLine[],edit:NativeRequest['edits'][number]):NativeLine|undefined{
 const hex=(color:number[])=>'#'+color.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
 const norm=(s:string)=>s.replace(/^[A-Z]{6}\+/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
 const found=lines.filter(({style:s})=>s.text===edit.expectedText&&Math.abs(s.baseline[0]-edit.x)<.1&&Math.abs(s.baseline[1]-edit.baseline)<.1&&Math.abs(s.size-edit.fontSize)<.01&&norm(s.baseFont)===norm(edit.fontLabel)&&s.bold===edit.bold&&s.italic===edit.italic&&hex(s.color).toLowerCase()===edit.color.toLowerCase()&&s.decodable&&!s.visualOrder);
 return found.length===1?found[0]:undefined;
}
