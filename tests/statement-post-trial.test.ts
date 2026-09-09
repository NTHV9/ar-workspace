import {expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {selectedDescriptor} from '../worker/documents/statement-post-trial';
import type {DocumentJob} from '../worker/documents/jobs';
const invoice=(id:string)=>({id,hotel:'KAT',account_id:'a',invoice_no:id,folio_no:id,reservation_id:null,folio_date:null,open:10,collection_role:'standalone'});
const job:DocumentJob={id:'11111111-1111-4111-8111-111111111111',owner:'owner',hotel:'KAT',account_id:'a',account_name:'Synthetic',content:'statement',layout:'combined',purpose:'review',invoice_ids:['1','3'],manifest:[invoice('1'),invoice('3')],state:'queued',revision:0,project_key:null,exports:[],acknowledged:false,files:[],created_at:''};
const row=(n:number)=>({transactionNo:n,balance:{amount:10,currencyCode:'THB'}});
const current={accountDetails:{hotelId:'KAT',accountId:{id:'a'},invoices:[row(1),row(2),row(3)]}};
const descriptor={hotelId:'KAT',accountId:{id:'a'},invoices:[row(1),row(3)],balance:{amount:20,currencyCode:'THB'}};
it('requires exact selected identities and current amounts before processing',()=>{
 expect(selectedDescriptor(job,current,{aRStatements:[descriptor]})).toEqual(descriptor);
 expect(()=>selectedDescriptor(job,current,{aRStatements:[{...descriptor,invoices:[row(1),row(2)]}]})).toThrow('statement_selection_rejected');
 expect(()=>selectedDescriptor(job,current,{aRStatements:[{...descriptor,balance:{amount:30,currencyCode:'THB'}}]})).toThrow('statement_selection_rejected');
 expect(()=>selectedDescriptor(job,{accountDetails:{...current.accountDetails,invoices:[{...row(1),parentInvoiceNo:9},row(3)]}},{aRStatements:[descriptor]})).toThrow('statement_selection_rejected');
});
it('performs one fixed Statement POST, retaining raw response without following Location',async()=>{
 const transport=vi.fn(async(request:Request)=>{expect(request.method).toBe('POST');expect(new URL(request.url).pathname).toBe('/ars/v1/hotels/KAT/accounts/a/statements');expect(request.redirect).toBe('manual');expect(await request.json()).toEqual({criteria:{statements:[descriptor],statementCriteria:{inclZero:false,inclPrinted:true,inclFolios:false}}});return new Response('{"links":[]}',{status:201,headers:{'Content-Type':'application/json',Location:'https://untrusted.example/document'}});});
 const reader=new OperaReader({origin:'https://gateway.example',appKey:'synthetic',hotelId:'KAT'},async()=> 'synthetic',transport);
 const response=await reader.processStatement('a',descriptor,job.id);
 expect(response.status).toBe(201);expect(new TextDecoder().decode(response.bytes)).toBe('{"links":[]}');expect(response.location).toBe('https://untrusted.example/document');expect(transport).toHaveBeenCalledTimes(1);
});
it('does not retry a failed POST and rejects scope mismatch before transport',async()=>{
 const transport=vi.fn(async()=>{throw new Error('private provider failure');});
 const reader=new OperaReader({origin:'https://gateway.example',appKey:'synthetic',hotelId:'KAT'},async()=> 'synthetic',transport);
 await expect(reader.processStatement('a',{...descriptor,hotelId:'TSK'},job.id)).rejects.toMatchObject({code:'invalid_request'});expect(transport).not.toHaveBeenCalled();
 await expect(reader.processStatement('a',descriptor,job.id)).rejects.toMatchObject({code:'provider_unavailable'});expect(transport).toHaveBeenCalledTimes(1);
});
