import {afterEach,expect,it,vi} from 'vitest';
import {trackerHeaders} from '../worker/tracker-sync/workbook';
import {readNativeTracker,writeNativeTrackerTransfers} from '../worker/tracker-sync/native';
import type {TransferWrite} from '../worker/tracker-sync/transfer-model';
const file='synthetic_transfer_tracker_12345',title='ลูกหนี้ เขาหลัก',column=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
type Cell={userEnteredValue?:{stringValue?:string;numberValue?:number;formulaValue?:string};effectiveValue?:{stringValue?:string};textFormatRuns?:unknown[]};
function native(options:{lost?:boolean;rich?:boolean;grouped?:'existing'|'new';sole?:boolean;urgent?:boolean;lookupEnd?:number}={}){
 const headers:Cell[]=Array.from({length:33},()=>({}));
 for(const [col,value]of Object.entries(trackerHeaders))headers[column(col)]={userEnteredValue:{stringValue:value}};
 headers[1]={userEnteredValue:{stringValue:'Agent'}};
 const cells:Cell[]=Array.from({length:33},()=>({}));
 for(const [col,value]of Object.entries({A:'SAN',B:'OLD',C:'A',E:'17',F:'3',G:'2026-11-01',R:'2026-11-02',S:'30',AB:'Preserve note',AG:'SAN|OLD|I:17|1'}))cells[column(col)]={userEnteredValue:{stringValue:value}};
 cells[column('T')]={userEnteredValue:{formulaValue:'=R3+S3'},effectiveValue:{stringValue:'2026-12-02'}};
 if(options.rich)cells[1].textFormatRuns=[{startIndex:0}];
 const rows=[{values:[] as Cell[]},{values:headers},{values:cells}],posts:unknown[][]=[];
 if(options.grouped){
  const amount=(r:Cell[],n:number)=>{r[7]={userEnteredValue:{numberValue:n}};for(let i=8;i<14;i++)r[i]={userEnteredValue:{numberValue:i===8?n:0}};};
  amount(cells,30);
  const two=structuredClone(cells);two[4]={userEnteredValue:{stringValue:'18'}};two[32]={userEnteredValue:{stringValue:'SAN|OLD|I:18|1'}};amount(two,20);
  const total=(agent:string,n:number,start:number,end:number,sum:number)=>{const r:Cell[]=Array.from({length:33},()=>({}));r[3]={userEnteredValue:{stringValue:'▸ รวม '+agent+' ('+n+' ใบ)'}};amount(r,sum);r[7]={userEnteredValue:{formulaValue:'=SUBTOTAL(9,H'+start+':H'+end+')'},effectiveValue:{numberValue:sum} as never};return {values:r};};
  if(!options.sole)rows.push({values:two});rows.push(total('OLD',options.sole?1:2,3,options.sole?3:4,options.sole?30:50));
  if(options.grouped==='existing'){
   const three=structuredClone(cells);three[1]={userEnteredValue:{stringValue:'NEW'}};three[2]={userEnteredValue:{stringValue:'B'}};three[4]={userEnteredValue:{stringValue:'19'}};three[32]={userEnteredValue:{stringValue:'SAN|NEW|I:19|1'}};amount(three,10);
   const at=rows.length+1;rows.push({values:three},total('NEW',1,at,at,10));
  }
 }
 const urgent=[{values:[] as Cell[]},{values:Array.from({length:18},(_,i)=>i===1?{userEnteredValue:{stringValue:'Agent'}}:{})},{values:Array.from({length:18},(_,i)=>i===1?{userEnteredValue:{stringValue:'OLD'}}:i===17?{userEnteredValue:{stringValue:'SAN|OLD|I:17|1'}}:i===8?{userEnteredValue:{formulaValue:"=INDEX('ลูกหนี้ เขาหลัก'!$R$3:$R$100000,MATCH($R3,'ลูกหนี้ เขาหลัก'!$AG$3:$AG$"+(options.lookupEnd??100000)+",0))"}}:{})}];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  expect(url.origin).toBe('https://sheets.googleapis.com');
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body));posts.push(body.requests);
   for(const r of body.requests){
    if(r.updateCells){const u=r.updateCells;for(const [i,c]of u.rows[0].values.entries())((u.start.sheetId===9?urgent:rows)[u.start.rowIndex]).values[u.start.columnIndex+i]={...((u.start.sheetId===9?urgent:rows)[u.start.rowIndex]).values[u.start.columnIndex+i],...c};}
    else if(r.moveDimension){const m=r.moveDimension;rows.splice(m.destinationIndex,0,...rows.splice(m.source.startIndex,m.source.endIndex-m.source.startIndex));}
    else if(r.insertDimension){const m=r.insertDimension.range;rows.splice(m.startIndex,0,{values:[]});}
    else if(r.copyPaste){const m=r.copyPaste;rows[m.destination.startRowIndex]={values:Array.from({length:33},()=>({}))};}
    else if(r.deleteDimension){const m=r.deleteDimension.range;rows.splice(m.startIndex,m.endIndex-m.startIndex);}
    else throw Error('Unexpected request');
   }
   for(const row of rows)for(let c=7;c<14;c++){const f=row.values[c]?.userEnteredValue?.formulaValue,m=f?/^=SUBTOTAL\(9,[H-N](\d+):[H-N](\d+)\)$/.exec(f):null;if(m){let n=0;for(let i=Number(m[1])-1;i<Number(m[2]);i++)n+=rows[i].values[c]?.userEnteredValue?.numberValue??0;row.values[c].effectiveValue={numberValue:n} as never;}}
   if(options.lost)throw Error('lost reply');
   return Response.json({spreadsheetId:file});
  }
  if(options.urgent&&url.searchParams.get('fields')==='spreadsheetId,sheets(properties(sheetId,title))')return Response.json({spreadsheetId:file,sheets:[{properties:{sheetId:7,title}},{properties:{sheetId:9,title:'🔥 เร่งด่วน'}}]});
  if(options.urgent&&decodeURIComponent(url.pathname).includes('🔥 เร่งด่วน'))return Response.json({range:"'🔥 เร่งด่วน'!R1:R3",majorDimension:'ROWS',values:urgent.map(r=>r.values[17]?.userEnteredValue?.stringValue?[r.values[17].userEnteredValue!.stringValue]:[])});
  if(options.urgent&&url.searchParams.getAll('ranges').some(r=>r.includes('🔥 เร่งด่วน')))return Response.json({spreadsheetId:file,sheets:[{properties:{sheetId:9,title:'🔥 เร่งด่วน'},data:[{startRow:0,startColumn:0,rowData:urgent}]}]});
  if(url.pathname.includes('/values/'))return Response.json({range:"'"+title+"'!AG1:AG"+rows.length,majorDimension:'ROWS',values:rows.map(r=>r.values[32]?.userEnteredValue?.stringValue?[r.values[32].userEnteredValue!.stringValue]:[])});
  return Response.json({spreadsheetId:file,sheets:[{properties:{sheetId:7,title},data:[{startRow:0,startColumn:0,rowData:rows}]}]});
 }));
 const input:TransferWrite={version:'before',rowKey:'SAN|OLD|I:17|1',expectedIdentity:{hotel:'TSAN',accountNo:'A',invoiceNo:'17',folio:'3',transactionDate:'2026-11-01'},expectedAgent:'OLD',agent:'NEW',accountNo:'B',newRowKey:'SAN|NEW|I:17|1'};
 return {cells,rows,posts,input,urgent};
}
afterEach(()=>vi.unstubAllGlobals());
it('native changes exactly B/C/AG in one batch and preserves every date and staff cell',async()=>{
 const h=native(),before=structuredClone(h.cells);
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'written',mutationStarted:true});
 expect(h.posts).toHaveLength(1);
 for(let i=0;i<33;i++)if(![1,2,32].includes(i))expect(h.cells[i]).toEqual(before[i]);
 expect(h.posts[0]).toHaveLength(3);
 expect((await readNativeTracker('test-token',file)).rows[0]).toMatchObject({agent:'NEW',accountNo:'B',rowKey:'SAN|NEW|I:17|1'});
});
it('native lost reply is uncertain and cannot overwrite the new row from the old preimage',async()=>{
 const h=native({lost:true});
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'uncertain',mutationStarted:true});
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'conflict',mutationStarted:false});
 expect(h.posts).toHaveLength(1);
});
it('native rich-text identity and duplicate full tuples hold without a POST',async()=>{
 let h=native({rich:true});expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'conflict',mutationStarted:false});expect(h.posts).toHaveLength(0);
 h=native();const duplicate=structuredClone(h.cells);duplicate[2]={userEnteredValue:{stringValue:'OTHER'}};duplicate[32]={userEnteredValue:{stringValue:'other-key'}};h.rows.push({values:duplicate});
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'conflict'});expect(h.posts).toHaveLength(0);
});
it.each(['existing','new'] as const)('native moves the row and rebuilds %s destination subtotal atomically',async grouped=>{
 const h=native({grouped}),date=h.cells[17].userEnteredValue;
 const result=await writeNativeTrackerTransfers('test-token',file,[h.input]);
 expect(result).toMatchObject({status:'written',mutationStarted:true});
 expect(h.posts).toHaveLength(1);
 const snapshot=await readNativeTracker('test-token',file,true);
 expect(snapshot.transferGroupsCorrect).toBe(true);
 expect(snapshot.rows.find(r=>r.invoiceNo==='17')).toMatchObject({agent:'NEW',accountNo:'B',fields:{R:'2026-11-02'}});
 expect(h.rows.filter(r=>r.values[3]?.userEnteredValue?.stringValue?.startsWith('▸ รวม ')).map(r=>r.values[3].userEnteredValue!.stringValue)).toContain('▸ รวม OLD (1 ใบ)');
 expect(h.rows.filter(r=>r.values[3]?.userEnteredValue?.stringValue?.startsWith('▸ รวม ')).map(r=>r.values[3].userEnteredValue!.stringValue)).toContain('▸ รวม NEW ('+(grouped==='existing'?2:1)+' ใบ)');
 expect(date).toEqual({stringValue:'2026-11-02'});
});

it('native removes the empty source subtotal while retaining both destination invoices',async()=>{
 const h=native({grouped:'existing',sole:true});
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'written'});
 expect(h.rows).toHaveLength(5);
 expect((await readNativeTracker('test-token',file,true)).rows).toHaveLength(2);
 expect(h.rows.some(r=>r.values[3]?.userEnteredValue?.stringValue==='▸ รวม OLD (1 ใบ)')).toBe(false);
});

it.each([100000,100001])('native retargets urgent KEY over the current lookup bound %s',async lookupEnd=>{
 const h=native({urgent:true,lookupEnd}),formula=h.urgent[2].values[8].userEnteredValue;
 expect(await writeNativeTrackerTransfers('test-token',file,[h.input])).toMatchObject({status:'written'});
 expect(h.posts).toHaveLength(1);
 expect(h.urgent[2].values[17].userEnteredValue).toEqual({stringValue:h.input.newRowKey});
 expect(h.urgent[2].values[1].userEnteredValue).toEqual({stringValue:'NEW'});
 expect(h.urgent[2].values[8].userEnteredValue).toEqual(formula);
});
