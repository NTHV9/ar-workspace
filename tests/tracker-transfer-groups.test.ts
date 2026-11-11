import {expect,it} from 'vitest';
import {unzipSync,strFromU8,strToU8,zipSync} from 'fflate';
import {transferWorkbook,transferInput} from './fixtures/tracker-transfer';
import {patchTrackerTransfers,parseTrackerWorkbook,regroupTrackerWorkbook,trackerWorkbookGroupsCorrect} from '../worker/tracker-sync/workbook';
const text=(ref:string,value:string)=>'<c r="'+ref+'" t="inlineStr"><is><t>'+value.replaceAll('&','&amp;')+'</t></is></c>';
function grouped(existing=true,sole=false){
 const zip=unzipSync(transferWorkbook()),path='xl/worksheets/sheet1.xml';let xml=strFromU8(zip[path]);
 const one=/<row r="3">([\s\S]*?)<\/row>/.exec(xml)![0].replace('</row>','<c r="H3"><v>30</v></c><c r="I3"><v>30</v></c></row>');
 const two=one.replaceAll('3"','4"').replaceAll('R3','R4').replaceAll('S3','S4').replaceAll('00017','00018').replaceAll('I:17','I:18').replaceAll('<v>30</v>','<v>20</v>');
 const total=(r:number,start:number,end:number,agent:string,n:number,amount:number)=>'<row r="'+r+'">'+text('D'+r,'▸ รวม '+agent+' ('+n+' ใบ)')+'<c r="H'+r+'"><f>SUBTOTAL(9,H'+start+':H'+end+')</f><v>'+amount+'</v></c>'+['I','J','K','L','M','N'].map((c,i)=>'<c r="'+c+r+'"><v>'+(i?0:amount)+'</v></c>').join('')+'</row>';
 const target=sole?5:6;
 const three=one.replaceAll('3"',target+'"').replaceAll('R3','R'+target).replaceAll('S3','S'+target).replaceAll('00017','00019').replaceAll('OLD AGENCY','NEW &amp; AGENCY').replaceAll('I:17','I:19').replaceAll('00009','00012').replaceAll('<v>30</v>','<v>10</v>');
 const rows=one+(sole?'':two)+total(sole?4:5,3,sole?3:4,'OLD AGENCY',sole?1:2,sole?30:50)+(existing?three+total(target+1,target,target,'NEW & AGENCY',1,10):'');
 xml=xml.replace(/<row r="3">[\s\S]*?<\/row>/,rows).replace('</worksheet>','<autoFilter ref="A2:AG'+(existing?target+1:sole?4:5)+'"/><conditionalFormatting sqref="T3:T'+(existing?target+1:sole?4:5)+'"/></worksheet>');
 zip[path]=strToU8(xml);
 return zipSync(zip);
}
it('moves the whole invoice into its existing target group and fixes both subtotal counts and sums',()=>{
 const before=grouped(),out=patchTrackerTransfers(before,'phuket',[transferInput]),parsed=parseTrackerWorkbook(out,'phuket');
 expect(parsed.rows.map(r=>[r.invoiceNo,r.agent,r.locator.row])).toEqual([['00018','OLD AGENCY',3],['00017','NEW & AGENCY',5],['00019','NEW & AGENCY',6]]);
 const xml=strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml']);
 expect(xml).toContain('▸ รวม OLD AGENCY (1 ใบ)');expect(xml).toContain('▸ รวม NEW &amp; AGENCY (2 ใบ)');
 expect(xml).toContain('SUBTOTAL(9,H3:H3)');expect(xml).toContain('SUBTOTAL(9,H5:H6)');
 expect(xml).toContain('R5+S5');expect(xml).toContain('R3+S3');
 expect(trackerWorkbookGroupsCorrect(out,'phuket')).toBe(true);
 expect(regroupTrackerWorkbook(out,'phuket')).toBe(out);
});
it('creates the first destination group and extends only the ledger bounds',()=>{
 const out=patchTrackerTransfers(grouped(false),'phuket',[transferInput]),xml=strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml']);
 expect(xml).toContain('▸ รวม NEW &amp; AGENCY (1 ใบ)');expect(xml).toContain('autoFilter ref="A2:AG6"');expect(xml).toContain('sqref="T3:T6"');
 expect(parseTrackerWorkbook(out,'phuket').rows).toHaveLength(2);
 expect(trackerWorkbookGroupsCorrect(out,'phuket')).toBe(true);
});
it('also repairs an identity already changed manually inside the old group',()=>{
 const zip=unzipSync(grouped(false)),path='xl/worksheets/sheet1.xml';
 zip[path]=strToU8(strFromU8(zip[path]).replace('<t>OLD AGENCY</t>','<t>NEW &amp; AGENCY</t>'));
 const out=regroupTrackerWorkbook(zipSync(zip),'phuket');
 expect(trackerWorkbookGroupsCorrect(out,'phuket')).toBe(true);
 expect(parseTrackerWorkbook(out,'phuket').rows.find(r=>r.invoiceNo==='00017')?.agent).toBe('NEW & AGENCY');
});
it('holds an unsupported cross-row employee formula instead of rebasing it incorrectly',()=>{
 const zip=unzipSync(grouped(false)),path='xl/worksheets/sheet1.xml';
 zip[path]=strToU8(strFromU8(zip[path]).replace('IF(R3=&quot;&quot;,&quot;&quot;,R3+S3)','IF(R2=&quot;&quot;,&quot;&quot;,R2+S2)'));
 // The fixture uses literal XML quotes, so inject an explicit cross-row formula.
 zip[path]=strToU8(strFromU8(zip[path]).replace('<f>IF(R3="","",R3+S3)</f>','<f>R99+S3</f>'));
 expect(()=>patchTrackerTransfers(zipSync(zip),'phuket',[transferInput])).toThrow('tracker_transfer_layout_invalid');
});
it('expands shared date and subtotal formulas before moving their master or follower rows',()=>{
 const zip=unzipSync(grouped()),path='xl/worksheets/sheet1.xml';let xml=strFromU8(zip[path]);
 xml=xml.replace('<f>IF(R3="","",R3+S3)</f>','<f t="shared" ref="T3:T4" si="1">IF(R3="","",R3+S3)</f>');
 xml=xml.replace('<f>IF(R4="","",R4+S4)</f>','<f t="shared" si="1"/>');
 xml=xml.replace('<f>SUBTOTAL(9,H3:H4)</f>','<f t="shared" ref="H5:N5" si="2">SUBTOTAL(9,H3:H4)</f>');
 for(const c of ['I','J','K','L','M','N'])xml=xml.replace('<c r="'+c+'5"><v>','<c r="'+c+'5"><f t="shared" si="2"/><v>');
 zip[path]=strToU8(xml);
 const out=patchTrackerTransfers(zipSync(zip),'phuket',[transferInput]),changed=strFromU8(unzipSync(out)[path]);
 expect(changed).not.toContain('t="shared"');
 expect(changed).toContain('R5+S5');expect(changed).toContain('R3+S3');
 expect(changed).toContain('SUBTOTAL(9,I3:I3)');
 expect(trackerWorkbookGroupsCorrect(out,'phuket')).toBe(true);
});

it('removes only an empty source subtotal when its sole invoice joins an existing group',()=>{
 const out=patchTrackerTransfers(grouped(true,true),'phuket',[transferInput]),xml=strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml']);
 expect(xml).not.toContain('▸ รวม OLD AGENCY');
 expect(xml).toContain('▸ รวม NEW &amp; AGENCY (2 ใบ)');
 expect(xml).toContain('autoFilter ref="A2:AG5"');
 expect(parseTrackerWorkbook(out,'phuket').rows.map(r=>r.invoiceNo)).toEqual(['00017','00019']);
 expect(trackerWorkbookGroupsCorrect(out,'phuket')).toBe(true);
});
