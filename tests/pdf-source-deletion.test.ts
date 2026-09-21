import { describe, expect, it } from 'vitest';
import { restoreProject } from '../src/pdf/model';
import { createReplacementLayer } from '../src/pdf/source-text';
import type { DetectedText, PdfProject, PdfProjectPage } from '../src/pdf/types';
import { deleteTextLayer, prepareRowDeletion, replacementForRun, sourceRunDeleted, validateDeletedLayer } from '../src/pdf/source-edits';
import { applyFlowEdit } from '../src/pdf/flow';

const run: DetectedText = { text: 'Voucher 1001', x: 40, y: 40, width: 80, height: 12, fontSize: 9, rotated: false, sourceText: { sourceId: 's', sourcePage: 1, runIndex: 0 } };
const page: PdfProjectPage = { id: 's:1', sourceId: 's', sourcePage: 1, width: 400, height: 300, layers: [] };
const original: PdfProject = { version: 1, content: 'invoices', delivery: 'combined', pages: [page] };
const layer = createReplacementLayer(run, 'voucher');
const saved = (value: unknown) => ({ ...original, pages: [{ ...page, layers: [value] }] });

describe('persisted source deletion', () => {
  it('retains an explicit mask-only deletion after serialization and restoration', () => {
    const input = JSON.parse(JSON.stringify(saved({ ...layer, text: '', deleted: true })));
    const restored = restoreProject(input, original).pages[0].layers[0];
    expect(restored).toMatchObject({ id: 'voucher', kind: 'replacement', text: '', deleted: true, original: { text: 'Voucher 1001', x: 40, y: 40, width: 80, height: 12 }, sourceText: { sourceId: 's', sourcePage: 1, runIndex: 0 } });
  });

  it('does not interpret legacy empty replacements as deleted', () => {
    const empty = { ...layer, text: '' };
    expect(restoreProject(saved(empty), original).pages[0].layers[0]).toEqual(empty);
  });

  it('accepts an explicitly enabled original mask on a deleted native run', () => {
    expect(restoreProject(saved({ ...layer, text: '', deleted: true, maskOriginal: true }), original).pages[0].layers[0]).toMatchObject({ text: '', deleted: true, maskOriginal: true });
  });

  it('rejects deletion markers on text, clones, visible text, or malformed marker values', () => {
    const deleted = { ...layer, text: '', deleted: true };
    for (const invalid of [
      { ...deleted, text: 'Hidden replacement' },
      { ...deleted, text: ' ' },
      { ...deleted, kind: 'text', original: undefined, sourceText: undefined },
      { ...deleted, original: undefined },
      { ...deleted, maskOriginal: false },
      { ...deleted, deleted: false },
      { ...deleted, deleted: 'true' },
    ]) expect(() => restoreProject(saved(invalid), original)).toThrow('Saved PDF edits are invalid');
  });

  it('keeps source identity validation for deleted runs', () => {
    expect(() => restoreProject(saved({ ...layer, text: '', deleted: true, sourceText: { ...run.sourceText, sourceId: 'another-document' } }), original)).toThrow();
  });
});

describe('source deletion ownership', () => {
  it('keeps a source mask when deleting a row containing text moved from outside the band',()=>{
    const moved={...layer,y:180},edit={id:'delete-row',kind:'delete' as const,y:175,height:25};
    const prepared=prepareRowDeletion({...page,layers:[moved]},edit,[moved.id]);
    const deleted=applyFlowEdit(prepared,edit);
    expect(deleted.layers[0]).toMatchObject({id:layer.id,y:40,text:'',deleted:true,original:{y:40}});
    expect(sourceRunDeleted(deleted,run)).toBe(true);
  });

  it('removes an obsolete source mask when the original source band itself is deleted',()=>{
    const edit={id:'delete-row',kind:'delete' as const,y:39,height:20};
    expect(prepareRowDeletion({...page,layers:[layer]},edit,[layer.id]).layers).toHaveLength(0);
  });
  it('erases the exact native source while retaining its mask and removing the editor spacer', () => {
    const edited = { ...layer, x: 120, y: 100, height: 60, text: 'Edited voucher', textFlow: { at: 52, height: 48 } };
    const input = { ...page, layers: [edited] };
    const next = deleteTextLayer(input, edited);
    expect(next.layers).toEqual([{ ...layer, text: '', deleted: true }]);
    expect(input.layers[0].text).toBe('Edited voucher');
    expect(sourceRunDeleted(next, run)).toBe(true);
  });

  it('removes added text and cloned cells instead of leaving a mask over another source', () => {
    const added = { ...layer, id: 'added', kind: 'text' as const, original: undefined, sourceText: undefined };
    const clone = { ...layer, id: 'clone', maskOriginal: false };
    const input = { ...page, layers: [layer, added, clone] };
    expect(deleteTextLayer(input, added).layers.map(l => l.id)).toEqual(['voucher', 'clone']);
    expect(deleteTextLayer(input, clone).layers.map(l => l.id)).toEqual(['voucher', 'added']);
    expect(replacementForRun({ ...page, layers: [clone] }, run)).toBeUndefined();
  });

  it('uses the last exact source mask and supports legacy original-coordinate identity', () => {
    const deleted = { ...layer, id: 'deleted', text: '', deleted: true as const };
    const clone = { ...layer, id: 'clone', maskOriginal: false };
    expect(replacementForRun({ ...page, layers: [layer, deleted, clone] }, run)?.id).toBe('deleted');
    expect(sourceRunDeleted({ ...page, layers: [deleted, layer] }, run)).toBe(false);
    const legacy = { ...deleted, sourceText: undefined };
    expect(sourceRunDeleted({ ...page, layers: [legacy] }, run)).toBe(true);
    expect(sourceRunDeleted({ ...page, layers: [legacy] }, { ...run, y: 100 })).toBe(false);
    expect(sourceRunDeleted({ ...page, layers: [{ ...layer, text: '' }] }, run)).toBe(false);
  });

  it('follows ordered row moves and disappears only when its source band is physically removed', () => {
    let next = deleteTextLayer({ ...page, layers: [layer] }, layer);
    next = applyFlowEdit(next, { id: 'insert', kind: 'insert', y: 20, height: 10 });
    expect(next.layers[0]).toMatchObject({ x: 40, y: 50, deleted: true, original: { x: 40, y: 40 } });
    next = applyFlowEdit(next, { id: 'move', kind: 'move', x: 30, y: 45, width: 100, height: 25, dx: 20, dy: 30 });
    expect(next.layers[0]).toMatchObject({ x: 60, y: 80, deleted: true });
    expect(sourceRunDeleted(next, run)).toBe(true);
    expect(applyFlowEdit(next, { id: 'delete', kind: 'delete', y: 79, height: 20 }).layers).toEqual([]);
  });

  it('validates a tombstone without requiring an available source font', () => {
    const deleted = { ...layer, text: '', deleted: true as const };
    expect(() => validateDeletedLayer(deleted)).not.toThrow();
    expect(() => validateDeletedLayer({ ...deleted, text: 'Ink' })).toThrow();
    expect(() => validateDeletedLayer({ ...deleted, maskOriginal: false })).toThrow();
    expect(() => validateDeletedLayer({ ...deleted, kind: 'text' })).toThrow();
    expect(() => validateDeletedLayer({ ...deleted, original: undefined })).toThrow();
  });
});
