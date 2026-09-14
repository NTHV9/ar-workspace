-- Version 3 adds current allocation proof scoped by PAYMENT transaction date.
-- Rollout: deploy a v3-aware worker before applying this new-run default.
alter table ar_private.financial_runs drop constraint financial_runs_steps_version_check;
alter table ar_private.financial_runs add constraint financial_runs_steps_version_check check(steps_version in(1,2,3));
alter table ar_private.financial_runs alter column steps_version set default 3;
alter table ar_private.financial_run_accounts add column payment_mapping_ready boolean not null default false;
alter table ar_private.financial_run_accounts add column payment_mapping_count integer not null default 0 check(payment_mapping_count>=0);
-- NULL is the historical v1/v2 contract; false is explicit v3 unknown proof.
alter table ar_private.financial_payments add column payment_mapping_verified boolean;

create table ar_private.financial_payment_mapping_work(
 run_id uuid not null,account_id text not null,batch integer not null check(batch>=0),
 payments jsonb not null check(jsonb_typeof(payments)='array' and jsonb_array_length(payments) between 1 and 5),
 results jsonb check(results is null or jsonb_typeof(results)='array' and jsonb_array_length(results)=jsonb_array_length(payments)),
 primary key(run_id,account_id,batch),
 foreign key(run_id,account_id) references ar_private.financial_run_accounts(run_id,account_id)
);
alter table ar_private.financial_payment_mapping_work enable row level security;
revoke all on ar_private.financial_payment_mapping_work from public,anon,authenticated,service_role;
create function ar_private.financial_payment_work_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if row(old.run_id,old.account_id,old.batch,old.payments) is distinct from row(new.run_id,new.account_id,new.batch,new.payments)
  or old.results is not null then raise exception 'financial_immutable';end if;
 return new;
end$$;
create trigger financial_payment_work_immutable before update on ar_private.financial_payment_mapping_work for each row execute function ar_private.financial_payment_work_immutable();
create trigger operations_database_guard before insert or update on ar_private.financial_payment_mapping_work for each statement execute function ar_private.operations_database_guard();

-- Request/claim also fail expired leases directly. Tie transient cleanup to the
-- committed state transition, so every failure path deletes only that run's work.
-- Success cleanup stays after publication: its proof is still needed by the
-- original publisher and coverage wrapper while they write final observations.
create function ar_private.financial_payment_failed_cleanup() returns trigger language plpgsql set search_path='' as $$
begin
 delete from ar_private.financial_payment_mapping_work where run_id=new.id;
 return new;
end$$;
create trigger financial_payment_failed_cleanup after update of status on ar_private.financial_runs
 for each row when(new.status='failed' and old.status is distinct from new.status)
 execute function ar_private.financial_payment_failed_cleanup();

