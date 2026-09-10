-- Managed file traffic is an app allowance; it is not the provider's total bill.
alter table ar_private.operations_budget add column limits jsonb;
create table ar_private.storage_upload_operations(
 id uuid primary key references ar_private.operations_budget_reservations(id),owner uuid not null references auth.users(id),object_key text not null,byte_count bigint not null,sha256 text not null,mime text not null,
 object_id uuid,object_updated_at timestamptz,verified boolean not null default false,origin_finished boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(object_key)
);
alter table ar_private.storage_upload_operations enable row level security;
revoke all on ar_private.storage_upload_operations from public,anon,authenticated,service_role;
create function ar_private.storage_key_valid(p_key text) returns boolean language sql immutable set search_path='' as $$
 select p_key is not null and length(p_key) between 1 and 1000 and p_key~'^(jobs|remittances|remittance-diagnostics|validation)/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._/-]*$' and p_key!~'(^|/)[.][.]?(/|$)';
$$;
create function public.ar_operations_budget_current(p_actor uuid,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;period_start timestamptz;period_end timestamptz;now_at timestamptz:=clock_timestamp();m jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;if not ar_private.operations_budget_limits(p_limits) then return jsonb_build_object('error','budget_invalid');end if;
 select * into b from ar_private.operations_budget where singleton for update;
 update ar_private.operations_budget set limits=p_limits where singleton;
 period_start:=date_trunc('month',now_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';period_end:=(date_trunc('month',now_at at time zone 'Asia/Bangkok')+interval '1 month') at time zone 'Asia/Bangkok';
 if b.measurement is null or now_at>=(b.measurement->>'periodEnd')::timestamptz then
  m:=jsonb_build_object('periodStart',period_start,'periodEnd',period_end,'observedAt',jsonb_build_object('storedBytes',null,'databaseBytes',null,'egressBytes',now_at),'used',jsonb_build_object('storedBytes',null,'databaseBytes',null,'egressBytes',0),'headroom',p_limits-array['safetyPercent','maxConcurrent','measurementMaxAgeSeconds']);
  m:=public.ar_operations_budget_measure(p_actor,m);if m?'error' then return m;end if;
  update ar_private.operations_budget set activated_at=coalesce(activated_at,now_at) where singleton;
 end if;
 select * into b from ar_private.operations_budget where singleton;
 if b.local_measured_at is null or b.local_measured_at<now_at-interval '2 minutes' then m:=public.ar_operations_budget_refresh_local(p_actor);if m?'error' then return m;end if;end if;
 select * into b from ar_private.operations_budget where singleton;
 return jsonb_build_object('measurement',b.measurement,'activatedAt',b.activated_at,'blocked',b.blocked,'egressScope','managed_file_transfers_since_activation','active',(select count(*) from ar_private.operations_budget_reservations where state in('reserved','started') and not detached),'unresolved',(select count(*) from ar_private.operations_budget_reservations where state='started'),'chargedEgress',(select coalesce(sum((actual->>'egressBytes')::bigint),0) from ar_private.operations_budget_reservations where state='finished' and finished_at>=(b.measurement->>'periodStart')::timestamptz));
end$$;
create function public.ar_storage_read_budget(p_actor uuid,p_id uuid,p_key text,p_ceiling bigint,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb;size bigint;charge jsonb;reason text;existing ar_private.operations_budget_reservations;
begin
 if not ar_private.storage_key_valid(p_key) or p_id is null or p_ceiling is null or p_ceiling not between 1 and 104857600 then return jsonb_build_object('error','budget_invalid');end if;
 state:=public.ar_operations_budget_current(p_actor,p_limits);if state?'error' then return state;end if;
 select (metadata->>'size')::bigint into size from storage.objects where bucket_id='ar-working-files' and name=p_key and metadata->>'size'~'^[0-9]{1,15}$';
 if size is null then return jsonb_build_object('error','storage_object_unavailable');end if;if size<1 or size>p_ceiling then return jsonb_build_object('error','storage_object_size_changed');end if;
 charge:=jsonb_build_object('storedBytes',0,'egressBytes',size,'databaseBytes',4096);
 select * into existing from ar_private.operations_budget_reservations where id=p_id;
 if found then return jsonb_build_object('error','budget_read_already_charged');end if;
 reason:=ar_private.operations_budget_admit(charge,p_limits,false,true);if reason is not null then return jsonb_build_object('error',reason);end if;
 -- Precharge the complete bounded response. An aborted/disconnected transfer is
 -- conservatively charged, never refunded as an unverified zero.
 insert into ar_private.operations_budget_reservations(id,owner,resource,reserved,actual,state,accounting_basis,started_at,finished_at) values(p_id,p_actor,'storage_read',charge,charge,'finished','read_upper_bound',clock_timestamp(),clock_timestamp());
 return jsonb_build_object('id',p_id,'byteCount',size,'chargedEgress',size);
end$$;
create function public.ar_storage_write_begin(p_actor uuid,p_id uuid,p_key text,p_bytes bigint,p_sha256 text,p_mime text,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb;r ar_private.storage_upload_operations;reservation jsonb;started jsonb;
begin
 if not ar_private.storage_key_valid(p_key) or p_id is null or p_bytes is null or p_bytes not between 1 and 104857600 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_mime is null or p_mime not in('application/pdf','application/json','image/png','image/jpeg','application/octet-stream') then return jsonb_build_object('error','budget_invalid');end if;
 state:=public.ar_operations_budget_current(p_actor,p_limits);if state?'error' then return state;end if;
 select * into r from ar_private.storage_upload_operations where id=p_id or object_key=p_key;
 if found then
  if row(r.id,r.owner,r.object_key,r.byte_count,r.sha256,r.mime) is distinct from row(p_id,p_actor,p_key,p_bytes,p_sha256,p_mime) then return jsonb_build_object('error','storage_operation_conflict');end if;
  if r.verified and not exists(select 1 from storage.objects where id=r.object_id and bucket_id='ar-working-files' and name=r.object_key and updated_at=r.object_updated_at and metadata->>'size'~'^[0-9]{1,15}$' and (metadata->>'size')::bigint=r.byte_count) then return jsonb_build_object('error','storage_object_changed');end if;
  return jsonb_build_object('id',r.id,'proceed',false,'verified',r.verified);
 end if;
 reservation:=public.ar_operations_budget_reserve(p_actor,p_id,'storage_upload',jsonb_build_object('storedBytes',p_bytes,'egressBytes',0,'databaseBytes',8192),p_limits);if reservation?'error' then return reservation;end if;
 started:=public.ar_operations_budget_start(p_actor,p_id,p_limits);if started?'error' then return started;end if;
 if started->>'proceed'<>'true' then return jsonb_build_object('error','budget_conflict');end if;
 insert into ar_private.storage_upload_operations(id,owner,object_key,byte_count,sha256,mime) values(p_id,p_actor,p_key,p_bytes,p_sha256,p_mime);
 return jsonb_build_object('id',p_id,'proceed',true,'verified',false);
end$$;
create function public.ar_storage_write_finish(p_actor uuid,p_id uuid,p_verified boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation ar_private.storage_upload_operations;verified_object_id uuid;object_time timestamptz;result jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;if p_verified is null then return jsonb_build_object('error','budget_invalid');end if;
 perform singleton from ar_private.operations_budget where singleton for update;
 select * into operation from ar_private.storage_upload_operations where id=p_id and owner=p_actor for update;if not found then return jsonb_build_object('error','budget_missing');end if;
 if p_verified then
  select o.id,o.updated_at into verified_object_id,object_time from storage.objects o where o.bucket_id='ar-working-files' and o.name=operation.object_key and o.metadata->>'size'~'^[0-9]{1,15}$' and (o.metadata->>'size')::bigint=operation.byte_count;
  if verified_object_id is null then return jsonb_build_object('error','storage_object_unavailable');end if;
  result:=public.ar_operations_budget_finish(p_actor,p_id,jsonb_build_object('storedBytes',operation.byte_count,'egressBytes',0,'databaseBytes',8192));if result?'error' then return result;end if;
 end if;
 update ar_private.storage_upload_operations set origin_finished=true,verified=verified or p_verified,object_id=coalesce(verified_object_id,storage_upload_operations.object_id),object_updated_at=coalesce(object_time,object_updated_at),updated_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('verified',operation.verified or p_verified);
end$$;
revoke all on function ar_private.storage_key_valid(text) from public,anon,authenticated,service_role;
revoke all on function public.ar_operations_budget_current(uuid,jsonb),public.ar_storage_read_budget(uuid,uuid,text,bigint,jsonb),public.ar_storage_write_begin(uuid,uuid,text,bigint,text,text,jsonb),public.ar_storage_write_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ar_operations_budget_current(uuid,jsonb),public.ar_storage_read_budget(uuid,uuid,text,bigint,jsonb),public.ar_storage_write_begin(uuid,uuid,text,bigint,text,text,jsonb),public.ar_storage_write_finish(uuid,uuid,boolean) to service_role;

-- Safe reconciliation never repeats the upload or refunds an uncertain write.
create function public.ar_storage_upload_recovery(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.storage_upload_operations;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 select * into r from ar_private.storage_upload_operations where id=p_id and owner=p_actor;
 if not found then return jsonb_build_object('error','budget_missing');end if;
 return jsonb_build_object('id',r.id,'key',r.object_key,'byteCount',r.byte_count,'sha256',r.sha256,'verified',r.verified,'originFinished',r.origin_finished);
end$$;
create function public.ar_operations_status(p_actor uuid,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare summary jsonb;pending jsonb;
begin
 summary:=public.ar_operations_budget_current(p_actor,p_limits);if summary?'error' then return summary;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'byteCount',byte_count,'createdAt',created_at,'originFinished',origin_finished) order by created_at),'[]'::jsonb) into pending from ar_private.storage_upload_operations where owner=p_actor and not verified;
 return summary||jsonb_build_object('limits',p_limits,'pendingUploads',pending);
end$$;
create function ar_private.operations_database_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;
begin
 select * into b from ar_private.operations_budget where singleton;
 -- Local physical size includes retained history and indexes. This conservative
 -- stop leaves headroom; it is not a prediction of provider WAL or billing.
 if b.activated_at is not null and b.limits is not null and pg_database_size(current_database())>floor((b.limits->>'databaseBytes')::numeric*(100-(b.limits->>'safetyPercent')::numeric)/100) then
  raise exception using message='budget_database_exceeded',errcode='P0001';
 end if;return null;
end$$;
do $$declare r record;begin
 for r in select schemaname,tablename from pg_tables where (schemaname='public' and tablename in('ar_accounts','ar_invoices','ar_document_jobs','ar_email_drafts','ar_email_attachments','ar_remittances')) or (schemaname='ar_private' and tablename in('refresh_stage','financial_stage_batches','financial_mapping_work','document_uploads')) loop
  execute format('create trigger operations_database_guard before insert on %I.%I for each statement execute function ar_private.operations_database_guard()',r.schemaname,r.tablename);
 end loop;
end$$;
revoke all on function ar_private.operations_database_guard() from public,anon,authenticated,service_role;
revoke all on function public.ar_storage_upload_recovery(uuid,uuid),public.ar_operations_status(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_storage_upload_recovery(uuid,uuid),public.ar_operations_status(uuid,jsonb) to service_role;
