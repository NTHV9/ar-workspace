import { describe, expect, it } from 'vitest';
import { containedAreaTextTargets, deleteAreaTextTargets, displayedAreaTextTargets, excludedAreaVoucherRects, rectFromPoints } from '../src/pdf/area-tools';
import { createReplacementLayer } from '../src/pdf/source-text';
import type { DetectedText, PdfLayer, PdfProjectPage } from '../src/pdf/types';
import type { VoucherBindings } from '../src/pdf/linked-vouchers';

const page: PdfProjectPage = { id: 'p', sourceId: 's', sourcePage: 1, width: 400, height: 300, layers: [] };
const run = (text = 'Header', x = 20, y = 20, index = 0): DetectedText => ({ text, x, y, width: 70, height: 12, fontSize: 10, rotated: false, sourceText: { sourceId: 's', sourcePage: 1, runIndex: index } });
const added = (id: string, text = 'Added address', kind: PdfLayer['kind'] = 'text'): PdfLayer => ({ ...createReplacementLayer(run(text), id), kind, original: undefined, sourceText: undefined });
const bindings: VoucherBindings = new Map();
const all = { x: 0, y: 0, width: 400, height: 1000 };

describe('area geometry', () => {
  it('normalizes reverse drags and clips both endpoints to continuation bounds', () => {
    expect(rectFromPoints({ x: 420, y: 700 }, { x: -10, y: 280 }, { width: 400, height: 600 })).toEqual({ x: 0, y: 280, width: 400, height: 320 });
  });
  it('rejects nonfinite, nonpositive bounds and zero-area drags', () => {
    for (const width of [0, -1, Infinity, NaN]) expect(rectFromPoints({ x: 0, y: 0 }, { x: 10, y: 10 }, { width, height: 300 })).toBeNull();
    expect(rectFromPoints({ x: NaN, y: 0 }, { x: 10, y: 10 }, page)).toBeNull();
    expect(rectFromPoints({ x: -20, y: 0 }, { x: -10, y: 10 }, page)).toBeNull();
    expect(rectFromPoints({ x: 10, y: 0 }, { x: 10, y: 10 }, page)).toBeNull();
  });
  it('requires full containment with only .01 unit tolerance, without snapping', () => {
    const targets = displayedAreaTextTargets(page, [run()], bindings);
    expect(containedAreaTextTargets(targets, { x: 20.1, y: 20, width: 70, height: 12 })).toEqual([]);
    expect(containedAreaTextTargets(targets, { x: 20.009, y: 20.009, width: 69.982, height: 11.982 })).toEqual(targets);
    for (const area of [{ ...all, width: 0 }, { ...all, x: NaN }, { ...all, height: -1 }]) expect(containedAreaTextTargets(targets, area)).toEqual([]);
  });
});

