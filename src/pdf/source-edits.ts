import { mapSourceTextRect } from './row-layout';
import { sourceStyle } from './source-text';
import type { DetectedText, PdfLayer, PdfProjectPage } from './types';

/** Only an explicit, empty native replacement can act as a deletion mask. */
export function validateDeletedLayer(layer: PdfLayer): void {
  if (layer.deleted !== undefined && (layer.deleted !== true || layer.kind !== 'replacement' || !layer.original || layer.maskOriginal === false || layer.text !== '')) {
    throw new Error('Invalid source text deletion. Restore the original text and try again.');
  }
}

/** Added cells may share source styling, but never own that source's pixels. */
export function replacementForRun(page: PdfProjectPage, run: DetectedText): PdfLayer | undefined {
  for (let index = page.layers.length - 1; index >= 0; index--) {
    const layer = page.layers[index], original = layer.original;
    if (layer.kind !== 'replacement' || !original || layer.maskOriginal === false) continue;
    const source = layer.sourceText, target = run.sourceText;
    const sameSource = source && target && source.sourceId === target.sourceId && source.sourcePage === target.sourcePage && source.runIndex === target.runIndex;
    const sameOriginal = original.text === run.text && Math.abs(original.x - run.x) < .01 && Math.abs(original.y - run.y) < .01;
    if (sameSource || sameOriginal) return layer;
  }
  return undefined;
}

export function sourceRunDeleted(page: PdfProjectPage, run: DetectedText): boolean {
  const layer = replacementForRun(page, run);
  return layer?.deleted === true && layer.text === '';
}

export function deleteTextLayer(page: PdfProjectPage, layer: PdfLayer): PdfProjectPage {
  if (layer.kind !== 'replacement' || !layer.original || layer.maskOriginal === false) {
    return { ...page, layers: page.layers.filter(candidate => candidate.id !== layer.id) };
  }
  const mask = mapSourceTextRect(layer.original, page.rowEdits ?? [], sourceStyle(layer)?.baseline);
  if (!mask) return { ...page, layers: page.layers.filter(candidate => candidate.id !== layer.id) };
  const deleted: PdfLayer = { ...layer, x: mask.x, y: mask.y, width: mask.width, height: mask.height, text: '', deleted: true };
  delete deleted.textFlow;
  return { ...page, layers: page.layers.map(candidate => candidate.id === layer.id ? deleted : candidate) };
}
