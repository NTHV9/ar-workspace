import {expect,it} from 'vitest';

it('rejects cross-hotel assets before rendering',async()=>{await expect(renderStatement({hotel:'KAT',rows:[{}]} as never,{hotel:'TSK',version:'rtf-20260909-v3'} as never)).rejects.toThrow('document_statement_layout_invalid');});
it('rejects missing or excessive row input instead of truncating',async()=>{for(const rows of [[],Array(501).fill({})])await expect(renderStatement({hotel:'KAT',rows} as never,{hotel:'KAT',version:'rtf-20260909-v3'} as never)).rejects.toThrow('document_statement_layout_invalid');});
import {PDFDocument,PDFRawStream,PDFContentStream,decodePDFRawStream} from 'pdf-lib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {renderStatement,type StatementAssets} from '../worker/statement/render';
import type {StatementModel} from '../worker/statement/model';
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
async function fixture(){const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(pixel),c=>c.charCodeAt(0)));const asset={width:612,height:1,png:pixel,sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};const assets:StatementAssets={hotel:'KAT',version:'rtf-20260909-v3',header:asset,closing:asset,footer:asset};const model:StatementModel={hotel:'KAT',accountId:'SYNTHETIC',accountNo:'SYN-001',address:['Synthetic Café GmbH','Straße 12'],printDate:'11/09/26',rows:[{id:'SYN-I',date:'09/09/26',folio:'F-1',guest:'Synthetic Müller — Groß',arrival:'01/09/26',departure:'09/09/26',voucher:'Réf-001',debit:10000,credit:0,balance:10000}],total:10000,aging:['Up to 30','31 - 60','61 - 90','91 - 120','121 - 150','151 and Over'].map((label,i)=>({label,cents:i?0:10000}))};return {assets,model};}
it('renders supported Latin accents and mixed Thai without treating every non-ASCII character as Thai',async()=>{const {assets,model}=await fixture();for(const [key,address,guest]of [['latin',['Synthetic Café GmbH','Straße 12'],'Synthetic Müller — Groß'],['thai',['บริษัท Example Café'],'ผู้ทดสอบ René'],['source',['Synthetic source text'],'Example Ã¤']] as const){const bytes=await renderStatement({...model,address:[...address],rows:[{...model.rows[0],guest}]},assets);expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);mkdirSync('.tmp/statement-unicode',{recursive:true});writeFileSync('.tmp/statement-unicode/'+key+'.pdf',bytes);}});
it('does not silently discard an unsupported character',async()=>{const {assets,model}=await fixture();await expect(renderStatement({...model,rows:[{...model.rows[0],guest:'Synthetic \u{1f600}'}]},assets)).rejects.toThrow('document_statement_character_unsupported');});
it('keeps the restored footer at its native height on every page of a new template',async()=>{
 const {assets,model}=await fixture();assets.version='rtf-20260921-v4';assets.footer={...assets.footer,height:81};
 const bytes=await renderStatement({...model,rows:Array.from({length:45},(_,i)=>({...model.rows[0],id:'SYN-'+i}))},assets),pdf=await PDFDocument.load(bytes);
 expect(pdf.getPageCount()).toBeGreaterThan(1);
 for(const page of pdf.getPages()){
  const contents=page.node.normalizedEntries().Contents;if(!contents)throw Error('Missing PDF content');
  const streams=contents.asArray().map(ref=>pdf.context.lookup(ref));
  const commands=streams.map(s=>new TextDecoder().decode(s instanceof PDFRawStream?decodePDFRawStream(s).decode():s instanceof PDFContentStream?s.getUnencodedContents():new Uint8Array())).join('\n');
  expect(commands).toContain('612 0 0 81 0 0 cm');expect(commands).not.toContain('612 0 0 77 0 0 cm');
 }
});
it('reserves footer space before paginating rows and the closing block',async()=>{
 const {assets,model}=await fixture(),many={...model,rows:Array.from({length:25},(_,i)=>({...model.rows[0],id:'SYN-'+i}))};
 const regular=await PDFDocument.load(await renderStatement(many,assets));
 assets.version='rtf-20260921-v4';assets.footer={...assets.footer,height:200};
 const larger=await PDFDocument.load(await renderStatement(many,assets));expect(larger.getPageCount()).toBeGreaterThan(regular.getPageCount());
});
