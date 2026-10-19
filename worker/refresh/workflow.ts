import {postPublicationMaintenance,joinedScheduledMaintenance} from './post-publication';
import {warmPeriodSummaries} from '../dashboard/precompute';
import {acceptanceEnvironment} from '../acceptance/context';
import {assertWritesEnabled} from '../operations/write-hold';
import type {DriveEnv} from '../drive/shared';
import {writeManagedStorage} from '../operations/storage';
import {runFinancialHistory,type FinancialIngestionEnv} from '../financial/refresh';
import {runFinancialDiagnostic} from '../opera/financial-diagnostic';
import {runMailReconcile} from '../email/reconcile';
import type {ReconcileEnv} from '../email/reconcile';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { makeReader,probeOpera } from '../opera/probe';
import { OperaError } from '../opera/client';
import {assertStatementWorkflowPolicy} from '../documents/source-policy';
import {documentJob,runDocumentJob,uuidPattern} from '../documents/jobs';
import { auditHistory, auditHistoryWindow } from '../opera/history-audit';
import { backendRpc, type RefreshEnv, type RefreshParams } from './backend';
import { discoverAccountIds, readBusinessDate } from './read-snapshot';
import {stageRefreshAccounts} from './accounts';
import {isHotelId} from '../../src/domain/hotels';
import {readFolioReportTypes} from '../documents/folio-type-probe';
import {readInvoiceFolioContract} from '../documents/invoice-contract-probe';
import {nativeFolioSelector} from '../documents/native-invoice';
import {renderInvoice} from '../invoice/render';
import type {InvoiceAssets} from '../invoice/types';
import {readInvoicePacket,readInvoiceModel} from '../invoice/read';
import {auditInvoiceRead} from '../invoice/read-audit';
import {invoiceModel,record as invoiceRecord} from '../invoice/model';

