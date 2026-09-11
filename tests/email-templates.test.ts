import {describe,it,expect} from 'vitest';
import {parseTemplate,applyTemplate,starterTemplates} from '../src/email/templates';
import {plainMessage} from '../src/email/rich-message';
describe('versioned email templates',()=>{
 const input={name:'Billing example',purpose:'billing',stage:null,subject:'Documents — {{account_name}} — {{hotel}}',richBody:plainMessage('Please review {{invoice_count}} attached invoices for {{account_name}}.'),archived:false};
 it('applies known tokens to an independent editable copy without interpreting customer markup',()=>{
  const t=parseTemplate(input);const before=JSON.stringify(t);const out=applyTemplate(t,{accountName:'A <script> & B',hotel:'TSK',invoiceCount:3});
  expect(out.subject).toBe('Documents — A <script> & B — TSK');expect(out.body).toContain('3 attached invoices for A <script> & B.');expect(JSON.stringify(t)).toBe(before);
 });
 it('rejects unknown tokens, unsafe headers, stage/purpose mismatch and hidden fields',()=>{
  for(const p of [{subject:'{{secret}}'},{subject:'x\r\nBcc: x@example.test'},{stage:'Final'},{purpose:'collection',stage:null},{extra:'value'},{name:''}])expect(()=>parseTemplate({...input,...p})).toThrow();
 });
 it('provides six editable starting points with full Follow-up labels and no recipients',()=>{
  expect(starterTemplates).toHaveLength(6);expect(starterTemplates.map(t=>t.name)).toContain('Follow-up 3');
  for(const t of starterTemplates){expect(()=>parseTemplate(t)).not.toThrow();expect(t).not.toHaveProperty('recipients');}
 });
 it('rejects expansion that would inject a header or exceed the subject budget',()=>{
  const t=parseTemplate(input);expect(()=>applyTemplate(t,{accountName:'A\nBcc: x@example.test',hotel:'KAT',invoiceCount:1})).toThrow();
  expect(()=>applyTemplate(t,{accountName:'A'.repeat(999),hotel:'KAT',invoiceCount:1})).toThrow();
 });
});