create function public.ar_financial_payment_prepare(p_actor uuid,p_run_id uuid,p_account text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;a ar_private.financial_run_accounts;n integer;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 if r.steps_version<>3 then raise exception 'financial_payment_version_invalid';end if;
 select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account for update;
 if not found or not a.history_ready then raise exception 'financial_history_incomplete';end if;
 if a.payment_mapping_ready then return jsonb_build_object('mappingCount',a.payment_mapping_count);end if;
 if a.staged then raise exception 'financial_account_staged';end if;
 -- Every staged payment gets an outcome, including explicit zero and unknown rows.
 -- Null/out-of-range dates may only produce a failure, never verified period proof.
 insert into ar_private.financial_payment_mapping_work(run_id,account_id,batch,payments)
 select p_run_id,p_account,((ordinal-1)/5)::integer,jsonb_agg(v order by v->>'transactionId')
 from(select v,row_number() over(order by v->>'transactionId') ordinal
  from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v
  where b.run_id=p_run_id and b.account_id=p_account and b.kind='payment') source_rows
 group by (ordinal-1)/5;
 select coalesce(sum(jsonb_array_length(payments)),0)::integer into n from ar_private.financial_payment_mapping_work where run_id=p_run_id and account_id=p_account;
 update ar_private.financial_run_accounts set payment_mapping_ready=true,payment_mapping_count=n where run_id=p_run_id and account_id=p_account;
 return jsonb_build_object('mappingCount',n);
end$$;

create function public.ar_financial_payment_batch_get(p_actor uuid,p_run_id uuid,p_account text,p_batch integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;a ar_private.financial_run_accounts;w ar_private.financial_payment_mapping_work;
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 if r.steps_version<>3 then raise exception 'financial_payment_version_invalid';end if;
 select * into a from ar_private.financial_run_accounts where run_id=p_run_id and account_id=p_account;
 if not found or not a.history_ready or not a.payment_mapping_ready or p_batch is null or p_batch<0 then raise exception 'financial_payment_batch_invalid';end if;
 select * into w from ar_private.financial_payment_mapping_work where run_id=p_run_id and account_id=p_account and batch=p_batch;
 if not found then raise exception 'financial_payment_batch_invalid';end if;
 if w.results is null then return jsonb_build_object('saved',false,'payments',w.payments);end if;
 return jsonb_build_object('saved',true,'verified',(select count(*) from jsonb_array_elements(w.results)v where v?'payment'),
  'unknown',(select count(*) from jsonb_array_elements(w.results)v where v?'error'),
  'links',(select coalesce(sum(jsonb_array_length(v->'links')),0) from jsonb_array_elements(w.results)v where v?'payment'));
end$$;

create function public.ar_financial_payment_batch_save(p_actor uuid,p_run_id uuid,p_account text,p_batch integer,p_results jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;w ar_private.financial_payment_mapping_work;snapshot jsonb;expected jsonb;invoice jsonb;link jsonb;allocated numeric;ids text[];actual_ids text[];
begin
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 perform public.ar_financial_payment_batch_get(p_actor,p_run_id,p_account,p_batch);
 select * into w from ar_private.financial_payment_mapping_work where run_id=p_run_id and account_id=p_account and batch=p_batch for update;
 if w.results is not null then
  if w.results is distinct from p_results then raise exception 'financial_payment_batch_conflict';end if;
  return public.ar_financial_payment_batch_get(p_actor,p_run_id,p_account,p_batch)-'saved';
 end if;
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)<>jsonb_array_length(w.payments) then raise exception 'financial_payment_batch_invalid';end if;
 select array_agg(v->>'transactionId' order by n) into ids from jsonb_array_elements(w.payments) with ordinality x(v,n);
 select array_agg(coalesce(v->'payment'->>'transactionId',v->>'paymentId') order by n) into actual_ids from jsonb_array_elements(p_results) with ordinality x(v,n);
 if ids is distinct from actual_ids then raise exception 'financial_payment_batch_invalid';end if;
 for snapshot,expected in select s.v,p.v from jsonb_array_elements(p_results) with ordinality s(v,n) join jsonb_array_elements(w.payments) with ordinality p(v,n) using(n) loop
  if jsonb_typeof(snapshot) is distinct from 'object' then raise exception 'financial_payment_snapshot_invalid';end if;
  if snapshot?'error' then
   if snapshot-array['paymentId','error']<>'{}'::jsonb or not(snapshot?&array['paymentId','error'])
    or jsonb_typeof(snapshot->'paymentId') is distinct from 'string' or jsonb_typeof(snapshot->'error') is distinct from 'string'
    or snapshot->>'error'!~'^financial_[a-z_]{1,80}$' then raise exception 'financial_payment_snapshot_invalid';end if;
   continue;
  end if;
  if snapshot-array['payment','invoices','links']<>'{}'::jsonb or not(snapshot?&array['payment','invoices','links'])
   or snapshot->'payment' is distinct from expected or not ar_private.financial_row_valid('payment',expected,r.hotel,p_account)
   or expected->>'currency' is distinct from 'THB' or expected->>'transfer' is distinct from 'none_reported'
   or expected->>'transactionDate' is null or (expected->>'transactionDate')::date not between r.source_from and r.source_to
   or jsonb_typeof(snapshot->'invoices') is distinct from 'array' or jsonb_typeof(snapshot->'links') is distinct from 'array'
   or jsonb_array_length(snapshot->'invoices')>5000 or jsonb_array_length(snapshot->'links')>5000 then raise exception 'financial_payment_snapshot_invalid';end if;
  select a.applied_amount into allocated from ar_private.financial_payment_allocation((expected->>'amount')::numeric,(expected->>'appliedAmount')::numeric,(expected->>'unallocatedAmount')::numeric)a;
  if allocated is null then raise exception 'financial_payment_mapping_total';end if;
  if (select count(*)<>count(distinct v->>'transactionId') from jsonb_array_elements(snapshot->'invoices')v)
   or (select count(*)<>count(distinct v->>'invoiceTransactionId') from jsonb_array_elements(snapshot->'links')v)
   or jsonb_array_length(snapshot->'invoices')<>jsonb_array_length(snapshot->'links') then raise exception 'financial_payment_snapshot_invalid';end if;
  for invoice in select v from jsonb_array_elements(snapshot->'invoices')v loop
   if not ar_private.financial_row_valid('invoice',invoice,r.hotel,p_account) or invoice->>'currency' is distinct from 'THB'
    or invoice->>'entryClassification' is distinct from 'invoice' or invoice->>'collectionRole' not in('standalone','parent')
    or invoice->>'currentAmount' is null or invoice->>'openAmount' is null or invoice->>'cumulativePayments' is null
    or abs((invoice->>'currentAmount')::numeric-(invoice->>'openAmount')::numeric)<>abs((invoice->>'cumulativePayments')::numeric)
    or not exists(select 1 from jsonb_array_elements(snapshot->'links')v where v->>'invoiceTransactionId'=invoice->>'transactionId') then raise exception 'financial_payment_snapshot_invalid';end if;
  end loop;
  for link in select v from jsonb_array_elements(snapshot->'links')v loop
   select v into invoice from jsonb_array_elements(snapshot->'invoices')v where v->>'transactionId'=link->>'invoiceTransactionId';
   if not found or not ar_private.financial_row_valid('application',link,r.hotel,p_account)
    or link->>'paymentTransactionId' is distinct from expected->>'transactionId' or link->>'currency' is distinct from 'THB'
    or link->>'appliedAmount' is null or (link->>'appliedAmount')::numeric=0
    or sign((link->>'appliedAmount')::numeric)<>sign(allocated) or abs((link->>'appliedAmount')::numeric)>abs(allocated)
    or link->'invoiceNo' is distinct from invoice->'invoiceNo' or link->'invoiceTransactionDate' is distinct from invoice->'transactionDate'
    or link->'invoicePostingDate' is distinct from invoice->'postingDate' or link->'invoiceCloseDate' is distinct from invoice->'closeDate'
    then raise exception 'financial_payment_snapshot_invalid';end if;
  end loop;
  if (select coalesce(sum((v->>'appliedAmount')::numeric),0) from jsonb_array_elements(snapshot->'links')v)<>allocated then raise exception 'financial_payment_mapping_total';end if;
 end loop;
 update ar_private.financial_payment_mapping_work set results=p_results where run_id=p_run_id and account_id=p_account and batch=p_batch;
 return public.ar_financial_payment_batch_get(p_actor,p_run_id,p_account,p_batch)-'saved';
end$$;

-- These functions read normalized, validated private work only. No detail request
-- broadens the complete dated history query's row counts or period coverage.
create function ar_private.financial_payment_observations(p_run uuid,p_kind text) returns table(account_id text,v jsonb) language sql stable set search_path='' as $$
 select distinct w.account_id,v from ar_private.financial_payment_mapping_work w
 cross join lateral jsonb_array_elements(w.results)s
 cross join lateral jsonb_array_elements(s->case p_kind when 'invoice' then 'invoices' else 'links' end)v
 where w.run_id=p_run and s?'payment';
$$;
create function ar_private.financial_payment_outcome(p_run uuid,p_account text,p_payment text) returns text language sql stable set search_path='' as $$
 select case when s?'payment' then 'verified' else 'failed' end
 from ar_private.financial_payment_mapping_work w cross join lateral jsonb_array_elements(w.results)s
 where w.run_id=p_run and w.account_id=p_account and coalesce(s->'payment'->>'transactionId',s->>'paymentId')=p_payment;
$$;

-- Merge both observations BEFORE each upsert. This prevents intermediate retire /
-- revive changes and preserves unique immutable (run,kind,identity) history.
do $migration$
declare definition text;signature text;change record;
begin
 signature:='ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[])';
 definition:=replace(pg_get_functiondef(signature::regprocedure),E'\r','');
 for change in select * from(values
  ($needle$insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)$needle$,
   $replacement$insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id,payment_mapping_verified)$replacement$),
  ($needle$(v->>'unallocatedAmount')::numeric,v,'observed',published,published,published,p_run_id$needle$,
   $replacement$(v->>'unallocatedAmount')::numeric,v,'observed',published,published,published,p_run_id,case when r.steps_version=3 then coalesce(ar_private.financial_payment_outcome(p_run_id,b.account_id,v->>'transactionId')='verified',false) end$replacement$),
  ($needle$unallocated_amount=excluded.unallocated_amount,source_data=excluded.source_data$needle$,
   $replacement$unallocated_amount=excluded.unallocated_amount,payment_mapping_verified=excluded.payment_mapping_verified,source_data=excluded.source_data$replacement$),
  ($needle$from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.kind='invoice'
 on conflict$needle$,
   $replacement$from (select distinct account_id,v from(
    select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='invoice'
    union all select account_id,v from ar_private.financial_payment_observations(p_run_id,'invoice') where r.steps_version=3
   ) combined) b
 on conflict$replacement$),
  ($needle$from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows) v where b.run_id=p_run_id and b.kind='application'
 on conflict$needle$,
   $replacement$from (select distinct account_id,v from(
    select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='application'
    union all select account_id,v from ar_private.financial_payment_observations(p_run_id,'application') where r.steps_version=3
   ) combined) b
 on conflict$replacement$),
  ($needle$where f.hotel=r.hotel and f.run_id<>p_run_id and ($needle$,
   $replacement$where f.hotel=r.hotel and f.run_id<>p_run_id and (
  r.steps_version=3 and ar_private.financial_payment_outcome(p_run_id,f.account_id,f.payment_id)='verified'
  or $replacement$)
 )x(old_text,new_text) loop
  if (length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text)<>1 then raise exception 'review current payment publication definition: %',left(change.old_text,80);end if;
  definition:=replace(definition,change.old_text,change.new_text);
 end loop;
 execute definition;
 signature:='ar_private.financial_publish_before_granular_cleanup(uuid,uuid,text[])';
 definition:=replace(pg_get_functiondef(signature::regprocedure),E'\r','');
 -- A failed full-invoice mapping must not invalidate independent complete PAYMENT
 -- proof. Context-only invoices remain mapping_verified=false (no full-invoice proof).
 for change in select * from(values
  ($needle$and not i.mapping_verified and a.source_status='observed';$needle$,
   $replacement$and not i.mapping_verified and a.source_status='observed'
   and not exists(select 1 from ar_private.financial_runs r where r.id=p_run_id and r.steps_version=3
    and ar_private.financial_payment_outcome(p_run_id,a.account_id,a.payment_id)='verified');$replacement$)
 )x(old_text,new_text) loop
  if (length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text)<>1 then raise exception 'review current payment coverage definition';end if;
  definition:=replace(definition,change.old_text,change.new_text);
 end loop;
 execute definition;
end $migration$;

-- Preserve every active-link amount, identity, status and freshness guard. An
-- omitted old link can leave the current cohort only when a complete PAYMENT
-- proof retired it in exactly this payment's atomic publication. Ordinary
-- absence, failures and old timestamps remain unknown, including a failed zero.
do $migration$
declare definition text;change record;
begin
 definition:=replace(pg_get_functiondef('public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for change in select * from(values
  ($needle$coalesce(p.source_status='observed' and p.source_date is not null$needle$,
   $replacement$coalesce(p.payment_mapping_verified is distinct from false and p.source_status='observed' and p.source_date is not null$replacement$),
  ($needle$where a.hotel=p.hotel and a.account_id=p.account_id and a.payment_id=p.transaction_id)m$needle$,
   $replacement$where a.hotel=p.hotel and a.account_id=p.account_id and a.payment_id=p.transaction_id
    and not(p.payment_mapping_verified is true and a.source_status='not_observed' and a.run_id=p.run_id and a.last_checked_at=p.last_observed_at))m$replacement$),
  ($needle$where (p.amount<0 and a.applied_amount>0 or p.amount>0 and a.applied_amount<0) and$needle$,
   $replacement$where not(p.payment_mapping_verified is true and a.source_status='not_observed' and a.run_id=p.run_id and a.last_checked_at=p.last_observed_at)
   and (p.amount<0 and a.applied_amount>0 or p.amount>0 and a.applied_amount<0) and$replacement$)
 )x(old_text,new_text) loop
  if (length(definition)-length(replace(definition,change.old_text,'')))/length(change.old_text)<>1 then raise exception 'review current payment retirement read definition';end if;
  definition:=replace(definition,change.old_text,change.new_text);
 end loop;
 execute definition;
end $migration$;

alter function public.ar_financial_publish(uuid,uuid,text[]) rename to financial_publish_before_payment_mapping;
alter function public.financial_publish_before_payment_mapping(uuid,uuid,text[]) set schema ar_private;
revoke all on function ar_private.financial_publish_before_payment_mapping(uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.ar_financial_publish(p_actor uuid,p_run_id uuid,p_accounts text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.financial_runs;result jsonb;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 select * into r from ar_private.financial_runs where id=p_run_id and owner=p_actor;
 if not found then raise exception 'financial_run_missing';end if;
 -- Match the original publisher's hotel-lock then run-lock order.
 perform pg_advisory_xact_lock(61747,case r.hotel when 'KAT' then 1 else 2 end);
 r:=ar_private.financial_require_run(p_actor,p_run_id,false);
 if r.steps_version<>3 then return ar_private.financial_publish_before_payment_mapping(p_actor,p_run_id,p_accounts);end if;
 -- Do not re-enter legacy cleanup after the durable proof has been cleared.
 if r.status='succeeded' then return jsonb_build_object('status','succeeded','accounts',r.account_count,'invoices',r.invoice_count,'payments',r.payment_count,'applications',r.application_count);end if;
 r:=ar_private.financial_require_run(p_actor,p_run_id);
 if exists(select 1 from ar_private.financial_run_accounts a where a.run_id=p_run_id and
   (not a.payment_mapping_ready or (select coalesce(sum(jsonb_array_length(w.payments)),0) from ar_private.financial_payment_mapping_work w where w.run_id=p_run_id and w.account_id=a.account_id)<>a.payment_mapping_count))
  or exists(select 1 from ar_private.financial_payment_mapping_work where run_id=p_run_id and results is null) then raise exception 'financial_payment_mapping_incomplete';end if;
 -- Conflicting context facts or allocation facts abort the entire publication.
 if exists(select 1 from(
   select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='invoice'
   union all select account_id,v from ar_private.financial_payment_observations(p_run_id,'invoice')
  )x group by account_id,v->>'transactionId' having count(distinct v)>1)
  or exists(select 1 from(
   select b.account_id,v from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v where b.run_id=p_run_id and b.kind='application'
   union all select account_id,v from ar_private.financial_payment_observations(p_run_id,'application')
  )x group by account_id,v->>'invoiceTransactionId',v->>'paymentTransactionId' having count(distinct v)>1)
  or exists(select 1 from ar_private.financial_stage_batches b cross join lateral jsonb_array_elements(b.rows)v
   where b.run_id=p_run_id and b.kind='application' and ar_private.financial_payment_outcome(p_run_id,b.account_id,v->>'paymentTransactionId')='verified'
   and not exists(select 1 from ar_private.financial_payment_observations(p_run_id,'application')o where o.account_id=b.account_id and o.v=v))
  then raise exception 'financial_payment_observation_conflict';end if;
 result:=ar_private.financial_publish_before_payment_mapping(p_actor,p_run_id,p_accounts);
 if result->>'status'='succeeded' then delete from ar_private.financial_payment_mapping_work where run_id=p_run_id;end if;
 return result;
end$$;

alter function public.ar_financial_fail(uuid,uuid,text) rename to financial_fail_before_payment_mapping;
alter function public.financial_fail_before_payment_mapping(uuid,uuid,text) set schema ar_private;
revoke all on function ar_private.financial_fail_before_payment_mapping(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.ar_financial_fail(p_actor uuid,p_run_id uuid,p_code text) returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean;
begin
 result:=ar_private.financial_fail_before_payment_mapping(p_actor,p_run_id,p_code);
 if exists(select 1 from ar_private.financial_runs where id=p_run_id and owner=p_actor and status='failed') then delete from ar_private.financial_payment_mapping_work where run_id=p_run_id;end if;
 return result;
end$$;
revoke all on function ar_private.financial_payment_work_immutable(),ar_private.financial_payment_failed_cleanup(),ar_private.financial_payment_observations(uuid,text),ar_private.financial_payment_outcome(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_financial_payment_prepare(uuid,uuid,text),public.ar_financial_payment_batch_get(uuid,uuid,text,integer),public.ar_financial_payment_batch_save(uuid,uuid,text,integer,jsonb),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ar_financial_payment_prepare(uuid,uuid,text),public.ar_financial_payment_batch_get(uuid,uuid,text,integer),public.ar_financial_payment_batch_save(uuid,uuid,text,integer,jsonb),public.ar_financial_publish(uuid,uuid,text[]),public.ar_financial_fail(uuid,uuid,text) to service_role;
