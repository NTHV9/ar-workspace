import {afterEach,expect,it} from 'vitest';
import {voucherFields} from '../src/pdf/voucher-field';
import {createReplacementLayer,registerSourceStyle,releaseSourceStyles,sourceStyle} from '../src/pdf/source-text';
import type {DetectedText,PdfProjectPage} from '../src/pdf/types';

const page:PdfProjectPage={id:'s:1',sourceId:'s',sourcePage:1,width:612,height:792,layers:[]};
const scope='voucher-test';
function run(text:string,x:number,y:number,index:number,bold=false):DetectedText{
 const r:DetectedText={text,x,y,width:text.length*4,height:10,fontSize:8,rotated:false,bold,italic:false,color:'#123456',fontLabel:bold?'Native Bold':'Native Regular',sourceText:{sourceId:'s',sourcePage:1,runIndex:index,scope}};
 registerSourceStyle(r.sourceText!,{run:r,font:'Native Test Face',fontSize:8,bold:false,italic:false,color:'#123456',baseline:7,hScale:.96,charSpacing:0,wordSpacing:0,glyphs:new Map(),sequence:[],supported:true});
 return r;
}
function header(){return [run('COPY OF INVOICE',382,84,0),run('Voucher No.',382,100,1,true),run(':',465,100.8,2),run('Room No.',382,111,3),run('1234',472.5,111,4),run('Folio No.',382,160,5,true),run(':',465,160.8,6),run('54321',472.5,159.5,7,true)];}
afterEach(()=>releaseSourceStyles(scope));

it('creates a blank Voucher target from the native value column, font and relative baseline',()=>{
 const input=header(),found=voucherFields(page,input),field=found.find(r=>r.field==='voucher-number')!;
 expect(field).toMatchObject({text:'',x:472.5,y:99.5,fontSize:8,bold:true,color:'#123456',fontLabel:'Native Bold',maskOriginal:false});
 expect(field.width).toBeGreaterThan(50);
 const layer=createReplacementLayer(field,'entry');expect(layer.maskOriginal).toBe(false);
 expect(sourceStyle(layer)).toMatchObject({font:'Native Test Face',baseline:7,hScale:.96,supported:true});
 expect(input).toHaveLength(8);
});
it('keeps an existing Voucher value instead of adding a second target',()=>{
 const input=[...header(),run('87654321',472.5,99.5,8,true)],found=voucherFields(page,input);
 expect(found).toHaveLength(input.length);expect(found.find(r=>r.field==='voucher-number')?.text).toBe('87654321');
});
it('keeps the same blank Voucher behavior for a workspace INVOICE heading',()=>{
 const input=header();input[0]=run('INVOICE',382,84,0);
 expect(voucherFields(page,input).find(r=>r.field==='voucher-number')).toMatchObject({text:'',x:472.5,y:99.5,maskOriginal:false});
});
it('does not invent fields in a Statement table or an ambiguous header',()=>{
 const input=header();expect(voucherFields(page,input.filter(r=>r.text!=='COPY OF INVOICE'))).toEqual(input.filter(r=>r.text!=='COPY OF INVOICE'));
 expect(voucherFields(page,input.filter(r=>r.text!=='Folio No.'))).toEqual(input.filter(r=>r.text!=='Folio No.'));
});
it('regenerates a stable field reference and follows a shifted native header',()=>{
 const input=header(),a=voucherFields(page,input).at(-1)!;expect(voucherFields(page,input).at(-1)?.sourceText?.runIndex).toBe(a.sourceText?.runIndex);
 const shifted=input.map(r=>run(r.text,r.x-20,r.y+30,r.sourceText!.runIndex,!!r.bold));
 expect(voucherFields(page,shifted).at(-1)).toMatchObject({x:452.5,y:129.5,fontSize:8});
});
