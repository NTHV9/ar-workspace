import {expect,it} from 'vitest';
import {assertCachedSources} from '../src/batch/source-snapshot';
import type {DocumentFile} from '../worker/documents/jobs';
const bytes=new Uint8Array([1,2,3]);
const first:DocumentFile={id:'a',kind:'invoice',invoice_id:'1',ordinal:1,state:'ready',storage_key:'private/a',byte_count:3,sha256:null,error_code:null};
const source={id:'a',kind:'invoice' as const,invoiceId:'1',bytes,name:'Inv. 1.pdf'};
it('rejects a cached subset when another source finishes at the same document revision',async()=>{
 await expect(assertCachedSources([first],[source])).resolves.toBeUndefined();
 await expect(assertCachedSources([first,{...first,id:'b',ordinal:2}],[source])).rejects.toThrow('source PDFs changed');
 await expect(assertCachedSources([{...first,state:'uncertain'}],[source])).rejects.toThrow();
});
it('checks current source identity and byte evidence before exporting cached edits',async()=>{
 await expect(assertCachedSources([first],[{...source,invoiceId:'different'}])).rejects.toThrow();
 await expect(assertCachedSources([{...first,byte_count:4}],[source])).rejects.toThrow();
 await expect(assertCachedSources([{...first,sha256:'0'.repeat(64)}],[source])).rejects.toThrow();
});
