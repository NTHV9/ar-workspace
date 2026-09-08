import { OperaError } from './client';
export interface ReadPage<T> { rows:T[]; hasMore?:boolean; count?:number; totalResults?:number; offset?:number }

/** Completes one stable query before any caller may publish its collected members. */
export async function collectPages<T>(read:(offset:number,limit:number)=>Promise<ReadPage<T>>,identity:(row:T)=>string,limit=50):Promise<T[]> {
  if(!Number.isSafeInteger(limit)||limit<1)throw new OperaError('invalid_request');
  const rows:T[]=[];const seen=new Set<string>();let offset=0,total:number|undefined;
  while(true) {
    const page=await read(offset,limit);
    if(!Array.isArray(page.rows)||(page.hasMore!==undefined&&typeof page.hasMore!=='boolean'))throw new OperaError('invalid_response');
    if(page.offset!==undefined&&page.offset!==offset)throw new OperaError('pagination_changed');
    if(page.count!==undefined&&page.count!==page.rows.length)throw new OperaError('pagination_incomplete');
    if(page.totalResults!==undefined){
      if(!Number.isSafeInteger(page.totalResults)||page.totalResults<0)throw new OperaError('invalid_response');
      if(total!==undefined&&total!==page.totalResults)throw new OperaError('pagination_changed');
      total=page.totalResults;
    }
    for(const row of page.rows){const key=identity(row);if(!key)throw new OperaError('invalid_response');if(seen.has(key))throw new OperaError('duplicate_member');seen.add(key);rows.push(row);}
    if(total!==undefined&&rows.length>total)throw new OperaError('pagination_incomplete');
    // Oracle's published contract treats absent hasMore as the end; totals are still checked.
    if(!page.hasMore){if(total!==undefined&&rows.length!==total)throw new OperaError('pagination_incomplete');return rows;}
    if(page.rows.length===0)throw new OperaError('pagination_incomplete');
    offset+=page.rows.length;
  }
}
