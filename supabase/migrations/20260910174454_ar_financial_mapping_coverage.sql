-- Per-invoice application coverage never changes independently verified payment/invoice money.
alter table ar_private.financial_invoice_entries add column mapping_verified boolean not null default false;
alter table ar_private.financial_invoice_entries add column mapping_error text;
do $migration$
declare definition text;needle text:=$needle$if exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent') and not(v->>'transactionId'=any(p_mapping_invoices))) then raise exception 'financial_mapping_invalid';end if;$needle$;
begin
 definition:=pg_get_functiondef('public.ar_financial_account_done(uuid,uuid,text,jsonb,jsonb,jsonb,text[])'::regprocedure);
 if strpos(definition,needle)=0 or strpos(definition,'''mappingVerified'',''mappingContractVersion''')=0 then raise exception 'review current financial coverage definition';end if;
 definition:=replace(definition,'''mappingVerified'',''mappingContractVersion''','''mappingVerified'',''mappingContractVersion'',''mappingFailures''');
 definition:=replace(definition,needle,$replacement$if jsonb_typeof(coalesce(p_coverage->'mappingFailures','[]'::jsonb)) is distinct from 'array' then raise exception 'financial_mapping_invalid';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_coverage->'mappingFailures','[]'::jsonb)) f where jsonb_typeof(f) is distinct from 'object' or f-array['invoiceId','code']<>'{}'::jsonb or not(f?&array['invoiceId','code']) or jsonb_typeof(f->'invoiceId') is distinct from 'string' or f->>'invoiceId'!~'^[1-9][0-9]{0,79}$' or jsonb_typeof(f->'code') is distinct from 'string' or f->>'code'!~'^financial_[a-z_]{1,80}$' or f->>'invoiceId'=any(p_mapping_invoices)
  or not exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) i where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and i->>'transactionId'=f->>'invoiceId' and i->>'entryClassification'='invoice' and i->>'collectionRole' in('standalone','parent')))
 or (select count(*)<>count(distinct f->>'invoiceId') from jsonb_array_elements(coalesce(p_coverage->'mappingFailures','[]'::jsonb)) f) then raise exception 'financial_mapping_invalid';end if;
 if exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent') and not(v->>'transactionId'=any(p_mapping_invoices)) and not exists(select 1 from jsonb_array_elements(coalesce(p_coverage->'mappingFailures','[]'::jsonb)) f where f->>'invoiceId'=v->>'transactionId')) then raise exception 'financial_mapping_invalid';end if;$replacement$);execute definition;
end $migration$;

alter function public.ar_financial_publish(uuid,uuid,text[]) rename to financial_publish_without_mapping_coverage;
alter function public.financial_publish_without_mapping_coverage(uuid,uuid,text[]) set schema ar_private;
revoke all on function ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.ar_financial_publish(p_actor uuid,p_run_id uuid,p_accounts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=ar_private.financial_publish_without_mapping_coverage(p_actor,p_run_id,p_accounts);
 if result->>'status'<>'succeeded' then return result;end if;
 update ar_private.financial_invoice_entries i set mapping_verified=i.transaction_id=any(a.mapping_invoices),mapping_error=(select f->>'code' from jsonb_array_elements(coalesce(a.coverage->'mappingFailures','[]'::jsonb)) f where f->>'invoiceId'=i.transaction_id)
 from ar_private.financial_run_accounts a where a.run_id=p_run_id and i.run_id=p_run_id and a.account_id=i.account_id and i.source_status='observed';
 update ar_private.financial_applications a set source_status='not_observed',last_checked_at=i.last_checked_at,run_id=p_run_id
 from ar_private.financial_invoice_entries i where i.run_id=p_run_id and i.hotel=a.hotel and i.account_id=a.account_id and i.transaction_id=a.invoice_id and not i.mapping_verified and a.source_status='observed';
 return result;
end$$;
revoke all on function public.ar_financial_publish(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.ar_financial_publish(uuid,uuid,text[]) to service_role;

alter function public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer) rename to financial_report_without_mapping_coverage;
alter function public.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer) set schema ar_private;
revoke all on function ar_private.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer) from public,anon,authenticated,service_role;
create function public.ar_financial_report(p_actor uuid,p_view text,p_hotel text default null,p_account text default null,p_type text default null,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;unknowns bigint;verified bigint;rows jsonb;
begin
 result:=ar_private.financial_report_without_mapping_coverage(p_actor,p_view,p_hotel,p_account,p_type,p_from,p_to,p_offset,p_limit);
 select count(*) filter(where not i.mapping_verified or i.source_status<>'observed'),count(*) filter(where i.mapping_verified and i.source_status='observed') into unknowns,verified
 from ar_private.financial_invoice_entries i join ar_private.financial_accounts c on c.hotel=i.hotel and c.account_id=i.account_id
 where i.source_data->>'entryClassification'='invoice' and i.source_data->>'collectionRole' in('standalone','parent') and (p_hotel is null or i.hotel=p_hotel) and (p_account is null or i.account_id=p_account) and (p_type is null or c.type=p_type) and (p_from is null or i.source_date is null or i.source_date between p_from and p_to);
 result:=jsonb_set(result,'{summary}',(result->'summary')||jsonb_build_object('mappingUnverified',unknowns,'mappingVerified',verified));
 if p_view='applications' and unknowns>0 then
  result:=jsonb_set(result,'{summary}',(result->'summary')||jsonb_build_object('amount',null,'unknownAmounts',coalesce((result->'summary'->>'unknownAmounts')::bigint,0)+unknowns,'coverageComplete',false));
  result:=jsonb_set(result,'{coverage,complete}','false'::jsonb);
 end if;
 if p_view='invoice_entries' then
  select coalesce(jsonb_agg(v||jsonb_build_object('mappingVerified',i.mapping_verified,'mappingError',i.mapping_error) order by ordinal),'[]'::jsonb) into rows
  from jsonb_array_elements(result->'rows') with ordinality page(v,ordinal) join ar_private.financial_invoice_entries i on i.hotel=v->>'hotel' and i.account_id=v->>'accountId' and i.transaction_id=v->>'transactionId';
  result:=jsonb_set(result,'{rows}',rows);
 end if;return result;
end$$;
revoke all on function public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer) from public,anon,authenticated;
grant execute on function public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer) to service_role;
