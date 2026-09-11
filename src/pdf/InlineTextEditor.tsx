import {useLayoutEffect,useMemo,type RefObject} from 'react';
import {sourceEditingStyle,measureLayerText} from './source-text';
import type {PdfLayer} from './types';

export function InlineTextEditor({layer,scale,inputRef,invalid,onChange,onFocus}:{layer:PdfLayer;scale:number;inputRef:RefObject<HTMLTextAreaElement|null>;invalid:boolean;onChange:(value:string)=>void;onFocus:(input:HTMLTextAreaElement)=>void}){
 const font=sourceEditingStyle(layer);
 const baseline=useMemo(()=>{const ctx=document.createElement('canvas').getContext('2d')!;ctx.font=`${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;const metrics=ctx.measureText('Mg');const ascent=metrics.fontBoundingBoxAscent??font.fontSize*.8,descent=metrics.fontBoundingBoxDescent??font.fontSize*.2;return ascent+(font.fontSize*font.lineHeight-ascent-descent)/2;},[font.fontFamily,font.fontSize,font.fontStyle,font.fontWeight,font.lineHeight]);
 const layout=measureLayerText(layer);
 const textScale=useMemo(()=>{const ctx=document.createElement('canvas').getContext('2d')!;ctx.font=`${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`;const width=Math.max(0,...layer.text.split('\n').map(line=>ctx.measureText(line).width));return width&&layer.sourceText?Math.max(.25,Math.min(4,layout.naturalWidth/width)):1;},[font.fontFamily,font.fontSize,font.fontStyle,font.fontWeight,layer.text,layer.sourceText,layout.naturalWidth]);
 const top=layer.sourceText?(font.baseline-baseline)*scale:2*scale;
 useLayoutEffect(()=>{
  const input=inputRef.current,scroller=input?.closest('.pdf-page-scroll');if(!input||document.activeElement!==input||!scroller)return;
  input.scrollTop=0;input.scrollLeft=0;
  const style=getComputedStyle(input),mirror=document.createElement('div'),caret=document.createElement('span');
  Object.assign(mirror.style,{position:'fixed',left:'-20000px',top:'0',visibility:'hidden',width:input.clientWidth+'px',whiteSpace:input.wrap==='off'?'pre':'pre-wrap',overflowWrap:'break-word',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,fontStyle:style.fontStyle,lineHeight:style.lineHeight});
  mirror.textContent=input.value.slice(0,input.selectionStart);caret.textContent='\u200b';mirror.appendChild(caret);document.body.appendChild(mirror);
  const marker=caret.getBoundingClientRect(),origin=mirror.getBoundingClientRect(),box=input.getBoundingClientRect(),view=scroller.getBoundingClientRect(),line=parseFloat(style.lineHeight);
  const y=box.top+marker.top-origin.top,x=box.left+(marker.left-origin.left)*(box.width/input.clientWidth);mirror.remove();
  if(y+line>view.bottom-12)scroller.scrollTop+=y+line-view.bottom+12;else if(y<view.top+12)scroller.scrollTop-=view.top+12-y;
  if(x>view.right-12)scroller.scrollLeft+=x-view.right+12;else if(x<view.left+12)scroller.scrollLeft-=view.left+12-x;
 },[layer.text,layer.height,scale,inputRef]);
 return <textarea ref={inputRef} className={'pdf-inline-text'+(invalid?' needs-font':'')} aria-label="Edit document text" spellCheck={false} autoComplete="off" wrap={layout.lines.length===1?'off':'soft'} value={layer.text} onFocus={event=>onFocus(event.currentTarget)} onChange={event=>onChange(event.target.value)} onPointerDown={event=>event.stopPropagation()} style={{fontFamily:font.fontFamily,fontSize:font.fontSize*scale,fontWeight:font.fontWeight,fontStyle:font.fontStyle,lineHeight:font.lineHeight,caretColor:layer.color,left:layer.sourceText?0:3*scale,top,width:`calc(${100/textScale}% + 2px)`,whiteSpace:layout.lines.length===1?'pre':'pre-wrap',height:`calc(100% + ${Math.abs(top)+2}px)`,transform:`scaleX(${textScale})`,transformOrigin:'top left'}}/>;
}
