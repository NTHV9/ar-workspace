import {strToU8,strFromU8,unzipSync,zipSync} from 'fflate';
import {fixture} from './tracker-workbook';
import type {TransferWrite} from '../../worker/tracker-sync/transfer-model';
export function transferWorkbook(){
 const entries=unzipSync(fixture());const name='xl/worksheets/sheet1.xml';let xml=strFromU8(entries[name]);
 xml=xml.replace('<row r="2">','<row r="2"><c r="B2" t="inlineStr"><is><t>Agent</t></is></c>');
 xml=xml.replace('<row r="3">','<row r="3"><c r="B3" t="inlineStr"><is><t>OLD AGENCY</t></is></c><c r="G3" t="d"><v>2026-11-01</v></c>');
 xml=xml.replace('KT|SYNTHETIC GUEST|INV:00017|FOL:003','KT|OLD AGENCY|I:17|1');
 entries[name]=strToU8(xml);return zipSync(entries);
}
export const transferInput:TransferWrite={version:'test',rowKey:'KT|OLD AGENCY|I:17|1',expectedIdentity:{hotel:'KAT',accountNo:'00009',invoiceNo:'00017',folio:'003',transactionDate:'2026-11-01'},expectedAgent:'OLD AGENCY',agent:'NEW & AGENCY',accountNo:'00012',newRowKey:'KT|NEW & AGENCY|I:17|1'};
