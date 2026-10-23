import {isHotelId,type HotelId} from '../../src/domain/hotels';
import {dataFailureReason,dataResponseEnvelopes} from './data-response';

export type OperaErrorCode = 'invalid_configuration'|'invalid_request'|'redirect_rejected'|'provider_unavailable'|'provider_unauthorized'|'provider_rejected'|'response_too_large'|'invalid_response'|'timeout'|'duplicate_member'|'pagination_incomplete'|'pagination_changed';
export class OperaError extends Error {
  constructor(readonly code: OperaErrorCode,readonly upstreamStatus?:number,readonly stage?:string,readonly providerMessage?:string,readonly diagnostics?:Record<string,number|boolean|string>) { super(stage?`${code}:${stage}`:code); this.name='OperaError'; }
}
export interface OperaReadConfig { origin:string; appKey:string; hotelId:string; timeoutMs?:number; maxResponseBytes?:number }
export type FetchPort = (request:Request)=>Promise<Response>;
export interface FinancialReadScope {hotel:HotelId;accountId:string}
export interface FinancialHistoryRead extends FinancialReadScope {start:string;end:string;kinds:readonly ('invoice'|'payment')[]}

export interface TransactionCodeListMetadata {hotelId:string;code:string;compTransaction?:boolean;classification?:{type?:string;transactionType?:{code?:string;taxCode?:number};group?:{code?:string};subgroup?:{code?:string}};trxSetup?:{revenue?:boolean;nonTaxable?:boolean;taxInclusive?:boolean;manualPosting?:boolean;useForPaidout?:boolean;depositPostingOnly?:boolean;generatesType?:string}}
type PosMetadata=Record<string,unknown>;
const posObject=(raw:unknown):PosMetadata=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new OperaError('invalid_response');return raw as PosMetadata;};
/** Strict projections prevent an over-broad provider response from persisting
 * communication/credential sections through these diagnostic capabilities. */
function posFields(raw:unknown,fields:Record<string,'string'|'number'|'boolean'>):PosMetadata{
 const source=posObject(raw),result:PosMetadata={};for(const [key,type]of Object.entries(fields)){const value=source[key];if(value===undefined)continue;if(typeof value!==type||type==='number'&&!Number.isSafeInteger(value))throw new OperaError('invalid_response');result[key]=value;}return result;
}
function posRows(raw:unknown,project:(raw:unknown)=>PosMetadata):PosMetadata[]{if(!Array.isArray(raw)||raw.length>4000)throw new OperaError('invalid_response');return raw.map(project);}
function posTransactionProjection(raw:unknown){
 const response=posObject(raw),details=response.details===undefined?{}:posObject(response.details);if(details.transactionsInfo===undefined)return {details:{}};
 const source=posObject(details.transactionsInfo),info=posFields(source,{allChargesCode:'string',miniBarCode:'string',cashCreditCardPosting:'string',subtotalPosting:'string',differencePosting:'string',calcTrxCodePosting:'string',numberOfDialedDigits:'string'});
 if(source.itemizers!==undefined)info.itemizers=posRows(source.itemizers,v=>posFields(v,{splitCode:'string',splitPost:'number',splitText:'string',splitFactor:'number'}));
 if(source.postingAccounts!==undefined)info.postingAccounts=posRows(source.postingAccounts,v=>posFields(v,{id:'number',paymentMethod:'string',account:'string',accountDescription:'string',salesOutlet:'string',transactionCode:'string',description:'string',autoBalance:'boolean'}));
 if(source.transactionCodes!==undefined)info.transactionCodes=posRows(source.transactionCodes,v=>{const row=posObject(v),result=posFields(row,{servingPeriod:'string',rowNum:'number',revenueCenter:'string',terminal:'string',paymentNum:'string',userId:'string',postRoute:'string',dialedDigits:'string',lineType:'string',code:'string',tipCode:'string',description:'string'});if(row.itemizersShortInfo!==undefined)result.itemizersShortInfo=posRows(row.itemizersShortInfo,v=>posFields(v,{code:'string',itemizerName:'string',itemNumber:'number'}));return result;});
 return {details:{transactionsInfo:info}};
}
const posKnownSectionNames=['primaryInfo','additionalInfo','generalInfo','translationInfo','classOfServiceInfo','importRoomsInfo','workstationSetupInfo','postingsInfo','customDataInfo','exportDataInfo'] as const;
interface PosMetadataShape {type:string;fields?:Record<string,PosMetadataShape>;length?:number;item?:PosMetadataShape;omittedKeys?:number;knownSectionsPresent?:(typeof posKnownSectionNames)[number][];truncated?:boolean}
/** Diagnostic structure only: never emit scalar values, traverse credential or
 * unrelated configuration sections, or expand a full provider configuration. */
function posTransactionShape(raw:unknown):PosMetadataShape{
 let remaining=128;
 const excluded=/communication|credential|password|secret|token|authorization|connection|clientId|apiKey|privateKey|^(primaryInfo|additionalInfo|generalInfo|translationInfo|classOfServiceInfo|importRoomsInfo|workstationSetupInfo|postingsInfo|customDataInfo|exportDataInfo)$/i;
 const visit=(value:unknown,depth:number):PosMetadataShape=>{
  const type=value===null?'null':Array.isArray(value)?'array':typeof value;if(remaining--<=0||depth>=5)return {type,truncated:true};
  if(Array.isArray(value))return {type,length:value.length,...value.length?{item:visit(value[0],depth+1)}:{}};
  if(type!=='object')return {type};
  const record=value as PosMetadata,keys=Object.keys(record),fields:Record<string,PosMetadataShape>={},knownSectionsPresent=posKnownSectionNames.filter(key=>Object.hasOwn(record,key));let omittedKeys=0,count=0,truncated=false;
  for(const key of keys){if(excluded.test(key)||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key)){omittedKeys++;continue;}if(count>=32||remaining<=0){truncated=true;break;}fields[key]=visit(record[key],depth+1);count++;}
  return {type,fields,...omittedKeys?{omittedKeys}:{},...knownSectionsPresent.length?{knownSectionsPresent}:{},...truncated?{truncated:true}:{}};
 };
 return visit(raw,0);
}

