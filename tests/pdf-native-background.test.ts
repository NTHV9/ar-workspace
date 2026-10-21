import {describe,it,expect,vi} from 'vitest';
import {flatMaskBackground,sourceMaskFill,assertMaskInterior,verifiedMaskBackground} from '../src/pdf/mask-background';
import type {PdfLayer} from '../src/pdf/types';
describe('safe source replacement backgrounds',()=>{
 it('keeps dense text unqualified when there is insufficient clear background evidence',()=>{
  const width=160,height=16,rect={x:5,y:5,width:150,height:5},original=new Uint8ClampedArray(width*height*4).fill(255),matte=new Uint8ClampedArray(width*height*4);
  for(let x=0;x<width;x++)original.set([0,0,0,255],(3*width+x)*4);
  for(let x=6;x<155;x+=3)for(let y=5;y<10;y++){const i=(y*width+x)*4;original.set([0,0,0,255],i);matte.set([0,0,0,255],i);}
  // Side strips and aggregate ink similarity do not prove the interior safe.
  for(const faintBridge of [false,true])for(const mark of ['none','black','gray','light','solid']){
   const data=original.slice(),expected=matte.slice();
   if(faintBridge)for(let x=6;x<155;x++){const i=(5*width+x)*4;if(!expected[i+3]){data.set([223,223,223,255],i);expected.set([0,0,0,32],i);}}
   if(mark==='solid')for(let y=5;y<10;y++)for(let x=5;x<155;x++)data.set([0,0,0,255],(y*width+x)*4);
   else if(mark!=='none'){const color=mark==='black'?0:mark==='gray'?150:230;for(let x=6;x<16;x++){const i=(7*width+x)*4;if(!expected[i+3])data.set([color,color,color,255],i);}}
   expect(()=>verifiedMaskBackground(data,expected,width,height,rect,2,'#000000')).toThrow(/background|artwork/i);
  }
 });
 it('allows a nearby table rule outside the painted mask but rejects it inside',()=>{
  const data=new Uint8ClampedArray(20*20*4).fill(255),matte=new Uint8ClampedArray(20*20*4),rect={x:4,y:5,width:12,height:8};
  for(let x=0;x<20;x++)data.set([0,0,0,255],(14*20+x)*4);
  for(let y=7;y<11;y++)for(let x=8;x<11;x++){const i=(y*20+x)*4;data.set([0,0,0,255],i);matte.set([0,0,0,255],i);}
  expect(()=>flatMaskBackground(data,20,20,rect)).toThrow(/background/i);
  expect(verifiedMaskBackground(data,matte,20,20,rect,1,'#000000')).toBe('rgb(255,255,255)');
  for(let x=4;x<16;x++)data.set([0,0,0,255],(12*20+x)*4);
  expect(()=>verifiedMaskBackground(data,matte,20,20,rect,1,'#000000')).toThrow(/background|artwork/i);
 });
 it('keeps colored backgrounds and refuses mixed or unprovable interior surfaces',()=>{
  const data=new Uint8ClampedArray(20*20*4),matte=new Uint8ClampedArray(20*20*4),rect={x:4,y:5,width:12,height:8};
  for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);
  for(let x=0;x<20;x++)data.set([0,0,0,255],(14*20+x)*4);
  const i=(8*20+9)*4;data.set([255,255,255,255],i);matte.set([255,255,255,255],i);
  expect(verifiedMaskBackground(data,matte,20,20,rect,1,'#ffffff')).toBe('rgb(12,60,130)');
  data.set([100,100,100,255],(7*20+5)*4);
  expect(()=>verifiedMaskBackground(data,matte,20,20,rect,1,'#ffffff')).toThrow(/background|artwork/i);
  matte.fill(255);expect(()=>verifiedMaskBackground(data,matte,20,20,rect,1,'#ffffff')).toThrow(/background/i);
 });
 it('protects fractional mask edges at the 1.5x inspection scale',()=>{
  const data=new Uint8ClampedArray(30*30*4).fill(255),matte=new Uint8ClampedArray(30*30*4),rect={x:4.2*1.5,y:5.1*1.5,width:10.4*1.5,height:6.2*1.5};
  const edge=Math.ceil(rect.y+rect.height);
  for(let x=0;x<30;x++)data.set([0,0,0,255],(edge*30+x)*4);
  for(let y=10;y<13;y++)for(let x=12;x<15;x++){const i=(y*30+x)*4;data.set([0,0,0,255],i);matte.set([0,0,0,255],i);}
  expect(verifiedMaskBackground(data,matte,30,30,rect,2,'#000000')).toBe('rgb(255,255,255)');
  for(let x=6;x<23;x++)data.set([0,0,0,255],((edge-1)*30+x)*4);
  expect(()=>verifiedMaskBackground(data,matte,30,30,rect,2,'#000000')).toThrow(/background|artwork/i);
 });
 it('refuses artwork fully inside a flat perimeter while allowing known original glyph ink',()=>{const data=new Uint8ClampedArray(16*16*4).fill(255),matte=new Uint8ClampedArray(16*16*4);data.set([0,0,0,255],(8*16+8)*4);expect(flatMaskBackground(data,16,16,{x:3,y:3,width:9,height:9})).toBe('rgb(255,255,255)');expect(()=>assertMaskInterior(data,matte,16,16,{x:3,y:3,width:9,height:9},'rgb(255,255,255)',0)).toThrow(/artwork/i);matte[(8*16+8)*4+3]=255;expect(()=>assertMaskInterior(data,matte,16,16,{x:3,y:3,width:9,height:9},'rgb(255,255,255)',0)).not.toThrow();});
 it('samples a bounded original source region even when the replacement moved',()=>{
  const getImageData=vi.fn((_x:number,_y:number,w:number,h:number)=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);return {data};});
  const canvas={width:2500,height:3500,getContext:()=>({getImageData})} as unknown as HTMLCanvasElement;
  const layer={fill:'#ffffff',x:300,y:500,original:{x:20,y:30,width:80,height:20}} as PdfLayer;
  expect(()=>sourceMaskFill(canvas,2,layer,{x:299,y:499,width:82,height:22,sourceX:19,sourceY:29})).toThrow(/cannot be verified/i);
  expect(getImageData.mock.calls[0]).toEqual([34,54,172,52]);
 });
 it('allows original white glyph ink on blue but rejects differently colored artwork within its glyph region',()=>{const data=new Uint8ClampedArray(16*16*4),matte=new Uint8ClampedArray(16*16*4);for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);const pixel=(8*16+8)*4;data.set([255,255,255,255],pixel);matte.set([255,255,255,255],pixel);expect(()=>assertMaskInterior(data,matte,16,16,{x:3,y:3,width:9,height:9},'rgb(12,60,130)',1)).not.toThrow();data.set([0,0,0,255],pixel);expect(()=>assertMaskInterior(data,matte,16,16,{x:3,y:3,width:9,height:9},'rgb(12,60,130)',1)).toThrow(/artwork/i);});
 it('accepts continuous antialias coverage missing from discrete matte samples',()=>{const data=new Uint8ClampedArray(12*12*4).fill(255),matte=new Uint8ClampedArray(12*12*4);const i=(6*12+6)*4;data.set([181,181,181,255],i);matte.set([0,0,0,255],i);expect(()=>assertMaskInterior(data,matte,12,12,{x:3,y:3,width:6,height:6},'rgb(255,255,255)',1,'#000000')).not.toThrow();data.set([181,60,60,255],i);expect(()=>assertMaskInterior(data,matte,12,12,{x:3,y:3,width:6,height:6},'rgb(255,255,255)',1,'#000000')).toThrow(/artwork/i);});
 it('preserves flat blue behind white INVOICE text',()=>{const data=new Uint8ClampedArray(12*12*4);for(let i=0;i<data.length;i+=4)data.set([12,60,130,255],i);expect(flatMaskBackground(data,12,12,{x:3,y:3,width:6,height:6})).toBe('rgb(12,60,130)');});
 it('refuses nonuniform artwork instead of painting a white rectangle',()=>{const data=new Uint8ClampedArray(12*12*4).fill(255);for(let y=0;y<12;y++)for(let x=0;x<6;x++)data.set([12,60,130,255],(y*12+x)*4);expect(()=>flatMaskBackground(data,12,12,{x:3,y:3,width:6,height:6})).toThrow(/background/i);});
});
