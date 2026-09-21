import {it,expect,vi} from 'vitest';
import {OperaReader,OperaError} from '../worker/opera/client';
import {readFolioReportTypes} from '../worker/documents/folio-type-probe';

it('reads only the two documented report groups from the exact property',async()=>{
 const requests:Request[]=[];
 const reader=new OperaReader({origin:'https://opera.example',hotelId:'KAT',appKey:'synthetic'},async()=> 'synthetic',async request=>{requests.push(request);return Response.json({details:{hotelId:'KAT',folioTypeName:'Synthetic type',folioReportName:'Synthetic report',unrelated:'must not leave response'}});});
 const result=await readFolioReportTypes(reader,'KAT');
 expect(requests.map(r=>r.method)).toEqual(['GET','GET']);
 expect(requests.map(r=>new URL(r.url).pathname)).toEqual(Array(2).fill('/csh/v1/hotels/KAT/folioTypeNames'));
 expect(requests.map(r=>new URL(r.url).searchParams.get('folioReportGroup'))).toEqual(['Guest','AccountsReceivables']);
 expect(result.results.every(r=>r.hotelMatches===true)).toBe(true);expect(JSON.stringify(result)).not.toContain('unrelated');
});
it('does not expose mismatched hotel metadata or retry provider failure',async()=>{
 const read=vi.fn().mockResolvedValueOnce({details:{hotelId:'OTHER',folioTypeName:'Do not use'}}).mockRejectedValueOnce(new OperaError('provider_rejected',400));
 const result=await readFolioReportTypes({folioTypeName:read},'KAT');
 expect(JSON.stringify(result)).not.toContain('Do not use');expect(read).toHaveBeenCalledTimes(2);expect(result.results[1]).toMatchObject({status:'unavailable',upstreamStatus:400});
});
