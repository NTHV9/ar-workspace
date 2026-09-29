\set ON_ERROR_STOP on
begin;
set local statement_timeout='0';
do $$
declare account_key text; payload jsonb; j uuid:='00000000-0000-4000-8000-000000009291';
begin
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,lease_until)
 values(j,'KAT','manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 for a in 1..105 loop
  account_key:='SYNTHETIC-PUBLISH-'||a;
  select jsonb_build_object('account',jsonb_build_object('hotel','KAT','id',account_key,'name','Synthetic publish account','type','SYNTHETIC','account_no','SYN','open',5000,'over90',0,'items',50,'currency','THB','creditLimit',null,'oldest',10,'agingBuckets','[]'::jsonb,'business_date',current_date),
   'invoices',jsonb_agg(jsonb_build_object('hotel','KAT','account_id',account_key,'id',i::text,'guest','Synthetic guest','invoice_no',i::text,'folio_no',i::text,'transaction_date',current_date-10,'original',100,'open',100,'aging','Up to 30','age',10,'current_amount',100,'applied_amount',0,'collection_role','standalone','compressed',false)),'unconfirmedInvoiceIds','[]'::jsonb)
  into payload from generate_series(1,50) i;
  perform public.ar_stage_account(j,payload);
 end loop;
end$$;
-- Match PostgREST's function-scoped budget; the pre-fix diagnostic used its inherited 8s limit.
set local statement_timeout='15s';
\timing on
select public.ar_publish_refresh('00000000-0000-4000-8000-000000009291',105);
\timing off
do $$ begin
 if not (select 'statement_timeout=15s'=any(proconfig) from pg_proc where oid='public.ar_publish_refresh(uuid,integer)'::regprocedure) then raise exception 'Publication RPC lost its bounded timeout';end if;
 if has_function_privilege('anon','public.ar_publish_refresh(uuid,integer)','execute') or has_function_privilege('authenticated','public.ar_publish_refresh(uuid,integer)','execute') then raise exception 'Publication permissions widened';end if;
 if (select status from ar_private.refresh_runs where id='00000000-0000-4000-8000-000000009291')<>'succeeded' or
    (select count(*) from public.ar_invoices where hotel='KAT' and account_id like 'SYNTHETIC-PUBLISH-%' and verification_state='verified')<>5250 then
  raise exception 'Publication did not make the complete staged invoice set current';
 end if;
end$$;
rollback;
select 'PASS: complete publication within the dedicated publication statement budget; rolled back';
