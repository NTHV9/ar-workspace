-- OPERA invoiceType is an invoice code, not the sign or economic meaning of its amount.
-- Correct legacy Credit/credit observations at read time, preserving their signed source money,
-- raw payloads, immutable source-change history, dates, coverage and independent mapping proof.
create function ar_private.financial_invoice_effective(v jsonb) returns jsonb
 language sql immutable strict security invoker set search_path='' as $$
 select case when v->>'invoiceType'='Credit' and v->>'entryClassification'='credit'
  then jsonb_set(v,'{entryClassification}','"invoice"'::jsonb,false) else v end;
$$;
revoke all on function ar_private.financial_invoice_effective(jsonb) from public,anon,authenticated,service_role;

create or replace view ar_private.financial_report_rows as
 select 'invoice_entries'::text as view_name,i.hotel,i.account_id,c.type as account_type,i.source_date,i.original_amount as amount,
  ar_private.financial_invoice_effective(i.source_data)->>'entryClassification'='invoice' and i.source_data->>'collectionRole' in('standalone','parent') as measured,
  i.transaction_id as invoice_id,null::text as payment_id,i.source_status,
  ar_private.financial_invoice_effective(i.source_data)||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',i.source_status,'firstObservedAt',i.first_observed_at,'lastObservedAt',i.last_observed_at,'lastCheckedAt',i.last_checked_at) as row_json
 from ar_private.financial_invoice_entries i join ar_private.financial_accounts c on c.hotel=i.hotel and c.account_id=i.account_id
 union all
 select 'payments',p.hotel,p.account_id,c.type,p.source_date,p.amount,true,null,p.transaction_id,p.source_status,
  p.source_data||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',p.source_status,'firstObservedAt',p.first_observed_at,'lastObservedAt',p.last_observed_at,'lastCheckedAt',p.last_checked_at)
 from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id
 union all
 select 'applications',a.hotel,a.account_id,c.type,i.source_date,a.applied_amount,true,a.invoice_id,a.payment_id,a.source_status,
  a.source_data||jsonb_build_object('accountName',c.name,'accountType',c.type,'accountNo',c.account_no,'sourceStatus',a.source_status,'firstObservedAt',a.first_observed_at,'lastObservedAt',a.last_observed_at,'lastCheckedAt',a.last_checked_at,'invoiceTransactionDate',i.source_date,'paymentTransactionDate',p.source_date,'paymentSourceStatus',p.source_status)
 from ar_private.financial_applications a join ar_private.financial_accounts c on c.hotel=a.hotel and c.account_id=a.account_id
 join ar_private.financial_invoice_entries i on i.hotel=a.hotel and i.account_id=a.account_id and i.transaction_id=a.invoice_id
 left join ar_private.financial_payments p on p.hotel=a.hotel and p.account_id=a.account_id and p.transaction_id=a.payment_id;
revoke all on ar_private.financial_report_rows from public,anon,authenticated,service_role;

do $migration$
declare
 definition text;needle text;signature text;expected integer;
begin
 -- Permit old running workers and new workers during rollout. Missing/malformed fields still
 -- fail the existing validator. Do not reinterpret staged rows in the mapping workflow:
 -- legacy credit rows remain mapping-unverified; new invoice rows require explicit mapping work.
 signature:='ar_private.financial_row_valid(text,jsonb,text,text)';
 definition:=pg_get_functiondef(signature::regprocedure);
 needle:=$needle$when 'Credit' then 'credit'$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
  raise exception 'review current financial invoice type validation definition';
 end if;
 definition:=replace(definition,needle,$replacement$when 'Credit' then case when v->>'entryClassification'='credit' then 'credit' else 'invoice' end$replacement$);
 execute definition;

 -- These are read predicates only. Guard the exact old occurrences so future unrelated
 -- function revisions cannot be silently replaced. CREATE OR REPLACE preserves existing ACLs.
 needle:=$needle$i.source_data->>'entryClassification'$needle$;
 foreach signature in array array[
  'public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)',
  'public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  expected:=case when signature like 'public.ar_financial_report(%' then 1 else 3 end;
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>expected then
   raise exception 'review current financial invoice classification read definition: %',signature;
  end if;
  definition:=replace(definition,needle,$replacement$ar_private.financial_invoice_effective(i.source_data)->>'entryClassification'$replacement$);
  execute definition;
 end loop;
end $migration$;
