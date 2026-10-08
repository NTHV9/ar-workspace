import {expect,it} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {agingBasisDiagnostic} from '../worker/opera/probe';
const row=(hotelId='KAT',value='ART',name='DATE_FOR_AGING')=>({hotelId,value,name,description:'PRIVATE',displayName:'PRIVATE'});
const fixture=(rows:unknown[])=>({groups:[{groupName:'PRIVATE',appSettings:rows}]});
it.each(['ART','INC','COD','ING'])('returns only the known exact-hotel DATE_FOR_AGING enum %s',basis=>{
 const result=agingBasisDiagnostic(fixture([row('TSK','COD'),row('KAT',basis),row('KAT','PRIVATE','OTHER_SETTING')]),'KAT');
 expect(result).toEqual({status:'verified',basis});expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('reads the documented nested setting row with its own exact hotel',()=>{
 expect(agingBasisDiagnostic(fixture([{name:'PARENT',hotelId:'_Global',settings:[row()]}]),'KAT')).toEqual({status:'verified',basis:'ART'});
 expect(agingBasisDiagnostic(fixture([{name:'PARENT',hotelId:'KAT',settings:[{name:'DATE_FOR_AGING',value:'ART'}]}]),'KAT').status).toBe('unavailable');
});
it.each([fixture([row('TSK')]),fixture([row(),row()]),fixture([row('KAT','PRIVATE')]),{groups:'PRIVATE'},fixture([{settings:'PRIVATE'}]),{}])('does not expose unknown, malformed or ambiguous settings %j',value=>{
 const result=agingBasisDiagnostic(value,'KAT');expect(result.status).toBe('unavailable');expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('issues only the fixed GET control-name query with exact configured hotel',async()=>{
 let received:Request|undefined;
 const reader=new OperaReader({origin:'https://synthetic.invalid',appKey:'synthetic',hotelId:'KAT'},async()=>'synthetic',async request=>{received=request;return Response.json(fixture([row()]));});
 await reader.agingBasisSettings();
 const url=new URL(received!.url);
 expect(received!.method).toBe('GET');expect(received!.redirect).toBe('manual');
 expect(url.pathname).toBe('/ent/config/v1/settings');expect([...url.searchParams]).toEqual([['hotelId','KAT'],['parameterNameWildCard','DATE_FOR_AGING']]);
 expect(received!.headers.get('x-hotelid')).toBe('KAT');
});
