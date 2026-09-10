-- Synthetic-only transaction. Run after the financial ingestion migration; never commits.
begin;
do $$
declare
 actor uuid;other uuid:=gen_random_uuid();command uuid:=gen_random_uuid();run uuid;second_run uuid;failed_run uuid;r jsonb;before_publications bigint;
 a text:='SYNTHETIC-FIN-A-'||gen_random_uuid();b text:='SYNTHETIC-FIN-B-'||gen_random_uuid();input jsonb;inv jsonb;pay jsonb;link jsonb;coverage jsonb;ctx jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'synthetic financial test requires approved actor';end if;
 input:='{"hotel":"KAT","reason":"backfill","from":"1901-01-01","to":"1901-01-31"}';
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',a,null,'1901-01-01','1901-01-31');if r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'missing coverage became zero';end if;
 r:=public.ar_financial_request(actor,command,input,'1901-01-01','1901-01-31','synthetic-proof');run:=(r->>'id')::uuid;
 if public.ar_financial_request(actor,command,input,'1901-01-01','1901-01-31','synthetic-proof')->>'id' is distinct from run::text then raise exception 'command duplicated';end if;
 if public.ar_financial_request(actor,gen_random_uuid(),input,'1901-01-01','1901-01-31','synthetic-proof')->>'id' is distinct from run::text then raise exception 'active work not shared';end if;
 begin perform public.ar_financial_command_get(actor,command,input||'{"reason":"manual"}');raise exception 'changed command accepted';exception when others then if sqlerrm<>'financial_command_conflict' then raise;end if;end;
 begin perform public.ar_financial_report(other,'payments');raise exception 'actor bypass';exception when others then if sqlerrm<>'financial_forbidden' then raise;end if;end;
 if not public.ar_financial_claim(actor,run) then raise exception 'claim failed';end if;
 perform public.ar_financial_discovery_set(actor,run,array[a,b]);
 inv:=jsonb_build_object('hotel','KAT','accountId',a,'kind','invoice','transactionId','101','transactionDate','1901-01-02','postingDate',null,'revenueDate',null,'transferDate',null,'currency','THB','transferredIn',false,'transferredOut',false,
  'invoiceNo','201','folioNo','401','invoiceType','Normal','originalAmount','0.30','currentAmount','0.30','cumulativePayments','0.30','openAmount','0.00','closeDate',null,'compressed',false,'parentInvoiceNo',null,'collectionRole','standalone','entryClassification','invoice');
 pay:=jsonb_build_object('hotel','KAT','accountId',a,'kind','payment','transactionId','301','transactionDate','1901-01-03','postingDate',null,'revenueDate',null,'transferDate',null,'currency','THB','transferredIn',false,'transferredOut',false,
  'transactionCode','9000','amount','-0.30','appliedAmount','-0.30','unallocatedAmount','0.00','transfer','none_reported','classification','unknown','reversal','unknown');
 link:=jsonb_build_object('hotel','KAT','accountId',a,'invoiceTransactionId','101','paymentTransactionId','301','invoiceNo','201','appliedAmount','0.30','currency','THB','invoiceTransactionDate','1901-01-02','invoicePostingDate',null,'invoiceCloseDate',null,'applicationDate',null,'applicationEventId',null);
 coverage:=jsonb_build_object('query',jsonb_build_object('hotel','KAT','accountId',a,'start','1901-01-01','end','1901-01-31','kinds','["invoice","payment"]'::jsonb),'observedAt',clock_timestamp(),'pagination','complete','pages',1,'members',2,'roots',2,'reportedRoots',2,'dateSemantics','unverified','financialClassification','unverified','completeForFinancialPeriod',false,'missingTransactionDates',0,'outsideRequestedTransactionDates',0,'unknownPrimaryAmounts',0,'mappingVerified',1,'mappingContractVersion','correlated_v1');
 ctx:='{"name":"Synthetic financial account","type":"SYN_A","accountNo":null}';
 perform public.ar_financial_stage_batch(actor,run,a,'invoice',0,jsonb_build_array(inv));
 perform public.ar_financial_stage_batch(actor,run,a,'invoice',0,jsonb_build_array(inv));
 begin perform public.ar_financial_stage_batch(actor,run,a,'invoice',0,jsonb_build_array(inv||'{"originalAmount":"0.31"}'));raise exception 'changed batch accepted';exception when others then if sqlerrm<>'financial_batch_conflict' then raise;end if;end;
 begin perform public.ar_financial_stage_batch(actor,run,a,'invoice',1,jsonb_build_array(inv||'{"originalAmount":0.30}'));raise exception 'numeric financial amount accepted';exception when others then if sqlerrm<>'financial_row_invalid' then raise;end if;end;
 perform public.ar_financial_stage_batch(actor,run,a,'payment',0,jsonb_build_array(pay));perform public.ar_financial_stage_batch(actor,run,a,'application',0,jsonb_build_array(link));
 begin perform public.ar_financial_account_done(actor,run,a,ctx,'{"invoices":1,"payments":1,"applications":1}',coverage-'members',array['101']);raise exception 'missing coverage counter accepted';exception when others then if sqlerrm<>'financial_coverage_invalid' then raise;end if;end;
 perform public.ar_financial_account_done(actor,run,a,ctx,'{"invoices":1,"payments":1,"applications":1}',coverage,array['101']);
 begin perform public.ar_financial_publish(actor,run,array[a,b]);raise exception 'partial hotel published';exception when others then if sqlerrm<>'financial_stage_incomplete' then raise;end if;end;
 if exists(select 1 from ar_private.financial_invoice_entries where hotel='KAT' and account_id=a) then raise exception 'staging leaked into reports';end if;
 perform public.ar_financial_stage_batch(actor,run,b,'invoice',0,jsonb_build_array(inv||jsonb_build_object('accountId',b,'transactionId','102','originalAmount',null,'cumulativePayments','0.00','openAmount','0.30')));
 perform public.ar_financial_account_done(actor,run,b,ctx||'{"type":"SYN_B"}','{"invoices":1,"payments":0,"applications":0}',jsonb_set(coverage,'{query,accountId}',to_jsonb(b))||'{"members":1,"roots":1,"reportedRoots":1,"unknownPrimaryAmounts":1}',array['102']);
 r:=public.ar_financial_publish(actor,run,array[a,b]);if r->>'invoices' is distinct from '2' or r->>'payments' is distinct from '1' then raise exception 'publication totals invalid';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',a,null,'1901-01-01','1901-01-31');if r->'summary'->>'amount' is distinct from '0.30' or r->'rows'->0->>'transactionDate' is distinct from '1901-01-02' then raise exception 'exact entry amount or original date lost';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',b,null,'1901-01-01','1901-01-31');if r->'summary'->'amount' is distinct from 'null'::jsonb or r->'summary'->>'unknownAmounts' is distinct from '1' then raise exception 'unknown amount became zero';end if;
 r:=public.ar_financial_report(actor,'payments','KAT',a,null,'1901-01-01','1901-01-31');if r->'summary'->>'amount' is distinct from '-0.30' or r->'summary'->>'receiptClassification' is distinct from 'unknown' then raise exception 'payment classified as cash or lost sign';end if;
 if r->'summary'->'paymentTotals'->>'creditPostings' is distinct from '0.30' or r->'summary'->'paymentTotals'->>'currentlyApplied' is distinct from '0.30' or r->'summary'->'paymentTotals'->>'currentlyUnallocated' is distinct from '0.00' then raise exception 'payment credits/application/unallocated separation';end if;
 r:=public.ar_financial_report(actor,'applications','KAT',a,null,'1901-01-01','1901-01-31');if r->'summary'->>'knownAmount' is distinct from '0.30' or r->'summary'->>'dateBasis' is distinct from 'invoice_transaction_date' or r->'rows'->0->'applicationDate' is distinct from 'null'::jsonb then raise exception 'application date fabricated';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',null,'SYN_A','1901-01-01','1901-01-31',0,1);if r->>'total' is distinct from '1' or r->'summary'->>'knownAmount' is distinct from '0.30' then raise exception 'type filter differs from sums';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',a,null,current_date,current_date);if r->>'total' is distinct from '0' then raise exception 'initial import counted today';end if;
 select count(*) into before_publications from ar_private.financial_publications where run_id=run;
 perform public.ar_financial_publish(actor,run,'{}');if (select count(*) from ar_private.financial_publications where run_id=run)<>before_publications then raise exception 'publish replay duplicated';end if;
 if public.ar_financial_fail(actor,run,'financial_test_failure') then raise exception 'failure changed successful publication';end if;
 second_run:=(public.ar_financial_request(actor,gen_random_uuid(),input,'1901-01-01','1901-01-31','synthetic-proof')->>'id')::uuid;
 perform public.ar_financial_claim(actor,second_run);perform public.ar_financial_discovery_set(actor,second_run,array[a]);
 perform public.ar_financial_account_done(actor,second_run,a,ctx,'{"invoices":0,"payments":0,"applications":0}',coverage||'{"members":0,"roots":0,"reportedRoots":0,"mappingVerified":0}','{}');
 begin perform public.ar_financial_publish(actor,second_run,array[a,b]);raise exception 'changed discovery published';exception when others then if sqlerrm<>'financial_stage_incomplete' then raise;end if;end;
 perform public.ar_financial_publish(actor,second_run,array[a]);
 if not exists(select 1 from ar_private.financial_invoice_entries where account_id=a and transaction_id='101' and original_amount=0.30 and source_status='not_observed') then raise exception 'missing invoice changed amount';end if;
 if not exists(select 1 from ar_private.financial_payments where account_id=a and transaction_id='301' and amount=-0.30 and source_status='not_observed') then raise exception 'missing payment inferred reversal or zero';end if;
 if not exists(select 1 from ar_private.financial_applications where account_id=a and invoice_id='101' and applied_amount=0.30 and source_status='not_observed') then raise exception 'missing invoice left mapping falsely current';end if;
 r:=public.ar_financial_report(actor,'invoice_entries','KAT',a,null,'1901-01-01','1901-01-31');if r->'summary'->'amount' is distinct from 'null'::jsonb or r->'summary'->>'notObserved' is distinct from '1' then raise exception 'absent invoice counted as known zero';end if;
 failed_run:=(public.ar_financial_request(actor,gen_random_uuid(),input,'1901-01-01','1901-01-31','synthetic-proof')->>'id')::uuid;
 perform public.ar_financial_claim(actor,failed_run);perform public.ar_financial_discovery_set(actor,failed_run,array[a]);perform public.ar_financial_stage_batch(actor,failed_run,a,'invoice',0,jsonb_build_array(inv));
 update ar_private.financial_runs set lease_until=clock_timestamp()-interval '1 second' where id=failed_run;
 begin perform public.ar_financial_stage_batch(actor,failed_run,a,'payment',0,jsonb_build_array(pay));raise exception 'expired worker staged';exception when others then if sqlerrm<>'financial_lease_invalid' then raise;end if;end;
 perform public.ar_financial_fail(actor,failed_run,'financial_test_failure');
 if exists(select 1 from ar_private.financial_publications where run_id=failed_run) or (select original_amount from ar_private.financial_invoice_entries where account_id=a and transaction_id='101')<>0.30 then raise exception 'failure damaged previous success';end if;
 if (select count(*) from ar_private.financial_changes where account_id=a)<6 then raise exception 'source changes not retained';end if;
 if has_function_privilege('authenticated','public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)','execute') or has_function_privilege('anon','public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer)','execute') or has_table_privilege('service_role','ar_private.financial_payments','select') then raise exception 'financial privilege leak';end if;
end$$;
rollback;
select 'Financial ingestion/source-date/unknown/atomic/lease/permissions checks passed; rolled back' as result;
