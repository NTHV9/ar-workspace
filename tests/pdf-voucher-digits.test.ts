import {afterEach,expect,it} from 'vitest';
import {completeVoucherDigits} from '../src/pdf/voucher-digits';
import {createReplacementLayer,registerSourceStyle,releaseSourceStyles,sourceStyle} from '../src/pdf/source-text';
import type {DetectedText} from '../src/pdf/types';
const run:DetectedText={text:'',x:472,y:139,width:100,height:10,fontSize:8,bold:true,rotated:false,fontLabel:'ABCDEF+Arial Bold',field:'voucher-number',sourceText:{sourceId:'s',sourcePage:1,runIndex:8,scope:'digits'}};
function setup(label=run.fontLabel){const r={...run,fontLabel:label},glyph={unicode:'0',fontChar:'\ue001',width:556,isInFont:true},glyphs=new Map([['0',glyph],['2',{...glyph,unicode:'2',fontChar:'\ue002'}]]);registerSourceStyle(r.sourceText!,{font:'embedded',fontSize:8,bold:false,italic:false,color:'#000000',baseline:7,hScale:1,charSpacing:0,wordSpacing:0,glyphs,sequence:[],supported:true,run:r});return r;}
afterEach(()=>releaseSourceStyles('digits'));
it('completes only missing digits from a verified same-family local face with native advances',async()=>{
 const r=setup(),before=sourceStyle(createReplacementLayer(r,'before'))!,original=before.glyphs.get('0');
 await completeVoucherDigits(r,async()=>({font:'"verified-local"',advances:Array(10).fill(556.152)}));
 const after=sourceStyle(createReplacementLayer(r,'after'))!;expect(after.glyphs.size).toBe(10);expect(after.glyphs.get('0')).toBe(original);expect(after.glyphs.get('1')).toMatchObject({fontChar:'1',width:556,fallbackFont:'"verified-local"'});expect(before.glyphs.size).toBe(2);
});
it('does not substitute an unavailable, mismatched, or differently named face',async()=>{
 for(const font of [null,{font:'wrong',advances:Array(10).fill(610)}]){const r=setup();await completeVoucherDigits(r,async()=>font);expect(sourceStyle(createReplacementLayer(r,'s'))!.glyphs.size).toBe(2);}
 const r=setup('Other Bold');let loaded=false;await completeVoucherDigits(r,async()=>{loaded=true;return null;});expect(loaded).toBe(false);
});
