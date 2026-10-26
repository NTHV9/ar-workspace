import { pageCanvasHeight } from './flow';
import { linkedVoucher, type VoucherBindings } from './linked-vouchers';
import { mapSourceTextRect } from './row-layout';
import { deleteTextLayer, replacementForRun } from './source-edits';
import { createReplacementLayer } from './source-text';
import type { DetectedText, PdfLayer, PdfProjectPage } from './types';

export type AreaRect = { x: number; y: number; width: number; height: number };
export type AreaPoint = { x: number; y: number };
export type AreaTextTarget =
  | { kind: 'source'; key: string; rect: AreaRect; run: DetectedText }
  | { kind: 'layer'; key: string; rect: AreaRect; layerId: string };

const tolerance = .01;
const validRect = (rect: AreaRect) => [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const geometry = ({ x, y, width, height }: AreaRect): AreaRect => ({ x, y, width, height });
const contains = (area: AreaRect, rect: AreaRect) => rect.x >= area.x - tolerance && rect.y >= area.y - tolerance && rect.x + rect.width <= area.x + area.width + tolerance && rect.y + rect.height <= area.y + area.height + tolerance;
const textLayer = (layer: PdfLayer) => ['text', 'replacement', 'note', 'stamp'].includes(layer.kind) && !layer.deleted && !!layer.text.trim();

export function rectFromPoints(start: AreaPoint, end: AreaPoint, bounds: { width: number; height: number }): AreaRect | null {
  if (![start.x, start.y, end.x, end.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null;
  const x = Math.max(0, Math.min(bounds.width, Math.min(start.x, end.x)));
  const y = Math.max(0, Math.min(bounds.height, Math.min(start.y, end.y)));
  const right = Math.max(0, Math.min(bounds.width, Math.max(start.x, end.x)));
  const bottom = Math.max(0, Math.min(bounds.height, Math.max(start.y, end.y)));
  const rect = { x, y, width: right - x, height: bottom - y };
  return validRect(rect) ? rect : null;
}

/** Both the selection and its linked-field notice resolve the same visible boxes. */
function displayedCandidates(page: PdfProjectPage, runs: DetectedText[]): { target: AreaTextTarget; candidate: PdfLayer }[] {
  const bounds = { x: 0, y: 0, width: page.width, height: pageCanvasHeight(page) };
  const visible = (rect: AreaRect) => validRect(rect) && contains(bounds, rect);
  const candidates: { target: AreaTextTarget; candidate: PdfLayer }[] = [];
  const keys = new Set<string>();
  for (const [index, run] of runs.entries()) {
    if (run.rotated || !run.text.trim() || !validRect(run) || replacementForRun(page, run)) continue;
    const mapped = mapSourceTextRect(run, page.rowEdits ?? [], run.fontSize * .72);
    if (!mapped || !visible(mapped)) continue;
    const ref = run.sourceText;
    const key = `source:${JSON.stringify(ref ? [ref.scope, ref.sourceId, ref.sourcePage, ref.runIndex] : [index])}`;
    if (keys.has(key)) continue;
    keys.add(key);
    candidates.push({ target: { kind: 'source', key, rect: geometry(mapped), run }, candidate: createReplacementLayer(run, key) });
  }
  for (const layer of page.layers) {
    if (!textLayer(layer) || !visible(layer)) continue;
    // An older replacement is hidden by the last mask owning that source.
    if (layer.kind === 'replacement' && layer.original && layer.maskOriginal !== false) {
      const originalRun: DetectedText = { ...layer.original, fontSize: layer.fontSize, rotated: false, sourceText: layer.sourceText };
      if (replacementForRun(page, originalRun)?.id !== layer.id) continue;
    }
    const key = `layer:${layer.id}`;
    if (keys.has(key)) continue;
    keys.add(key);
    candidates.push({ target: { kind: 'layer', key, rect: geometry(layer), layerId: layer.id }, candidate: layer });
  }
  return candidates;
}

export function displayedAreaTextTargets(page: PdfProjectPage, runs: DetectedText[], bindings: VoucherBindings): AreaTextTarget[] {
  return displayedCandidates(page, runs).filter(({ candidate }) => !linkedVoucher(page, candidate, bindings)).map(({ target }) => target);
}

export function excludedAreaVoucherRects(page: PdfProjectPage, runs: DetectedText[], bindings: VoucherBindings): AreaRect[] {
  return displayedCandidates(page, runs).filter(({ candidate }) => !!linkedVoucher(page, candidate, bindings)).map(({ target }) => target.rect);
}

export function containedAreaTextTargets(targets: AreaTextTarget[], area: AreaRect): AreaTextTarget[] {
  return validRect(area) ? targets.filter(target => validRect(target.rect) && contains(area, target.rect)) : [];
}

export function deleteAreaTextTargets(page: PdfProjectPage, targets: AreaTextTarget[], newId: () => string): PdfProjectPage {
  let next = page;
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.key) || !validRect(target.rect)) continue;
    seen.add(target.key);
    let layer: PdfLayer | undefined;
    if (target.kind === 'layer') layer = next.layers.find(candidate => candidate.id === target.layerId);
    else {
      const run = target.run;
      if (run.rotated || !run.text.trim() || !validRect(run)) continue;
      layer = replacementForRun(next, run);
      if (!layer) {
        const mapped = mapSourceTextRect(run, next.rowEdits ?? [], run.fontSize * .72);
        if (!mapped || !validRect(mapped) || !contains({ x: 0, y: 0, width: next.width, height: pageCanvasHeight(next) }, mapped)) continue;
        layer = createReplacementLayer(run, newId());
        next = { ...next, layers: [...next.layers, layer] };
      }
    }
    if (layer && textLayer(layer)) next = deleteTextLayer(next, layer);
  }
  return next;
}
