import type { PdfLayer, PdfProject, PdfProjectPage, PdfSourceDocument } from './types';

/** Reject untrusted persisted edit data before it can reach the canvas or image loader. */
export function restoreProject(input: unknown, original: PdfProject): PdfProject {
  const fail = (): never => { throw new Error('Saved PDF edits are invalid or do not match these source documents. Reopen the originals without saved edits.'); };
  if (!input || typeof input !== 'object') return fail();
  const saved = input as Record<string, unknown>;
  if (saved.version !== 1 || !['statement', 'invoices', 'both'].includes(String(saved.content)) || !['combined', 'split', 'separate'].includes(String(saved.delivery)) || !Array.isArray(saved.pages) || saved.pages.length > 1000) return fail();
  const sourceIds = new Set(original.pages.map(p => p.sourceId));
  const ids = new Set<string>();
  const number = (v: unknown, min = -14400, max = 14400): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail();
  const string = (v: unknown, max = 100000): string => typeof v === 'string' && v.length <= max ? v : fail();
  const color = (v: unknown): string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fail();
  const pages = saved.pages.map((raw): PdfProjectPage => {
    if (!raw || typeof raw !== 'object') return fail();
    const p = raw as Record<string, unknown>;
    const id = string(p.id, 200), sourceId = string(p.sourceId, 200);
    if (!id || ids.has(id) || !sourceIds.has(sourceId)) return fail(); ids.add(id);
    const width = number(p.width, 1), height = number(p.height, 1);
    const sourcePage = p.sourcePage === null ? null : number(p.sourcePage, 1, 10000);
    if (sourcePage !== null) {
      const actual = original.pages.find(page => page.sourceId === sourceId && page.sourcePage === sourcePage);
      if (!Number.isInteger(sourcePage) || !actual || Math.abs(actual.width - width) > .01 || Math.abs(actual.height - height) > .01) return fail();
    }
    if (!Array.isArray(p.layers) || p.layers.length > 500) return fail();
    const layerIds = new Set<string>();
    const layers = p.layers.map((rawLayer): PdfLayer => {
      if (!rawLayer || typeof rawLayer !== 'object') return fail();
      const l = rawLayer as Record<string, unknown>;
      const layerId = string(l.id, 200);
      if (!layerId || layerIds.has(layerId)) return fail(); layerIds.add(layerId);
      if (!['text', 'replacement', 'note', 'stamp', 'shape', 'image', 'whiteout'].includes(String(l.kind)) || !['Arial', 'Georgia', 'Courier New', 'Tahoma', 'Plus Jakarta Sans'].includes(String(l.font)) || typeof l.bold !== 'boolean' || typeof l.italic !== 'boolean') return fail();
      let image: string | undefined;
      if (l.image !== undefined) {
        image = string(l.image, 14_000_000);
        if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return fail();
      }
      if (l.kind === 'image' && !image) return fail();
      let source: PdfLayer['original'];
      if (l.original !== undefined) {
        if (!l.original || typeof l.original !== 'object' || l.kind !== 'replacement') return fail();
        const o = l.original as Record<string, unknown>;
        source = { text: string(o.text), x: number(o.x), y: number(o.y), width: number(o.width, 0), height: number(o.height, 0) };
      }
      if (l.kind === 'replacement' && !source) return fail();
      return { id: layerId, kind: l.kind as PdfLayer['kind'], x: number(l.x), y: number(l.y), width: number(l.width, .1), height: number(l.height, .1), text: string(l.text), color: color(l.color), fill: color(l.fill), font: l.font as string, fontSize: number(l.fontSize, 6, 144), bold: l.bold, italic: l.italic, ...(image ? { image } : {}), ...(source ? { original: source } : {}) };
    });
    return { id, sourceId, sourcePage, width, height, layers };
  });
  return { version: 1, content: saved.content as PdfProject['content'], delivery: saved.delivery as PdfProject['delivery'], pages };
}

export function deliveryGroups(project: PdfProject, sources: PdfSourceDocument[]): { name: string; pages: PdfProjectPage[] }[] {
  const statements = sources.filter(s => s.kind === 'statement');
  const invoices = sources.filter(s => s.kind === 'invoice');
  const groups = (documents: PdfSourceDocument[]) => documents.map(source => ({ name: source.name.replace(/\.pdf$/i, ''), pages: project.pages.filter(p => p.sourceId === source.id) })).filter(g => g.pages.length);
  const statementPages = groups(statements).flatMap(g => g.pages);
  // Multiple source documents for one invoice must still be delivered together.
  const invoiceGroups: ReturnType<typeof groups> = [];
  for (const source of invoices) {
    const key = source.invoiceId || source.id;
    const index = invoices.findIndex(s => (s.invoiceId || s.id) === key);
    if (invoices[index].id !== source.id) continue;
    const ids = new Set(invoices.filter(s => (s.invoiceId || s.id) === key).map(s => s.id));
    const pages = project.pages.filter(p => ids.has(p.sourceId));
    if (pages.length) invoiceGroups.push({ name: source.name.replace(/\.pdf$/i, ''), pages });
  }
  const statement = project.content === 'invoices' ? [] : statementPages;
  const invoice = project.content === 'statement' ? [] : invoiceGroups;
  if (project.delivery === 'combined' || project.content === 'statement') return [{ name: 'Documents', pages: [...statement, ...invoice.flatMap(g => g.pages)] }].filter(g => g.pages.length);
  return [...(statement.length ? [{ name: 'Statement', pages: statement }] : []), ...(project.delivery === 'split' ? (invoice.length ? [{ name: 'Invoices', pages: invoice.flatMap(g => g.pages) }] : []) : invoice)];
}

export function movePage(project: PdfProject, id: string, direction: -1 | 1): PdfProject {
  const page = project.pages.find(p => p.id === id);
  if (!page) return project;
  const siblings = project.pages.filter(p => p.sourceId === page.sourceId);
  const sibling = siblings[siblings.indexOf(page) + direction];
  if (!sibling) return project;
  const pages = [...project.pages];
  const from = pages.indexOf(page), to = pages.indexOf(sibling);
  [pages[from], pages[to]] = [pages[to], pages[from]];
  return { ...project, pages };
}

export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && measure(line + char) > maxWidth) { result.push(line); line = ''; }
      line += char;
    }
    result.push(line);
  }
  return result;
}
