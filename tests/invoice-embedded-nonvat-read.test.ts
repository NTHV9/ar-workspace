import {expect,it,vi} from 'vitest';
import {readEmbeddedGenerateEvidence} from '../worker/invoice/embedded-generate-read';
import {invoiceModel} from '../worker/invoice/model';
import {embeddedNonVatPacket,nonVatCalculation} from './fixtures/invoice-embedded-nonvat';

function fixture(amounts?:number[]){
 const p=embeddedNonVatPacket(amounts),proof=p.embeddedGenerateProof,rules=new Map<string,unknown>([...proof.groups.flatMap(g=>[g.rules,...g.generatedRules]),...proof.nonVatGroups.map(g=>g.rules)].map(r=>[r.transactionCode.code,r]));
 const readRules=vi.fn(async(code:string)=>structuredClone(rules.get(code))),readFresh=vi.fn(async()=>structuredClone(p));
 const readCalculation=vi.fn(async(code:string,amount:number):Promise<unknown>=>nonVatCalculation(code,amount));
 return {p,rules,readRules,readFresh,readCalculation};
}
it('reads and retains explicit NonVAT rules twice and returns an independently revalidated model',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture(),result=await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation);
 expect(result).toBeDefined();expect(invoiceModel(result!)).toMatchObject({gross:16770,vat:770,nonTaxable:5000,taxableNet:11000});
 expect(result?.embeddedGenerateProof?.nonVatGroups?.map(g=>g.provenance)).toEqual(['opera-non-taxable','owner-confirmed-tsan-6002-non-vat']);
 expect(readRules.mock.calls.map(c=>c[0])).toEqual(['6000','6002','FOOD','NONREV','VAT','6000','6002','FOOD','NONREV','VAT']);expect(readFresh).toHaveBeenCalledOnce();
});
it.each(['description','flag','generates','associated'] as const)('rejects changed NonVAT rule metadata instead of permitting fallback (%s)',async kind=>{
 const {p,rules,readRules,readFresh,readCalculation}=fixture();let count=0;
 readRules.mockImplementation(async code=>{const value=structuredClone(rules.get(code));if(++count>5&&code==='6002'){
  const r=value as {transactionCode:{description:{defaultText:string};trxSetup:{nonTaxable:boolean};generatesSetup:Record<string,unknown>;associatedTransactionCodes:unknown[]}};
  if(kind==='description')r.transactionCode.description.defaultText='Changed';
  if(kind==='flag')r.transactionCode.trxSetup.nonTaxable=true;
  if(kind==='generates')r.transactionCode.generatesSetup.generates=[{code:'VAT'}];
  if(kind==='associated')r.transactionCode.associatedTransactionCodes.push({code:'VAT'});
 }return value;});
 await expect(readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).rejects.toThrow('document_source_changed');
});
it('refuses an unknown taxless code before requesting another source snapshot',async()=>{
 const {p,rules,readRules,readFresh,readCalculation}=fixture();rules.set('6002',{transactionCode:{...p.embeddedGenerateProof.nonVatGroups[1].rules.transactionCode,code:'UNKNOWN'}});
 expect(await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).toBeUndefined();expect(readFresh).not.toHaveBeenCalled();
});
it('rejects newly posted tax in the second source read even when an identical negative charge could cancel it',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture();readFresh.mockImplementation(async()=>{const next=structuredClone(p);next.taxRows[2].postingBreakdown.netAmount.amount--;next.taxRows[2].postingBreakdown.taxes=[{...next.taxRows[0].postingBreakdown.taxes[1],transactionNo:21001,referenceTransactionNo:11002,amount:{amount:1,currencyCode:'THB'}}];return next;});
 await expect(readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).rejects.toThrow('document_source_changed');expect(readRules).toHaveBeenCalledTimes(5);
});
it('propagates a failed NonVAT metadata read without a fresh source read or retry',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture(),error=Error('provider-unavailable');readRules.mockImplementation(async code=>{if(code==='6002')throw error;return {};});
 await expect(readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).rejects.toBe(error);expect(readFresh).not.toHaveBeenCalled();expect(readRules.mock.calls.filter(c=>c[0]==='6002')).toHaveLength(1);
});
it('deduplicates calculations by transaction code and exact signed amount on both sides of the source read',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture([20,30,30,-30]),events:string[]=[];
 readCalculation.mockImplementation(async(code,amount)=>{events.push(`${code}:${amount}`);return nonVatCalculation(code,amount);});readFresh.mockImplementation(async()=>{events.push('source');return structuredClone(p);});
 const result=await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation);
 expect(invoiceModel(result!)).toMatchObject({nonTaxable:5000});expect(events).toEqual(['6000:20','6002:30','6002:-30','source','6000:20','6002:30','6002:-30']);
});
it('leaves NonVAT packets ineligible without a calculation reader before any additional read',async()=>{
 const {p,readRules,readFresh}=fixture();expect(await readEmbeddedGenerateEvidence(p,readRules,readFresh)).toBeUndefined();expect(readRules).not.toHaveBeenCalled();expect(readFresh).not.toHaveBeenCalled();
});
it('bounds effective calculations at forty unique code/amount pairs before provider reads',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture(Array.from({length:41},(_,i)=>i+1));
 expect(await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).toBeUndefined();expect(readRules).not.toHaveBeenCalled();expect(readCalculation).not.toHaveBeenCalled();expect(readFresh).not.toHaveBeenCalled();
});
it('admits forty unique pairs and runs at most four calculations concurrently',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture(Array.from({length:40},(_,i)=>i+1));let active=0,peak=0;
 readCalculation.mockImplementation(async(code,amount)=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return nonVatCalculation(code,amount);});
 expect(await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).toBeDefined();expect(readCalculation).toHaveBeenCalledTimes(80);expect(peak).toBe(4);
});
it('refuses an initially nonzero calculation before a fresh source read',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture();readCalculation.mockImplementation(async(code,amount)=>{const c=nonVatCalculation(code,amount);c.result.charges.push({transactionCode:'VAT',level:'TransactionCode',amount:2,sequence:1,basePosting:false});return c;});
 expect(await readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).toBeUndefined();expect(readFresh).not.toHaveBeenCalled();
});
it('rejects a changed effective calculation after initial qualification without fallback',async()=>{
 const {p,readRules,readFresh,readCalculation}=fixture();let count=0;readCalculation.mockImplementation(async(code,amount)=>{const c=nonVatCalculation(code,amount);if(++count>2)c.result.charges.push({transactionCode:'VAT',level:'TransactionCode',amount:2,sequence:1,basePosting:false});return c;});
 await expect(readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).rejects.toThrow('document_source_changed');expect(readFresh).toHaveBeenCalledOnce();expect(readCalculation).toHaveBeenCalledTimes(4);
});
it.each(['before','after'] as const)('propagates failed effective calculation without retry (%s)',async when=>{
 const {p,readRules,readFresh,readCalculation}=fixture(),error=Error('calculator-unavailable');let count=0;
 readCalculation.mockImplementation(async(code,amount)=>{if(++count>(when==='before'?0:2))throw error;return nonVatCalculation(code,amount);});
 await expect(readEmbeddedGenerateEvidence(p,readRules,readFresh,readCalculation)).rejects.toBe(error);expect(readFresh).toHaveBeenCalledTimes(when==='before'?0:1);expect(readCalculation).toHaveBeenCalledTimes(when==='before'?2:4);
});
