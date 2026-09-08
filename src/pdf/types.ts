export type PdfSourceDocument = { id: string; name: string; kind: 'statement' | 'invoice'; invoiceId?: string; bytes: Uint8Array };
export type PdfExportFile = { name: string; bytes: Uint8Array };
export type ContentMode = 'statement' | 'invoices' | 'both';
export type DeliveryLayout = 'combined' | 'split' | 'separate';
export type PdfLayer = {
  id: string; kind: 'text' | 'replacement' | 'note' | 'stamp' | 'shape' | 'image' | 'whiteout';
  x: number; y: number; width: number; height: number; text: string; color: string;
  fill: string; font: string; fontSize: number; bold: boolean; italic: boolean;
  image?: string; original?: { text: string; x: number; y: number; width: number; height: number };
};
export type PdfProjectPage = { id: string; sourceId: string; sourcePage: number | null; width: number; height: number; layers: PdfLayer[] };
export type PdfProject = { version: 1; content: ContentMode; delivery: DeliveryLayout; pages: PdfProjectPage[] };
export type DetectedText = { text: string; x: number; y: number; width: number; height: number; fontSize: number; rotated: boolean };
