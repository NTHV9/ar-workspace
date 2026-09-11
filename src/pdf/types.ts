import type { SourceTextReference } from './source-text';
export type PdfSourceDocument = { id: string; name: string; kind: 'statement' | 'invoice'; invoiceId?: string; bytes: Uint8Array };
export type PdfExportFile = { name: string; bytes: Uint8Array };
export type ContentMode = 'statement' | 'invoices' | 'both';
export type DeliveryLayout = 'combined' | 'split' | 'separate';
export type PdfLayer = {
  id: string; kind: 'text' | 'replacement' | 'note' | 'stamp' | 'shape' | 'image' | 'whiteout';
  x: number; y: number; width: number; height: number; text: string; color: string;
  fill: string; font: string; fontSize: number; bold: boolean; italic: boolean;
  tableRow?:string; maskOriginal?: boolean; sourceText?: SourceTextReference; image?: string; original?: { text: string; x: number; y: number; width: number; height: number };
};
export type PdfRowEdit = { id: string; kind: 'insert' | 'delete'; y: number; height: number } | { id: string; kind: 'move'; x: number; y: number; width: number; height: number; dx: number; dy: number };
export type PdfProjectPage = { id: string; sourceId: string; sourcePage: number | null; width: number; height: number; layers: PdfLayer[]; rowEdits?: PdfRowEdit[] };
export type PdfProject = { version: 1; content: ContentMode; delivery: DeliveryLayout; pages: PdfProjectPage[] };
export type DetectedText = { text: string; x: number; y: number; width: number; height: number; fontSize: number; rotated: boolean; color?: string; bold?: boolean; italic?: boolean; fontLabel?: string; maskOriginal?: boolean; sourceText?: SourceTextReference; unsupported?: boolean };
