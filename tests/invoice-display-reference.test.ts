import {it,expect} from 'vitest';
import {invoiceDisplayReference} from '../worker/invoice/display-reference';

it('preserves a blank AR reference instead of substituting an operational remark',()=>{
 expect(invoiceDisplayReference('','')).toBe('');
});
it('uses the canonical AR reference for rows without a check or routed narrative',()=>{
 expect(invoiceDisplayReference('','  Adjustment approved  ')).toBe('Adjustment approved');
 expect(invoiceDisplayReference('','Source only')).toBe('Source only');
});
it('preserves existing check and routed narrative rules',()=>{
 expect(invoiceDisplayReference('123','other reference')).toBe('123');
 expect(invoiceDisplayReference('123','prefix Routed From Room #45')).toBe('Routed From Room #45\n123');
 expect(invoiceDisplayReference('123','Routed From Room #45 123')).toBe('Routed From Room #45 123');
 expect(invoiceDisplayReference('123456789','Routed From Room #45123456789')).toBe('Routed From Room #45123456789');
 expect(invoiceDisplayReference('123','Routed From Room #45123')).toBe('Routed From Room #45123\n123');
 expect(invoiceDisplayReference('','prefix routed from Room #45')).toBe('routed from Room #45');
});

it('preserves a full AR reference with an exact printed-check prefix and narrative suffix',()=>{
 expect(invoiceDisplayReference('123456','  123456  Split into two charges.  ')).toBe('123456  Split into two charges.');
 expect(invoiceDisplayReference('654321','654321\tTransferred by cashier note')).toBe('654321\tTransferred by cashier note');
});
it('requires a whitespace boundary and real suffix rather than a partial check collision',()=>{
 expect(invoiceDisplayReference('123','1234 Split into two charges')).toBe('123');expect(invoiceDisplayReference('ABC','ABCD suffix')).toBe('ABC');expect(invoiceDisplayReference('ABC','ABC: suffix')).toBe('ABC');expect(invoiceDisplayReference('ABC','ABC')).toBe('ABC');expect(invoiceDisplayReference('123','Other 123 Split')).toBe('123');expect(invoiceDisplayReference('123','123   ')).toBe('123');expect(invoiceDisplayReference('123','')).toBe('123');expect(invoiceDisplayReference('','123 Split')).toBe('123 Split');
});
it('retains the established routed-narrative precedence when a reference also starts with its check',()=>{
 expect(invoiceDisplayReference('123','123 prefix Routed From Room #45')).toBe('Routed From Room #45\n123');
});

it('retains an explicit multiword-check reference prefix when the exact check is its bounded suffix',()=>{
 expect(invoiceDisplayReference('202 01.01.26','  201 01.01.26 202 01.01.26  ')).toBe('201 01.01.26 202 01.01.26');
 expect(invoiceDisplayReference('202 01.01.26','prefix X202 01.01.26')).toBe('202 01.01.26');
 expect(invoiceDisplayReference('202 01.01.26','prefix 202 01.01.26X')).toBe('202 01.01.26');
 expect(invoiceDisplayReference('123','[NA Pkg. Trx] 123')).toBe('123');
});
it('projects the explicit literal room/check reference without decoding the opaque source check',()=>{
 expect(invoiceDisplayReference('OPAQUE-KEY','Room# 101 : CHECK# 55 [48] 1,000.00 Split into 200.00 and 800.00.')).toBe('Room# 101 : CHECK# 55 1,000.00 Split into 200.00 and 800.00.');
 expect(invoiceDisplayReference('OTHER-OPAQUE','Room# 101 : CHECK# 55 [48] Source #101=>Target #102 [789]')).toBe('Room# 101 : CHECK# 55 Source #101=>Target #102 [789]');
});
it('does not accept a malformed or embedded room/check narrative as a standalone projection',()=>{
 expect(invoiceDisplayReference('OPAQUE','prefix Room# 101 : CHECK# 55 [48] note')).toBe('OPAQUE');
 expect(invoiceDisplayReference('OPAQUE','Room# 101 : CHECK# 55 [unknown] note')).toBe('OPAQUE');
 expect(invoiceDisplayReference('OPAQUE','Room# 101 : CHECK# 55 note')).toBe('OPAQUE');
 expect(invoiceDisplayReference('OPAQUE','Room# 101 : CHECK# 55 [48] Routed From Room #201')).toBe('Routed From Room #201\nOPAQUE');
});

it('preserves an exact source check and full suffix after only the literal NA package marker',()=>{
 expect(invoiceDisplayReference('123456','[NA Pkg. Trx] 123456 1,000.00 Split into 400.00 and 600.00.')).toBe('123456 1,000.00 Split into 400.00 and 600.00.');
 expect(invoiceDisplayReference('ABC','  [NA Pkg. Trx]  ABC  Source #101=>Target #102 [789]  ')).toBe('ABC  Source #101=>Target #102 [789]');
});
it('keeps bare NA wrapper, no-check and unrelated-check forms unchanged',()=>{
 expect(invoiceDisplayReference('123','[NA Pkg. Trx] 123')).toBe('123');expect(invoiceDisplayReference('','[NA Pkg. Trx] 123 suffix')).toBe('[NA Pkg. Trx] 123 suffix');expect(invoiceDisplayReference('OTHER','[NA Pkg. Trx] 123 suffix')).toBe('OTHER');expect(invoiceDisplayReference('123','[NA Pkg. Trx] Other 123 suffix')).toBe('123');
});
it('requires the exact marker and whitespace check boundaries before suppressing NA text',()=>{
 for(const ref of ['[NA Pkg. Trx] 1234 suffix','[NA Pkg. Trx] 123: suffix','[NA Pkg.Trx] 123 suffix','[na pkg. trx] 123 suffix','[NA Pkg. Trx]123 suffix','prefix [NA Pkg. Trx] 123 suffix'])expect(invoiceDisplayReference('123',ref)).toBe('123');
});
it('keeps Routed From precedence for an NA marker and check-prefix suffix',()=>{
 expect(invoiceDisplayReference('123','[NA Pkg. Trx] 123 note Routed From Room #45')).toBe('Routed From Room #45\n123');
});

