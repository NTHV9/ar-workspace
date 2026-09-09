import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperaReader, OperaError } from '../worker/opera/client';
import { collectPages,verifiedNextCursor } from '../worker/opera/pagination';

const config={origin:'https://gateway.example.com',appKey:'synthetic-app-key',hotelId:'SYNTHETIC-KAT'};
describe('new OPERA read client',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('does not bind the Worker global fetch function to the client instance',async()=>{
    vi.stubGlobal('fetch',function(this:unknown){
      if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');
      return Promise.resolve(Response.json({hasMore:false,accountsDetails:[]}));
    });
    const reader=new OperaReader(config,async()=> 'synthetic-token');
    await expect(reader.accounts()).resolves.toMatchObject({hasMore:false});
  });
  it('builds account discovery with All balances and exact hotel scope',async()=>{
    let received:Request|undefined;
    const reader=new OperaReader(config,async()=> 'synthetic-token',async(request)=>{received=request;return Response.json({accountsDetails:{accountInfo:[]},hasMore:false});});
    await reader.accounts(0,50);
    const url=new URL(received!.url);
    expect(url.pathname).toBe('/ars/v1/accounts');
    expect(url.searchParams.get('balance')).toBe('All');
    expect(url.searchParams.get('hotelIds')).toBe('SYNTHETIC-KAT');
    expect(received!.headers.get('x-hotelid')).toBe('SYNTHETIC-KAT');
    expect(received!.redirect).toBe('manual');
  });
  it('requests all five current sections and keeps IDs inside one path segment',async()=>{
    let url:URL|undefined;
    const reader=new OperaReader(config,async()=> 'synthetic-token',async(request)=>{url=new URL(request.url);return Response.json({});});
    await reader.account('a/b');
    expect(url!.pathname.endsWith('/accounts/a%2Fb')).toBe(true);
    expect(url!.searchParams.getAll('fetchInstructions')).toEqual(['Account','Summary','Invoices','Aging','Payments']);
  });
  it('retains history and omits unBilled from the normal query',async()=>{
    let url:URL|undefined;
    const reader=new OperaReader(config,async()=> 'synthetic-token',async(request)=>{url=new URL(request.url);return Response.json({});});
    await reader.history('a',50,50);
    expect(url!.searchParams.get('inclZeroBalance')).toBe('true');
    expect(url!.searchParams.has('unBilled')).toBe(false);
    expect(url!.searchParams.getAll('fetchInstructions')).toEqual(['Invoices','Payments']);
  });
  it('prepares a statement using only explicitly selected transaction identities',async()=>{
    let requested:URL|undefined;
    const reader=new OperaReader(config,async()=> 'synthetic-token',async request=>{requested=new URL(request.url);return Response.json({aRStatements:[]});});
    await reader.statementSelection('synthetic-account',['100','102']);
    expect(requested!.pathname).toBe('/ars/v1/statements');
    expect(requested!.searchParams.getAll('transactionNo')).toEqual(['100','102']);
    expect(requested!.searchParams.getAll('accountID')).toEqual(['synthetic-account']);
    expect(requested!.searchParams.get('inclPrinted')).toBe('true');
  });
  it('never follows redirects or returns provider error bodies',async()=>{
    let requests=0;
    const reader=new OperaReader(config,async()=> 'synthetic-token',async()=>{requests++;return new Response('sensitive upstream message',{status:302,headers:{Location:'https://other.example.com'}});});
    await expect(reader.accounts(0,50)).rejects.toMatchObject({code:'redirect_rejected'});
    expect(requests).toBe(1);
  });
  it('rejects malformed origins before obtaining a token',()=>{
    for(const origin of ['http://gateway.example.com','https://user:password@gateway.example.com','https://gateway.example.com/path','https://gateway.example.com?key=value']){
      expect(()=>new OperaReader({...config,origin},async()=> 'unused')).toThrow(OperaError);
    }
  });
  it('bounds response bytes while streaming',async()=>{
    const reader=new OperaReader({...config,maxResponseBytes:10},async()=> 'synthetic-token',async()=>new Response('{"long":"value"}',{headers:{'Content-Type':'application/json'}}));
    await expect(reader.accounts(0,50)).rejects.toMatchObject({code:'response_too_large'});
  });
});
describe('complete pagination',()=>{
  it('retains extra unique history rows only with explicit terminal metadata and a warning',async()=>{
    const data=[{id:'100'},{id:'101'}];let warning:unknown;
    const policy={allowExtraUniqueRows:true,onExtraRows:(counts:unknown)=>{warning=counts;}};
    expect(await collectPages(async()=>({rows:data,hasMore:false,totalResults:1}),r=>r.id,20,policy)).toEqual(data);
    expect(warning).toEqual({reported:1,observed:2});
    await expect(collectPages(async()=>({rows:data,hasMore:false,totalResults:1}),r=>r.id,20)).rejects.toMatchObject({code:'pagination_incomplete'});
    await expect(collectPages(async()=>({rows:[data[0],data[0]],hasMore:false,totalResults:1}),r=>r.id,20,policy)).rejects.toMatchObject({code:'duplicate_member'});
    await expect(collectPages(async()=>({rows:data,totalResults:1}),r=>r.id,20,policy)).rejects.toMatchObject({code:'pagination_incomplete'});
    await expect(collectPages(async()=>({rows:data,hasMore:false,totalResults:3}),r=>r.id,20,policy)).rejects.toMatchObject({code:'pagination_incomplete'});
  });
  it('handles the verified next-page cursor including a partial last page',async()=>{
    expect(verifiedNextCursor({offset:120,limit:20},100,20)).toBe(120);
    const offsets:number[]=[];
    const rows=await collectPages(async offset=>{offsets.push(offset);return {rows:[{id:String(offset)}],nextOffset:offset+20,hasMore:offset===0,totalResults:2};},r=>r.id,20);
    expect(offsets).toEqual([0,20]);expect(rows).toHaveLength(2);
    expect(()=>verifiedNextCursor({offset:0,limit:20},0,20)).toThrow();
  });
  it('visits requested offsets and returns every distinct member',async()=>{
    const offsets:number[]=[];
    const rows=await collectPages(async offset=>{offsets.push(offset);return offset===0?{rows:[{id:'a'},{id:'b'}],hasMore:true,count:2,totalResults:3,offset:0}:{rows:[{id:'c'}],hasMore:false,count:1,totalResults:3,offset:2};},row=>row.id,2);
    expect(offsets).toEqual([0,2]);expect(rows.map(x=>x.id)).toEqual(['a','b','c']);
  });
  it('rejects duplicate members even when their amounts could offset',async()=>{
    await expect(collectPages(async offset=>({rows:[{id:'same'}],hasMore:offset===0,count:1}),r=>r.id,1)).rejects.toMatchObject({code:'duplicate_member'});
  });
  it('does not treat an empty intermediate page or mismatched count as complete',async()=>{
    await expect(collectPages(async()=>({rows:[],hasMore:true}),r=>String(r),50)).rejects.toMatchObject({code:'pagination_incomplete'});
    await expect(collectPages(async()=>({rows:[{id:'a'}],hasMore:false,totalResults:2}),r=>r.id,50)).rejects.toMatchObject({code:'pagination_incomplete'});
  });
  it('fails the whole collection when a later page fails',async()=>{
    await expect(collectPages(async offset=>{if(offset)throw new OperaError('provider_unavailable');return {rows:[{id:'a'}],hasMore:true};},r=>r.id,1)).rejects.toMatchObject({code:'provider_unavailable'});
  });
});


it('adds the documented Statement fetch instruction only for explicit visibility audit',async()=>{
 const urls:URL[]=[];
 const reader=new OperaReader(config,async()=> 'synthetic-token',async request=>{urls.push(new URL(request.url));return Response.json({});});
 await reader.account('synthetic-account');await reader.account('synthetic-account',true);
 expect(urls[0].searchParams.getAll('fetchInstructions')).not.toContain('Statement');
 expect(urls[1].searchParams.getAll('fetchInstructions')).toEqual(['Account','Summary','Invoices','Aging','Payments','Statement']);
});
