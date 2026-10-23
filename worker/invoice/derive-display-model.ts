import {revalidatePosDisplaySuppressionCatalog,type PosDisplaySuppressionCatalog} from './zero-pos-display-proof';
import type {InvoiceModel,InvoiceLine,InvoiceDisplayLine} from './types';
import type {VerifiedPosDisplayGroup} from './pos-display-proof';
import {revalidatePaymentOffsetDisplayCatalog,type PaymentOffsetDisplayCatalog,type PaymentOffsetDisplayAtom} from './payment-offset-display-proof';
import {amountCents} from '../opera/normalize';
import type {CurrentArTaxSource} from './current-ar-tax';
const fail=():never=>{throw Error('document_invoice_display_invalid');};
const id=(value:unknown)=>typeof value==='string'&&/^[1-9][0-9]{0,15}$/.test(value)?value:fail();
const cents=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):fail();
const number=(value:bigint)=>{const result=Number(value);return Number.isSafeInteger(result)&&BigInt(result)===value?result:fail();};
const text=(value:unknown)=>typeof value==='string'&&value.length<=2000&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)?value:fail();
const date=(value:unknown)=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return fail();return value;};
const printedDate=(value:string)=>value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(2,4);
const order=(a:InvoiceDisplayLine,b:InvoiceDisplayLine)=>a.sourceDate.localeCompare(b.sourceDate)||(BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
const columns=(lines:InvoiceLine[])=>({debit:lines.reduce((n,line)=>n+cents(line.debit),0n),credit:lines.reduce((n,line)=>n+cents(line.credit),0n)});
const row=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const optionalMoney=(v:unknown)=>v===undefined?0:amountCents(v,'THB');
function financialSourceColumns(selected:Record<string,unknown>,source:CurrentArTaxSource){
 const debit=optionalMoney(selected.debitAmount),credit=optionalMoney(selected.creditAmount),roots=source.taxRows.map(row).filter(e=>String(row(e.posting).transactionNo)===String(selected.transactionNo));
 if(!roots.some(e=>row(e.posting).transactionType==='Payment'))return {debit,credit};
 // Validate the existing invoiceModel selected-Payment projection. AR may
 // encode a deposit as negative debit; its scoped ledger supplies the printed
 // columns. This is a binding of already qualified output, not a money rule.
 if(roots.length!==1)return fail();const entry=roots[0],p=row(entry.posting),m=source.manifest,paidDebit=optionalMoney(p.debitAmount),paidCredit=optionalMoney(p.creditAmount),signed=paidDebit-paidCredit;
 if(entry.postingBreakdown!==undefined||p.hotelId!==m.hotel||String(p.folioNo)!==m.folio_no||String(row(row(p.guestInfo).reservationId).id)!==m.reservation_id||p.transactionCode!==selected.transactionCode||date(p.transactionDate)!==date(selected.transactionDate)||!signed||paidDebit&&paidCredit||debit&&credit||signed!==debit-credit||Math.abs(amountCents(p.postedAmount,'THB'))!==Math.abs(signed))return fail();
 return {debit:paidDebit,credit:paidCredit};
}
function sources(model:InvoiceModel){
 if(!Array.isArray(model.lines)||!model.lines.length||model.lines.length>=4000)return fail();const byId=new Map<string,InvoiceLine>();for(const line of model.lines){const key=id(line.id);if(byId.has(key))return fail();byId.set(key,line);cents(line.debit);cents(line.credit);}
 // Gross can exclude payment amounts already qualified by the financial model.
 // This display adapter conserves columns and preserves footer totals verbatim.
 cents(model.gross);const sums=columns(model.lines);if(sums.debit!==cents(model.debit)||sums.credit!==cents(model.credit))return fail();return byId;
}
function auxiliary(model:InvoiceModel,original:Map<string,InvoiceLine>){
 const atoms=new Map<string,PaymentOffsetDisplayAtom>(),dates=new Map<string,string>();if(model.paymentOffsetDisplaySource===undefined)return {catalog:undefined,atoms,dates};
 const catalog=revalidatePaymentOffsetDisplayCatalog(model.paymentOffsetDisplaySource),source=catalog.proof.sourceBefore,m=source.manifest;
 if(m.hotel!==model.hotel||m.account_id!==model.accountId||m.id!==model.invoiceId||m.folio_no!==model.folio)return fail();
 const selected=(source.postings as {invoicePostingsDetails:unknown[]}).invoicePostingsDetails;if(!Array.isArray(selected)||selected.length!==original.size)return fail();const seen=new Set<string>();
 for(const raw of selected){const selectedRow=row(raw),key=id(String(selectedRow.transactionNo)),line=original.get(key)??fail(),amount=financialSourceColumns(selectedRow,source);if(seen.has(key))return fail();seen.add(key);dates.set(key,date(selectedRow.transactionDate));if(printedDate(date(selectedRow.transactionDate))!==line.date||BigInt(amount.debit)!==cents(line.debit)||BigInt(amount.credit)!==cents(line.credit))return fail();}
 for(const atom of catalog.atoms){const key=id(atom.id);if(original.has(key)||atoms.has(key))return fail();atoms.set(key,atom);}
 const sums=columns(catalog.atoms);if(sums.debit!==0n||sums.credit!==0n)return fail();return {catalog,atoms,dates};
}
function suppression(model:InvoiceModel,original:Map<string,InvoiceLine>){
 const ids=new Set<string>(),dates=new Map<string,string>();if(model.posDisplaySuppressionSource===undefined)return {catalog:undefined,ids,dates,groups:[]};
 const {catalog,financialModel}=revalidatePosDisplaySuppressionCatalog(model.posDisplaySuppressionSource),m=catalog.packet.manifest;
 if(m.hotel!==model.hotel||m.account_id!==model.accountId||m.id!==model.invoiceId||m.folio_no!==model.folio||financialModel.lines.length!==original.size)return fail();
 for(const field of ['debit','credit','gross','taxableNet','nonTaxable','vat','outstanding'] as const)if(financialModel[field]!==model[field])return fail();
 const selected=row(catalog.packet.postings).invoicePostingsDetails;if(!Array.isArray(selected)||selected.length!==original.size)return fail();
 for(const raw of selected){const source=row(raw),key=id(String(source.transactionNo));if(dates.has(key)||!original.has(key))return fail();dates.set(key,date(source.transactionDate));}
 for(const source of financialModel.lines){const line=original.get(source.id)??fail();if(line.date!==source.date||line.debit!==source.debit||line.credit!==source.credit||printedDate(dates.get(source.id)??fail())!==line.date)return fail();}
 for(const group of catalog.suppressed){const own:InvoiceLine[]=[];if(!group.sourceIds.includes(group.representativeId))return fail();for(const key of group.sourceIds){const source=original.get(key)??fail();if(ids.has(key)||dates.get(key)!==group.date)return fail();ids.add(key);own.push(source);}const sums=columns(own);if(sums.debit!==0n||sums.credit!==0n)return fail();}
 return {catalog,ids,dates,groups:catalog.suppressed};
}
/** Renderer boundary: never trust an optional display array merely because it
 * exists. Every original financial ID and each monetary column must survive. */
export function validatedInvoiceDisplayLines(model:InvoiceModel):InvoiceLine[]{
 if(model.displayLines===undefined){if(model.paymentOffsetDisplaySource!==undefined||model.posDisplaySuppressionSource!==undefined)return fail();return model.lines;}
 const original=sources(model),aux=auxiliary(model,original),suppressed=suppression(model,original),covered=new Set<string>(suppressed.ids),coverageSize=original.size+aux.atoms.size;if(!Array.isArray(model.displayLines)||!model.displayLines.length||model.displayLines.length>coverageSize)return fail();
 for(const [index,line]of model.displayLines.entries()){
  const representative=id(line.id);if(!Array.isArray(line.sourceIds)||!line.sourceIds.length||line.sourceIds.length>original.size||!['source','pos-group','payment-offset'].includes(line.kind))return fail();const own:InvoiceLine[]=[];
  if(line.kind==='payment-offset'){
   const source=aux.atoms.get(representative)??fail();if(line.sourceIds.length!==1||line.sourceIds[0]!==representative||covered.has(representative)||date(line.sourceDate)!==source.date||line.date!==printedDate(source.date)||line.description!==source.description||line.reference!==source.reference||line.debit!==source.debit||line.credit!==source.credit)return fail();covered.add(representative);
   if(index&&order(model.displayLines[index-1],line)>=0)return fail();continue;
  }
  for(const raw of line.sourceIds){const key=id(raw),source=original.get(key)??fail();if(covered.has(key))return fail();covered.add(key);own.push(source);}
  if(!line.sourceIds.includes(representative))return fail();const sourceDate=date(line.sourceDate);if(printedDate(sourceDate)!==line.date||own.some(source=>source.date!==line.date||aux.dates.has(source.id)&&aux.dates.get(source.id)!==sourceDate||suppressed.dates.has(source.id)&&suppressed.dates.get(source.id)!==sourceDate))return fail();text(line.description);text(line.reference);
  const sums=columns(own);if(sums.debit!==cents(line.debit)||sums.credit!==cents(line.credit))return fail();
  if(line.kind==='source'&&(own.length!==1||own[0].id!==representative||own[0].description!==line.description||own[0].reference!==line.reference))return fail();
  if(index&&order(model.displayLines[index-1],line)>=0)return fail();
 }
 if(covered.size!==coverageSize)return fail();const sums=columns(model.displayLines);if(sums.debit!==cents(model.debit)||sums.credit!==cents(model.credit))return fail();return model.displayLines;
}
/** Build display-only rows after the existing financial and metadata proofs.
 * Literal debit/credit column sums are independent: never net, abs or clamp. */
export function deriveInvoiceDisplayModel(model:InvoiceModel,groups:VerifiedPosDisplayGroup[],sourceDates:ReadonlyMap<string,string>,catalog?:PaymentOffsetDisplayCatalog,suppressionCatalog?:PosDisplaySuppressionCatalog):InvoiceModel{
 const original=sources(model),base={...model,...catalog?{paymentOffsetDisplaySource:catalog}:{},...suppressionCatalog?{posDisplaySuppressionSource:suppressionCatalog}:{}},aux=auxiliary(base,original),suppressed=suppression(base,original),claimed=new Set<string>(suppressed.ids),displayLines:InvoiceDisplayLine[]=[];if(!Array.isArray(groups)||groups.length>original.size)return fail();
 for(const group of groups){
  if(group.sourceIds.some(key=>suppressed.ids.has(key))){const match=suppressed.groups.find(item=>item.representativeId===group.representativeId&&item.date===group.date&&item.sourceIds.length===group.sourceIds.length&&item.sourceIds.every((key,index)=>key===group.sourceIds[index]));if(!match)return fail();continue;}
  const representative=id(group.representativeId),sourceDate=date(group.date);if(!Array.isArray(group.sourceIds)||!group.sourceIds.length||!group.sourceIds.includes(representative))return fail();const own:InvoiceLine[]=[];
  for(const raw of group.sourceIds){const key=id(raw),source=original.get(key)??fail();if(claimed.has(key)||date(sourceDates.get(key))!==sourceDate||source.date!==printedDate(sourceDate)||aux.dates.has(key)&&aux.dates.get(key)!==sourceDate||suppressed.dates.has(key)&&suppressed.dates.get(key)!==sourceDate)return fail();claimed.add(key);own.push(source);}
  const sums=columns(own);displayLines.push({id:representative,sourceIds:[...group.sourceIds],sourceDate,kind:'pos-group',date:printedDate(sourceDate),description:text(group.description),reference:text(group.reference),debit:number(sums.debit),credit:number(sums.credit)});
 }
 for(const [key,line]of original)if(!claimed.has(key)){const sourceDate=date(sourceDates.get(key));if(printedDate(sourceDate)!==line.date||aux.dates.has(key)&&aux.dates.get(key)!==sourceDate||suppressed.dates.has(key)&&suppressed.dates.get(key)!==sourceDate)return fail();displayLines.push({...line,sourceIds:[key],sourceDate,kind:'source'});}
 for(const atom of aux.atoms.values())displayLines.push({...atom,sourceIds:[atom.id],sourceDate:atom.date,kind:'payment-offset',date:printedDate(atom.date)});
 displayLines.sort(order);const derived={...model,...aux.catalog?{paymentOffsetDisplaySource:aux.catalog}:{},...suppressed.catalog?{posDisplaySuppressionSource:suppressed.catalog}:{},displayLines};validatedInvoiceDisplayLines(derived);return derived;
}
