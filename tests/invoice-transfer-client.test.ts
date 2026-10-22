import {expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
it('looks up one exact source account number within the configured hotel including zero balances',async()=>{
 const transport=vi.fn(async(_request:Request)=>Response.json({accountsDetails:[]})),reader=new OperaReader({origin:'https://opera.example',appKey:'synthetic',hotelId:'WAKL'},async()=> 'synthetic',transport);
 await reader.accountsByNumber('SYN-SOURCE');const request=transport.mock.calls[0][0],url=new URL(request.url);
 expect(request.method).toBe('GET');expect(url.pathname).toBe('/ars/v1/accounts');expect([...url.searchParams]).toEqual([['accountNo','SYN-SOURCE'],['hotelIds','WAKL'],['balance','All'],['offset','0'],['limit','20']]);
});
it.each(['',' ',' SOURCE','SOURCE ','*','A/B','A\\B','A?B','A&B','A\nB','A'.repeat(81)])('refuses unbounded or malformed source-account selectors (%j)',value=>{
 const transport=vi.fn(),reader=new OperaReader({origin:'https://opera.example',appKey:'synthetic',hotelId:'WAKL'},async()=> 'synthetic',transport);
 expect(()=>reader.accountsByNumber(value)).toThrow('invalid_request');expect(transport).not.toHaveBeenCalled();
});
