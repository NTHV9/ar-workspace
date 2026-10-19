import {describe,it,expect} from 'vitest';
import {matchNativeLine,type NativeLine,type NativeRequest} from '../src/pdf/native/protocol';
const style={text:'INVOICE',rect:[10,10,100,30],baseline:[10,12],font:'F1',baseFont:'Helvetica-Bold',size:18,bold:true,italic:false,color:[1,1,1],decodable:true,visualOrder:false};
const edit:NativeRequest['edits'][number]={id:'x',expectedText:'INVOICE',text:'BILL',x:10,baseline:12,fontSize:18,fontLabel:'Helvetica-Bold',bold:true,italic:false,color:'#ffffff'};
describe('native source identity',()=>{
 it('requires exact unique text, geometry and font/style',()=>{const lines:NativeLine[]=[{index:0,style}];expect(matchNativeLine(lines,edit)).toBe(lines[0]);for(const patch of [{expectedText:'Invoice'},{x:11},{fontLabel:'Courier'},{color:'#000000'},{bold:false}])expect(matchNativeLine(lines,{...edit,...patch})).toBeUndefined();expect(matchNativeLine([...lines,...lines],edit)).toBeUndefined();});
 it('refuses undecodable and visual-order fonts',()=>{expect(matchNativeLine([{index:0,style:{...style,decodable:false}}],edit)).toBeUndefined();expect(matchNativeLine([{index:0,style:{...style,visualOrder:true}}],edit)).toBeUndefined();});
});
