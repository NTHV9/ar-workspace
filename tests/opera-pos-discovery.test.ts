import {it,expect,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
const known={hotelId:'KAT',interfaceType:'Pos',logo:'SYN_POS_',interfaceId:{id:'7',type:'HotelInterface',idContext:'OPERA'},interfaceName:'Synthetic POS',activeFlag:true};
function fixture(response:unknown={hotelInterfaces:[known]}){
 const requests:Request[]=[],transport=vi.fn(async(r:Request)=>{requests.push(r);return Response.json(response);}),reader=new OperaReader({origin:'https://gateway.example.test',hotelId:'KAT',appKey:'synthetic'},async()=> 'synthetic',transport);
 return {reader,transport,requests};
}
it('preserves a source-observed 21-digit check string through a fixed GET',async()=>{
 const {reader,requests}=fixture({checkNumber:'001234567890123456789',checkDate:'2026-10-19',checkDetailsInfo:'Synthetic check'});
 expect(await reader.invoiceCheckDetails('001234567890123456789')).toMatchObject({checkNumber:'001234567890123456789'});
 const request=requests[0],url=new URL(request.url);expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');expect(url.pathname).toBe('/csh/v1/hotels/KAT/check/001234567890123456789');expect([...url.searchParams]).toEqual([]);
});
it('requests only active POS interfaces in the configured property and projects discovery identity fields',async()=>{
 const {reader,requests}=fixture({hotelInterfaces:[{...known,machineName:'Excluded',interfaceId:{...known.interfaceId,password:'Excluded'}}],communicationInfo:{password:'Excluded'}});
 expect(await reader.invoicePosInterfaces()).toEqual({hotelInterfaces:[known]});
 const request=requests[0],url=new URL(request.url);expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');expect(url.pathname).toBe('/int/config/v1/hotelInterfaceTypes');expect(Object.fromEntries(url.searchParams)).toEqual({hotelIds:'KAT',interfaceTypes:'Pos',includeInactive:'false'});expect(request.headers.get('x-hotelid')).toBe('KAT');
});
it('allows only an observed POS logo and persists only whitelisted transaction mapping metadata',async()=>{
 const {reader,transport,requests}=fixture();await reader.invoicePosInterfaces();
 transport.mockImplementation(async(r:Request)=>{requests.push(r);return Response.json({details:{communicationInfo:{password:'DO-NOT-RETURN'},primaryInfo:{password:'DO-NOT-RETURN'},transactionsInfo:{allChargesCode:'ALL',password:'DO-NOT-RETURN',itemizers:[{splitCode:'SC',splitPost:1,splitText:'Service',splitFactor:10,password:'DO-NOT-RETURN'}],transactionCodes:[{code:'SYN-SVC',lineType:'SC',revenueCenter:'R1',itemizersShortInfo:[{code:'SC',itemizerName:'Service',itemNumber:1,password:'DO-NOT-RETURN'}],password:'DO-NOT-RETURN'}],postingAccounts:[{id:1,account:'Synthetic',transactionCode:'SYN-SVC',autoBalance:false,password:'DO-NOT-RETURN'}]}}});});
 const result=await reader.invoicePosTransactionCodes('SYN_POS_'),request=requests[1],url=new URL(request.url);
 expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');expect(url.pathname).toBe('/int/config/v1/hotels/KAT/logos/SYN_POS_');expect([...url.searchParams]).toEqual([['fetchInstructions','TransactionCodesInfo']]);
 expect(result).toEqual({details:{transactionsInfo:{allChargesCode:'ALL',itemizers:[{splitCode:'SC',splitPost:1,splitText:'Service',splitFactor:10}],transactionCodes:[{code:'SYN-SVC',lineType:'SC',revenueCenter:'R1',itemizersShortInfo:[{code:'SC',itemizerName:'Service',itemNumber:1}]}],postingAccounts:[{id:1,account:'Synthetic',transactionCode:'SYN-SVC',autoBalance:false}]}}});expect(JSON.stringify(result)).not.toContain('DO-NOT-RETURN');
});
it('does not fabricate empty transaction mappings when the selected response section is absent',async()=>{
 const {reader,transport}=fixture();await reader.invoicePosInterfaces();transport.mockResolvedValue(Response.json({details:{communicationInfo:{password:'Excluded'}}}));
 expect(await reader.invoicePosTransactionCodes('SYN_POS_')).toEqual({details:{}});
});
it.each(['','..','https://elsewhere.test/config','SYN_POS_?fetchInstructions=CommunicationInfo','UNKNOWN_'])('rejects unobserved or unsafe interface identity %s before requests',logo=>{
 const {reader,transport}=fixture();expect(()=>reader.invoicePosTransactionCodes(logo)).toThrow('invalid_request');expect(transport).not.toHaveBeenCalled();
});
it.each(['','..','https://elsewhere.test/','123?query=true','a/b'])('rejects unsafe check identity %s before requests',check=>{
 const {reader,transport}=fixture();expect(()=>reader.invoiceCheckDetails(check)).toThrow('invalid_request');expect(transport).not.toHaveBeenCalled();
});
it.each(['foreign-hotel','wrong-kind','inactive','duplicate'] as const)('does not authorize logos from invalid discovery: %s',async kind=>{
 const item={...known};if(kind==='foreign-hotel')item.hotelId='TSK';if(kind==='wrong-kind')item.interfaceType='Xml';if(kind==='inactive')item.activeFlag=false;
 const {reader}=fixture({hotelInterfaces:kind==='duplicate'?[item,item]:[item]});await expect(reader.invoicePosInterfaces()).rejects.toThrow('invalid_response');expect(()=>reader.invoicePosTransactionCodes('SYN_POS_')).toThrow('invalid_request');
});
it('revokes observed logos before a failed rediscovery can leave stale authority',async()=>{
 const {reader,transport}=fixture();await reader.invoicePosInterfaces();transport.mockResolvedValue(Response.json({hotelInterfaces:[{...known,activeFlag:false}]}));
 await expect(reader.invoicePosInterfaces()).rejects.toThrow('invalid_response');expect(()=>reader.invoicePosTransactionCodes('SYN_POS_')).toThrow('invalid_request');
});
it('returns bounded key/type diagnostics without values or credential/configuration sections',async()=>{
 const {reader,transport}=fixture();await reader.invoicePosInterfaces();transport.mockResolvedValue(Response.json({alternateDetails:{transactionsInfo:{transactionCodes:[{code:'PRIVATE-CODE',lineType:'PRIVATE-TYPE'}]}},communicationInfo:{password:'NEVER-PERSIST'},details:{providerCredentials:{secret:'NEVER-PERSIST'}}}));
 const shape=await reader.invoicePosTransactionCodesShape('SYN_POS_'),serialized=JSON.stringify(shape);
 expect(shape.type).toBe('object');expect(serialized).toContain('alternateDetails');expect(serialized).toContain('transactionsInfo');expect(serialized).toContain('transactionCodes');expect(serialized).toContain('string');
 expect(serialized).not.toContain('PRIVATE-CODE');expect(serialized).not.toContain('PRIVATE-TYPE');expect(serialized).not.toContain('NEVER-PERSIST');expect(serialized).not.toContain('communicationInfo');expect(serialized).not.toContain('providerCredentials');
});
it('bounds structural key count and samples at most one array element',async()=>{
 const {reader,transport}=fixture();await reader.invoicePosInterfaces();transport.mockResolvedValue(Response.json({items:[{code:'FIRST'},{OnlySecondElement:'SECOND'}],...Object.fromEntries(Array.from({length:80},(_,n)=>['key'+n,'PRIVATE']))}));
 const shape=await reader.invoicePosTransactionCodesShape('SYN_POS_'),serialized=JSON.stringify(shape);expect(serialized).not.toContain('OnlySecondElement');expect(serialized).not.toContain('PRIVATE');expect(serialized.length).toBeLessThan(12000);expect(serialized).toContain('truncated');
});
it('keeps shape diagnostics on the same authorized fixed GET and single expansion',async()=>{
 const {reader,requests}=fixture();expect(()=>reader.invoicePosTransactionCodesShape('SYN_POS_')).toThrow('invalid_request');await reader.invoicePosInterfaces();await reader.invoicePosTransactionCodesShape('SYN_POS_');const r=requests[1],url=new URL(r.url);
 expect(r.method).toBe('GET');expect(r.redirect).toBe('manual');expect(url.pathname).toBe('/int/config/v1/hotels/KAT/logos/SYN_POS_');expect([...url.searchParams]).toEqual([['fetchInstructions','TransactionCodesInfo']]);
});
it('identifies only known non-sensitive section names without inspecting their contents',async()=>{
 const {reader,transport}=fixture();await reader.invoicePosInterfaces();transport.mockResolvedValue(Response.json({details:{primaryInfo:{password:'NEVER-PERSIST'},postingsInfo:{account:'NEVER-PERSIST'},customDataInfo:{value:'NEVER-PERSIST'},communicationInfo:{password:'NEVER-PERSIST'},providerCredentials:{secret:'NEVER-PERSIST'}}}));
 const shape=await reader.invoicePosTransactionCodesShape('SYN_POS_'),details=shape.fields?.details,serialized=JSON.stringify(shape);
 expect(details?.knownSectionsPresent).toEqual(['primaryInfo','postingsInfo','customDataInfo']);expect(details?.fields).toEqual({});expect(details?.omittedKeys).toBe(5);
 expect(serialized).not.toContain('NEVER-PERSIST');expect(serialized).not.toContain('communicationInfo');expect(serialized).not.toContain('providerCredentials');expect(serialized).not.toContain('password');
});
