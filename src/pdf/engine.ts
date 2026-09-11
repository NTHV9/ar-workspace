import { getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import type { DetectedText, PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument, PdfExportFile } from './types';
import { deliveryGroups, wrapText } from './model';
GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadSources(sources: PdfSourceDocument[]): Promise<{ documents: Map<string, PDFDocumentProxy>; project: PdfProject; dispose: () => void }> {
  const documents = new Map<string, PDFDocumentProxy>();
  const tasks: { destroy: () => Promise<void> }[] = [];
  const pages: PdfProjectPage[] = [];
  try {
    for (const source of sources) {
      if (documents.has(source.id)) throw new Error('Duplicate document identity. Reopen this job.');
      const task = getDocument({ data: source.bytes.slice() }); tasks.push(task); const doc = await task.promise;
      documents.set(source.id, doc);
      for (let n = 1; n <= doc.numPages; n++) {
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        pages.push({ id: `${source.id}:${n}`, sourceId: source.id, sourcePage: n, width: viewport.width, height: viewport.height, layers: [] });
      }
    }
    return { documents, dispose: () => { for (const task of tasks) void task.destroy(); }, project: { version: 1, pages, content: sources.some(s => s.kind === 'statement') ? (sources.some(s => s.kind === 'invoice') ? 'both' : 'statement') : 'invoices', delivery: 'combined' } };
  } catch (error) { for (const task of tasks) void task.destroy(); throw error; }
}

export async function detectText(page: PdfProjectPage, documents: Map<string, PDFDocumentProxy>): Promise<DetectedText[]> {
  if (!page.sourcePage) return [];
  const pdfPage = await documents.get(page.sourceId)!.getPage(page.sourcePage);
  const viewport = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  return content.items.flatMap(item => {
    if (!('str' in item) || !item.str.trim()) return [];
    const tx = Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(tx[2], tx[3]);
    const style = content.styles[item.fontName];
    return [{ text: item.str, x: tx[4], y: tx[5] - height * (style?.ascent ?? 0.85), width: Math.max(item.width, 2), height: height * 1.15, fontSize: height, rotated: Math.abs(tx[1]) > 0.1 || Math.abs(tx[2]) > 0.1 }];
  });
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: PdfLayer) {
  ctx.save();
  if (layer.original) { const o = layer.original; ctx.fillStyle = layer.fill; ctx.fillRect(o.x - 1, o.y - 1, o.width + 2, o.height + 2); }
  const { x, y, width, height } = layer;
  if (['shape', 'whiteout', 'note', 'stamp'].includes(layer.kind)) {
    ctx.fillStyle = layer.fill; ctx.fillRect(x, y, width, height);
    if (layer.kind === 'shape' || layer.kind === 'stamp') { ctx.strokeStyle = layer.color; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, width - 2, height - 2); }
  }
  if (layer.kind === 'image' && layer.image) {
    const img = new Image(); img.src = layer.image; await img.decode(); ctx.drawImage(img, x, y, width, height);
  } else if (!['shape', 'whiteout'].includes(layer.kind)) {
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
  ctx.save(); ctx.scale(scale, scale);
  for (const layer of page.layers) await drawLayer(ctx, layer);
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
      if (page.layers.length || page.sourcePage === null) {
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
