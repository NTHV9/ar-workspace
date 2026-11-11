export interface GroupData {key:string;hotel:string;agent:string;accountNo?:string;row:number;cents:number[]}
export interface GroupMarker {row:number;start:number;end:number;label:string;cents:number[]}
export interface GroupTotal {kind:'total';oldRow:number|null;templateRow:number;category:string;agent:string;start:number;end:number;row:number;count:number;cents:number[];rebuild:boolean}
export interface GroupItem {kind:'data';oldRow:number;row:number;key:string}
export interface GroupPlan {start:number;end:number;newEnd:number;items:(GroupItem|GroupTotal)[];changed:boolean}
const fail=():never=>{throw Error('tracker_transfer_layout_invalid');};
export function moneyCents(value:unknown):number {
 if(value===null||value===undefined||value==='')return 0;
 const n=typeof value==='number'?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(value)?Number(value):NaN;
 const cents=Math.round(n*100);if(!Number.isSafeInteger(cents)||Math.abs(n*100-cents)>.01)fail();return cents;
}
export function groupMarker(row:number,label:string,formula:string,cents:number[]):GroupMarker|null {
 if(!label.startsWith('▸ รวม '))return null;
 const f=/^SUBTOTAL\(9,H(\d+)(?::H(\d+))?\)$/i.exec(formula),l=/^▸ รวม (.+) \(\d+ ใบ\)$/.exec(label);
 if(!f||!l||cents.length!==7)return fail();
 return {row,start:Number(f[1]),end:Number(f[2]??f[1]),label,cents};
}
/** Reuse existing subtotal rows and styles; create a target group only when needed. */
export function planGroups(data:readonly GroupData[],markers:readonly GroupMarker[]):GroupPlan|null {
 if(!markers.length)return null;
 const sorted=[...markers].sort((a,b)=>a.row-b.row),start=sorted[0].start,end=sorted.at(-1)!.row;
 if(start!==3||sorted.some((m,i)=>m.row!==m.end+1||m.start>(m.end)||i>0&&m.start!==sorted[i-1].row+1))fail();
 const byRow=new Map(data.map(r=>[r.row,r]));if(byRow.size!==data.length||data.some(r=>r.row<start||r.row>end||!r.agent||r.cents.length!==7))fail();
 const category=(r:GroupData)=>r.accountNo?.toUpperCase().includes('CCR')?'0':'1';
 const originals:{marker:GroupMarker;category:string;agent:string|null}[]=[];
 for(const marker of sorted){
  const rows=Array.from({length:marker.end-marker.start+1},(_,i)=>byRow.get(marker.start+i));
  if(rows.some(r=>!r))fail();
  const type=category(rows[0]!);if(rows.some(r=>category(r!)!==type))fail();
  const name=/^▸ รวม (.+) \(\d+ ใบ\)$/.exec(marker.label)![1];
  const candidates=[...new Set(rows.map(r=>r!.agent))].filter(a=>a.startsWith(name));
  if(candidates.length>1)fail();
  originals.push({marker,category:type,agent:candidates[0]??null});
 }
 if(data.length!==sorted.reduce((sum,m)=>sum+m.end-m.start+1,0))fail();
 const key=(c:string,a:string)=>JSON.stringify([c,a]);
 const groups=new Map<string,{category:string;agent:string;rows:GroupData[];marker?:GroupMarker}>();
 for(const row of data){const k=key(category(row),row.agent);let g=groups.get(k);if(!g){g={category:category(row),agent:row.agent,rows:[]};groups.set(k,g);}g.rows.push(row);}
 const order:string[]=[];
 for(const o of originals)if(o.agent){const k=key(o.category,o.agent),g=groups.get(k);if(g&&!order.includes(k)){g.marker=o.marker;order.push(k);}else if(g)fail();}
 for(const [k,g]of groups)if(!order.includes(k)){
  let position=order.findIndex(v=>{const other=groups.get(v)!;return other.category>g.category||other.category===g.category&&other.agent.toLowerCase()>g.agent.toLowerCase();});
  if(position<0)position=order.length;order.splice(position,0,k);
 }
 const used=new Set(order.flatMap(k=>groups.get(k)!.marker?.row??[]));
 const spare=originals.map(o=>o.marker).filter(m=>!used.has(m.row));
 const items:GroupPlan['items']=[];let cursor=start,changed=false;
 for(const k of order){
  const g=groups.get(k)!,rows=[...g.rows].sort((a,b)=>a.row-b.row),begin=cursor,sums=Array<number>(7).fill(0);
  for(const row of rows){for(let i=0;i<7;i++){sums[i]+=row.cents[i];if(!Number.isSafeInteger(sums[i]))fail();}items.push({kind:'data',oldRow:row.row,row:cursor,key:row.key});changed||=row.row!==cursor;cursor++;}
  const marker=g.marker??spare.shift(),label='▸ รวม '+g.agent+' ('+rows.length+' ใบ)';
  items.push({kind:'total',oldRow:marker?.row??null,templateRow:marker?.row??sorted[0].row,category:g.category,agent:g.agent,start:begin,end:cursor-1,row:cursor,count:rows.length,cents:sums,rebuild:!marker||marker.label!==label||marker.cents.some((c,i)=>c!==sums[i])||rows.length!==marker.end-marker.start+1||rows.some(r=>r.row<marker.start||r.row>marker.end)});
  changed||=!marker||marker.row!==cursor||marker.start!==begin||marker.end!==cursor-1||marker.label!==label||marker.cents.some((c,i)=>c!==sums[i]);
  cursor++;
 }
 changed||=cursor-1!==end;
 return {start,end,newEnd:cursor-1,items,changed};
}
