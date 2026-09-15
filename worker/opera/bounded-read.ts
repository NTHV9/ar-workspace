/** Only independent reads may overlap. Keep source comparisons and writes outside
 * each batch barrier. A rejected read drains its peers before the step can retry. */
export async function mapFinancialReads<T,R>(items:readonly T[],read:(item:T)=>Promise<R>):Promise<R[]> {
 const results:R[]=[];
 for(let offset=0;offset<items.length;offset+=3){
  const settled=await Promise.allSettled(items.slice(offset,offset+3).map(async item=>read(item)));
  for(const result of settled){if(result.status==='rejected')throw result.reason;results.push(result.value);}
 }
 return results;
}
