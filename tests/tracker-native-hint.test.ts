import {afterEach,expect,it,vi} from 'vitest';
import * as native from '../worker/tracker-sync/native';

const file='synthetic_native_hint_123456789',title='ลูกหนี้ เขาหลัก';
const spans=['A1:AG2','A1:A100002','C1:C100002','E1:G100002','R1:AC100002','AG1:AG100002'];
function payload(){return {spreadsheetId:file,valueRanges:spans.map((span,i)=>({range:`'${title}'!${span}`,majorDimension:'ROWS',values:i===0?Array.from({length:2},(_,row)=>Array.from({length:33},(_,j)=>`synthetic header-${row}-${j}`)):[[],[],Array.from({length:[33,1,1,3,12,1][i]},(_,j)=>`synthetic-${i}-${j}`)]}))};}
const hint=()=>native.readNativeTrackerChangeHint('synthetic-token',file);
afterEach(()=>vi.unstubAllGlobals());

it('returns a stable opaque numeric hint from exactly one fixed projected values request',async()=>{
 const fetcher=vi.fn(async()=>Response.json(payload()));vi.stubGlobal('fetch',fetcher);
 const result=await hint();expect(result).toMatch(/^9\d{29}$/);expect(await hint()).toBe(result);
 expect(fetcher).toHaveBeenCalledTimes(2);
 const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];const parsed=new URL(url);
 expect(parsed.origin+parsed.pathname).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${file}/values:batchGet`);
 expect(parsed.searchParams.getAll('ranges')).toEqual(['A1:AG2','A:A','C:C','E:G','R:AC','AG:AG'].map(span=>`'${title}'!${span}`));
 expect(Object.fromEntries([...parsed.searchParams].filter(([key])=>key!=='ranges'))).toEqual({prettyPrint:'false',valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER',majorDimension:'ROWS',fields:'spreadsheetId,valueRanges(range,majorDimension,values)'});
 expect(init).toMatchObject({redirect:'manual',headers:{Authorization:'Bearer synthetic-token'}});
 expect(result).not.toContain('synthetic');
});

it('detects edits, clears and restorations independently of unchanged Drive metadata',async()=>{
 const value=payload();vi.stubGlobal('fetch',async()=>Response.json({...value,version:'same-drive-version'}));
 const original=await hint();value.valueRanges[4].values[2][0]='new synthetic date';const edited=await hint();expect(edited).not.toBe(original);
 value.valueRanges[4].values[2][0]='';const cleared=await hint();expect(cleared).not.toBe(edited);expect(cleared).not.toBe(original);
 value.valueRanges[4].values[2][0]='synthetic-4-0';expect(await hint()).toBe(original);
});

it('hashes every mapped, identity, key and header value but no response metadata',async()=>{
 const value=payload();vi.stubGlobal('fetch',async()=>Response.json(value));const original=await hint();
 for(const range of value.valueRanges)for(const row of range.values)for(let j=0;j<row.length;j++){
  const before=row[j];row[j]='changed synthetic';expect(await hint()).not.toBe(original);row[j]=before;
 }
 value.valueRanges.forEach(range=>range.range=range.range.replaceAll("'",''));expect(await hint()).toBe(original);
});

it.each(['wrong-id','missing-range','wrong-order','wrong-title','wrong-start','too-many-rows','too-wide','object','nonfinite','wrong-dimension','nonarray'])('refuses malformed projection: %s',async(kind)=>{
 const value=payload();
 if(kind==='wrong-id')value.spreadsheetId='synthetic_other_123456789';
 if(kind==='missing-range')value.valueRanges.pop();
 if(kind==='wrong-order')value.valueRanges.reverse();
 if(kind==='wrong-title')value.valueRanges[1].range='Other!A1:A100002';
 if(kind==='wrong-start')value.valueRanges[1].range=`'${title}'!A2:A100002`;
 if(kind==='too-many-rows')value.valueRanges[1].values=Array.from({length:100003},()=>[]);
 if(kind==='too-wide')value.valueRanges[1].values=[['one','two']];
 if(kind==='object')(value.valueRanges[1].values as unknown[][])[0]=[{}];
 if(kind==='nonfinite')value.valueRanges[1].values[0]=['unused'];
 if(kind==='wrong-dimension')value.valueRanges[1].majorDimension='COLUMNS';
 if(kind==='nonarray')(value.valueRanges[1] as unknown as {values:unknown}).values={};
 if(kind==='nonfinite')vi.stubGlobal('fetch',async()=>new Response(JSON.stringify(value).replace('"unused"','1e999')));
 else vi.stubGlobal('fetch',async()=>Response.json(value));
 await expect(hint()).rejects.toThrow('tracker_native_schema_invalid');
});

it('accepts finite primitives and omitted empty matrices without business-date validation',async()=>{
 const value=payload();(value.valueRanges[4].values as unknown[][])[2]=[null,true,false,123.5,'not a business date'];
 delete (value.valueRanges[2] as {values?:unknown}).values;
 vi.stubGlobal('fetch',async()=>Response.json(value));const omitted=await hint();
 value.valueRanges[2].values=[];expect(await hint()).toBe(omitted);
});

it('ignores a formatted-only whole-column tail while bounding the actual returned rows',async()=>{
 const value=payload();vi.stubGlobal('fetch',async()=>Response.json(value));const original=await hint();
 for(const range of value.valueRanges.slice(1))range.range=range.range.replace('100002','1000000');
 expect(await hint()).toBe(original);
 value.valueRanges[1].values=Array.from({length:100003},()=>[]);
 await expect(hint()).rejects.toThrow('tracker_native_schema_invalid');
});

it('validates file IDs before issuing a request and refuses authorization errors',async()=>{
 const fetcher=vi.fn(async()=>new Response('',{status:403}));vi.stubGlobal('fetch',fetcher);
 await expect(native.readNativeTrackerChangeHint('synthetic-token','../bad')).rejects.toThrow('tracker_target_conflict');expect(fetcher).not.toHaveBeenCalled();
 await expect(hint()).rejects.toThrow('tracker_authorization_required');
});

it.each([true,false])('cancels oversized %s declared/streamed bodies with the typed hint error',async(declared)=>{
 const cancel=vi.fn();const body=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(600000));},cancel});
 vi.stubGlobal('fetch',async()=>new Response(body,{headers:declared?{'Content-Length':String(1024*1024+1)}:{}}));
 await expect(hint()).rejects.toThrow(/^tracker_native_hint_too_large$/);expect(cancel).toHaveBeenCalledTimes(1);
});
