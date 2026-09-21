import {it,expect} from 'vitest';
import {createReplacementLayer,sourceAppearanceUnchanged,validateSourceText} from '../src/pdf/source-text';
import type {DetectedText,PdfLayer} from '../src/pdf/types';
const run:DetectedText={text:'Original',x:40,y:60,width:80,height:12,fontSize:10,rotated:false,sourceText:{sourceId:'s',sourcePage:1,runIndex:0}};
const native=createReplacementLayer(run,'selected');
it('accepts only the original native appearance at its mapped position',()=>{
 expect(sourceAppearanceUnchanged(native,run,run)).toBe(true);
 const changes:Partial<PdfLayer>[]=[{kind:'text'},{text:'Changed'},{x:41},{y:61},{fontSize:11},{bold:true},{italic:true},{color:'#ffffff'},{fill:'#000000'},{width:10},{height:5},{maskOriginal:false},{deleted:true},{sourceText:{sourceId:'foreign',sourcePage:1,runIndex:0}},{sourceText:{sourceId:'s',sourcePage:1,runIndex:1}}];
 for(const change of changes)expect(sourceAppearanceUnchanged({...native,...change},run,run),JSON.stringify(change)).toBe(false);
 expect(sourceAppearanceUnchanged(native,run,null)).toBe(false);
 expect(sourceAppearanceUnchanged({...native,y:80},run,{x:40,y:80})).toBe(true);
});
it('whitespace-only edits erase ink without needing a font, while nonempty edits remain validated',()=>{
 expect(()=>validateSourceText({...native,text:' \n\t '})).not.toThrow();
 expect(()=>validateSourceText({...native,text:'Changed'})).toThrow('source font');
});