it('preserves the complete explicit reference when check and reference differ only by whitespace',()=>{
 expect(invoiceDisplayReference('123..','123 ..')).toBe('123 ..');expect(invoiceDisplayReference('ABCD','AB\tCD')).toBe('AB\tCD');expect(invoiceDisplayReference('AB CD','ABCD')).toBe('ABCD');
});
it('does not repair non-whitespace reference differences or invent a blank reference',()=>{
 expect(invoiceDisplayReference('123..','123 ...')).toBe('123..');expect(invoiceDisplayReference('ABC','unrelated reference')).toBe('ABC');expect(invoiceDisplayReference('123..','')).toBe('123..');expect(invoiceDisplayReference('','123 ..')).toBe('123 ..');expect(invoiceDisplayReference('ABC','ABC')).toBe('ABC');
});
it('keeps routed precedence even when complete strings are whitespace-equivalent',()=>{
 expect(invoiceDisplayReference('RoutedFromRoom#45','Routed From Room #45')).toBe('Routed From Room #45\nRoutedFromRoom#45');
});

it('preserves a real source prefix before an exact singleword check suffix',()=>{
 expect(invoiceDisplayReference('123.','1234. 123.')).toBe('1234. 123.');expect(invoiceDisplayReference('CHECK-9','MARK*2 Batch-77 CHECK-9')).toBe('MARK*2 Batch-77 CHECK-9');
});
it('does not extend a singleword suffix across collisions, punctuation or unknown bracket protocols',()=>{
 for(const ref of ['prefix XABC','prefix ABC:','prefix ABC suffix','[OTHER] ABC','[NA Pkg. Trx] ABC','[unknown protocol]   ABC'])expect(invoiceDisplayReference('ABC',ref)).toBe('ABC');expect(invoiceDisplayReference('','prefix ABC')).toBe('prefix ABC');expect(invoiceDisplayReference('ABC','')).toBe('ABC');
});
it('keeps routed precedence over a newly supported singleword check suffix',()=>{
 expect(invoiceDisplayReference('ABC','Before Routed From Room #42 ABC')).toBe('Routed From Room #42 ABC');
});

it('projects the exact room protocol marker to its literal suffix rather than substituting a check',()=>{
 expect(invoiceDisplayReference('123456789','[NA P.Room] ')).toBe('');
 expect(invoiceDisplayReference('123456789','[NA Room]')).toBe('');
 expect(invoiceDisplayReference('123456789','  [NA P.Room]  18/08/26  ')).toBe('18/08/26');
 expect(invoiceDisplayReference('','[NA Room] source note')).toBe('source note');
});
it('does not treat other bracket protocols or partial room markers as a room reference',()=>{
 for(const ref of ['[na room]','[NA P.RoomX]','[NA Room]attached','prefix [NA Room]','[NA Pkgs.HBD50]','[NA Pkgs.HBL50]'])expect(invoiceDisplayReference('123',ref)).toBe('123');
 expect(invoiceDisplayReference('123','[NA Pkg. Trx] 123')).toBe('123');
 expect(invoiceDisplayReference('123','[NA Room] Routed From Room #45')).toBe('Routed From Room #45\n123');
});
it('does not append a supplied nine-digit check already literally joined to a room before routing continuation',()=>{
 expect(invoiceDisplayReference('123456789','[NA Pkg. Trx] Routed From Guest Of Room #45123456789 Source #45=>Target #46')).toBe('Routed From Guest Of Room #45123456789 Source #45=>Target #46');
});
it('does not find a routed check through partial digits, punctuation, missing room identity or unrelated text',()=>{
 for(const ref of ['Routed From Guest Of Room #451234567890 continuation','Routed From Guest Of Room #45123456789: continuation','Routed From Guest Of Room #123456789 continuation','Routed From Guest 123456789 continuation','Routed From Guest Bedroom #45123456789 continuation'])expect(invoiceDisplayReference('123456789',ref)).toBe(ref+'\n123456789');
 expect(invoiceDisplayReference('123','Routed From Room #45123 continuation')).toBe('Routed From Room #45123 continuation\n123');
});
it('suppresses only the complete observed automatic Add markers without replacing a check or stripping narrative',()=>{
 expect(invoiceDisplayReference('','[Add: 10%.(B)]')).toBe('');
 expect(invoiceDisplayReference('','  [Add: 7%.(S1)]  ')).toBe('');
 for(const ref of ['[Add: 10%.(B)] suffix','[Add: 8%.(S1)]','[add: 10%.(B)]','prefix [Add: 10%.(B)]'])expect(invoiceDisplayReference('',ref)).toBe(ref);
 expect(invoiceDisplayReference('123','[Add: 10%.(B)]')).toBe('123');
});
