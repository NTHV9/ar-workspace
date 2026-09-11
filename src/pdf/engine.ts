import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import type { DetectedText, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument, PdfExportFile } from './types';
import { deliveryGroups, wrapText } from './model';
import { applySourceRowEdits, mapSourceRect } from './row-layout';
import { extractSourceText } from './source-extraction';
import { drawSourceText, releaseSourceStyles } from './source-text';
GlobalWorkerOptions.workerSrc = workerUrl;
const documentScopes = new WeakMap<Map<string, PDFDocumentProxy>, string>();

export async function loadSources(sources: PdfSourceDocument[]): Promise<{ documents: Map<string, PDFDocumentProxy>; project: PdfProject; dispose: () => void }> {
  const documents = new Map<string, PDFDocumentProxy>();
  const scope = crypto.randomUUID(); documentScopes.set(documents, scope);
  const tasks: { destroy: () => Promise<void> }[] = [];
  const pages: PdfProjectPage[] = [];
  try {
    for (const source of sources) {
      if (documents.has(source.id)) throw new Error('Duplicate document identity. Reopen this job.');
      const task = getDocument({ data: source.bytes.slice(), fontExtraProperties: true }); tasks.push(task); const doc = await task.promise;
      documents.set(source.id, doc);
      for (let n = 1; n <= doc.numPages; n++) {
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        pages.push({ id: `${source.id}:${n}`, sourceId: source.id, sourcePage: n, width: viewport.width, height: viewport.height, layers: [] });
      }
    }
    return { documents, dispose: () => { releaseSourceStyles(scope); for (const task of tasks) void task.destroy(); }, project: { version: 1, pages, content: sources.some(s => s.kind === 'statement') ? (sources.some(s => s.kind === 'invoice') ? 'both' : 'statement') : 'invoices', delivery: 'combined' } };
  } catch (error) { for (const task of tasks) void task.destroy(); throw error; }
}

export async function detectText(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>): Promise<DetectedText[]> {
  if (!page.sourcePage) return [];
  const pdfPage = await documents.get(page.sourceId)!.getPage(page.sourcePage);
  return extractSourceText(page, pdfPage, documentScopes.get(documents) ?? 'unregistered');
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: PdfLayer, page: PdfProjectPage) {
  ctx.save();
  const mask = layer.original && layer.maskOriginal !== false ? mapSourceRect(layer.original, page.rowEdits ?? []) : null;
  if (mask) { const o = mask; ctx.fillStyle = layer.fill; ctx.fillRect(o.x - 1, o.y - 1, o.width + 2, o.height + 2); }
  const { x, y, width, height } = layer;
  if (['shape', 'whiteout', 'note', 'stamp'].includes(layer.kind)) {
    ctx.fillStyle = layer.fill; ctx.fillRect(x, y, width, height);
    if (layer.kind === 'shape' || layer.kind === 'stamp') { ctx.strokeStyle = layer.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2); }
  }
  if (layer.kind === 'image' && layer.image) {
    const img = new Image(); img.src = layer.image; await img.decode(); ctx.drawImage(img, x, y, width, height);
  } else if (!['shape', 'whiteout'].includes(layer.kind)) {
    if (drawSourceText(ctx, layer)) { ctx.restore(); return; }
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.font = `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${layer.fontSize}px ${layer.font}`;
    ctx.fillStyle = layer.color; ctx.textBaseline = 'top';
    wrapText(layer.text, Math.max(width - 6, 1), text => ctx.measureText(text).width).forEach((line, n) => ctx.fillText(line, x + 3, y + 2 + n * layer.fontSize * 1.25));
  }
  ctx.restore();
}

export async function renderPage(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>, canvas: HTMLCanvasElement, scale = 1.5) {
  const maxPixels = 20_000_000;
  scale = Math.min(scale, Math.sqrt(maxPixels / (page.width * page.height)));
  canvas.width = Math.ceil(page.width * scale); canvas.height = Math.ceil(page.height * scale);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (page.sourcePage) {
    const source = await documents.get(page.sourceId)!.getPage(page.sourcePage);
    await source.render({ canvas, canvasContext: ctx, viewport: source.getViewport({ scale }), background: '#ffffff' }).promise;
  }
  applySourceRowEdits(canvas, page.rowEdits ?? [], scale);
  if (page.layers.some(layer => layer.sourceText)) {
    const runs = await detectText(page, documents);
    for (const layer of page.layers) if (layer.sourceText) {
      const run = runs.find(r => r.sourceText?.runIndex === layer.sourceText?.runIndex);
      if (layer.sourceText.sourceId !== page.sourceId || layer.sourceText.sourcePage !== page.sourcePage || !run || !layer.original || run.text !== layer.original.text || Math.abs(run.x-layer.original.x)>.01 || Math.abs(run.y-layer.original.y)>.01) throw new Error('Source text no longer matches this document. Reopen the original.');
      layer.sourceText = { ...run.sourceText! };
    }
  }
  ctx.save(); ctx.scale(scale, scale);
  for (const layer of page.layers) await drawLayer(ctx, layer, page);
  ctx.restore();
}

export async function exportProject(project: PdfProject, sources: PdfSourceDocument[], documents: Map<string, PDFDocumentProxy>): Promise<PdfExportFile[]> {
  const groups = deliveryGroups(project, sources);
  if (!groups.length) throw new Error('No pages selected for export.');
  const native = new Map<string, PDFDocument>();
  const files: PdfExportFile[] = [];
  for (const [index, group] of groups.entries()) {
    const output = await PDFDocument.create();
    for (const page of group.pages) {
      if (page.layers.length || page.rowEdits?.length || page.sourcePage === null) {
        // Only a new opaque bitmap is copied into edited pages. No source streams,
        // hidden OCR/text, annotations or attachments are retained on those pages.
        const canvas = document.createElement('canvas');
        await renderPage(page, documents, canvas, 300/72);
        const png = await output.embedPng(canvas.toDataURL('image/png'));
        output.addPage([page.width, page.height]).drawImage(png, { x: 0, y: 0, width: page.width, height: page.height });
        canvas.width = canvas.height = 0;
      } else {
        if (!native.has(page.sourceId)) native.set(page.sourceId, await PDFDocument.load(sources.find(s => s.id === page.sourceId)!.bytes));
        const [copy] = await output.copyPages(native.get(page.sourceId)!, [page.sourcePage - 1]); output.addPage(copy);
      }
    }
    files.push({ name: `${String(index + 1).padStart(2, '0')}-${group.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100)}.pdf`, bytes: await output.save() });
  }
  return files;
}
