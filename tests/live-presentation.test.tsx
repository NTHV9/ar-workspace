import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Portfolio } from '../src/Portfolio';
import { AccountDetail } from '../src/AccountDetail';
import type { Account, Invoice } from '../src/domain/portfolio';
const account: Account = {hotel:'KAT',id:'synthetic',name:'Synthetic test',type:'Agent',open:100,over90:0,items:1};
it('does not invent live aging when the source has no buckets',()=>{
  const html=renderToStaticMarkup(<Portfolio accounts={[account]} hotel="All" review={false} params={new URLSearchParams()} update={()=>{}} openAccount={()=>{}}/>);
  expect(html).not.toContain('width:43%');
  expect(html).toContain('Aging unavailable');
});
it('distinguishes unavailable due data from confirmed not billed',()=>{
  const invoice: Invoice={id:'test',hotel:'KAT',accountId:'synthetic',guest:'Example',invoiceNo:'test',folioNo:'test',date:'2026-09-08',due:null,original:100,open:100,aging:'Unknown',stage:'Not available'};
  const html=renderToStaticMarkup(<AccountDetail account={account} invoices={[invoice]} review={false} back={()=>{}}/>);
  expect(html).not.toContain('Not billed');
  expect(html).toContain('Not available');
});
