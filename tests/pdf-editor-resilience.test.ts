import { describe, expect, it } from 'vitest';
import { rowGeometry } from '../src/pdf/row-geometry';
import { createReplacementLayer, validateSourceText } from '../src/pdf/source-text';
import type { DetectedText, PdfProjectPage } from '../src/pdf/types';
import {includeTouchedText,inside} from '../src/pdf/row-layout';

function sparseInvoice() {
  const columns = [20, 90, 200, 300, 360];
  const values: [string, number, number, number][] = [
    ...['DATE', 'DESCRIPTION', 'REFERENCE', 'DEBIT', 'CREDIT'].map((text, i) => [text, columns[i], 20, i === 1 ? 90 : 40] as [string, number, number, number]),
    ['01/09/26', 20, 40, 45], ['Room charge', 90, 40, 90], ['REF-001', 200, 40, 60], ['100.00', 300, 40, 40],
    ['02/09/26', 20, 54, 45], ['City Ledger', 90, 54, 90], ['100.00', 360, 54, 40],
    ['Credit continuation', 90, 64, 95], ['TOTAL', 200, 90, 60],
  ];
  const runs: DetectedText[] = values.map(([text,x,y,width],runIndex) => ({text,x,y,width,height:9.2,fontSize:8,rotated:false,bold:runIndex<5,sourceText:{sourceId:'s',sourcePage:1,runIndex}}));
  const anchor = createReplacementLayer(runs[10], 'anchor');
  const page: PdfProjectPage = {id:'s:1',sourceId:'s',sourcePage:1,width:440,height:300,layers:[anchor]};
  return {page,anchor,runs,barriers:[{x:15,y:33,width:410,height:.5},{x:15,y:80,width:410,height:.5}]};
}

describe('PDF editor reported failures', () => {
  it('offers all five invoice columns when inserting below a sparse credit row', () => {
    const {page,anchor,runs,barriers}=sparseInvoice();
    const row=rowGeometry(page,anchor,runs,barriers);
    expect(row.separable).toBe(true);
    expect(row.template.map(cell=>cell.rect.x).sort((a,b)=>a-b)).toEqual([20,90,200,300,360]);
  });

  it('clearing a native text box does not require a drawable source font', () => {
    const {anchor}=sparseInvoice();
    // Source identity still belongs to the document; no glyph is needed to erase it.
    expect(()=>validateSourceText({...anchor,text:''})).not.toThrow();
  });

  it('does not infer invoice columns from a header in a different format or from totals',()=>{
    const {page,anchor,runs,barriers}=sparseInvoice();
    expect(rowGeometry(page,anchor,runs.filter(r=>r.text!=='CREDIT'),barriers).template).toHaveLength(3);
    const total=createReplacementLayer(runs.at(-1)!,'total');
    expect(rowGeometry({...page,layers:[total]},total,runs,barriers).template).toHaveLength(1);
  });

  it('keeps a description continuation with the sparse row at ordinary 14pt leading',()=>{
    const {page,anchor,runs,barriers}=sparseInvoice();
    const ordinary=runs.map(r=>r.text==='Credit continuation'?{...r,y:68}:r);
    const row=rowGeometry(page,anchor,ordinary,barriers);
    expect(row.cells.map(c=>c.run.text)).toContain('Credit continuation');
  });

  it('includes whole touched objects transitively and leaves disjoint text alone',()=>{
    const selection={x:15,y:15,width:10,height:10},text=[{x:10,y:10,width:30,height:10},{x:35,y:18,width:20,height:12},{x:100,y:100,width:20,height:20}];
    const expanded=includeTouchedText(selection,text);
    expect(inside(text[0],expanded)).toBe(true);expect(inside(text[1],expanded)).toBe(true);expect(inside(text[2],expanded)).toBe(false);
    expect(selection).toEqual({x:15,y:15,width:10,height:10});expect(includeTouchedText(expanded,text)).toEqual(expanded);
  });
});
