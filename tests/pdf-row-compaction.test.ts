import { describe, expect, it } from 'vitest';
import { compactEmptyRowLines } from '../src/pdf/row-compaction';
import { createReplacementLayer } from '../src/pdf/source-text';
import { applyFlowEdit } from '../src/pdf/flow';
import { mapSourceTextRect } from '../src/pdf/row-layout';
import type { DetectedText, PdfLayer, PdfProjectPage } from '../src/pdf/types';

function fixture() {
  const values = [
    ['Date', 20, 40, 40], ['F002', 90, 40, 40], ['Voucher first', 200, 40, 75], ['200.00', 300, 40, 40],
    ['Voucher second', 200, 50, 75], ['Voucher third', 200, 60, 75], ['Voucher fourth', 200, 70, 75],
    ['Balance Due', 200, 88, 75], ['Footer', 20, 250, 60],
  ] as const;
  const runs: DetectedText[] = values.map(([text, x, y, width], runIndex) => ({ text, x, y, width, height: 9.2, fontSize: 8, rotated: false, sourceText: { sourceId: 's', sourcePage: 1, runIndex } }));
  const anchor = createReplacementLayer(runs[1], 'anchor');
  const blank = (index: number): PdfLayer => ({ ...createReplacementLayer(runs[index], `blank-${index}`), text: '' });
  const page: PdfProjectPage = { id: 's:1', sourceId: 's', sourcePage: 1, width: 400, height: 300, layers: [anchor, ...[2, 4, 5, 6].map(blank)] };
  const barriers = [{ x: 10, y: 84, width: 370, height: 20 }];
  return { page, anchor, runs, barriers };
}

describe('cleared native row continuation compaction', () => {
  it('removes three full 10pt pitches and preserves the first baseline, total, and footer', () => {
    const f = fixture(), result = compactEmptyRowLines(f.page, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(3);
    expect(result.page.rowEdits?.map(edit => edit.kind === 'delete' ? edit.height : 0)).toEqual([10, 10, 10]);
    expect(result.page.rowEdits?.map(edit => edit.y)).toEqual([69.6, 59.6, 49.6]);
    expect(result.page.layers.map(layer => layer.id)).toEqual(['anchor', 'blank-2']);
    expect(result.anchor).toMatchObject({ id: 'anchor', text: 'F002', x: 90, y: 40 });
    expect(mapSourceTextRect(f.runs[7], result.page.rowEdits ?? [])?.y).toBe(58);
    expect(mapSourceTextRect(f.runs[8], result.page.rowEdits ?? [])?.y).toBe(220);
    expect(f.page.rowEdits).toBeUndefined();
    expect(f.page.layers).toHaveLength(5);
  });

  it('compacts empty bands before a surviving continuation without deleting its ink', () => {
    const f = fixture();
    f.page.layers = f.page.layers.filter(layer => layer.id !== 'blank-6');
    const result = compactEmptyRowLines(f.page, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(2);
    expect(mapSourceTextRect(f.runs[6], result.page.rowEdits ?? [])).toMatchObject({ text: 'Voucher fourth', y: 50 });
  });

  it('requires every native run on the continuation band to be explicitly cleared', () => {
    const f = fixture();
    f.runs.push({ ...f.runs[4], text: 'Keep this cell', x: 100, width: 40, sourceText: { sourceId: 's', sourcePage: 1, runIndex: 9 } });
    const result = compactEmptyRowLines(f.page, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(2);
    expect(mapSourceTextRect(f.runs[9], result.page.rowEdits ?? [])).toMatchObject({ text: 'Keep this cell', y: 50 });
  });

  it('supports deletion masks and returns a base anchor when the selected continuation disappears', () => {
    const f = fixture();
    f.page.layers = f.page.layers.map(layer => layer.id.startsWith('blank-') ? { ...layer, deleted: true } : layer);
    const result = compactEmptyRowLines(f.page, f.page.layers[3], f.runs, f.barriers);
    expect(result.removedLines).toBe(3);
    expect(result.anchor).toMatchObject({ text: 'Date', x: 20, y: 40, original: { text: 'Date' } });
    expect(result.anchor.deleted).not.toBe(true);
  });

  it('does not collapse whitespace-only text or an added table row', () => {
    const f = fixture();
    const whitespace = { ...f.page, layers: f.page.layers.map(layer => layer.text === '' ? { ...layer, text: ' ' } : layer) };
    expect(compactEmptyRowLines(whitespace, f.anchor, f.runs, f.barriers)).toEqual({ page: whitespace, anchor: f.anchor, removedLines: 0 });
    const added = { ...f.anchor, tableRow: 'added-row', maskOriginal: false };
    expect(compactEmptyRowLines(f.page, added, f.runs, f.barriers)).toEqual({ page: f.page, anchor: added, removedLines: 0 });
  });

  it('protects a surviving added text box anywhere across the deleted band', () => {
    const f = fixture();
    const extra: PdfLayer = { ...f.anchor, id: 'extra', kind: 'text', original: undefined, sourceText: undefined, x: 5, y: 60, width: 30, height: 9.2, text: 'Keep' };
    const result = compactEmptyRowLines({ ...f.page, layers: [...f.page.layers, extra] }, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(2);
    expect(result.page.layers.find(layer => layer.id === 'extra')).toMatchObject({ text: 'Keep', y: 50 });
  });

  it('protects small native images that are not row-wide rules', () => {
    const f = fixture();
    const result = compactEmptyRowLines(f.page, f.anchor, f.runs, [...f.barriers, { x: 350, y: 61, width: 12, height: 5 }]);
    expect(result.removedLines).toBe(2);
    expect(result.page.rowEdits?.map(edit => edit.y)).toEqual([69.6, 49.6]);
  });

  it('protects native artwork moved into a candidate band even without text or image targets', () => {
    const f = fixture();
    const moved = applyFlowEdit(f.page, { id: 'move-art', kind: 'move', x: 350, y: 200, width: 20, height: 5, dx: 0, dy: -148 });
    const result = compactEmptyRowLines(moved, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(2);
    expect(result.page.rowEdits?.filter(edit => edit.kind === 'delete').map(edit => edit.y)).toEqual([69.6, 59.6]);
  });

  it('does not erase an identity mismatch by physically deleting the edited source band', () => {
    const f = fixture();
    f.page.layers = f.page.layers.map(layer => layer.id === 'blank-4' ? { ...layer, sourceText: { sourceId: 's', sourcePage: 1, runIndex: 0 } } : layer);
    const result = compactEmptyRowLines(f.page, f.anchor, f.runs, f.barriers);
    expect(result.removedLines).toBe(2);
    expect(result.page.layers.some(layer => layer.id === 'blank-4')).toBe(true);
    expect(mapSourceTextRect(f.runs[4], result.page.rowEdits ?? [])?.y).toBe(50);
  });
});
