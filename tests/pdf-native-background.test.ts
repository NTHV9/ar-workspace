import {describe,it,expect,vi} from 'vitest';
import {flatMaskBackground,sourceMaskFill} from '../src/pdf/mask-background';
import type {PdfLayer} from '../src/pdf/types';
describe('safe source replacement backgrounds',()=>{
 it('samples a bounded original source region even when the replacement moved',()=>{
  const getImageData=vi.fn((_x:number,_y:number,w:number,h:number)=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);return {data};});
  const canvas={width:2500,height:3500,getContext:()=>({getImageData})} as unknown as HTMLCanvasElement;
  const layer={fill:'#ffffff',x:300,y:500,original:{x:20,y:30,width:80,height:20}} as PdfLayer;
  expect(sourceMaskFill(canvas,2,layer,{x:299,y:499,width:82,height:22,sourceX:19,sourceY:29})).toBe('rgb(12,60,130)');
  expect(getImageData.mock.calls[0]).toEqual([34,54,172,52]);
 });
 it('preserves flat blue behind white INVOICE text',()=>{const data=new Uint8ClampedArray(12*12*4);for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);expect(flatMaskBackground(data,12,12,{x:3,y:3,width:6,height:6})).toBe('rgb(12,60,130)');});
 it('refuses nonuniform artwork instead of painting a white rectangle',()=>{const data=new Uint8ClampedArray(12*12*4).fill(255);for(let y=0;y<12;y++)for(let x=0;x<6;x++)data.set([12,60,130,255],(y*12+x)*4);expect(()=>flatMaskBackground(data,12,12,{x:3,y:3,width:6,height:6})).toThrow(/background/i);});
});
