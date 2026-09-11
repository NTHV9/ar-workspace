import { OperaError } from './client';
export interface ReadPage<T> { rows:T[]; hasMore?:boolean; count?:number; logicalCount?:number; totalResults?:number; offset?:number; nextOffset?:number }
/** This environment was verified to return requested offset + requested limit,
 * including the partial last page. This is an explicit adapter, not a heuristic. */
export function verifiedNextCursor(page:Record<string,unknown>,requestedOffset:number,limit:number):number {
  if(page.limit!==limit||page.offset!==requestedOffset+limit)throw new OperaError('pagination_changed');
  return page.offset as number;
}

/** Completes one stable query before any caller may publish its collected members. */
export interface PaginationPolicy { allowExtraUniqueRows?:boolean; onExtraRows?:(counts:{reported:number;observed:number})=>void }
export async function collectPages<T>(read:(offset:number,limit:number)=>Promise<ReadPage<T>>,identity:(row:T)=>string,limit=50,policy:PaginationPolicy={}):Promise<T[]> {
  if(!Number.isSafeInteger(limit)||limit<1)throw new OperaError('invalid_request');
  if(policy.allowExtraUniqueRows&&!policy.onExtraRows)throw new OperaError('invalid_configuration');
  const rows:T[]=[];const seen=new Set<string>();let offset=0,total:number|undefined,collected=0;
  while(true) {
    const page=await read(offset,limit);
    if(!Array.isArray(page.rows)||(page.hasMore!==undefined&&typeof page.hasMore!=='boolean'))throw new OperaError('invalid_response');
    if(page.offset!==undefined&&page.offset!==offset)throw new OperaError('pagination_changed');
    if(page.count!==undefined&&page.count!==page.rows.length)throw new OperaError('pagination_incomplete',undefined,'paging_count_mismatch',undefined,{declared:page.count,actual:page.rows.length,offset});
    const logical=page.logicalCount??page.rows.length;
    if(!Number.isSafeInteger(logical)||logical<0||logical>page.rows.length||(page.rows.length>0&&logical===0))throw new OperaError('invalid_response');
    collected+=logical;
    if(page.totalResults!==undefined){
      if(!Number.isSafeInteger(page.totalResults)||page.totalResults<0)throw new OperaError('invalid_response');
      if(total!==undefined&&total!==page.totalResults)throw new OperaError('pagination_changed');
      total=page.totalResults;
    }
    for(const row of page.rows){const key=identity(row);if(!key)throw new OperaError('invalid_response');if(seen.has(key))throw new OperaError('duplicate_member');seen.add(key);rows.push(row);}
    if(total!==undefined&&collected>total&&!policy.allowExtraUniqueRows)throw new OperaError('pagination_incomplete',undefined,'paging_total_exceeded',undefined,{collected,total,offset,pageRows:page.rows.length});
    // Oracle's published contract treats absent hasMore as the end; totals are still checked.
    if(!page.hasMore){
      if(total!==undefined&&collected<total)throw new OperaError('pagination_incomplete',undefined,'paging_total_missing',undefined,{collected,total,offset,pageRows:page.rows.length});
      if(total!==undefined&&collected>total){
        if(!policy.allowExtraUniqueRows||page.hasMore!==false)throw new OperaError('pagination_incomplete');
        policy.onExtraRows!({reported:total,observed:collected});
      }
      return rows;
    }
    if(page.rows.length===0)throw new OperaError('pagination_incomplete',undefined,'paging_empty_intermediate',undefined,{collected:rows.length,total:total??-1,offset});
    if(page.nextOffset!==undefined){if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw new OperaError('pagination_changed');offset=page.nextOffset;}
    else offset+=logical;
  }
}
