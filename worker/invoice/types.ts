export const INVOICE_TEMPLATE_VERSION='invoice-rtf-20260921-v1';
export interface InvoiceLine {id:string;date:string;description:string;reference:string;debit:number;credit:number}
export interface InvoiceModel {
 hotel:string;accountId:string;invoiceId:string;folio:string;voucher:string;address:string[];
 company:string;guest:string;taxId:string;room:string;arrival:string;departure:string;adults:string;children:string;confirmation:string;cashierNo:string;cashierName:string;printDate:string;printTime:string;
 lines:InvoiceLine[];debit:number;credit:number;gross:number;taxableNet:number;nonTaxable:number;vat:number;outstanding:number;
}
export interface InvoiceImage {width:number;height:number;png:string;sha256:string}
export interface InvoicePosition {x0:number;x1:number;top:number;bottom:number;size:number;fontname:string}
export interface InvoiceAssets {hotel:string;version:string;header:InvoiceImage;closing:InvoiceImage;signature:InvoiceImage;footer:InvoiceImage;bankText?:{x:number;top:number;text:string}[];layout:{positions:Record<string,InvoicePosition[]>;rowTop:number;closingTop:number;signatureTop:number;pageTop:number}}
