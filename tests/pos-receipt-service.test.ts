import {it,expect} from 'vitest';
import {parseFullServiceReceipt,verifyMappedScCode,verifyMappedFeeCode} from '../worker/invoice/pos-receipt-service';
import {serviceReceipt,serviceInterfaces} from './fixtures/pos-service-receipt';
it.each(['FOOD','BEVERAGE'])('parses a complete positive %s receipt without transforming its printed check',kind=>{
 expect(parseFullServiceReceipt(serviceReceipt(kind),'2026-01-02')).toEqual({date:'2026-01-02',printedCheck:'0099',baseCents:100000,serviceCents:10000,vatCents:7700,totalCents:117700});
});
it.each(['19:43 PM','16:14 PM'])('accepts provider receipt clocks that print 24-hour time beside AM/PM: %s',time=>{
 const raw=serviceReceipt('BEVERAGE');raw.checkDetailsInfo=raw.checkDetailsInfo.replace('11:00 AM',time).replace('11:10 AM',time);
 expect(parseFullServiceReceipt(raw,'2026-01-02')).toMatchObject({date:'2026-01-02',baseCents:100000,totalCents:117700});
});
it.each(['24:01 PM','19:60 PM','19:43 AM','00:10 PM'])('rejects invalid or unambiguously contradictory receipt clocks: %s',time=>{
 const raw=serviceReceipt();raw.checkDetailsInfo=raw.checkDetailsInfo.replace('11:00 AM',time);expect(()=>parseFullServiceReceipt(raw,'2026-01-02')).toThrow();
});
it.each(['adjusted-date','split','discount','tip','unknown-fee','duplicate-vat','foreign-currency','wrong-rate','changed-total','no-close','multiple-checks'] as const)('rejects unsupported receipt: %s',kind=>{
 const raw=serviceReceipt();let date='2026-01-02';
 if(kind==='adjusted-date')date='2026-01-03';
 if(kind==='split')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('ROOM CHARGE THB1,177.00','ROOM CHARGE THB500.00\nROOM CHARGE THB677.00');
 if(kind==='discount')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('FOOD THB1,000.00','FOOD THB1,000.00\nDiscount -THB10.00');
 if(kind==='tip')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('FOOD THB1,000.00','FOOD THB1,000.00\nTips THB10.00');
 if(kind==='unknown-fee')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('Service Charge','Other Fee THB10.00\nService Charge');
 if(kind==='duplicate-vat')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('Vat 7% THB77.00','Vat 7% THB70.00\nVat 7% THB7.00');
 if(kind==='foreign-currency')raw.checkDetailsInfo=raw.checkDetailsInfo.replaceAll('THB','USD');
 if(kind==='wrong-rate')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('Vat 7%','Vat 8%');
 if(kind==='changed-total')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('Payment THB1,177.00','Payment THB1,178.00');
 if(kind==='no-close')raw.checkDetailsInfo=raw.checkDetailsInfo.replace('Check Closed','Still Open');
 if(kind==='multiple-checks')raw.checkDetailsInfo+='\nCHK 0100';
 expect(()=>parseFullServiceReceipt(raw,date)).toThrow();
});
it.each(['CASH USD1.00','CASH 1.00','OTHER THB1.00'])('rejects an additional nonzero tender regardless of its currency label: %s',tender=>{
 const raw=serviceReceipt();raw.checkDetailsInfo=raw.checkDetailsInfo.replace('ROOM CHARGE THB1,177.00','ROOM CHARGE THB1,177.00\n'+tender);expect(()=>parseFullServiceReceipt(raw,'2026-01-02')).toThrow();
});
it('sums two unique contiguous base buckets without replacing either amount',()=>{
 const raw=serviceReceipt();raw.checkDetailsInfo=raw.checkDetailsInfo.replace('FOOD THB1,000.00','FOOD THB600.00\nBEVERAGE THB400.00');expect(parseFullServiceReceipt(raw,'2026-01-02').baseCents).toBe(100000);
});
it('refuses an unlabeled negative item amount instead of overlooking a discount or adjustment',()=>{
 const raw=serviceReceipt();raw.checkDetailsInfo=raw.checkDetailsInfo.replace('1 Synthetic item 1,000.00 T1','1 Synthetic item 1,010.00 T1\n1 Adjustment -10.00');expect(()=>parseFullServiceReceipt(raw,'2026-01-02')).toThrow();
});
it('joins item number to typed split post and accepts an SC0 alias only beside its SC witness',()=>{
 expect(verifyMappedScCode(serviceInterfaces(),'SERVICE')).toBe(true);
});
it.each(['name-only','sc0-only','st-conflict','factor','default-use','missing-logo','changed-map','foreign-hotel','wrong-post'] as const)('rejects incomplete or ambiguous mapping: %s',kind=>{
 const e=serviceInterfaces(),info=e.mappings[0].before.details.transactionsInfo;
 if(kind==='name-only')Object.assign(info.transactionCodes[0].itemizersShortInfo[0],{itemNumber:undefined,itemizerName:'Service'});
 if(kind==='sc0-only')info.itemizers.pop();if(kind==='st-conflict')info.itemizers[1].splitCode='ST1';if(kind==='factor')info.itemizers[1].splitFactor=10;
 if(kind==='default-use')info.transactionCodes[0].code='SERVICE';if(kind==='missing-logo')e.discoveryBefore.hotelInterfaces.push({...e.discoveryBefore.hotelInterfaces[0],logo:'OTHER_'});
 if(kind==='foreign-hotel')e.hotel='TSK';if(kind==='wrong-post')info.itemizers.forEach(v=>v.splitPost=22);
 e.discoveryAfter=structuredClone(e.discoveryBefore);e.mappings[0].after=structuredClone(e.mappings[0].before);if(kind==='changed-map')e.mappings[0].after.details.transactionsInfo.itemizers[0].splitFactor=2;
 expect(()=>verifyMappedScCode(e,'SERVICE')).toThrow();
});
it('permits an explicit tipCode only as corroboration of the same numbered SC join',()=>{
 const e=serviceInterfaces();Reflect.set(e.mappings[0].before.details.transactionsInfo.transactionCodes[0],'tipCode','SERVICE');e.mappings[0].after=structuredClone(e.mappings[0].before);
 expect(verifyMappedFeeCode(e,'SERVICE')).toBe(true);expect(()=>verifyMappedScCode(e,'SERVICE')).toThrow();
});
it('refuses a tip route on another row with no numbered join even when a different row maps the code',()=>{
 const e=serviceInterfaces();e.mappings[0].before.details.transactionsInfo.transactionCodes.push({code:'OTHER',itemizersShortInfo:[]});Reflect.set(e.mappings[0].before.details.transactionsInfo.transactionCodes[1],'tipCode','SERVICE');e.mappings[0].after=structuredClone(e.mappings[0].before);expect(()=>verifyMappedFeeCode(e,'SERVICE')).toThrow();
});
