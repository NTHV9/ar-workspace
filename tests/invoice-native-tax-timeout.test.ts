import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({destroy:vi.fn(()=>new Promise<void>(()=>{}))}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({getDocument:()=>({promise:new Promise(()=>{}),destroy:mocks.destroy})}));
import {readNativeTaxControls} from '../worker/invoice/native-tax-controls';
afterEach(()=>vi.useRealTimers());
it('rejects within a bounded deadline even if parser setup and cancellation both stall',async()=>{vi.useFakeTimers();let state='pending';void readNativeTaxControls(new TextEncoder().encode('%PDF-synthetic'),'88').then(()=>{state='resolved';},()=>{state='rejected';});await vi.advanceTimersByTimeAsync(15250);expect(state).toBe('rejected');expect(mocks.destroy).toHaveBeenCalledOnce();});
