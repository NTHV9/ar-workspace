import {expect,it} from 'vitest';
import {renderStatement} from '../worker/statement/render';
it('rejects cross-hotel assets before rendering',async()=>{await expect(renderStatement({hotel:'KAT',rows:[{}]} as never,{hotel:'TSK',version:'rtf-20260909-v3'} as never)).rejects.toThrow('document_statement_layout_invalid');});
it('rejects missing or excessive row input instead of truncating',async()=>{for(const rows of [[],Array(501).fill({})])await expect(renderStatement({hotel:'KAT',rows} as never,{hotel:'KAT',version:'rtf-20260909-v3'} as never)).rejects.toThrow('document_statement_layout_invalid');});