describe('displayed text targets', () => {
  it('keeps eleven equal References distinct and includes generic headers, addresses and body text', () => {
    const runs = [...Array.from({ length: 11 }, (_, n) => run('SAME REF', 120, 70 + n * 16, n)), run('INVOICE HEADER', 20, 10, 11), run('123 Beach Road', 20, 30, 12), run('Please remit payment', 20, 50, 13)];
    const targets = displayedAreaTextTargets(page, runs, bindings);
    expect(targets).toHaveLength(14);
    expect(new Set(targets.map(t => t.key)).size).toBe(14);
    expect(containedAreaTextTargets(targets, { x: 120, y: 70, width: 70, height: 172 })).toHaveLength(11);
    const legacy = runs.slice(0, 2).map(r => ({ ...r, sourceText: undefined }));
    expect(new Set(displayedAreaTextTargets(page, legacy, bindings).map(t => t.key)).size).toBe(2);
  });
  it('hides the original and uses actual edited layer geometry, while clones remain independent', () => {
    const original = run(), edit = { ...createReplacementLayer(original, 'edit'), text: 'Edited header', x: 180, y: 90, font: 'Georgia', fontSize: 15 };
    const clone = { ...createReplacementLayer(original, 'clone'), maskOriginal: false, x: 100 };
    const targets = displayedAreaTextTargets({ ...page, layers: [edit, clone, added('note', 'Body note', 'note'), added('stamp', 'PAID', 'stamp')] }, [original], bindings);
    expect(targets.map(t => t.kind === 'layer' && t.layerId)).toEqual(['edit', 'clone', 'note', 'stamp']);
    expect(targets[0].rect).toEqual({ x: 180, y: 90, width: 70, height: 12 });
    expect(displayedAreaTextTargets({ ...page, layers: [clone] }, [original], bindings)).toHaveLength(2);
  });
  it('excludes deleted, empty, graphics, invalid and rotated source targets', () => {
    const deleted = { ...createReplacementLayer(run(), 'deleted'), text: '', deleted: true as const };
    const layers = [deleted, added('empty', ' '), ...(['image', 'shape', 'whiteout'] as const).map(k => added(k, 'Graphic', k)), { ...added('invalid'), width: Infinity }];
    expect(displayedAreaTextTargets({ ...page, layers }, [run(), { ...run('rotated', 100), rotated: true }, run(' '), { ...run('bad'), width: 0 }], bindings)).toEqual([]);
  });
  it('follows insert/delete/move source coordinates without transforming added layers twice', () => {
    const edited: PdfProjectPage = { ...page, rowEdits: [{ id: 'i', kind: 'insert', y: 10, height: 20 }, { id: 'd', kind: 'delete', y: 60, height: 10 }, { id: 'm', kind: 'move', x: 10, y: 35, width: 100, height: 20, dx: 80, dy: 40 }], layers: [{ ...added('body'), y: 100 }] };
    const targets = displayedAreaTextTargets(edited, [run(), run('deleted band', 20, 38, 1), run('after cut', 20, 80, 2)], bindings);
    expect(targets.map(t => t.rect.y)).toEqual([80, 90, 100]);
    expect(targets[0].rect.x).toBe(100);
  });
  it('accepts continuation text but excludes targets beyond logical page bounds', () => {
    const continued = { ...page, flowHeight: 600, layers: [{ ...added('continued'), y: 500 }, { ...added('outside'), x: 390 }] };
    expect(displayedAreaTextTargets(continued, [run('Source body', 20, 480)], bindings)).toHaveLength(2);
  });
  it('excludes actual linked source and font-changed replacements, without treating ordinary headers as linked', () => {
    const source = run('Voucher value'), fields: VoucherBindings = new Map([['s:1', [{ ...source, hotel: 'KAT', accountId: 'account', invoiceId: 'invoice', bold: false }]]]);
    const replacement = { ...createReplacementLayer(source, 'bound'), text: 'Changed', font: 'Georgia', fontSize: 16, x: 150, y: 100 };
    const ordinary = run('Voucher value', 200, 20, 1);
    expect(displayedAreaTextTargets(page, [source, ordinary], fields)).toHaveLength(1);
    expect(excludedAreaVoucherRects(page, [source, ordinary], fields)).toEqual([{ x: 20, y: 20, width: 70, height: 12 }]);
    const input = { ...page, layers: [replacement] };
    expect(displayedAreaTextTargets(input, [source, ordinary], fields)).toHaveLength(1);
    expect(excludedAreaVoucherRects(input, [source, ordinary], fields)).toEqual([{ x: 150, y: 100, width: 70, height: 12 }]);
    expect(excludedAreaVoucherRects({ ...input, layers: [{ ...replacement, text: '', deleted: true }] }, [source], fields)).toEqual([]);
  });
});

