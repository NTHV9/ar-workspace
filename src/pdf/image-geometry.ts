type Size={width:number;height:number};
export function fitImage(width:number,height:number,maxWidth:number,maxHeight:number):Size{
 if(![width,height,maxWidth,maxHeight].every(v=>Number.isFinite(v)&&v>0))throw Error('The image dimensions could not be read. Choose another PNG or JPEG.');
 const factor=Math.min(maxWidth/width,maxHeight/height);return {width:width*factor,height:height*factor};
}
export function resizeImage(size:Size,change:Partial<Size>,maxWidth:number,maxHeight:number):Size{
 const factor=change.width!==undefined?change.width/size.width:change.height!==undefined?change.height/size.height:1;
 const scale=Math.min(Math.max(.01,factor),maxWidth/size.width,maxHeight/size.height);
 return {width:size.width*scale,height:size.height*scale};
}
export async function readImageSize(data:string):Promise<Size>{
 const image=new Image();image.src=data;
 try{await image.decode();}catch{throw Error('The image could not be decoded. Choose another PNG or JPEG.');}
 if(!image.naturalWidth||!image.naturalHeight)throw Error('The image dimensions could not be read.');
 return {width:image.naturalWidth,height:image.naturalHeight};
}
