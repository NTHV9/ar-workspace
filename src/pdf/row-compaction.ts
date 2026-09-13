import { applyFlowEdit, sourceFragments } from './flow';
import { rowGeometry } from './row-geometry';
import { mapSourceTextRect } from './row-layout';
import { replacementForRun } from './source-edits';
import { createReplacementLayer, sourceEditingStyle, sourceStyle } from './source-text';
import type { DetectedText, PdfLayer, PdfProjectPage } from './types';

type Rect = { x: number; y: number; width: number; height: number };
type Cell = ReturnType<typeof rowGeometry>['cells'][number];
type Band = { y: number; height: number };

function intersectsBand(rect: Rect, band: Band, width: number): boolean {
  return rect.x < width && rect.x + rect.width > 0 && rect.y < band.y + band.height - .01 && rect.y + rect.height > band.y + .01;
}

function mappedPieces(page: PdfProjectPage, rectangles: Rect[]) {
  return sourceFragments(page, rectangles.map(rect => ({ ...rect, sx: rect.x, sy: rect.y })));
}

function movedAreas(page: PdfProjectPage): Rect[] {
  return (page.rowEdits ?? []).flatMap((edit, index, edits) => edit.kind !== 'move' ? [] : mappedPieces({ ...page, rowEdits: edits.slice(index + 1) }, [
    { x: edit.x, y: edit.y, width: edit.width, height: edit.height },
    { x: edit.x + edit.dx, y: edit.y + edit.dy, width: edit.width, height: edit.height },
  ]));
}

function matchesRun(layer: PdfLayer, run: DetectedText, page: PdfProjectPage): boolean {
  return replacementForRun({ ...page, layers: [layer] }, run) === layer;
}

function verifiedSource(layer: PdfLayer, run: DetectedText): boolean {
  const original = layer.original, source = layer.sourceText, target = run.sourceText;
  return !!original && original.text === run.text && Math.abs(original.x - run.x) < .01 && Math.abs(original.y - run.y) < .01
    && (!source || !!target && source.sourceId === target.sourceId && source.sourcePage === target.sourcePage && source.runIndex === target.runIndex);
}

function bandIsProtected(page: PdfProjectPage, band: Band, removedIds: Set<string>, runs: DetectedText[], barriers: Rect[]): boolean {
  const intersects = (rect: Rect) => intersectsBand(rect, band, page.width);
  if ([...mappedPieces(page, barriers), ...movedAreas(page)].some(intersects)) return true;
  for (const run of runs) {
    // A replacement owns the original ink; its current box is checked below.
    if (replacementForRun(page, run)) continue;
    const original = createReplacementLayer(run, 'measure');
    const mapped = mapSourceTextRect(run, page.rowEdits ?? [], sourceEditingStyle(original).baseline);
    if (mapped && intersects(mapped)) return true;
  }
  for (const layer of page.layers) {
    if (removedIds.has(layer.id)) continue;
    if (layer.kind === 'replacement' && layer.original && layer.maskOriginal !== false && layer.text === '') {
      // Empty native editors can retain a tall box, but only their source mask
      // still occupies the document. Added blank cells remain protected below.
      const mask = mapSourceTextRect(layer.original, page.rowEdits ?? [], sourceStyle(layer)?.baseline);
      if (mask && intersects(mask)) return true;
    } else if (intersects(layer)) return true;
  }
  return false;
}

/** Remove only explicitly cleared physical continuation lines, never the base row. */
export function compactEmptyRowLines(page: PdfProjectPage, anchor: PdfLayer, runs: DetectedText[], barriers: Rect[] = []): { page: PdfProjectPage; anchor: PdfLayer; removedLines: number } {
  const unchanged = { page, anchor, removedLines: 0 };
  if (anchor.tableRow || anchor.maskOriginal === false) return unchanged;
  const geometry = rowGeometry(page, anchor, runs, barriers);
  if (!geometry.template.length) return unchanged;
  const tolerance = Math.max(1, anchor.fontSize * .25), bands: Cell[][] = [];
  for (const cell of [...geometry.cells].sort((a, b) => a.baseline - b.baseline)) {
    const last = bands.at(-1);
    if (last && Math.abs(last[0].baseline - cell.baseline) < tolerance) last.push(cell);
    else bands.push([cell]);
  }
  if (bands.length < 2) return unchanged;
  const baseRun = geometry.template.find(cell => matchesRun(anchor, cell.run, page))?.run ?? geometry.template[0].run;
  let next = page, removedLines = 0;
  for (let index = bands.length - 1; index > 0; index--) {
    const cells = bands[index], previous = bands[index - 1];
    if (!cells.every(cell => {
      const layer = replacementForRun(next, cell.run);
      return layer?.text === '' && verifiedSource(layer, cell.run);
    })) continue;
    const matches = next.layers.filter(layer => cells.some(cell => matchesRun(layer, cell.run, next)));
    // Earlier duplicate overlays can still paint ink, so they also must be clear.
    if (matches.some(layer => layer.text !== '' || layer.tableRow || !cells.some(cell => verifiedSource(layer, cell.run)))) continue;
    const pitch = cells[0].baseline - previous[0].baseline;
    const previousBottom = Math.max(...previous.map(cell => cell.rect.y + cell.rect.height));
    const top = Math.min(...cells.map(cell => cell.rect.y));
    if (!Number.isFinite(pitch + previousBottom + top) || pitch <= 0 || previousBottom >= top - .01) continue;
    const band = { y: (previousBottom + top) / 2, height: pitch };
    const removedIds = new Set(matches.map(layer => layer.id));
    if (bandIsProtected(next, band, removedIds, runs, barriers)) continue;
    const cleared = { ...next, layers: next.layers.filter(layer => !removedIds.has(layer.id)) };
    try {
      next = applyFlowEdit(cleared, { id: crypto.randomUUID(), kind: 'delete', ...band });
      removedLines++;
    } catch {
      // A partial or ambiguous object boundary must preserve the prior page.
    }
  }
  if (!removedLines) return unchanged;
  const existing = replacementForRun(next, baseRun);
  const base = createReplacementLayer(baseRun, existing?.id ?? anchor.id);
  const mapped = mapSourceTextRect(baseRun, next.rowEdits ?? [], sourceEditingStyle(base).baseline);
  return { page: next, anchor: existing && !existing.deleted && existing.text !== '' ? existing : mapped ? { ...base, x: mapped.x, y: mapped.y } : anchor, removedLines };
}
