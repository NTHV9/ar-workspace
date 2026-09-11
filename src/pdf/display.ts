import type {PdfProjectPage} from './types';

/** PDF points stay unchanged; only the display bitmap follows CSS width and HiDPI. */
export function displayScale(page:Pick<PdfProjectPage,'width'|'height'>,cssWidth:number,dpr:number){
 return Math.min(Math.max(.1,cssWidth*Math.max(1,dpr||1)/page.width),Math.sqrt(20_000_000/(page.width*page.height)));
}
export function observeDisplay(element:HTMLElement,changed:()=>void){
 const observer=new ResizeObserver(changed);observer.observe(element);
 let media:MediaQueryList;
 const densityChanged=()=>{media?.removeEventListener('change',densityChanged);media=matchMedia(`(resolution: ${devicePixelRatio}dppx)`);media.addEventListener('change',densityChanged);changed();};
 densityChanged();window.addEventListener('resize',changed);
 return ()=>{observer.disconnect();media.removeEventListener('change',densityChanged);window.removeEventListener('resize',changed);};
}
