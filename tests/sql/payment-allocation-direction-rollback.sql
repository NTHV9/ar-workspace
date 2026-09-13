-- Synthetic-only regression for source-signed and magnitude-only amountUsed/balance.
-- The first assertion fails on the pre-fix report; all source writes roll back.
begin;
do $$
declare
 actor uuid;scope text:='SYNTHETIC-ALLOCATION-'||gen_random_uuid();run uuid:=gen_random_uuid();next_run uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();
 r jsonb;totals jsonb;before_sources jsonb;before_history bigint;before_links bigint;example record;directed record;k text;original_transfer text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'synthetic allocation test requires approved actor';end if;
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at)
 select id,actor,'KAT','1905-01-01','1905-01-31','backfill','synthetic-allocation-proof','succeeded',true,stamp from(values(run),(next_run))v(id);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id)
 values('KAT',scope,'Synthetic allocation account','SYNTHETIC_ALLOCATION',stamp,run);
 insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
 values(run,'KAT','1905-01-01','1905-01-31',stamp,1,1,1,0,true,true,'synthetic-allocation-proof');
 insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'101','1904-12-15',100,100,30,'{"invoiceNo":"201","invoiceType":"Credit","entryClassification":"credit","collectionRole":"standalone"}','observed',stamp,stamp,stamp,run);
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'301','1905-01-03',-100,70,30,'{"transactionId":"301","amount":"-100.00","appliedAmount":"70.00","unallocatedAmount":"30.00","transfer":"none_reported","classification":"unknown","reversal":"unknown"}','observed',stamp,stamp,stamp,run);

 -- Independently known posting credits remain separate from the current allocation.
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03');totals:=r->'summary'->'paymentTotals';
 if totals->>'creditPostings' is distinct from '100.00' or totals->>'debitPostings' is distinct from '0.00'
  or totals->>'currentlyApplied' is distinct from '70.00' or totals->>'currentlyUnallocated' is distinct from '30.00'
  or r->'summary'->>'amount' is distinct from '-100.00' or r->'summary'->>'receiptClassification' is distinct from 'unknown'
 then raise exception 'positive amountUsed credit allocation direction incorrect';end if;
 select jsonb_agg(to_jsonb(p) order by transaction_id) into before_sources from ar_private.financial_payments p where account_id=scope;
 select count(*) into before_history from ar_private.financial_changes where account_id=scope;
 select count(*) into before_links from ar_private.financial_applications where account_id=scope;
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' or r->'summary'->'amount' is distinct from 'null'::jsonb or r->>'unknownMappings' is distinct from '1'
  or r->'rows' is distinct from '[]'::jsonb then raise exception 'amountUsed fabricated invoice application proof';end if;
 if (select jsonb_agg(to_jsonb(p) order by transaction_id) from ar_private.financial_payments p where account_id=scope) is distinct from before_sources
  or (select count(*) from ar_private.financial_changes where account_id=scope)<>before_history
  or (select count(*) from ar_private.financial_applications where account_id=scope)<>before_links then raise exception 'read normalization rewrote source/history/links';end if;

 -- Only an actual application with exact scoped identity can verify the payment.
 insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'101','301',70,'1904-12-15','{"applicationDate":null}','observed',stamp,stamp,stamp,run);
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'amount' is distinct from '70.00' or r->'summary'->>'count' is distinct from '1'
  or r->'rows'->0->>'invoiceId' is distinct from '101' or r->'rows'->0->>'verified' is distinct from 'true' then raise exception 'positive amountUsed exact application did not verify';end if;

 -- Both raw component signs carry the same allocation direction once magnitudes reconcile.
 for example in select * from(values
  (-100::numeric,70::numeric,30::numeric,70::numeric,30::numeric),(-100,-70,-30,70,30),(-100,-70,30,70,30),(-100,70,-30,70,30),
  (-100,100,0,100,0),(-100,-100,0,100,0),(-100,0,100,0,100),(-100,0,-100,0,100),
  (100,70,30,-70,-30),(100,-70,-30,-70,-30),(100,70,-30,-70,-30),(100,-70,30,-70,-30),
  (0,0,0,0,0),(-0.30,0.10,0.20,0.10,0.20),
  (null,70,30,null,null),(-100,null,30,null,null),(-100,70,null,null,null),
  (-100,70,29,null,null),(-100,101,0,null,null),(0,10,-10,null,null),
  ('NaN'::numeric,0,0,null,null),('Infinity'::numeric,'Infinity'::numeric,0,null,null)
 )v(posted,used,balance,expected_applied,expected_unallocated) loop
  select * into directed from ar_private.financial_payment_allocation(example.posted,example.used,example.balance);
  if directed.applied_amount is distinct from example.expected_applied or directed.unallocated_amount is distinct from example.expected_unallocated then raise exception 'allocation helper accepted incorrect direction/reconciliation';end if;
 end loop;

 -- Report and dashboard share the same direction without touching the original JSON.
 update ar_private.financial_payments set applied_amount=-70,unallocated_amount=-30 where hotel='KAT' and account_id=scope;
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03');
 if r->'summary'->'paymentTotals'->>'currentlyApplied' is distinct from '70.00' or r->'summary'->'paymentTotals'->>'currentlyUnallocated' is distinct from '30.00' then raise exception 'signed raw components changed credit allocation';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'amount' is distinct from '70.00' then raise exception 'signed raw components changed invoice mapping';end if;

 -- Debit postings reduce allocation and stay separate from newly recorded payment credits.
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'302','1905-01-03',20,15,5,'{"transfer":"none_reported","classification":"unknown","reversal":"unknown"}','observed',stamp,stamp,stamp,run);
 insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 values('KAT',scope,'101','302',-15,'1904-12-15','{"applicationDate":null}','observed',stamp,stamp,stamp,run);
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03',0,1);totals:=r->'summary'->'paymentTotals';
 if totals->>'creditPostings' is distinct from '100.00' or totals->>'debitPostings' is distinct from '20.00'
  or totals->>'currentlyApplied' is distinct from '55.00' or totals->>'currentlyUnallocated' is distinct from '25.00'
  or r->'summary'->>'amount' is distinct from '-80.00' or r->>'total' is distinct from '2' or jsonb_array_length(r->'rows')<>1 then raise exception 'debit correction counted as cash or pagination changed totals';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'amount' is distinct from '55.00' or r->'summary'->>'signedCorrections' is distinct from '-20.00'
  or r->'summary'->>'count' is distinct from '1' or r->'rows'->0->>'paymentCount' is distinct from '1' then raise exception 'debit correction distorted paid invoice count/net allocation';end if;

 -- Missing or inconsistent components hide only the allocation totals, not known postings.
 for example in select * from(values(70::numeric,null::numeric),(null,30),(70,29),(101,0))v(used,balance) loop
  update ar_private.financial_payments set applied_amount=example.used,unallocated_amount=example.balance where hotel='KAT' and account_id=scope and transaction_id='301';
  r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03');totals:=r->'summary'->'paymentTotals';
  if totals->>'creditPostings' is distinct from '100.00' or totals->>'debitPostings' is distinct from '20.00'
   or totals->'currentlyApplied' is distinct from 'null'::jsonb or totals->'currentlyUnallocated' is distinct from 'null'::jsonb then raise exception 'invalid components became zero or hid independent postings';end if;
  r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
  if r->>'complete' is distinct from 'false' or r->'summary'->'amount' is distinct from 'null'::jsonb then raise exception 'invalid components accepted as mapped';end if;
 end loop;
 update ar_private.financial_payments set amount=null,applied_amount=70,unallocated_amount=30 where hotel='KAT' and account_id=scope and transaction_id='301';
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03');totals:=r->'summary'->'paymentTotals';
 if totals->'creditPostings' is distinct from 'null'::jsonb or totals->'currentlyApplied' is distinct from 'null'::jsonb or totals->'currentlyUnallocated' is distinct from 'null'::jsonb then raise exception 'missing posting fabricated allocation direction';end if;
 update ar_private.financial_payments set amount=-100 where hotel='KAT' and account_id=scope and transaction_id='301';

 -- Unrelated account/payment IDs cannot replace an actual link even for matching money.
 update ar_private.financial_applications set payment_id='999' where hotel='KAT' and account_id=scope and payment_id='301';
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' then raise exception 'unrelated payment identity accepted';end if;
 update ar_private.financial_applications set payment_id='301' where hotel='KAT' and account_id=scope and payment_id='999';
 update ar_private.financial_applications set last_observed_at=stamp-interval '1 second' where hotel='KAT' and account_id=scope and payment_id='301';
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' then raise exception 'stale allocation accepted';end if;
 update ar_private.financial_applications set last_observed_at=stamp where hotel='KAT' and account_id=scope and payment_id='301';
 update ar_private.financial_payments set source_data=jsonb_set(source_data,'{transfer}','"in"'),run_id=next_run where hotel='KAT' and account_id=scope and transaction_id='301';
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-03','1905-01-03','KAT',scope);
 if r->>'complete' is distinct from 'false' then raise exception 'transfer payment mapping guard removed';end if;
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-01-03','1905-01-03');
 if r->'summary'->'paymentTotals'->>'transferRows' is distinct from '1' then raise exception 'transfer marker lost';end if;
 r:=public.ar_financial_report(actor,'payments','KAT',scope,null,'1905-02-01','1905-02-01');
 if r->'summary'->'paymentTotals'->'currentlyApplied' is distinct from 'null'::jsonb then raise exception 'missing period coverage became zero allocation';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1905-01-04','1905-01-04','KAT',scope);
 if r->>'complete' is distinct from 'true' or r->'summary'->>'amount' is distinct from '0.00' then raise exception 'payment date cohort changed';end if;
 if has_function_privilege('anon','ar_private.financial_payment_allocation(numeric,numeric,numeric)','execute')
  or has_function_privilege('authenticated','ar_private.financial_payment_allocation(numeric,numeric,numeric)','execute')
  or has_function_privilege('service_role','ar_private.financial_payment_allocation(numeric,numeric,numeric)','execute')
  or has_function_privilege('authenticated','public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)','execute')
  or has_table_privilege('service_role','ar_private.financial_payments','select') then raise exception 'allocation correction exposed private access';end if;
end$$;
rollback;
select 'Payment allocation direction, exact reconciliation, independent postings, immutable evidence and mapping guards passed; rolled back' as result;
