import {it,expect} from 'vitest';
import {beginArPosDisplayRead,readPosDisplayPages} from '../worker/invoice/pos-display-read';
import {verifyArPosDisplayProof} from '../worker/invoice/pos-display-proof';
import {OperaError} from '../worker/opera/client';
import {posDisplayFixture} from './fixtures/invoice-pos-display';

it('pairs complete scoped metadata around the caller financial fence without changing financial lines',async()=>{
 const {packet,roles,page}=posDisplayFixture(),calls:string[]=[];
 const reader={invoicePosDisplayFolios:async(...args:unknown[])=>{calls.push(JSON.stringify(args));return structuredClone(page);}};
 const session=await beginArPosDisplayRead(reader,packet);calls.push('financial-fence');const result=await session.finish(structuredClone(packet));
 expect(calls).toEqual(['["777",1,0,200]','financial-fence','["777",1,0,200]']);expect(result.gap).toBeUndefined();expect(verifyArPosDisplayProof(packet,result.proof!,roles).groups).toHaveLength(1);
 await beginArPosDisplayRead(reader,packet);expect(calls).toHaveLength(4);
});
it.each(['source','metadata'])('rejects mutation across paired evidence: %s',async kind=>{
 const {packet,page}=posDisplayFixture(),reader={invoicePosDisplayFolios:async()=>structuredClone(page)},session=await beginArPosDisplayRead(reader,packet),fresh=structuredClone(packet);
 if(kind==='source'){if(!fresh.invoice||typeof fresh.invoice!=='object')throw Error('fixture');Reflect.set(fresh.invoice,'reference','changed');}
 else Reflect.set(page.windows[0].folios[0].postings[0].groupTypeInfo,'groupDescription','Changed');
 await expect(session.finish(fresh)).rejects.toThrow('document_source_changed');
});
it('preserves existing rows for missing capability or first-read provider gaps',async()=>{
 const {packet}=posDisplayFixture();expect(await (await beginArPosDisplayRead({},packet)).finish(packet)).toEqual({gap:'pos-display-capability'});
 const reader={invoicePosDisplayFolios:async()=>{throw new OperaError('provider_unavailable');}};expect(await (await beginArPosDisplayRead(reader,packet)).finish(packet)).toEqual({gap:'pos-display-provider'});
});
function twoPages(){
 const {page}=posDisplayFixture(),first=structuredClone(page),second=structuredClone(page);
 for(const p of [first,second]){p.windows[0].totalPages=2;p.windows[0].totalResults=201;}
 const regular=()=>({transactionNo:100000,transactionDate:'2026-01-03',transactionCode:'OTHER',reference:'',checkNo:'',cashierInfo:{cashierId:3},groupTypeInfo:{}});
 for(let n=0;n<199;n++){const row=regular();row.transactionNo+=n;first.windows[0].folios[0].postings.push(row);}
 const last=regular();last.transactionNo=100999;second.windows[0].folios[0].postings=[last];second.windows[0].offset=400;return {first,second};
}
it('paginates by outer headers and regular rows rather than expanded member count',async()=>{
 const {first,second}=twoPages(),offsets:number[]=[];
 const result=await readPosDisplayPages(async(_r,_w,offset)=>{offsets.push(offset);return structuredClone(offset===0?first:second);},{hotel:'KAT',reservationId:'777',folioWindowNo:1});
 expect(offsets).toEqual([0,200]);expect(result).toHaveLength(2);expect(first.windows[0].folios[0].postings).toHaveLength(203);
});
it('refuses an incomplete group split over a page boundary',async()=>{
 const {first,second}=twoPages(),member=first.windows[0].folios[0].postings.splice(3,1)[0];second.windows[0].folios[0].postings.push(member);
 await expect(readPosDisplayPages(async(_r,_w,offset)=>structuredClone(offset===0?first:second),{hotel:'KAT',reservationId:'777',folioWindowNo:1})).rejects.toThrow('document_invoice_ar_pos_display_unverified');
});
it('refuses changing pagination counters instead of silently joining pages',async()=>{
 const {first,second}=twoPages();second.windows[0].totalResults++;
 await expect(readPosDisplayPages(async(_r,_w,offset)=>structuredClone(offset===0?first:second),{hotel:'KAT',reservationId:'777',folioWindowNo:1})).rejects.toThrow();
});
