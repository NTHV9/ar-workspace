/** Only independent reads may overlap. Keep source comparisons and writes outside
 * this barrier. Stop admission after a rejection and drain peers before retry. */
export async function mapFinancialReads<T,R>(items:readonly T[],read:(item:T)=>Promise<R>):Promise<R[]> {
 const results:R[]=new Array(items.length);let next=0,failed=false,failure:unknown;
 const worker=async()=>{while(!failed&&next<items.length){const index=next++;try{results[index]=await read(items[index]);}catch(error){if(!failed){failed=true;failure=error;}return;}}};
 await Promise.all(Array.from({length:Math.min(3,items.length)},worker));
 if(failed)throw failure;
 return results;
}
