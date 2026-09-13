-- Synthetic observations only. Both old and new normalizer payloads are covered; all writes roll back.
begin;
do $$
declare
 actor uuid;scope text:='SYNTHETIC-INVOICE-TYPE-'||gen_random_uuid();run uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
 r jsonb;inv jsonb;rows jsonb;pay jsonb;link jsonb;before_sources jsonb;before_history bigint;k text;
 next_run uuid;coverage jsonb;ids text[];batch jsonb;new_scope text:=scope||'-NEW';
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'synthetic invoice type test requires approved actor';end if;
 inv:=jsonb_build_object('hotel','KAT','accountId',scope,'kind','invoice','transactionId','101','transactionDate','1904-01-02','postingDate',null,'revenueDate',null,'transferDate',null,
  'currency','THB','transferredIn',false,'transferredOut',false,'invoiceNo','201','folioNo','401','invoiceType','Credit','originalAmount','100.00','currentAmount','100.00',
  'cumulativePayments','0.00','openAmount','100.00','closeDate',null,'compressed',false,'parentInvoiceNo',null,'collectionRole','standalone','entryClassification','credit');
 rows:=jsonb_build_array(inv,
  inv||'{"transactionId":"102","originalAmount":"-25.00","currentAmount":"-25.00","openAmount":"-25.00"}',
  inv||'{"transactionId":"103","originalAmount":"0.00","currentAmount":"0.00","openAmount":"0.00"}',
  inv||'{"transactionId":"104","originalAmount":"50.00","currentAmount":"50.00","openAmount":"50.00","compressed":true,"collectionRole":"parent"}',
  inv||'{"transactionId":"105","originalAmount":"50.00","currentAmount":"50.00","openAmount":"50.00","parentInvoiceNo":"201","collectionRole":"child"}',
  inv||'{"transactionId":"0","originalAmount":"999.00","currentAmount":"999.00","openAmount":"999.00","invoiceType":"OldBalance","entryClassification":"opening_balance"}');
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at)
 values(run,actor,'KAT','1904-01-01','1904-01-31','backfill','synthetic-invoice-code-proof','succeeded',true,stamp);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id)
 values('KAT',scope,'Synthetic invoice code account','SYNTHETIC_CODE',stamp,run);
 -- Represents a period already published before the classification correction.
 insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
 values(run,'KAT','1904-01-01','1904-01-31',stamp,1,6,0,0,true,true,'synthetic-invoice-code-proof');
 insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,cumulative_payments,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select 'KAT',scope,v->>'transactionId',(v->>'transactionDate')::date,(v->>'originalAmount')::numeric,(v->>'currentAmount')::numeric,(v->>'cumulativePayments')::numeric,(v->>'openAmount')::numeric,v,'observed',stamp,stamp,stamp,run from jsonb_array_elements(rows)v;
 select jsonb_agg(to_jsonb(i) order by transaction_id) into before_sources from ar_private.financial_invoice_entries i where account_id=scope;
 select count(*) into before_history from ar_private.financial_changes where account_id=scope;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',scope,null,'1904-01-01','1904-01-31',0,2);
 if r->'summary'->>'amount' is distinct from '125.00' or r->'summary'->>'invoiceCount' is distinct from '4' or r->>'total' is distinct from '6'
  or r->'summary'->>'compressedChildren' is distinct from '1' or r->'summary'->>'openingBalances' is distinct from '1' or r->'summary'->>'credits' is distinct from '0'
  or r->'summary'->>'mappingUnverified' is distinct from '4' or r->'summary'->>'mappingVerified' is distinct from '0' or jsonb_array_length(r->'rows')<>2
 then raise exception 'legacy Credit signed totals/counts/exclusions/mapping/pagination incorrect';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',scope,null,'1904-01-02','1904-01-02');
 if exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'invoiceType'='Credit' and (v->>'entryClassification' is distinct from 'invoice' or v->>'mappingVerified' is distinct from 'false'))
  or not exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='102' and v->>'originalAmount'='-25.00')
  or not exists(select 1 from jsonb_array_elements(r->'rows')v where v->>'transactionId'='103' and v->>'originalAmount'='0.00') then raise exception 'effective rows lost source type/sign or fabricated mapping';end if;
 r:=public.ar_financial_report(actor,'applications','KAT',scope,null,'1904-01-01','1904-01-31');
 if r->'summary'->'amount' is distinct from 'null'::jsonb or r->'coverage'->>'complete' is distinct from 'false' or r->'summary'->>'mappingUnverified' is distinct from '4' then raise exception 'legacy unmapped Credit applications became verified zero';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',scope,null,'1904-02-01','1904-02-01');
 if r->>'total' is distinct from '0' or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'classification bypassed source date/coverage guards';end if;
 if (select jsonb_agg(to_jsonb(i) order by transaction_id) from ar_private.financial_invoice_entries i where account_id=scope) is distinct from before_sources
  or (select count(*) from ar_private.financial_changes where account_id=scope)<>before_history then raise exception 'effective report rewrote stored source/history';end if;

 -- Only the established invoice code/classification pair is reinterpreted. Other absent facts stay absent.
 if ar_private.financial_invoice_effective(inv)-'entryClassification' is distinct from inv-'entryClassification'
  or ar_private.financial_invoice_effective(inv)->>'entryClassification' is distinct from 'invoice'
  or not ar_private.financial_row_valid('invoice',inv,'KAT',scope)
  or not ar_private.financial_row_valid('invoice',inv||'{"entryClassification":"invoice"}','KAT',scope) then raise exception 'dual-version Credit contract failed';end if;
 foreach k in array array['invoiceType','entryClassification','collectionRole','compressed','originalAmount','currency','transactionDate'] loop
  if ar_private.financial_row_valid('invoice',inv-k,'KAT',scope) then raise exception 'missing required source field accepted: %',k;end if;
 end loop;
 if ar_private.financial_invoice_effective(inv-'invoiceType') is distinct from inv-'invoiceType'
  or ar_private.financial_invoice_effective(inv-'entryClassification') is distinct from inv-'entryClassification'
  or ar_private.financial_invoice_effective(inv||'{"invoiceType":"FutureCode"}') is distinct from inv||'{"invoiceType":"FutureCode"}'
  or ar_private.financial_row_valid('invoice',inv||'{"invoiceType":"Normal"}','KAT',scope)
  or ar_private.financial_row_valid('invoice',inv||'{"invoiceType":"OldBalance","entryClassification":"invoice"}','KAT',scope)
  or ar_private.financial_row_valid('invoice',inv||'{"originalAmount":100}','KAT',scope) then raise exception 'unknown code or malformed money was promoted';end if;
 if not ar_private.financial_row_valid('invoice',inv||'{"invoiceType":"Normal","entryClassification":"invoice","originalAmount":"-25.00"}','KAT',scope)
  or not ar_private.financial_row_valid('invoice',inv||'{"invoiceType":"PasserBy","entryClassification":"invoice"}','KAT',scope) then raise exception 'other known invoice codes changed';end if;

 -- A payment amount alone supplies no allocation proof, including for corrected legacy Credit rows.
 pay:=jsonb_build_object('hotel','KAT','accountId',scope,'kind','payment','transactionId','301','transactionDate','1904-01-03','postingDate',null,'revenueDate',null,'transferDate',null,
  'currency','THB','transferredIn',false,'transferredOut',false,'transactionCode','9000','amount','-20.00','appliedAmount','-20.00','unallocatedAmount','0.00','transfer','none_reported','classification','unknown','reversal','unknown');
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'301','1904-01-03',-20,-20,0,pay,'observed',stamp,stamp,stamp,run);
 r:=public.ar_dashboard_payment_invoices(actor,'1904-01-03','1904-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' or r->'summary'->'count' is distinct from 'null'::jsonb or r->>'unknownMappings' is distinct from '1' then raise exception 'unmapped legacy Credit payment became known';end if;
 -- Independent, observed allocation evidence is explicitly supplied by this fixture, never generated by the migration.
 link:=jsonb_build_object('hotel','KAT','accountId',scope,'invoiceTransactionId','101','paymentTransactionId','301','invoiceNo','201','appliedAmount','20.00','currency','THB',
  'invoiceTransactionDate','1904-01-02','invoicePostingDate',null,'invoiceCloseDate',null,'applicationDate',null,'applicationEventId',null);
 insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'101','301',20,'1904-01-02',link,'observed',stamp,stamp,stamp,run);
 r:=public.ar_dashboard_payment_invoices(actor,'1904-01-03','1904-01-03','KAT',scope);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'count' is distinct from '1' or r->'summary'->>'amount' is distinct from '20.00'
  or r->'rows'->0->>'invoiceId' is distinct from '101' then raise exception 'observed allocation did not include legacy Credit invoice';end if;
 -- Reconciliation and source freshness remain mandatory after classification correction.
 update ar_private.financial_payments set applied_amount=-21 where account_id=scope;
 r:=public.ar_dashboard_payment_invoices(actor,'1904-01-03','1904-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'unreconciled allocation accepted';end if;
 update ar_private.financial_payments set applied_amount=-20,last_observed_at=stamp+interval '1 second' where account_id=scope;
 r:=public.ar_dashboard_payment_invoices(actor,'1904-01-03','1904-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' then raise exception 'stale allocation accepted';end if;

 -- Fresh worker payloads enter the existing mapping workflow; legacy running jobs retain their raw stage contract.
 next_run:=(public.ar_financial_request(actor,gen_random_uuid(),'{"hotel":"KAT","reason":"backfill","from":"1904-01-01","to":"1904-01-31"}','1904-01-01','1904-01-31','synthetic-invoice-code-proof')->>'id')::uuid;
 perform public.ar_financial_claim(actor,next_run);perform public.ar_financial_discovery_set(actor,next_run,array[scope,new_scope]);
 perform public.ar_financial_stage_batch(actor,next_run,scope,'invoice',0,rows);
 coverage:=jsonb_build_object('query',jsonb_build_object('hotel','KAT','accountId',scope,'start','1904-01-01','end','1904-01-31','kinds','["invoice","payment"]'::jsonb),
  'observedAt',stamp,'pagination','complete','pages',1,'members',6,'roots',5,'reportedRoots',5,'dateSemantics','unverified','financialClassification','unverified',
  'completeForFinancialPeriod',false,'missingTransactionDates',0,'outsideRequestedTransactionDates',0,'unknownPrimaryAmounts',0);
 r:=public.ar_financial_history_ready(actor,next_run,scope,'{"name":"Synthetic legacy contract","type":"SYNTHETIC_CODE","accountNo":null}',coverage);
 if r->>'mappingCount' is distinct from '0' then raise exception 'legacy raw stage contract was reinterpreted';end if;
 perform public.ar_financial_history_finalize(actor,next_run,scope);
 select jsonb_agg(ar_private.financial_invoice_effective(v)||jsonb_build_object('accountId',new_scope) order by v->>'transactionId') into rows from jsonb_array_elements(rows)v;
 perform public.ar_financial_stage_batch(actor,next_run,new_scope,'invoice',0,rows);
 r:=public.ar_financial_history_ready(actor,next_run,new_scope,'{"name":"Synthetic corrected contract","type":"SYNTHETIC_CODE","accountNo":null}',jsonb_set(coverage,'{query,accountId}',to_jsonb(new_scope)));
 if r->>'mappingCount' is distinct from '4' then raise exception 'new Credit invoice mapping work omitted signed or zero entities';end if;
 begin perform public.ar_financial_history_finalize(actor,next_run,new_scope);raise exception 'new Credit mapping skipped';exception when others then if sqlerrm<>'financial_mapping_incomplete' then raise;end if;end;
 batch:=public.ar_financial_mapping_batch_get(actor,next_run,new_scope,0);
 select array_agg(v->>'transactionId' order by v->>'transactionId') into ids from jsonb_array_elements(batch->'invoices')v;
 if ids is distinct from array['101','102','103','104'] then raise exception 'mapping includes child/old balance or drops signed Credit';end if;
 -- Explicit successful empty allocation responses reconcile with current=open and cumulativePayments=0 for all four.
 perform public.ar_financial_mapping_batch_save(actor,next_run,new_scope,0,ids,ids,'[]','[]');
 perform public.ar_financial_history_finalize(actor,next_run,new_scope);
 perform public.ar_financial_publish(actor,next_run,array[scope,new_scope]);
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',new_scope,null,'1904-01-01','1904-01-31');
 if r->'summary'->>'amount' is distinct from '125.00' or r->'summary'->>'mappingVerified' is distinct from '4' then raise exception 'new Credit publication incorrect';end if;
 r:=public.ar_financial_report(actor,'applications','KAT',scope,null,'1904-01-01','1904-01-31');
 if r->'summary'->>'mappingUnverified' is distinct from '4' or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'legacy publish manufactured mapping verification';end if;

 if has_function_privilege('anon','ar_private.financial_invoice_effective(jsonb)','execute')
  or has_function_privilege('authenticated','ar_private.financial_invoice_effective(jsonb)','execute')
  or has_function_privilege('service_role','ar_private.financial_invoice_effective(jsonb)','execute')
  or has_function_privilege('authenticated','public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)','execute')
  or has_function_privilege('anon','public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)','execute')
  or has_table_privilege('service_role','ar_private.financial_report_rows','select') then raise exception 'classification correction exposed private reads';end if;
end$$;
rollback;
select 'Invoice type legacy/new contracts, signed totals, immutable evidence, allocation proof and permissions passed; rolled back' as result;