describe('immutable batch deletion', () => {
  it('creates source deletion masks once and keeps all neighbor geometry and row allocations', () => {
    const runs = [run('Header'), run('Address', 20, 60, 1)], neighbor = added('neighbor');
    const input = { ...page, flowHeight: 350, rowEdits: [{ id: 'insert', kind: 'insert' as const, y: 10, height: 20 }], layers: [neighbor] };
    const snapshot = structuredClone(input), targets = displayedAreaTextTargets(input, runs, bindings).filter(t => t.kind === 'source');
    let ids = 0;
    const next = deleteAreaTextTargets(input, [...targets, targets[0]], () => `new-${++ids}`);
    expect(ids).toBe(2);
    expect(next.layers.slice(1)).toMatchObject([{ text: '', deleted: true, original: { text: 'Header' }, y: 40 }, { text: '', deleted: true, original: { text: 'Address' }, y: 80 }]);
    expect(next.layers[0]).toBe(neighbor);
    expect(next.rowEdits).toBe(input.rowEdits);
    expect(next.flowHeight).toBe(350);
    expect(input).toEqual(snapshot);
    expect(deleteAreaTextTargets(next, targets, () => { throw Error('duplicate'); })).toBe(next);
  });
  it('deletes existing edited, added and cloned text together without releasing their space', () => {
    const source = run(), replacement = { ...createReplacementLayer(source, 'edit'), text: 'Edited header', textFlow: { at: 30, height: 40 } };
    const clone = { ...createReplacementLayer(run('clone'), 'clone'), maskOriginal: false };
    const neighbor = added('neighbor'), input = { ...page, layers: [replacement, added('address'), clone, neighbor] };
    const targets = displayedAreaTextTargets(input, [source], bindings).filter(t => t.kind === 'layer' && t.layerId !== 'neighbor');
    const next = deleteAreaTextTargets(input, targets, () => { throw Error('existing targets'); });
    expect(next.layers).toHaveLength(2);
    expect(next.layers[0]).toMatchObject({ id: 'edit', text: '', deleted: true });
    expect(next.layers[0].textFlow).toBeUndefined();
    expect(next.layers[1]).toBe(neighbor);
    expect(input.layers).toHaveLength(4);
  });
  it('returns the identical page for empty, invalid or already missing selections', () => {
    expect(deleteAreaTextTargets(page, [], () => 'unused')).toBe(page);
    const target = displayedAreaTextTargets({ ...page, layers: [added('missing')] }, [], bindings)[0];
    expect(deleteAreaTextTargets(page, [target], () => 'unused')).toBe(page);
    expect(deleteAreaTextTargets(page, [{ ...displayedAreaTextTargets(page, [run()], bindings)[0], rect: { ...all, width: 0 } }], () => 'unused')).toBe(page);
  });
});


it('deletes a mixed header/body selection once while retaining unselected body text by identity', () => {
  const source = run('Original header'), editedSource = run('Original address', 20, 50, 1);
  const edit = { ...createReplacementLayer(editedSource, 'edit'), text: 'Edited address', y: 90 };
  const neighbor = added('neighbor', 'Please pay within agreed terms');
  const input = { ...page, layers: [edit, added('new-body', 'Additional instructions'), neighbor] };
  const snapshot = structuredClone(input);
  Object.freeze(input.layers);
  for (const layer of input.layers) Object.freeze(layer);
  Object.freeze(input);
  const targets = displayedAreaTextTargets(input, [source, editedSource], bindings).filter(t => t.kind !== 'layer' || t.layerId !== neighbor.id);
  let ids = 0;
  const result = deleteAreaTextTargets(input, [...targets, ...targets], () => `mask-${++ids}`);
  expect(ids).toBe(1);
  expect(result.layers.filter(l => l.deleted).map(l => l.original?.text)).toEqual(['Original address', 'Original header']);
  expect(result.layers.find(l => l.id === neighbor.id)).toBe(neighbor);
  expect(result.layers.find(l => l.id === 'new-body')).toBeUndefined();
  expect(input).toEqual(snapshot);
});

it('only exposes the last source-owning replacement while retaining independent clones', () => {
  const source = run();
  const older = createReplacementLayer(source, 'old'), newer = { ...older, id: 'new', text: 'Current header' };
  const input = { ...page, layers: [older, newer] };
  expect(displayedAreaTextTargets(input, [source], bindings).map(t => t.kind === 'layer' && t.layerId)).toEqual(['new']);
  expect(displayedAreaTextTargets({ ...input, layers: [older, { ...newer, text: '', deleted: true }] }, [source], bindings)).toEqual([]);
});
