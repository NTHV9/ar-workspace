import type {Page} from '@playwright/test';
export async function choosePdfTool(page:Page,name:string){
 const button=page.getByRole('button',{name,exact:true,includeHidden:true});
 if(!await button.isVisible()){const menu=page.locator('details.pdf-tool-group').filter({has:button});await menu.locator('summary').click();}
 await button.click();
}

/** Draw through the same pointer interaction used by staff, in fixture PDF units. */
export async function drawPdfWhiteout(page:Page,rect={x:45,y:70,width:210,height:65},size={width:595,height:842}){
 await page.locator('.pdf-paper .pdf-canvas[data-render-state="ready"]').waitFor({state:'attached'});
 await choosePdfTool(page,'Whiteout');
 const paper=page.locator('.pdf-paper');
 await page.locator('.pdf-page-scroll').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});
 const box=await paper.boundingBox();
 if(!box)throw new Error('PDF paper is unavailable');
 const point=(x:number,y:number)=>({x:box.x+x/size.width*box.width,y:box.y+y/size.height*box.height});
 const start=point(rect.x,rect.y),end=point(rect.x+rect.width,rect.y+rect.height);
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
}