/** Property reads plus explicit Statement document processing. No caller-supplied URL or accounting mutations. */
export class OperaReader {
  private readonly origin:string;
  private readonly timeoutMs:number;
  private readonly maxResponseBytes:number;
  private readonly observedPosLogos=new Set<string>();
  constructor(private readonly config:OperaReadConfig, private readonly getToken:()=>Promise<string>,private readonly transport:FetchPort=request=>fetch(request)) {
    let url:URL;
    try { url=new URL(config.origin); } catch { throw new OperaError('invalid_configuration'); }
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!config.appKey.trim()||!config.hotelId.trim())throw new OperaError('invalid_configuration');
    this.origin=url.origin;
    this.timeoutMs=config.timeoutMs??20000;this.maxResponseBytes=config.maxResponseBytes??8*1024*1024;
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||!Number.isSafeInteger(this.maxResponseBytes)||this.maxResponseBytes<=0)throw new OperaError('invalid_configuration');
  }
  private id(value:string) {
    if(!value||value.length>2000||value==='.'||value==='..')throw new OperaError('invalid_request');
    return encodeURIComponent(value);
  }
  private page(offset:number,limit:number) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1)throw new OperaError('invalid_request');
    return [['offset',String(offset)],['limit',String(limit)]];
  }
  accounts(offset=0,limit=20) {
    return this.read('/ars/v1/accounts',[['balance','All'],['hotelIds',this.config.hotelId],...this.page(offset,limit)]);
  }
  accountsByNumber(accountNo:string) {
    if(typeof accountNo!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(accountNo))throw new OperaError('invalid_request');
    return this.read('/ars/v1/accounts',[['accountNo',accountNo],['hotelIds',this.config.hotelId],['balance','All'],...this.page(0,20)]);
  }
  /** Fixed read-only diagnostic selector; never accepts arbitrary control names or URLs. */
  agingBasisSettings() {
    return this.read('/ent/config/v1/settings',[['hotelId',this.config.hotelId],['parameterNameWildCard','DATE_FOR_AGING']]);
  }
  profile(profileId:string) { return this.read(`/crm/v1/profiles/${this.id(profileId)}`,[['fetchInstructions','Profile'],['fetchInstructions','Address']]); }
  account(accountId:string,includeStatement=false) {
    return this.read(`/ars/v1/hotels/${this.id(this.config.hotelId)}/accounts/${this.id(accountId)}`,['Account','Summary','Invoices','Aging','Payments',...(includeStatement?['Statement']:[])].map(section=>['fetchInstructions',section]));
  }
  history(accountId:string,offset=0,limit=20) {
    return this.read(`/ars/v1/invoicePayments/accounts/${this.id(accountId)}`,[['inclZeroBalance','true'],['inclDetails','true'],['hotelIds',this.config.hotelId],['fetchInstructions','Invoices'],['fetchInstructions','Payments'],...this.page(offset,limit)]);
  }
  openHistory(accountId:string,offset=0,limit=20) {
    return this.read(`/ars/v1/invoicePayments/accounts/${this.id(accountId)}`,[['inclZeroBalance','false'],['inclDetails','true'],['hotelIds',this.config.hotelId],['fetchInstructions','Invoices'],['fetchInstructions','Payments'],...this.page(offset,limit)]);
  }
  invoiceHistory(accountId:string,invoiceNumbers:string[],offset=0,limit=20) {
    if(invoiceNumbers.some(n=>!/^\d+$/.test(n)))throw new OperaError('invalid_request');
    return this.read(`/ars/v1/invoicePayments/accounts/${this.id(accountId)}`,[['inclZeroBalance','true'],['inclDetails','true'],['hotelIds',this.config.hotelId],['fetchInstructions','Invoices'],...invoiceNumbers.map(n=>['invoiceNo',n]),...this.page(offset,limit)]);
  }
  private financialScope(scope:FinancialReadScope) {
    if(!isHotelId(scope.hotel)||scope.hotel!==this.config.hotelId||typeof scope.accountId!=='string'||!scope.accountId||scope.accountId.length>200||scope.accountId.trim()!==scope.accountId||scope.accountId==='.'||scope.accountId==='..'||/[\x00-\x1f\x7f/\\]/.test(scope.accountId))throw new OperaError('invalid_request',undefined,'financial_scope');
  }
  /** A separate dated read; the incumbent current-debt refresh does not call it. */
  financialHistoryPage(scope:FinancialHistoryRead,offset=0,limit=20) {
    this.financialScope(scope);
    const date=(v:string)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000-')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
    if(!date(scope.start)||!date(scope.end)||scope.start>scope.end||(Date.parse(scope.end)-Date.parse(scope.start))/86400000>=366||!Array.isArray(scope.kinds)||scope.kinds.length<1||scope.kinds.length>2||new Set(scope.kinds).size!==scope.kinds.length||scope.kinds.some(k=>!['invoice','payment'].includes(k))||![10,20].includes(limit))throw new OperaError('invalid_request',undefined,'financial_history_query');
    return this.read(`/ars/v1/invoicePayments/accounts/${this.id(scope.accountId)}`,[['hotelIds',scope.hotel],['start',scope.start],['end',scope.end],['inclZeroBalance','true'],['inclDetails','true'],['orderBy','TransactionDate'],['sortOrder','Asc'],...scope.kinds.map(kind=>['fetchInstructions',kind==='invoice'?'Invoices':'Payments']),...this.page(offset,limit)]);
  }
  financialTransactionDetail(scope:FinancialReadScope&{transactionId:string}) {
    this.financialScope(scope);
    if(typeof scope.transactionId!=='string'||!/^-?(0|[1-9][0-9]*)$/.test(scope.transactionId)||scope.transactionId==='-0'||scope.transactionId.length>80)throw new OperaError('invalid_request',undefined,'financial_transaction_identity');
    return this.read(`/ars/v1/hotels/${this.id(scope.hotel)}/accounts/${this.id(scope.accountId)}/transactions/${this.id(scope.transactionId)}/invoicePaymentDetails`,[]);
  }
  invoicePostings(scope:FinancialReadScope&{transactionId:string;invoiceNo:string;folioNo?:string;internalFolioWindowId?:string}) {
    this.financialScope(scope);
    if([scope.transactionId,scope.invoiceNo,...scope.folioNo===undefined?[]:[scope.folioNo],...scope.internalFolioWindowId===undefined?[]:[scope.internalFolioWindowId]].some(id=>typeof id!=='string'||!/^[1-9][0-9]{0,15}$/.test(id)))throw new OperaError('invalid_request',undefined,'invoice_posting_scope');
    return this.read('/ars/v1/invoicePostings',[['hotelId',scope.hotel],['accountId',scope.accountId],['accountIdContext','OPERA'],['accountType','AccountId'],['transactionNo',scope.transactionId],['invoiceNo',scope.invoiceNo],...scope.folioNo===undefined?[]:[['folioNo',scope.folioNo]],...scope.internalFolioWindowId===undefined?[]:[['internalFolioWindowID',scope.internalFolioWindowId]]]);
  }
  appliedInvoicePayments(scope:FinancialReadScope&{invoiceTransactionId:string;invoiceNo?:string}) {
    this.financialScope(scope);
    if(typeof scope.invoiceTransactionId!=='string'||!/^[1-9][0-9]*$/.test(scope.invoiceTransactionId)||scope.invoiceTransactionId.length>80||scope.invoiceNo!==undefined&&(typeof scope.invoiceNo!=='string'||!/^(0|[1-9][0-9]*)$/.test(scope.invoiceNo)||scope.invoiceNo.length>80))throw new OperaError('invalid_request',undefined,'financial_invoice_identity');
    return this.read(`/ars/v1/hotels/${this.id(scope.hotel)}/transactions/${this.id(scope.invoiceTransactionId)}/accounts/${this.id(scope.accountId)}/invoiceAppliedPayments`,scope.invoiceNo===undefined?[]:[['invoiceNo',scope.invoiceNo]]);
  }
  paymentAppliedInvoices(scope:FinancialReadScope&{paymentTransactionId:string}) {
    this.financialScope(scope);
    if(typeof scope.paymentTransactionId!=='string'||!/^[1-9][0-9]{0,79}$/.test(scope.paymentTransactionId))throw new OperaError('invalid_request',undefined,'financial_payment_identity');
    return this.read(`/ars/v1/hotels/${this.id(scope.hotel)}/transactions/${this.id(scope.paymentTransactionId)}/accounts/${this.id(scope.accountId)}/invoiceAppliedPayments`,[]);
  }
  statementSelection(accountId:string,transactionIds:string[],includeFolios=false) {
    if(typeof includeFolios!=='boolean'||!transactionIds.length||transactionIds.some(id=>!/^\d+$/.test(id)))throw new OperaError('invalid_request');
    return this.read('/ars/v1/statements',[['hotelId',this.config.hotelId],['accountID',accountId],...transactionIds.map(id=>['transactionNo',id]),['inclFolios',String(includeFolios)],['inclPrinted','true'],['inclZero','false']]);
  }
  folioHistory(reservationId:string,folioDate:string,offset=0,limit=20) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(folioDate))throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/folioHistory`,[['id',reservationId],['folioDate',folioDate],['folioEndDate',folioDate],['aR','true'],['checkOut','true'],...this.page(offset,limit)]);
  }
  folioReport(reservationId:string,folioWindowNo:number,folioDate:string,selector?:{billNumber:string;folioType:string}) {
    if(!Number.isSafeInteger(folioWindowNo)||folioWindowNo<1||!/^\d{4}-\d{2}-\d{2}$/.test(folioDate))throw new OperaError('invalid_request');
    if(selector&&(!/^[1-9][0-9]{0,15}$/.test(selector.billNumber)||!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(selector.folioType)))throw new OperaError('invalid_request');
    return this.read(`/med/config/v1/hotels/${this.id(this.config.hotelId)}/reservations/${this.id(reservationId)}/folioReports`,[['reservationIdContext','OPERA'],['reservationIdType','Reservation'],['folioWindowNo',String(folioWindowNo)],['folioDate',folioDate],['referenceCurrency','THB'],...selector?[['billNumber',selector.billNumber],['folioType',selector.folioType]]:[]]);
  }
  folioTypesConfig(){return this.read('/fof/config/v1/folioTypesConfig',[['hotelId',this.config.hotelId]]);}
  folioTypeName(group:'Guest'|'AccountsReceivables') {
    if(!['Guest','AccountsReceivables'].includes(group))throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/folioTypeNames`,[['folioReportGroup',group]]);
  }
  reservationFolios(reservationId:string,folioDate:string,includePayee=false) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(folioDate))throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/reservations/${this.id(reservationId)}/folios`,[['includeFolioHistory','true'],['fetchInstructions','Reservation'],['fetchInstructions','Foliohistory'],...(includePayee?[['fetchInstructions','Payee'],['fetchInstructions','Account']]:[]),['start',folioDate],['end',folioDate]]);
  }
  reservationInvoiceFolios(reservationId:string,window:number,offset=0,limit=200) {
    if(!Number.isSafeInteger(window)||window<1)throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/reservations/${this.id(reservationId)}/folios`,[['includeFolioHistory','true'],['folioWindowNo',String(window)],...['Reservation','Foliohistory','Postings','Transactioncodes','Payee','Account','Totalbalance'].map(x=>['fetchInstructions',x]),...this.page(offset,limit)]);
  }
  /** CSH 26.3 CheckNo grouping diagnostic. No caller-selected grouping/query,
   * monetary values, profile contacts or payee data escape this projection. */
  private posDisplayFoliosRead(reservationId:string,window:number,offset=0,limit=200){
    if(!isHotelId(this.config.hotelId)||typeof reservationId!=='string'||!/^[1-9][0-9]{0,15}$/.test(reservationId)||!Number.isSafeInteger(window)||window<1||!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/reservations/${this.id(reservationId)}/folios`,[['includeFolioHistory','true'],['folioWindowNo',String(window)],['groupType','CheckNo'],...['Reservation','Foliohistory','Postings','Transactioncodes'].map(value=>['fetchInstructions',value]),...this.page(offset,limit)]);
  }
  invoicePosDisplayFolios(reservationId:string,window:number,offset=0,limit=200){
    return this.posDisplayFoliosRead(reservationId,window,offset,limit).then(raw=>{
      const info=posObject(posObject(raw).reservationFolioInformation),reservation=posObject(info.reservationInfo);
      const identities=posRows(reservation.reservationIdList,row=>posFields(row,{id:'string',type:'string'})).filter(row=>row.type==='Reservation');
      if(reservation.hotelId!==this.config.hotelId||identities.length!==1||identities[0].id!==reservationId)throw new OperaError('invalid_response');
      const strings=(raw:unknown,fields:Record<string,number>):PosMetadata=>{
        const source=posObject(raw),result:PosMetadata={};for(const [key,max]of Object.entries(fields)){const value=source[key];if(value===undefined)continue;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new OperaError('invalid_response');result[key]=value;}return result;
      };
      const numbers=(raw:unknown,fields:string[]):PosMetadata=>{const result=posFields(raw,Object.fromEntries(fields.map(key=>[key,'number' as const])));if(Object.values(result).some(value=>Number(value)<0))throw new OperaError('invalid_response');return result;};
      const posting=(raw:unknown)=>{
        const source=posObject(raw),result={...strings(source,{transactionDate:10,transactionCode:200,transactionDescription:2000,reference:2000,checkNo:2000,arrangementCode:20,rateCode:20}),...numbers(source,['transactionNo'])};
        if(source.rateCode!==undefined&&/[\u0000-\u001f\u007f]/.test(String(source.rateCode)))throw new OperaError('invalid_response');
        if(source.groupTypeInfo!==undefined){
          const group=posObject(source.groupTypeInfo);
          // Actual CheckNo grouping echoes the exact opaque check key, including
          // observed 21-character keys beyond the schema's general 20 limit.
          // Extend only that equality-bound case to the documented checkNo cap.
          result.groupTypeInfo={...strings(group,{groupId:group.groupId===source.checkNo?2000:20,subGroupId:group.subGroupId===source.checkNo?2000:20,groupDescription:2000}),...numbers(group,['groupCount'])};
        }
        if(source.financialTransactionIdList!==undefined)result.financialTransactionIdList=posRows(source.financialTransactionIdList,row=>strings(row,{id:80,type:40,idContext:40}));
        if(source.originalReservationInformation!==undefined)result.originalReservationInformation=strings(source.originalReservationInformation,{originalRoomNumber:20,originalReservationId:80});
        if(source.cashierInfo!==undefined)result.cashierInfo=numbers(source.cashierInfo,['cashierId']);
        return result;
      };
      let omittedWindows=0;const windows:PosMetadata[]=[];
      for(const [section,key]of [['current','folioWindows'],['history','folioHistory']] as const){
        const source=info[key]===undefined?[]:posRows(info[key],row=>posObject(row));let matched=0;
        for(const rawWindow of source){
          if(!Number.isSafeInteger(rawWindow.folioWindowNo)||Number(rawWindow.folioWindowNo)<1)throw new OperaError('invalid_response');
          if(rawWindow.folioWindowNo!==window){omittedWindows++;continue;}if(++matched>1)throw new OperaError('invalid_response');
          const result:PosMetadata={section,...numbers(rawWindow,['folioWindowNo','offset','limit','totalPages','totalResults']),...posFields(rawWindow,{hasMore:'boolean',emptyWindow:'boolean'})};
          if(rawWindow.internalFolioWindowID!==undefined){const value=rawWindow.internalFolioWindowID;if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0||typeof value==='string'&&/^[0-9]{1,20}$/.test(value))result.internalFolioWindowID=value;else throw new OperaError('invalid_response');}
          result.folios=rawWindow.folios===undefined?[]:posRows(rawWindow.folios,rawFolio=>{const folio=posObject(rawFolio);return {...numbers(folio,['folioNo','invoiceNo']),...strings(folio,{start:10,folioStatus:80}),postings:folio.postings===undefined?[]:posRows(folio.postings,posting)};});
          windows.push(result);
        }
      }
      return {hotelId:this.config.hotelId,reservationId,folioWindowNo:window,missingWindow:windows.length===0,omittedWindows,windows};
    });
  }
  /** Same fixed request, structural diagnostics only. Never expands contacts,
   * money, unknown keys or raw scalar values when diagnosing a provider shape. */
  invoicePosDisplayFoliosShape(reservationId:string,window:number,offset=0,limit=200){
    return this.posDisplayFoliosRead(reservationId,window,offset,limit).then(raw=>{
      const object=(value:unknown):PosMetadata=>value&&typeof value==='object'&&!Array.isArray(value)?value as PosMetadata:{};
      const type=(value:unknown)=>value===null?'null':Array.isArray(value)?'array':typeof value;
      const pick=(value:unknown,keys:string[])=>{const source=object(value);return Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));};
      const lengths=(value:unknown,keys:string[])=>{const source=object(value);return Object.fromEntries(keys.filter(key=>typeof source[key]==='string').map(key=>[key,String(source[key]).length]));};
      const validNumbers=(value:unknown,keys:string[])=>{const source=object(value);return Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,Number.isSafeInteger(source[key])&&Number(source[key])>=0]));};
      const root=object(raw),info=object(root.reservationFolioInformation),reservation=object(info.reservationInfo);
      const list=reservation.reservationIdList,identities=Array.isArray(list)?list.slice(0,20).map(object).filter(row=>row.type==='Reservation'):[];
      const section=(key:string)=>{
        const rawWindows=info[key],all=Array.isArray(rawWindows)?rawWindows.slice(0,4000).map(object):[],matched=all.filter(row=>row.folioWindowNo===window),sample=(matched.length?matched:all).slice(0,2);
        return {type:type(rawWindows),length:Array.isArray(rawWindows)?rawWindows.length:undefined,matchingWindows:matched.length,windows:sample.map(row=>{
          const rawFolios=row.folios,folios=Array.isArray(rawFolios)?rawFolios.slice(0,2).map(object):[];
          return {fields:posTransactionShape(pick(row,['folioWindowNo','internalFolioWindowID','offset','limit','totalPages','totalResults','hasMore'])),numericFieldsValid:validNumbers(row,['folioWindowNo','offset','limit','totalPages','totalResults']),windowTextLengths:lengths(row,['internalFolioWindowID']),windowNumberValid:Number.isSafeInteger(row.folioWindowNo)&&Number(row.folioWindowNo)>0,foliosType:type(rawFolios),foliosLength:Array.isArray(rawFolios)?rawFolios.length:undefined,folios:folios.map(folio=>{
            const rawPostings=folio.postings,postings=Array.isArray(rawPostings)?rawPostings.slice(0,4).map(object):[];
            return {fields:posTransactionShape(pick(folio,['folioNo','invoiceNo','start','folioStatus'])),numericFieldsValid:validNumbers(folio,['folioNo','invoiceNo']),textLengths:lengths(folio,['start','folioStatus']),postingsType:type(rawPostings),postingsLength:Array.isArray(rawPostings)?rawPostings.length:undefined,postings:postings.map(posting=>({fields:posTransactionShape(pick(posting,['transactionNo','transactionDate','transactionCode','transactionDescription','reference','checkNo','arrangementCode','groupTypeInfo','financialTransactionIdList'])),textLengths:lengths(posting,['transactionDate','transactionCode','transactionDescription','reference','checkNo','arrangementCode']),groupTextLengths:lengths(posting.groupTypeInfo,['groupId','subGroupId','groupDescription']),cashierIdType:type(object(posting.cashierInfo).cashierId),cashierIdValid:object(posting.cashierInfo).cashierId===undefined||Number.isSafeInteger(object(posting.cashierInfo).cashierId)&&Number(object(posting.cashierInfo).cashierId)>=0,groupIdMatchesCheckNo:typeof object(posting.groupTypeInfo).groupId==='string'&&object(posting.groupTypeInfo).groupId===posting.checkNo,subGroupIdMatchesCheckNo:typeof object(posting.groupTypeInfo).subGroupId==='string'&&object(posting.groupTypeInfo).subGroupId===posting.checkNo,transactionNoValid:posting.transactionNo===undefined||Number.isSafeInteger(posting.transactionNo)&&Number(posting.transactionNo)>=0,groupCountValid:object(posting.groupTypeInfo).groupCount===undefined||Number.isSafeInteger(object(posting.groupTypeInfo).groupCount)&&Number(object(posting.groupTypeInfo).groupCount)>=0}))};
          })};
        })};
      };
      return {kind:'pos-display-folio-shape',rootType:type(raw),informationType:type(root.reservationFolioInformation),identity:{hotelIdType:type(reservation.hotelId),hotelMatches:reservation.hotelId===this.config.hotelId,reservationListType:type(list),reservationMatches:identities.length===1&&identities[0].id===reservationId},current:section('folioWindows'),history:section('folioHistory')};
    });
  }
  invoicePostingBreakdown(reservationId:string,window:number,start:string,end:string,offset=0,limit=50) {
    if(!Number.isSafeInteger(window)||window<1||limit>50||![start,end].every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))||start>end)throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/financialPostingsNetVat`,[['reservationId',reservationId],['folioWindowNo',String(window)],['startDate',start],['endDate',end],...this.page(offset,limit)]);
  }
  /** Read-only diagnostic alternative for posted AR generates; not a tax classification. */
  invoiceTaxData(transactionId:string) {
    if(!/^[1-9][0-9]{0,14}$/.test(transactionId))throw new OperaError('invalid_request');
    const query='query InvoiceTaxEvidence($input: FinancialTransactionDetailsExtendedQueryArgumentsType!) { financialTransactionDetailsExtended(input: $input) { financialUnifiedDetails { trxNo invoiceNumber folioNo grossAmount netAmount } folioTaxDetails { property billNumber invoiceNumber totalGrossAmount totalNetAmount totalNonTaxableAmount totalTax xtax1Amt netAmount1 } } }';
    return this.read('/rna/v1/graphql',[],{query,variables:{input:{financialunifiedDetailsResort:{_eq:this.config.hotelId},financialunifiedDetailsFtTrxNo:{_eq:Number(transactionId)}}}});
  }
  invoiceGuestTransactions(reservationId:string,start:string,end:string) {
    const day=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!/^[1-9][0-9]{0,15}$/.test(reservationId)||!day(start)||!day(end)||start>end||Date.parse(end)-Date.parse(start)>=30*86400000)throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/transactions`,[['reservationList',reservationId],['includeGenerates','true'],['includeTransactionsWithARInvoiceNo','true'],['includeTransactionsWithFolioNo','true'],['startDate',start],['endDate',end]]);
  }
  invoicePostingJournal(cashierId:string,date:string,offset=0) {
    if(!/^[1-9][0-9]{0,12}$/.test(cashierId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!Number.isSafeInteger(offset)||offset<0||offset>450||offset%50!==0)throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/financialPostings`,[['cashierId',cashierId],['startDate',date],['endDate',date],...this.page(offset,50)]);
  }
  /** POS check strings are source identifiers, including values longer than a
   * JavaScript safe integer. Never coerce them to numbers or follow links. */
  invoiceCheckDetails(checkNumber:string){
    if(typeof checkNumber!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,1999}$/.test(checkNumber)||checkNumber==='.'||checkNumber==='..')throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/check/${this.id(checkNumber)}`,[]).then(raw=>posFields(raw,{checkNumber:'string',checkDate:'string',checkDetailsInfo:'string',checkImageInfo:'string'}));
  }
  invoicePosInterfaces(){
    this.observedPosLogos.clear();if(!isHotelId(this.config.hotelId))throw new OperaError('invalid_request');
    return this.read('/int/config/v1/hotelInterfaceTypes',[['hotelIds',this.config.hotelId],['interfaceTypes','Pos'],['includeInactive','false']]).then(raw=>{
      const source=posObject(raw),logos=new Set<string>();
      const hotelInterfaces=posRows(source.hotelInterfaces,raw=>{const row=posObject(raw);if(row.hotelId!==this.config.hotelId||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(row.logo)||logos.has(row.logo))throw new OperaError('invalid_response');logos.add(row.logo);
        const result=posFields(row,{hotelId:'string',interfaceType:'string',logo:'string',interfaceName:'string',activeFlag:'boolean'});if(row.interfaceId!==undefined)result.interfaceId=posFields(row.interfaceId,{id:'string',type:'string',idContext:'string'});return result;});
      for(const logo of logos)this.observedPosLogos.add(logo);return {hotelInterfaces};
    });
  }
  /** Only a logo observed in active, property-scoped POS discovery on this
   * reader may select this single documented metadata expansion. */
  private posTransactionCodesRead(interfaceLogoId:string){
    if(typeof interfaceLogoId!=='string'||!this.observedPosLogos.has(interfaceLogoId))throw new OperaError('invalid_request');
    return this.read(`/int/config/v1/hotels/${this.id(this.config.hotelId)}/logos/${this.id(interfaceLogoId)}`,[['fetchInstructions','TransactionCodesInfo']]);
  }
  invoicePosTransactionCodes(interfaceLogoId:string){return this.posTransactionCodesRead(interfaceLogoId).then(posTransactionProjection);}
  invoicePosTransactionCodesShape(interfaceLogoId:string){return this.posTransactionCodesRead(interfaceLogoId).then(posTransactionShape);}
  /** FOF 26.3 getTransactionCodes: exact historical-code selectors only. */
  invoiceTransactionCodesList(codes:string[]){
    if(!isHotelId(this.config.hotelId)||!Array.isArray(codes)||!codes.length||codes.length>20||new Set(codes).size!==codes.length||codes.some(code=>typeof code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(code)))throw new OperaError('invalid_request');
    const wanted=[...codes],hotel=this.config.hotelId;
    return this.read('/fof/config/v1/transactionCodes',[['hotelIds',hotel],...wanted.map(code=>['transactionCodes',code]),['includeInactive','true']]).then(raw=>{
      const response=posObject(raw),values=response.transactionCodes;if(!Array.isArray(values)||values.length!==wanted.length||response.hasMore!==undefined&&response.hasMore!==false||response.totalPages!==undefined&&response.totalPages!==1||response.totalResults!==undefined&&response.totalResults!==values.length||response.count!==undefined&&response.count!==values.length||Array.isArray(response.links)&&response.links.some(link=>posObject(link).rel==='next'))throw new OperaError('invalid_response');
      const text=(v:unknown)=>{if(typeof v!=='string'||v.length>80||/[\u0000-\u001f\u007f]/.test(v))throw new OperaError('invalid_response');return v;},byCode=new Map<string,TransactionCodeListMetadata>();
      for(const value of values){const source=posObject(value),code=text(source.code);if(source.hotelId!==hotel||!wanted.includes(code)||byCode.has(code))throw new OperaError('invalid_response');const result:TransactionCodeListMetadata={hotelId:hotel,code};
        if(source.compTransaction!==undefined){if(typeof source.compTransaction!=='boolean')throw new OperaError('invalid_response');result.compTransaction=source.compTransaction;}
        if(source.classification!==undefined){const c=posObject(source.classification),classification:NonNullable<TransactionCodeListMetadata['classification']>={};if(c.type!==undefined)classification.type=text(c.type);if(c.transactionType!==undefined){const t=posObject(c.transactionType),type:NonNullable<typeof classification.transactionType>={};if(t.code!==undefined)type.code=text(t.code);if(t.taxCode!==undefined){if(!Number.isSafeInteger(t.taxCode))throw new OperaError('invalid_response');type.taxCode=t.taxCode as number;}classification.transactionType=type;}for(const name of ['group','subgroup'] as const)if(c[name]!==undefined){const group=posObject(c[name]);classification[name]=group.code===undefined?{}:{code:text(group.code)};}result.classification=classification;}
        if(source.trxSetup!==undefined){const setup=posFields(source.trxSetup,{revenue:'boolean',nonTaxable:'boolean',taxInclusive:'boolean',manualPosting:'boolean',useForPaidout:'boolean',depositPostingOnly:'boolean'});const rawSetup=posObject(source.trxSetup);if(rawSetup.generatesType!==undefined)setup.generatesType=text(rawSetup.generatesType);result.trxSetup=setup as NonNullable<TransactionCodeListMetadata['trxSetup']>;}
        byCode.set(code,result);
      }
      return {transactionCodes:wanted.map(code=>byCode.get(code)!)};
    });
  }
  invoiceTransactionCodeRules(code:string){
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(code))throw new OperaError('invalid_request');
    return this.read(`/fof/config/v1/hotels/${this.id(this.config.hotelId)}/transactionCodes/${this.id(code)}/hotelTransactionCode`,['Header','Generates','AssociatedTrxCodes'].map(v=>['fetchInstructions',v]));
  }
  /** FOF 26.3 Header + MappingCodes diagnostics only. Mapping strings are
   * inert metadata: never evaluate them or follow them as URLs. */
  invoiceTransactionCodeReportMetadata(code:string){
    if(!isHotelId(this.config.hotelId)||typeof code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(code))throw new OperaError('invalid_request');
    return this.read(`/fof/config/v1/hotels/${this.id(this.config.hotelId)}/transactionCodes/${this.id(code)}/hotelTransactionCode`,[['fetchInstructions','Header'],['fetchInstructions','MappingCodes']]).then(raw=>{
      const source=posObject(posObject(raw).transactionCode);if(source.hotelId!==this.config.hotelId||source.code!==code)throw new OperaError('invalid_response');
      const strings=(raw:unknown,fields:Record<string,number>):PosMetadata=>{
        const row=posObject(raw),result:PosMetadata={};for(const [key,max]of Object.entries(fields)){const value=row[key];if(value===undefined)continue;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new OperaError('invalid_response');result[key]=value;}return result;
      };
      const result:PosMetadata={hotelId:source.hotelId,code:source.code,...strings(source,{otaTaxType:20}),...posFields(source,{compTransaction:'boolean',printTrxReceipt:'boolean'})};
      if(source.classification!==undefined){
        const classification=posObject(source.classification),projected=strings(classification,{type:20,fiscalTransactionType:1});
        if(classification.transactionType!==undefined)projected.transactionType={...strings(classification.transactionType,{code:20}),...posFields(classification.transactionType,{taxCode:'number'})};
        for(const name of ['group','subgroup'])if(classification[name]!==undefined)projected[name]=strings(classification[name],{code:20,description:2000});
        result.classification=projected;
      }
      if(source.trxSetup!==undefined)result.trxSetup={...strings(source.trxSetup,{serviceType:20,accountingCode:40,quantityCode:40}),...posFields(source.trxSetup,{taxInclusive:'boolean',revenue:'boolean',manualPosting:'boolean',useForPaidout:'boolean',includeInDepositRule:'boolean',depositPostingOnly:'boolean',postingRule:'boolean',nonTaxable:'boolean',interHotelSales:'boolean',checkNoRequired:'boolean'})};
      if(source.mappingCodes!==undefined)result.mappingCodes=posRows(source.mappingCodes,rawMapping=>{const mapping=posObject(rawMapping),projected=strings(mapping,{linkedCode:2000,exportMappingCode:100,defaultMappedValue:2000,mappedValue:2000,mappingTypeDescription:2000,mappingCodeDescription:2000,lovName:40});if(mapping.exportMappingId!==undefined)projected.exportMappingId=strings(mapping.exportMappingId,{id:80,type:40});return projected;});
      return {transactionCode:result};
    });
  }
  /** FOF 26.3 getFolioArrangementCodes: exact observed display mappings only.
   * Names and member codes do not classify tax roles or authorize grouping. */
  invoiceFolioArrangementCodes(codes:string[]){
    if(!isHotelId(this.config.hotelId)||!Array.isArray(codes)||!codes.length||codes.length>20||codes.some(code=>typeof code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(code)))throw new OperaError('invalid_request');
    const requested=[...new Set(codes)];
    return this.read('/fof/config/v1/folioArrangementCodes',[['hotelIds',this.config.hotelId],...requested.map(code=>['arrangementCodes',code])]).then(raw=>{
      const source=posObject(raw),seen=new Set<string>();
      if(!Array.isArray(source.folioArrangementCodes)||source.folioArrangementCodes.length>requested.length)throw new OperaError('invalid_response');
      const strings=(raw:unknown,fields:Record<string,number>):PosMetadata=>{
        const input=posObject(raw),result:PosMetadata={};for(const [key,max]of Object.entries(fields)){const value=input[key];if(value===undefined)continue;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new OperaError('invalid_response');result[key]=value;}return result;
      };
      const folioArrangementCodes=source.folioArrangementCodes.map(raw=>{
        const row=posObject(raw);if(row.hotelId!==this.config.hotelId||typeof row.code!=='string'||!requested.includes(row.code)||seen.has(row.code))throw new OperaError('invalid_response');seen.add(row.code);
        const projected:PosMetadata={hotelId:row.hotelId,code:row.code};
        if(row.description!==undefined){const description=posObject(row.description),text=strings(description,{defaultText:2000});if(description.translatedTexts!==undefined)text.translatedTexts=posRows(description.translatedTexts,row=>strings(row,{value:2000,language:20}));projected.description=text;}
        if(row.transactionCodes!==undefined){if(!Array.isArray(row.transactionCodes)||row.transactionCodes.length>4000||row.transactionCodes.some(value=>typeof value!=='string'||value.length>20||/[\u0000-\u001f\u007f]/.test(value)))throw new OperaError('invalid_response');projected.transactionCodes=[...row.transactionCodes];}
        return projected;
      });
      return {folioArrangementCodes,missingCodes:requested.filter(code=>!seen.has(code))};
    });
  }
  /** ENTCFG 26.3 getCountries: configured country labels for display audits.
   * A bounded complete response is required; no language or name is inferred. */
  invoiceCountryDisplayMetadata(codes:string[]){
    if(!isHotelId(this.config.hotelId)||!Array.isArray(codes)||!codes.length||codes.length>20||codes.some(code=>typeof code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(code)))throw new OperaError('invalid_request');
    const requested=[...new Set(codes)];
    return this.read(`/ent/config/v1/hotels/${this.id(this.config.hotelId)}/countries`,[...requested.map(code=>['countriesCodes',code]),['limit','20']]).then(raw=>{
      const source=posObject(raw),seen=new Set<string>();if(!Array.isArray(source.countries)||source.countries.length>requested.length)throw new OperaError('invalid_response');
      const count=source.countries.length;
      if(source.hasMore!==undefined&&source.hasMore!==false)throw new OperaError('invalid_response');
      if(source.totalPages!==undefined&&source.totalPages!==1&&!(source.totalPages===0&&count===0))throw new OperaError('invalid_response');
      for(const key of ['count','totalResults'])if(source[key]!==undefined&&source[key]!==count)throw new OperaError('invalid_response');
      if(source.limit!==undefined&&source.limit!==20||source.offset!==undefined&&(!Number.isSafeInteger(source.offset)||Number(source.offset)<0||Number(source.offset)>20))throw new OperaError('invalid_response');
      const strings=(raw:unknown,fields:Record<string,number>):PosMetadata=>{const input=posObject(raw),result:PosMetadata={};for(const [key,max]of Object.entries(fields)){const value=input[key];if(value===undefined)continue;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new OperaError('invalid_response');result[key]=value;}return result;};
      const countries=source.countries.map(raw=>{
        const row=posObject(raw);if(row.hotelId!==this.config.hotelId||typeof row.countryCode!=='string'||!requested.includes(row.countryCode)||seen.has(row.countryCode))throw new OperaError('invalid_response');seen.add(row.countryCode);
        const projected:PosMetadata={hotelId:row.hotelId,countryCode:row.countryCode,...strings(row,{name:80,isoName:200,isoCode:20})};
        if(row.description!==undefined){const description=posObject(row.description),text=strings(description,{defaultText:2000});if(description.translatedTexts!==undefined)text.translatedTexts=posRows(description.translatedTexts,row=>strings(row,{value:2000,language:20}));projected.description=text;}
        return projected;
      });
      return {countries,missingCodes:requested.filter(code=>!seen.has(code))};
    });
  }
  /** RTP 26.3 getRatePlan: bounded display metadata only. This current
   * configuration is not evidence of historical pricing or tax treatment. */
  invoiceRatePlanFolioText(code:string){
    if(typeof code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/.test(code))throw new OperaError('invalid_request');
    return this.read(`/rtp/v1/hotels/${this.id(this.config.hotelId)}/ratePlans/${this.id(code)}`,[['fetchInstructions','PrimaryDetails'],['fetchInstructions','TransactionDetails']]).then(raw=>{
      const source=posObject(raw);
      if(!Array.isArray(source.ratePlans)||source.ratePlans.length!==1)throw new OperaError('invalid_response');
      const plan=posObject(source.ratePlans[0]);
      if(plan.hotelId!==this.config.hotelId||plan.ratePlanCode!==code)throw new OperaError('invalid_response');
      const strings=(raw:unknown,fields:Record<string,number>):PosMetadata=>{
        const input=posObject(raw),result:PosMetadata={};for(const [key,max]of Object.entries(fields)){const value=input[key];if(value===undefined)continue;if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new OperaError('invalid_response');result[key]=value;}return result;
      };
      const result:PosMetadata={hotelId:plan.hotelId,ratePlanCode:plan.ratePlanCode};
      if(plan.primaryDetails!==undefined){
        const primary=posObject(plan.primaryDetails);
        if(primary.description!==undefined){const description=posObject(primary.description),projected=strings(description,{defaultText:2000});if(description.translatedTexts!==undefined)projected.translatedTexts=posRows(description.translatedTexts,row=>strings(row,{value:2000,language:20}));result.primaryDetails={description:projected};}
      }
      if(plan.transactionDetails!==undefined){
        const details=posObject(plan.transactionDetails),projected=strings(details,{transactionCode:20,packageTransactionCode:20});
        if(details.folioText!==undefined){const folio=posObject(details.folioText),text=strings(folio,{defaultText:2000});if(folio.translatedTexts!==undefined)text.translatedTexts=posRows(folio.translatedTexts,row=>strings(row,{value:2000,language:20}));projected.folioText=text;}
        if(details.roomTransactionCodes!==undefined)projected.roomTransactionCodes=posRows(details.roomTransactionCodes,row=>strings(row,{roomType:20,roomClass:20,transactionCode:20}));
        result.transactionDetails=projected;
      }
      return {ratePlans:[result]};
    });
  }
  invoiceChargeSimulation(code:string,amount:number){
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(code)||!Number.isFinite(amount)||amount===0||Math.abs(amount)>1000000000)throw new OperaError('invalid_request');
    return this.read(`/fof/config/v1/hotels/${this.id(this.config.hotelId)}/transactionCodes/${this.id(code)}/chargeSimulations`,[['postingAmount',String(amount)]]);
  }
  invoiceTransactionDetails(transactionIds:string[]) {
    if(!transactionIds.length||transactionIds.length>40||new Set(transactionIds).size!==transactionIds.length||transactionIds.some(id=>!/^[1-9][0-9]{0,15}$/.test(id)))throw new OperaError('invalid_request');
    return this.read(`/csh/v1/hotels/${this.id(this.config.hotelId)}/transactionDetails`,[['includeGenerates','true'],...transactionIds.map(id=>['transactionNo',id])]);
  }
  invoiceReservation(reservationId:string) {
    if(!/^[1-9][0-9]{0,15}$/.test(reservationId))throw new OperaError('invalid_request');
    return this.read(`/rsv/v1/hotels/${this.id(this.config.hotelId)}/reservations/${this.id(reservationId)}`,[['fetchInstructions','Reservation'],['markAsRecentlyAccessed','false'],['includeInSession','false']]);
  }
  reports(name:string){if(!name||name.length>2000)throw new OperaError('invalid_request');return this.read('/rep/config/v1/reports',[['hotel',this.config.hotelId],['name',name],['includeInternalReports','true'],['includeUnpublished','false'],['includeWatermarkDetails','false']]);}
  allReports(name:string){if(!name||name.length>2000)throw new OperaError('invalid_request');return this.read('/rep/config/v1/allReports',[['hotel',this.config.hotelId],['name',name],['includeInternalReports','true'],['includeUnpublished','true'],['includeWatermarkDetails','false']]);}
  reportParameters(id:string,context:string,type:string){if(!id||!context||!type)throw new OperaError('invalid_request');return this.read('/rep/config/v1/reportParameters',[['id',id],['idContext',context],['type',type]]);}
  /** Explicit document processing only. Caller must hold a durable claim. Never retries. */
  async processStatement(accountId:string,descriptor:Record<string,unknown>,requestId:string) {
    if(descriptor.hotelId!==this.config.hotelId||!descriptor.accountId||typeof descriptor.accountId!=='object'||('id' in descriptor.accountId?descriptor.accountId.id:null)!==accountId||!Array.isArray(descriptor.invoices)||!descriptor.invoices.length||!/^[0-9a-f-]{36}$/.test(requestId))throw new OperaError('invalid_request');
    const token=await this.getToken();if(!token)throw new OperaError('provider_unauthorized');
    const url=new URL(`/ars/v1/hotels/${this.id(this.config.hotelId)}/accounts/${this.id(accountId)}/statements`,this.origin);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const r=await this.transport(new Request(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'x-app-key':this.config.appKey,'x-hotelid':this.config.hotelId,'x-request-id':requestId,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({criteria:{statements:[descriptor],statementCriteria:{inclZero:false,inclPrinted:true,inclFolios:false}}}),redirect:'manual',signal:controller.signal}));
      const chunks:Uint8Array[]=[];let size=0;
      if(r.body){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>this.maxResponseBytes){await reader.cancel();throw new OperaError('response_too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}}
      const bytes=new Uint8Array(size);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
      // Location is evidence only; never follow it with credentials automatically.
      return {status:r.status,type:r.headers.get('Content-Type'),location:r.headers.get('Location'),bytes};
    }catch(e){if(e instanceof OperaError)throw e;throw new OperaError(controller.signal.aborted?'timeout':'provider_unavailable');}
    finally{clearTimeout(timer);}
  }
  async statementLocation(location:string) {
    const url=new URL(location,this.origin);
    if(url.origin!==this.origin||url.username||url.password||url.hash||!['/ars/v1/','/med/config/v1/'].some(p=>url.pathname.startsWith(p)))throw new OperaError('redirect_rejected');
    const token=await this.getToken();if(!token)throw new OperaError('provider_unauthorized');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const r=await this.transport(new Request(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,'x-app-key':this.config.appKey,'x-hotelid':this.config.hotelId,Accept:'application/json, application/pdf'},redirect:'manual',signal:controller.signal}));
      const chunks:Uint8Array[]=[];let size=0;
      if(r.body){const stream=r.body.getReader();try{while(true){const p=await stream.read();if(p.done)break;size+=p.value.length;if(size>this.maxResponseBytes){await stream.cancel();throw new OperaError('response_too_large');}chunks.push(p.value);}}finally{stream.releaseLock();}}
      const bytes=new Uint8Array(size);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}return {status:r.status,type:r.headers.get('Content-Type'),bytes};
    }catch(e){if(e instanceof OperaError)throw e;throw new OperaError(controller.signal.aborted?'timeout':'provider_unavailable');}finally{clearTimeout(timer);}
  }
  statementHistory(accountId:string,profileId:string) { return this.read(`/ars/v1/hotels/${this.id(this.config.hotelId)}/profiles/${this.id(profileId)}/accounts/${this.id(accountId)}/statementsHistory`,[]); }
  businessDate() { return this.read(`/bof/v1/hotels/${this.id(this.config.hotelId)}/businessDate`,[]); }
  private async read(path:string,query:string[][],readQuery?:{query:string;variables:unknown}):Promise<unknown> {
    let token:string;
    try {token=await this.getToken();} catch(e) {throw e instanceof OperaError?e:new OperaError('provider_unauthorized');}
    if(!token)throw new OperaError('provider_unauthorized');
    const url=new URL(path,this.origin);url.search=new URLSearchParams(query).toString();
    if(url.origin!==this.origin)throw new OperaError('invalid_request');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.transport(new Request(url,{method:readQuery?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'x-app-key':this.config.appKey,'x-hotelid':this.config.hotelId,Accept:readQuery?'multipart/mixed; deferSpec=20220824, application/json':'application/json',...(readQuery?{'Content-Type':'application/json','x-request-id':crypto.randomUUID()}:{})},...(readQuery?{body:JSON.stringify(readQuery)}:{}),redirect:'manual',signal:controller.signal}));
      if(response.status>=300&&response.status<400){await response.body?.cancel();throw new OperaError('redirect_rejected');}
      if(!response.ok){
        let providerMessage: string|undefined;
        // Discovery has only owner-confirmed hotel IDs and pagination inputs. Inspect bounded
        // validation title/detail only, never return account payloads or token endpoint bodies.
        if((response.status===400&&(path==='/ars/v1/accounts'||/^\/csh\/v1\/hotels\/[^/]+\/(folioHistory|financialPostingsNetVat)$/.test(path))||readQuery&&[400,401,403,404].includes(response.status)&&path==='/rna/v1/graphql')&&response.body){
          const reader=response.body.getReader();let text='';const decoder=new TextDecoder();let bytes=0;
          try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>4096){await reader.cancel();break;}text+=decoder.decode(p.value,{stream:true});}
            if(readQuery){let error:unknown=text;try{error=JSON.parse(text);}catch{/* HTML/plain gateway response: keep heading only. */}providerMessage=dataFailureReason(error,token,this.config.appKey);}
            else{const error=JSON.parse(text);providerMessage=[error.title,error.detail,error['o:errorCode']].filter(v=>typeof v==='string').join(' · ').replaceAll(token,'[redacted]').replaceAll(this.config.appKey,'[redacted]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').slice(0,400);}
            if(providerMessage)for(const [,value]of query)if(value.length>3)providerMessage=providerMessage.replaceAll(value,'[redacted input]');
          }catch{/* only the categorical status survives unreadable errors */}finally{reader.releaseLock();}
        }else await response.body?.cancel();
        throw new OperaError(response.status===401||response.status===403?'provider_unauthorized':response.status>=500||response.status===429?'provider_unavailable':'provider_rejected',response.status,undefined,providerMessage);
      }
      const contentType=response.headers.get('Content-Type')??'';
      if(!contentType.toLowerCase().includes('json')&&!(readQuery&&/^multipart\/mixed\b/i.test(contentType))){await response.body?.cancel();throw new OperaError('invalid_response');}
      const declared=Number(response.headers.get('Content-Length'));
      if(declared>this.maxResponseBytes){await response.body?.cancel();throw new OperaError('response_too_large');}
      if(!response.body)throw new OperaError('invalid_response');
      const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try {
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>this.maxResponseBytes){await reader.cancel();throw new OperaError('response_too_large');}chunks.push(part.value);}
      } finally { reader.releaseLock(); }
      const bytes=new Uint8Array(size);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.byteLength;}
      let envelopes:unknown[];
      try {const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);envelopes=readQuery?dataResponseEnvelopes(text,contentType):[JSON.parse(text)];} catch {throw new OperaError('invalid_response');}
      if(readQuery){
        for(const envelope of envelopes){const value=envelope as {errors?:unknown;data?:unknown};if(Array.isArray(value?.errors)&&value.errors.length)throw new OperaError('provider_rejected',response.status,'data_query_failed',dataFailureReason(value.errors,token,this.config.appKey),{partialData:value.data!=null});}
        return envelopes.find(e=>e&&typeof e==='object'&&'data' in e)??envelopes[0];
      }
      return envelopes[0];
    } catch(error) {
      if(error instanceof OperaError)throw error;
      // Never propagate upstream response bodies, request URLs, headers or credentials into logs/errors.
      throw new OperaError(controller.signal.aborted?'timeout':'provider_unavailable');
    } finally { clearTimeout(timer); }
  }
}
