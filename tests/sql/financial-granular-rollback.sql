begin;
do $$
declare actor uuid;account text:='SYNTHETIC-GRANULAR-'||gen_random_uuid();input jsonb;run uuid;rows jsonb;coverage jsonb;result jsonb;batch jsonb;ids text[];
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 input:='{"hotel":"KAT","reason":"backfill","from":"1901-01-01","to":"1901-01-31"}';
 run:=(public.ar_financial_request(actor,gen_random_uuid(),input,'1901-01-01','1901-01-31','synthetic-proof')->>'id')::uuid;
 if public.ar_financial_run_get(actor,run)->>'stepsVersion'<>'2' then raise exception 'new run version missing';end if;
 perform public.ar_financial_claim(actor,run);perform public.ar_financial_discovery_set(actor,run,array[account]);
 select jsonb_agg(jsonb_build_object('hotel','KAT','accountId',account,'kind','invoice','transactionId',n::text,'transactionDate','1901-01-02','postingDate',null,'revenueDate',null,'transferDate',null,'currency','THB','transferredIn',false,'transferredOut',false,
 'invoiceNo',(n+100)::text,'folioNo',(n+200)::text,'invoiceType','Normal','originalAmount','100.00','currentAmount','100.00','cumulativePayments','0.00','openAmount','100.00','closeDate',null,'compressed',false,'parentInvoiceNo',null,'collectionRole','standalone','entryClassification','invoice') order by n) into rows from generate_series(101,123)n;
 perform public.ar_financial_stage_batch(actor,run,account,'invoice',0,rows);
 coverage:=jsonb_build_object('query',jsonb_build_object('hotel','KAT','accountId',account,'start','1901-01-01','end','1901-01-31','kinds','["invoice","payment"]'::jsonb),'observedAt',clock_timestamp(),'pagination','complete','pages',2,'members',23,'roots',23,'reportedRoots',23,'dateSemantics','unverified','financialClassification','unverified','completeForFinancialPeriod',false,'missingTransactionDates',0,'outsideRequestedTransactionDates',0,'unknownPrimaryAmounts',0);
 result:=public.ar_financial_history_ready(actor,run,account,'{"name":"Synthetic large history Account","type":"SYNTHETIC","accountNo":null}',coverage);if result->>'mappingCount'<>'23' then raise exception 'source preparation count';end if;
 begin perform public.ar_financial_history_finalize(actor,run,account);raise exception 'partial mapping finalized';exception when others then if sqlerrm<>'financial_mapping_incomplete' then raise;end if;end;
 for n in 0..2 loop
  batch:=public.ar_financial_mapping_batch_get(actor,run,account,n);if jsonb_array_length(batch->'invoices')<>(case n when 2 then 3 else 10 end) then raise exception 'mapping batch not bounded';end if;
  select array_agg(v->>'transactionId' order by v->>'transactionId') into ids from jsonb_array_elements(batch->'invoices')v;
  begin perform public.ar_financial_mapping_batch_save(actor,run,account,n,array['999'],array['999'],'[]','[]');raise exception 'wrong scope batch accepted';exception when others then if sqlerrm<>'financial_mapping_batch_invalid' then raise;end if;end;
  perform public.ar_financial_mapping_batch_save(actor,run,account,n,ids,ids,'[]','[]');perform public.ar_financial_mapping_batch_save(actor,run,account,n,ids,ids,'[]','[]');
  if public.ar_financial_mapping_batch_get(actor,run,account,n)->>'saved'<>'true' then raise exception 'mapping retry does not use receipt';end if;
  begin perform public.ar_financial_mapping_batch_save(actor,run,account,n,ids,'{}','[]','[]');raise exception 'changed batch retry accepted';exception when others then if sqlerrm<>'financial_mapping_batch_conflict' then raise;end if;end;
 end loop;
 result:=public.ar_financial_history_finalize(actor,run,account);if result->>'invoices'<>'23' or result->>'applications'<>'0' then raise exception 'finalize counts';end if;
 perform public.ar_financial_history_finalize(actor,run,account);result:=public.ar_financial_publish(actor,run,array[account]);if result->>'status'<>'succeeded' then raise exception 'full publication';end if;
 if exists(select 1 from ar_private.financial_mapping_work where run_id=run) or exists(select 1 from ar_private.financial_stage_batches where run_id=run) then raise exception 'temporary mapping/history batches retained';end if;
 result:=public.ar_financial_report(actor,'invoice_entries','KAT',account,null,'1901-01-01','1901-01-31');if result->'summary'->>'amount'<>'2300.00' or result->'summary'->>'mappingVerified'<>'23' then raise exception 'bounded workflow altered financial proof';end if;
 if has_function_privilege('anon','public.ar_financial_mapping_batch_save(uuid,uuid,text,integer,text[],text[],jsonb,jsonb)','execute') then raise exception 'batch service permission';end if;
end$$;
rollback;
select 'Granular financial history/10-row batches/identity/replay/atomic publish/cleanup checks passed and rolled back' as result;
