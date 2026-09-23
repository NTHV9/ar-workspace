import {it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {addVoucherField,readVoucherFields,type VoucherField} from '../src/pdf/voucher-metadata';
import {syncVouchers,voucherRuns,type VoucherBindings} from '../src/pdf/linked-vouchers';
import {createReplacementLayer,registerSourceStyle,sourceStyle,releaseSourceStyles} from '../src/pdf/source-text';
import type {DetectedText} from '../src/pdf/types';
import {restoreProject} from '../src/pdf/model';
import type {PdfProject} from '../src/pdf/types';
const field=(invoiceId:string,text=''):VoucherField=>({hotel:'KAT',accountId:'AC',invoiceId,text,x:100,y:200,width:100,height:14,fontSize:8,bold:false});
const base:PdfProject={version:1,content:'both',delivery:'combined',pages:['S','A','B1','B2'].map(id=>({id,sourceId:id,sourcePage:1,width:612,height:792,layers:[]}))};
const bindings:VoucherBindings=new Map([['S:1',[field('B')]],['A:1',[field('A','KEEP')]],['B1:1',[field('B')]],['B2:1',[field('B')]]]);
const edit=(project:PdfProject,page=0,text='NEW')=>({...project,pages:project.pages.map((p,i)=>i===page?{...p,layers:[{...createReplacementLayer({...field('B'),rotated:false},'edit'),text}]}:p)});
it('does not consume the next header row when its text box overlaps the Voucher boundary',()=>{
 const scope='voucher-baseline-test',ref=(runIndex:number)=>({sourceId:'I',sourcePage:1,runIndex,scope});
 const room:DetectedText={text:'101',x:103,y:211,width:16,height:10,fontSize:8,rotated:false,sourceText:ref(0)};
 const voucher:DetectedText={...room,text:'OLD',y:202,width:20,bold:true,sourceText:ref(1)};
 for(const run of [room,voucher])registerSourceStyle(run.sourceText!,{font:'Arial',fontSize:8,bold:!!run.bold,italic:false,color:'#000000',baseline:6,hScale:1,charSpacing:0,wordSpacing:0,glyphs:new Map(),sequence:[],supported:true,run});
 const result=voucherRuns([room,voucher],[{...field('B','OLD'),height:12,bold:true}]);
 expect(result).toContain(room);expect(result).not.toContain(voucher);
 expect(sourceStyle(createReplacementLayer(result.find(r=>r.field)!,'edit'))?.baseline).toBe(8);
 releaseSourceStyles(scope);
});
it('updates matching identities on all pages as one restorable project, without touching other invoices',()=>{
 const changed=syncVouchers(base,edit(base),bindings);
 expect(changed.pages.map(p=>p.layers.map(l=>l.text))).toEqual([['NEW'],[],['NEW'],['NEW']]);
 expect(base.pages.every(p=>p.layers.length===0)).toBe(true);
 expect(restoreProject(changed,base).pages[2].layers[0].text).toBe('NEW');
});
it('supports clearing, restoring, reverse edits and hidden content without changing selection',()=>{
 const changed=syncVouchers(base,edit(base),bindings);
 const cleared=syncVouchers(changed,edit(changed,2,''),bindings);
 expect(cleared.pages[0].layers[0].text).toBe('');expect(cleared.pages[3].layers[0].text).toBe('');
 const hidden={...changed,content:'statement' as const};expect(syncVouchers(hidden,edit(hidden,0,'NEXT'),bindings).pages[3].layers[0].text).toBe('NEXT');
 const restored={...changed,pages:changed.pages.map((p,i)=>i===0?{...p,layers:[]}:p)};
 expect(syncVouchers(changed,restored,bindings).pages[2].layers[0].text).toBe('');
});
it('does not propagate page or row deletion as a voucher edit',()=>{
 const changed=syncVouchers(base,edit(base),bindings);
 const removed={...changed,pages:changed.pages.slice(1)};
 expect(syncVouchers(changed,removed,bindings).pages[1].layers[0].text).toBe('NEW');
});
it('persists exact field identities in generated page metadata and rejects malformed geometry',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage();addVoucherField(page,field('B'));
 const reopened=await PDFDocument.load(await doc.save());expect(readVoucherFields(reopened.getPage(0))).toEqual([field('B')]);
 addVoucherField(page,{...field('C'),width:9999});expect(()=>readVoucherFields(page)).toThrow('Voucher fields do not match');
});