export class ArRefreshWorkflow extends WorkflowEntrypoint<RefreshEnv & ReconcileEnv & FinancialIngestionEnv & DriveEnv,RefreshParams> {
  async run(event:WorkflowEvent<RefreshParams>,step:WorkflowStep) {
    const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload;
  const runtime=payload.acceptanceId?await acceptanceEnvironment(this.env,payload.actorId??'',payload.acceptanceId):this.env;
  assertWritesEnabled(runtime);
    const {runId,hotel,accountId}=payload as RefreshParams;
    assertStatementWorkflowPolicy(payload);
    if(payload.mailReconcile){if(!/^[0-9a-f-]{36}$/.test(runId??''))throw Error('invalid_workflow_parameters');return runMailReconcile(runtime,runId,step);}
    if(!/^[0-9a-f-]{36}$/.test(runId??'')||!isHotelId(hotel))throw new Error('invalid_workflow_parameters');
    // Retire diagnostic control windows without entering an unregistered financial run.
    if(payload.currentTickerStart!==undefined)return {status:'retired'};
    if(payload.scheduledMaintenance)return joinedScheduledMaintenance(runtime,payload,step);
    if(payload.folioTypeProbe)return step.do('folio-report-configuration',{retries:{limit:0,delay:'5 seconds'},timeout:'3 minutes'},()=>readFolioReportTypes(makeReader(runtime,hotel),hotel));
    if(payload.invoiceContractJob){
      if(!uuidPattern.test(payload.invoiceContractJob))throw Error('document_probe_scope_invalid');
      return step.do('selected-invoice-contract',{retries:{limit:0,delay:'5 seconds'},timeout:'3 minutes'},async()=>{
        const job=await documentJob(runtime,payload.invoiceContractJob!);
        if(!job||job.hotel!==hotel||!payload.invoiceAuditId&&job.invoice_ids.length!==1)throw Error('document_probe_scope_invalid');
        const selectedId=payload.invoiceAuditId??job.invoice_ids[0];if(!/^[1-9][0-9]{0,15}$/.test(selectedId)||!job.invoice_ids.includes(selectedId))throw Error('document_probe_scope_invalid');
        const invoice=job.manifest.find(i=>i.id===selectedId);
        if(!invoice||invoice.hotel!==hotel||invoice.account_id!==job.account_id)throw Error('document_probe_scope_invalid');
        if(payload.invoiceTaxRulesProbe){
          const reader=makeReader(runtime,hotel),packet=await readInvoicePacket(reader,invoice);
          const roots=(packet.arDetails??[]).flatMap(d=>(invoiceRecord(d.response).transactions as unknown[]).map(invoiceRecord));
          if(!roots.length||roots.length>5)throw Error('document_probe_scope_invalid');
          const samples=[];
          for(const p of roots){
            const selected=(invoiceRecord(packet.postings).invoicePostingsDetails as unknown[]).map(invoiceRecord).filter(r=>r.transactionNo===p.transactionNo);
            if(selected.length!==1||String(invoiceRecord(p.aRInfo).invoiceNo)!==invoice.invoice_no||String(invoiceRecord(p.aRInfo).accountNumber)!==String(invoiceRecord(packet.account).accountNo)||String(p.folioNo)!==invoice.folio_no||p.transactionCode!==selected[0].transactionCode)throw Error('document_probe_scope_invalid');
            const debit=p.debitAmount?invoiceRecord(p.debitAmount):undefined,credit=p.creditAmount?invoiceRecord(p.creditAmount):undefined;
            if(debit&&debit.currencyCode!=='THB'||credit&&credit.currencyCode!=='THB')throw Error('document_probe_scope_invalid');
            const amount=Number(debit?.amount??0)-Number(credit?.amount??0),code=String(p.transactionCode);
            const rules=await reader.invoiceTransactionCodeRules(code),defs=invoiceRecord(invoiceRecord(rules).transactionCode),generates=invoiceRecord(defs.generatesSetup).generates as unknown[];
            samples.push({code,amount,rules,calculation:await reader.invoiceChargeSimulation(code,amount),generatedRules:await Promise.all(generates.map(g=>reader.invoiceTransactionCodeRules(String(invoiceRecord(g).code))))});
          }
          return JSON.stringify({hotel,samples});
        }
        if(payload.invoiceGuestProbe){
          const reader=makeReader(runtime,hotel),packet=await readInvoicePacket(reader,invoice);
          const rows=(invoiceRecord(packet.postings).invoicePostingsDetails as unknown[]).map(invoiceRecord);
          const dates=rows.map(r=>String(r.transactionDate)).sort();
          let extra:unknown;
          if(payload.invoiceLedgerProbe){
            const roots=(packet.arDetails??[]).flatMap(d=>(invoiceRecord(d.response).transactions as unknown[]).map(invoiceRecord));
            if(!roots.length||roots.some(p=>String(invoiceRecord(p.aRInfo).invoiceNo)!==invoice.invoice_no||String(invoiceRecord(p.aRInfo).accountNumber)!==String(invoiceRecord(packet.account).accountNo)||!rows.some(r=>r.transactionNo===p.transactionNo)))throw Error('document_probe_scope_invalid');
            const scopes=[...new Map(roots.map(p=>[JSON.stringify([String(invoiceRecord(p.cashierInfo).cashierId),String(p.transactionDate)]),p])).values()];
            if(scopes.length!==1)throw Error('document_probe_scope_invalid');
            extra=await reader.invoicePostingJournal(String(invoiceRecord(scopes[0].cashierInfo).cashierId),String(scopes[0].transactionDate));
          }else extra=await reader.invoiceGuestTransactions(invoice.reservation_id!,dates[0],dates.at(-1)!);
          // Existing privileged control-plane diagnostic only; no public HTTP route,
          // accounting mutation, document save or email. Returned text is hashed.
          const digest=async(value:unknown)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value??''))))].map(n=>n.toString(16).padStart(2,'0')).join('');
          const summarize=async(value:unknown,depth=0):Promise<unknown>=>{
            if(depth>15)return 'depth_limit';
            if(Array.isArray(value))return Promise.all(value.slice(0,4000).map(v=>summarize(v,depth+1)));
            if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).filter(([k])=>k!=='links').map(async([k,v])=>[k,typeof v==='string'&&!/^(?:transactionCode|transactionType|transactionGroup|transactionSubGroup|currencyCode|hotelId|transactionDate|postingDate|revenueDate|id|type|invoiceNo|accountNumber|folioNo|referenceTransactionNo|referencePackageTransactionNo|cashierId)$/.test(k)?{length:v.length,sha256:await digest(v)}:await summarize(v,depth+1)])));
            return value;
          };
          let taxData:unknown,taxFailure:unknown;if(!payload.invoiceLedgerProbe)try{taxData=await reader.invoiceTaxData(invoice.id);}catch(error){taxFailure=error instanceof OperaError?{code:error.code,status:error.upstreamStatus,reason:error.providerMessage}:{code:'unavailable'};}
          return JSON.stringify({postings:await summarize(packet.postings),arDetails:await summarize(packet.arDetails),invoiceCashier:await summarize(invoiceRecord(packet.invoice).cashierInfo),extra:await summarize(extra),taxData:await summarize(taxData),taxFailure});
        }
        // Exact selected-job diagnostic: renders in memory, never saves a PDF or changes the job.
        if(payload.invoiceRenderProbe){
          try{const model=await readInvoiceModel(makeReader(runtime,hotel),invoice);
            const assets=await backendRpc<InvoiceAssets>(runtime,'ar_invoice_template',{p_hotel:hotel,p_version:job.invoice_template_version});
            const bytes=await renderInvoice(model,assets);return JSON.stringify({ok:true,hotel,byteCount:bytes.length,voucherLength:model.voucher.length,lineCount:model.lines.length,vat:model.vat,nonTaxable:model.nonTaxable,taxableNet:model.taxableNet,gross:model.gross,outstanding:model.outstanding});
          }catch(error){return JSON.stringify({ok:false,hotel,error:error instanceof Error&&/^document_[a-z_]+$/.test(error.message)?error.message:'invalid_response'});}
        }
        if(payload.invoiceReadAudit)return JSON.stringify(await auditInvoiceRead(makeReader(runtime,hotel),invoice));
        if(payload.invoiceModelProbe){const packet=await readInvoicePacket(makeReader(runtime,hotel),invoice,true);try{const model=invoiceModel(packet);return JSON.stringify({hotel:model.hotel,voucherLength:model.voucher.length,voucherHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(model.voucher.replace(/\s+/g,''))))].map(n=>n.toString(16).padStart(2,'0')).join(''),headerIds:await Promise.all((invoiceRecord(packet.reservation).reservationIdList as unknown[]).map(invoiceRecord).map(async r=>({type:r.type,length:String(r.id??'').length,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(r.id??'').replace(/\s+/g,''))))].map(n=>n.toString(16).padStart(2,'0')).join('')}))),lines:model.lines.length,debit:model.debit,credit:model.credit,gross:model.gross,vat:model.vat,taxableNet:model.taxableNet,nonTaxable:model.nonTaxable,outstanding:model.outstanding,referenceHash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(model.lines.map(l=>l.reference).sort().join('|'))))].map(n=>n.toString(16).padStart(2,'0')).join('')});}catch(error){const rows=(invoiceRecord(packet.postings).invoicePostingsDetails as unknown[]).map(invoiceRecord),net=packet.taxRows.map(invoiceRecord).map(r=>invoiceRecord(r.posting)),ids=new Set(rows.map(r=>String(r.transactionNo))),checks=new Set(rows.map(r=>String(r.checkNo)));return JSON.stringify({hotel,error:error instanceof Error?error.message:'invalid',rows:rows.length,rootsFound:net.filter(r=>ids.has(String(r.transactionNo))).length,childrenById:net.filter(r=>ids.has(String(r.referencePackageTransactionNo))).length,childrenByCheck:net.filter(r=>checks.has(String(r.referencePackageTransactionNo))).length,sampleRoots:net.filter(r=>ids.has(String(r.transactionNo))).slice(0,2).map(r=>({id:r.transactionNo,reference:r.reference,check:r.checkNo,package:r.referencePackageTransactionNo})),sampleChildren:net.filter(r=>r.referencePackageTransactionNo).slice(0,2).map(r=>({id:r.transactionNo,package:r.referencePackageTransactionNo}))});}}
        return JSON.stringify(await readInvoiceFolioContract(makeReader(runtime,hotel),invoice));
      });
    }
    if(payload.financialHistory){if(typeof payload.actorId!=='string'||!/^[0-9a-f-]{36}$/.test(payload.actorId))throw Error('invalid_workflow_parameters');const result=await runFinancialHistory(runtime,{actor:payload.actorId,runId},step);if(result.status==='succeeded'){try{await step.do('period-summary-precompute',{retries:{limit:0,delay:'5 seconds'},timeout:'10 minutes'},()=>warmPeriodSummaries(runtime));}catch{/* Published source data remains successful; maintenance retries this optional cache. */}}return result;}
    if(payload.financialProbe)return step.do('financial-read-diagnostic',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>runFinancialDiagnostic(runtime,hotel));
    if(payload.documentJob)return runDocumentJob(runtime,runId,step);
    if(payload.pdfProbe)return step.do('pdf-probe',{retries:{limit:0,delay:'5 seconds'},timeout:'5 minutes'},async()=>JSON.stringify(await probeOpera(runtime,hotel,accountId,async(bytes,expected)=>{
      if(!runtime.SUPABASE_URL||!runtime.SUPABASE_SECRET_KEY)throw new Error('private_storage_unavailable');
      for(const [extension,body,type]of [['pdf',new Uint8Array(bytes).buffer,'application/pdf'],['json',JSON.stringify(expected),'application/json']] as const){
        await writeManagedStorage(runtime,`validation/${runId}/${hotel}.${extension}`,typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body),type);
      }
    })));
    if(payload.historyAudit){
      if(!accountId)throw new Error('audit_account_required');
      if(payload.historyAuditOffset!==undefined){const offset=payload.historyAuditOffset;return step.do('history-window-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistoryWindow(makeReader(runtime,hotel),hotel,accountId,offset));}
      return step.do('history-count-audit',{retries:{limit:0,delay:'5 seconds'},timeout:'15 minutes'},()=>auditHistory(makeReader(runtime,hotel),hotel,accountId,payload.historyAuditLimit));
    }
    try {
      const reader=makeReader(runtime,hotel);
      let acquired=false;
      for(let attempt=0;attempt<120&&!acquired;attempt++){
        acquired=await step.do(`claim-${attempt}`,async()=>{
          const ok=await backendRpc<boolean>(runtime,'ar_claim_refresh',{p_run_id:runId});
          if(ok)return true;
          // Cloudflare enforces one instance for runId. Resume after an ambiguous claim
          // response may renew only this instance's own still-active database lease.
          const job=await backendRpc<{status:string}>(runtime,'ar_refresh_job',{p_run_id:runId});
          if(job.status==='running')return backendRpc<boolean>(runtime,'ar_renew_refresh',{p_run_id:runId});
          if(job.status==='succeeded')return false;
          if(job.status==='failed')throw new Error('refresh_run_failed');
          return false;
        });
        if(!acquired)await step.sleep(`wait-${attempt}`,'15 seconds');
      }
      if(!acquired)throw new Error('refresh_queue_timeout');
      const businessDate=await step.do('business-date',{retries:{limit:1,delay:'5 seconds',backoff:'constant'}},()=>readBusinessDate(reader,hotel));
      const ids=await step.do('discovery',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
        if(accountId)return [accountId];
        return discoverAccountIds(reader,hotel);
      });
      const invalidAccounts=await stageRefreshAccounts(runtime,runId,hotel,ids,businessDate,step,reader);
      if(payload.validateOnly){
        await step.do('finish-validation-only',async()=>{await backendRpc(runtime,'ar_fail_refresh',{p_run_id:runId,p_error_code:'validation_only_finished'});return {validated:invalidAccounts===0};});
        return {hotel,status:invalidAccounts?'validation_failed':'validated',accounts:ids.length};
      }
      if(invalidAccounts)throw new OperaError('invalid_response',undefined,'account_validation');
      await step.do('verify-membership-and-publish',{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'},async()=>{
        const job=await backendRpc<{status:string}>(runtime,'ar_refresh_job',{p_run_id:runId});
        if(job.status==='succeeded')return {accounts:ids.length};
        if(!await backendRpc<boolean>(runtime,'ar_renew_refresh',{p_run_id:runId}))throw new Error('refresh_lease_expired');
        if(!accountId){const after=await discoverAccountIds(reader,hotel);const expected=new Set(ids);if(after.length!==ids.length||after.some(id=>!expected.has(id)))throw new OperaError('pagination_changed');}
        await backendRpc(runtime,'ar_publish_refresh',{p_run_id:runId,p_expected_accounts:ids.length});return {accounts:ids.length};
      });
      await postPublicationMaintenance(runtime,payload,step);
      return {hotel,status:'succeeded',accounts:ids.length};
    }catch(error){
      const serialized=error instanceof Error?error.message.match(/^OperaError: ([a-z_]+)(?::([a-z_]+))?$/):null;
      const code=error instanceof OperaError?`${error.code}${error.stage?'_'+error.stage:''}`:serialized?`${serialized[1]}${serialized[2]?'_'+serialized[2]:''}`:'refresh_failed';
      await step.do('record-failure',async()=>{await backendRpc(runtime,'ar_fail_refresh',{p_run_id:runId,p_error_code:code});return {status:'failed'};});
      throw new Error(code);
    }
  }
}
