export type TextEdit = {text:string; caret:number};

export function insertTextLine(text:string,start:number,end=start):TextEdit {
  const from=Math.max(0,Math.min(start,text.length)),through=Math.max(from,Math.min(end,text.length));
  return {text:text.slice(0,from)+'\n'+text.slice(through),caret:from+1};
}

export function removeTextLine(text:string,start:number,end=start):TextEdit {
  const caret=Math.max(0,Math.min(start,text.length)),last=Math.max(caret,Math.min(end,text.length));
  const from=caret===0?0:text.lastIndexOf('\n',caret-1)+1;
  const next=text.indexOf('\n',Math.max(caret,last-1));
  if(next>=0)return {text:text.slice(0,from)+text.slice(next+1),caret:from};
  const before=from>0?from-1:0;
  return {text:text.slice(0,before),caret:before};
}
