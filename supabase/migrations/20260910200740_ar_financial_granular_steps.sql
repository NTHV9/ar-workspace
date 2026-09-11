-- New runs checkpoint complete history and bounded mapping batches privately.
alter table ar_private.financial_runs add column steps_version smallint not null default 1 check(steps_version in(1,2));
alter table ar_private.financial_runs alter column steps_version set default 2;
alter table ar_private.financial_run_accounts add column history_ready boolean not null default false;
alter table ar_private.financial_run_accounts add column mapping_count integer not null default 0;
create table ar_private.financial_mapping_work(
 run_id uuid not null,account_id text not null,batch integer not null check(batch>=0),invoice_ids text[] not null,verified_ids text[] not null,links jsonb not null,failures jsonb not null,
 primary key(run_id,account_id,batch),foreign key(run_id,account_id) references ar_private.financial_run_accounts(run_id,account_id)
);
alter table ar_private.financial_mapping_work enable row level security;
revoke all on ar_private.financial_mapping_work from public,anon,authenticated,service_role;
create trigger financial_mapping_work_immutable before update on ar_private.financial_mapping_work for each row execute function ar_private.financial_immutable();

do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('ar_private.financial_run_json(ar_private.financial_runs)'::regprocedure);
 definition:=replace(definition,'''id'',r.id,','''stepsVersion'',r.steps_version,''id'',r.id,');execute definition;
 definition:=pg_get_functiondef('ar_private.financial_receipt(ar_private.financial_runs,boolean)'::regprocedure);
 definition:=replace(definition,'''id'',r.id,','''stepsVersion'',r.steps_version,''id'',r.id,');execute definition;
 definition:=pg_get_functiondef('public.ar_financial_account_get(uuid,uuid,integer)'::regprocedure);
 definition:=replace(definition,'''ordinal'',a.ordinal,','''historyReady'',a.history_ready,''mappingCount'',a.mapping_count,''ordinal'',a.ordinal,');execute definition;
end $migration$;

create function public.ar_financial_history_ready(p_actor uuid,p_run_id uuid,p_account text,p_context jsonb,p_coverage jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;a ar_private.financial_run_accounts;prepared_counts jsonb;eligible integer;duplicates bigint;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account for update;if not found then raise exception 'financial_account_missing';end if;
 if a.history_ready then if a.context is distinct from p_context or a.coverage is distinct from p_coverage then raise exception 'financial_history_conflict';end if;return jsonb_build_object('mappingCount',a.mapping_count,'counts',a.counts);end if;
 if a.staged or p_context is null or p_coverage is null then raise exception 'financial_history_invalid';end if;
 with rows as(select b.kind,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.account_id=p_account)
 select jsonb_build_object('invoices',count(*) filter(where kind='invoice'),'payments',count(*) filter(where kind='payment'),'applications',0),count(*) filter(where kind='invoice' and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent')),count(*)-count(distinct (kind,v->>'transactionId')) into prepared_counts,eligible,duplicates from rows;
 if duplicates<>0 or exists(select 1 from ar_private.financial_stage_batches where run_id=p_run_id and account_id=p_account and kind='application') then raise exception 'financial_history_invalid';end if;
 if p_coverage->>'pagination' is distinct from 'complete' or p_coverage->'query'->>'hotel' is distinct from r.hotel or p_coverage->'query'->>'accountId' is distinct from p_account or p_coverage->'query'->>'start' is distinct from to_char(r.source_from,'YYYY-MM-DD') or p_coverage->'query'->>'end' is distinct from to_char(r.source_to,'YYYY-MM-DD') then raise exception 'financial_history_invalid';end if;
 update ar_private.financial_run_accounts set history_ready=true,mapping_count=eligible,context=p_context,counts=prepared_counts,coverage=p_coverage where run_id=p_run_id and account_id=p_account;
 return jsonb_build_object('mappingCount',eligible,'counts',prepared_counts);
end$$;
create function public.ar_financial_mapping_batch_get(p_actor uuid,p_run_id uuid,p_account text,p_batch integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a ar_private.financial_run_accounts;rows jsonb;saved ar_private.financial_mapping_work;
begin
 if not ar_private.financial_actor(p_actor) or not exists(select 1 from ar_private.financial_runs where id=p_run_id and owner=p_actor) then raise exception 'financial_forbidden';end if;
 select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account;
 if not found or not a.history_ready or p_batch is null or p_batch<0 or p_batch*10>=a.mapping_count then raise exception 'financial_mapping_batch_invalid';end if;
 select * into saved from ar_private.financial_mapping_work where run_id=p_run_id and account_id=p_account and batch=p_batch;
 if found then return jsonb_build_object('saved',true,'verified',cardinality(saved.verified_ids),'unknown',jsonb_array_length(saved.failures),'links',jsonb_array_length(saved.links));end if;
 select jsonb_agg(v order by v->>'transactionId') into rows from(select v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.account_id=p_account and b.kind='invoice' and v->>'entryClassification'='invoice' and v->>'collectionRole' in('standalone','parent') order by v->>'transactionId' offset p_batch*10 limit 10)x;
 return jsonb_build_object('saved',false,'invoices',rows);
end$$;
create function public.ar_financial_mapping_batch_save(p_actor uuid,p_run_id uuid,p_account text,p_batch integer,p_ids text[],p_verified text[],p_links jsonb,p_failures jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;saved ar_private.financial_mapping_work;expected text[];batch_data jsonb;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 select * into saved from ar_private.financial_mapping_work where run_id=p_run_id and account_id=p_account and batch=p_batch;
 if found then if row(saved.invoice_ids,saved.verified_ids,saved.links,saved.failures) is distinct from row(p_ids,p_verified,p_links,p_failures) then raise exception 'financial_mapping_batch_conflict';end if;return jsonb_build_object('verified',cardinality(saved.verified_ids),'unknown',jsonb_array_length(saved.failures),'links',jsonb_array_length(saved.links));end if;
 batch_data:=public.ar_financial_mapping_batch_get(p_actor,p_run_id,p_account,p_batch);
 select array_agg(v->>'transactionId' order by v->>'transactionId') into expected from jsonb_array_elements(batch_data->'invoices')v;
 if p_ids is null or p_verified is null or expected is distinct from p_ids or jsonb_typeof(p_links) is distinct from 'array' or jsonb_typeof(p_failures) is distinct from 'array' or cardinality(p_verified)<>(select count(distinct v) from unnest(p_verified)v) or jsonb_array_length(p_links)>50000 then raise exception 'financial_mapping_batch_invalid';end if;
 if exists(select 1 from unnest(p_verified)v where not(v=any(p_ids))) or exists(select 1 from jsonb_array_elements(p_failures)f where jsonb_typeof(f) is distinct from 'object' or f-array['invoiceId','code']<>'{}'::jsonb or not(f?&array['invoiceId','code']) or f->>'code'!~'^financial_[a-z_]{1,80}$' or not(f->>'invoiceId'=any(p_ids)) or f->>'invoiceId'=any(p_verified)) then raise exception 'financial_mapping_batch_invalid';end if;
 if cardinality(p_ids)<>cardinality(p_verified)+jsonb_array_length(p_failures) or (select count(*)<>count(distinct f->>'invoiceId') from jsonb_array_elements(p_failures)f) then raise exception 'financial_mapping_batch_invalid';end if;
 if exists(select 1 from jsonb_array_elements(p_links)l where not ar_private.financial_row_valid('application',l,r.hotel,p_account) or not(l->>'invoiceTransactionId'=any(p_verified))) or (select count(*)<>count(distinct(l->>'invoiceTransactionId',l->>'paymentTransactionId')) from jsonb_array_elements(p_links)l) then raise exception 'financial_mapping_batch_invalid';end if;
 insert into ar_private.financial_mapping_work values(p_run_id,p_account,p_batch,p_ids,p_verified,p_links,p_failures);
 return jsonb_build_object('verified',cardinality(p_verified),'unknown',jsonb_array_length(p_failures),'links',jsonb_array_length(p_links));
end$$;
create function public.ar_financial_history_finalize(p_actor uuid,p_run_id uuid,p_account text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;a ar_private.financial_run_accounts;links jsonb;failures jsonb;verified text[];b integer;counts jsonb;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account for update;
 if not found or not a.history_ready then raise exception 'financial_history_incomplete';end if;if a.staged then return a.counts;end if;
 if (select count(*) from ar_private.financial_mapping_work where run_id=p_run_id and account_id=p_account)<>(a.mapping_count+9)/10 or exists(select 1 from generate_series(0,(a.mapping_count+9)/10-1)n where not exists(select 1 from ar_private.financial_mapping_work where run_id=p_run_id and account_id=p_account and batch=n)) then raise exception 'financial_mapping_incomplete';end if;
 select coalesce(jsonb_agg(l order by l->>'invoiceTransactionId',l->>'paymentTransactionId'),'[]'::jsonb) into links from ar_private.financial_mapping_work w cross join lateral jsonb_array_elements(w.links)l where w.run_id=p_run_id and w.account_id=p_account;
 select coalesce(jsonb_agg(f order by f->>'invoiceId'),'[]'::jsonb) into failures from ar_private.financial_mapping_work w cross join lateral jsonb_array_elements(w.failures)f where w.run_id=p_run_id and w.account_id=p_account;
 select coalesce(array_agg(v order by v),'{}'::text[]) into verified from ar_private.financial_mapping_work w cross join lateral unnest(w.verified_ids)v where w.run_id=p_run_id and w.account_id=p_account;
 for b in 0..(jsonb_array_length(links)+499)/500-1 loop
  perform public.ar_financial_stage_batch(p_actor,p_run_id,p_account,'application',b,(select jsonb_agg(v order by ord) from jsonb_array_elements(links) with ordinality x(v,ord) where ord>b*500 and ord<=(b+1)*500));
 end loop;
 counts:=a.counts||jsonb_build_object('applications',jsonb_array_length(links));
 return public.ar_financial_account_done(p_actor,p_run_id,p_account,a.context,counts,a.coverage||jsonb_build_object('mappingVerified',cardinality(verified),'mappingFailures',failures,'mappingContractVersion','correlated_v1'),verified);
end$$;

alter function public.ar_financial_publish(uuid,uuid,text[]) rename to financial_publish_before_granular_cleanup;
alter function public.financial_publish_before_granular_cleanup(uuid,uuid,text[]) set schema ar_private;
revoke all on function ar_private.financial_publish_before_granular_cleanup(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.ar_financial_publish(p_actor uuid,p_run_id uuid,p_accounts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin result:=ar_private.financial_publish_before_granular_cleanup(p_actor,p_run_id,p_accounts);if result->>'status'='succeeded' then delete from ar_private.financial_mapping_work where run_id=p_run_id;end if;return result;end$$;
alter function public.ar_financial_fail(uuid,uuid,text) rename to financial_fail_before_granular_cleanup;
alter function public.financial_fail_before_granular_cleanup(uuid,uuid,text) set schema ar_private;
revoke all on function ar_private.financial_fail_before_granular_cleanup(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.ar_financial_fail(p_actor uuid,p_run_id uuid,p_code text) returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean;
begin result:=ar_private.financial_fail_before_granular_cleanup(p_actor,p_run_id,p_code);if exists(select 1 from ar_private.financial_runs where id=p_run_id and owner=p_actor and status='failed') then delete from ar_private.financial_mapping_work where run_id=p_run_id;end if;return result;end$$;
revoke all on function public.ar_financial_history_ready(uuid,uuid,text,jsonb,jsonb),public.ar_financial_mapping_batch_get(uuid,uuid,text,integer),public.ar_financial_mapping_batch_save(uuid,uuid,text,integer,text[],text[],jsonb,jsonb),public.ar_financial_history_finalize(uuid,uuid,text),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ar_financial_history_ready(uuid,uuid,text,jsonb,jsonb),public.ar_financial_mapping_batch_get(uuid,uuid,text,integer),public.ar_financial_mapping_batch_save(uuid,uuid,text,integer,text[],text[],jsonb,jsonb),public.ar_financial_history_finalize(uuid,uuid,text),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text) to service_role;
