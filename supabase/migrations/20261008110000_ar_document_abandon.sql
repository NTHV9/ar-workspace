-- Explicit departure is a durable request, never an age-based purge.
alter table public.ar_document_jobs add column discard_requested_at timestamptz;
alter table public.ar_document_jobs add constraint document_discard_request_transient check(discard_requested_at is null or lifecycle='transient');

create function public.ar_document_abandon(p_actor uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;reason text;
begin
 perform pg_advisory_xact_lock(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found or not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if j.lifecycle<>'transient' then raise exception 'document_lifecycle_invalid';end if;
 if j.closed_at is not null then return jsonb_build_object('job',public.ar_document_get(j.id),'outcome','discarded');end if;
 -- Do not convert a protected Draft or unknown send into a future discard request.
 if ar_private.document_pending_mail(j.id) then return jsonb_build_object('job',public.ar_document_get(j.id),'outcome','protected','reason','document_mail_pending');end if;
 update public.ar_document_jobs set discard_requested_at=coalesce(discard_requested_at,clock_timestamp()) where id=j.id;
 if j.state in('queued','running','uncertain') or exists(select 1 from public.ar_document_files where job_id=j.id and state in('pending','generating','uncertain')) then reason:='document_generation_pending';
 elsif exists(select 1 from ar_private.document_transient_uploads where job_id=j.id and not registered and not cancelled) then reason:='document_upload_pending';end if;
 if reason is not null then return jsonb_build_object('job',public.ar_document_get(j.id),'outcome','pending','reason',reason);end if;
 return jsonb_build_object('job',public.ar_document_discard(p_actor,j.id),'outcome','discarded');
end$$;

-- Scheduled retry closes only marked requests after all admitted work settles.
create function public.ar_document_finalize_abandoned(p_actor uuid,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare jid uuid;result jsonb:='[]';
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 for jid in select j.id from public.ar_document_jobs j where j.owner=p_actor and j.lifecycle='transient' and j.closed_at is null and j.discard_requested_at is not null
 and j.state not in('queued','running','uncertain') and not exists(select 1 from public.ar_document_files f where f.job_id=j.id and f.state in('pending','generating','uncertain'))
 and not ar_private.document_pending_mail(j.id) and not exists(select 1 from ar_private.document_transient_uploads u where u.job_id=j.id and not u.registered and not u.cancelled)
 order by j.discard_requested_at,j.id limit p_limit loop
  result:=result||jsonb_build_array(public.ar_document_abandon(p_actor,jid));
 end loop;
 return result;
end$$;

create function public.ar_document_cleanup_job_candidates(p_actor uuid,p_job_id uuid,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) or not exists(select 1 from public.ar_document_jobs where id=p_job_id and owner=p_actor and lifecycle='transient' and closed_at is not null) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 select array_agg(id) into ids from (
  select cnd.id from (
   select o.id from storage.objects o where o.bucket_id='ar-working-files' and split_part(o.name,'/',2)=p_job_id::text
   and o.name~'^jobs/[0-9a-f-]{36}/(originals|exports)/' and exists(select 1 from ar_private.retention_storage_receipts r where r.storage_key=o.name and r.owner=p_actor)
   union
   select r.object_id::uuid from ar_private.retention_items r where r.owner=p_actor and r.store='supabase' and r.state<>'deleted' and split_part(r.storage_key,'/',2)=p_job_id::text
   and r.storage_key~'^jobs/[0-9a-f-]{36}/(originals|exports)/'
  )cnd left join ar_private.transient_cleanup_checks c on c.object_id=cnd.id order by c.checked_at nulls first,cnd.id limit p_limit
 )s;
 insert into ar_private.transient_cleanup_checks(object_id) select unnest(ids) on conflict(object_id) do update set checked_at=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object('objectId',x.id,'itemId',r.id)),'[]') into result from unnest(ids)x(id) left join ar_private.retention_items r on r.store='supabase' and r.object_id=x.id::text;
 return result;
end$$;
revoke all on function public.ar_document_abandon(uuid,uuid),public.ar_document_finalize_abandoned(uuid,integer),public.ar_document_cleanup_job_candidates(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_abandon(uuid,uuid),public.ar_document_finalize_abandoned(uuid,integer),public.ar_document_cleanup_job_candidates(uuid,uuid,integer) to service_role;

-- Closed preparations no longer appear as pending Operations work.
create or replace function public.ar_operations_queue(p_actor uuid,p_kind text default 'all',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','operations_forbidden');end if;
 if p_kind is null or p_kind not in('all','document','email','archive','refresh','financial') or p_offset is null or p_offset<0 then return jsonb_build_object('error','operations_invalid');end if;
 with latest_refresh as(select distinct on(hotel) * from ar_private.refresh_runs order by hotel,created_at desc),latest_financial as(select distinct on(hotel) * from ar_private.financial_runs order by hotel,created_at desc),items as(
  select 'document'::text as kind,j.id::text,j.hotel,j.account_name as label,j.state,j.updated_at as updated_at,j.id as job_id,null::uuid as delivery_id,null::integer as revision,
   coalesce((select min(f.error_code) from public.ar_document_files f where f.job_id=j.id and f.error_code is not null),case when j.state='ready' then 'document_review_pending' else 'document_processing' end) as reason
  from public.ar_document_jobs j where j.owner=p_actor and j.closed_at is null and (j.state<>'ready' or not j.acknowledged)
  union all
  select 'email',m.id::text,m.snapshot->'draft'->>'hotel',coalesce(d.account_name,'Synthetic email test'),m.state,m.created_at,d.document_job_id,m.id,m.revision,m.reason
  from ar_private.mail_deliveries m left join public.ar_email_drafts d on d.id=m.draft_id where m.owner=p_actor and m.state<>'sent'
  union all
  select 'archive',a.id::text,j.hotel,coalesce(j.account_name,'Synthetic archive test'),'attention',a.created_at,a.document_job_id,null::uuid,a.document_revision,min(f.error_code)
  from ar_private.drive_archives a join ar_private.drive_archive_files f on f.archive_id=a.id left join public.ar_document_jobs j on j.id=a.document_job_id
  where a.owner=p_actor and f.state not in('verified','trashed') group by a.id,j.hotel,j.account_name
  union all
  select 'refresh',r.id::text,r.hotel,'Current OPERA data',r.status,r.created_at,null::uuid,null::uuid,null::integer,r.error_code from latest_refresh r where r.status<>'succeeded'
  union all
  select 'financial',r.id::text,r.hotel,'OPERA financial history',r.status,r.created_at,null::uuid,null::uuid,null::integer,r.error_code from latest_financial r where r.status<>'succeeded'
 ),filtered as materialized(select * from items where p_kind='all' or kind=p_kind),page as(select * from filtered order by updated_at desc,kind,id offset p_offset limit 50)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.kind,p.id) from page p),'[]'::jsonb),'scope','pending_work_and_latest_source_runs') into result;return result;
end$$;

-- Fence new editor/mail work once departure has been accepted. Existing original
-- completion and receipt registration remain admitted; no provider request is repeated.
alter function public.ar_document_review(uuid,uuid,integer,jsonb,boolean) set schema ar_private;
alter function ar_private.ar_document_review(uuid,uuid,integer,jsonb,boolean) rename to ar_document_review_before_abandon_guard;
revoke all on function ar_private.ar_document_review_before_abandon_guard(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.ar_document_review(p_actor uuid,p_job_id uuid,p_revision integer,p_exports jsonb,p_acknowledged boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if j.discard_requested_at is not null then raise exception 'document_discard_pending';end if;
 return ar_private.ar_document_review_before_abandon_guard(p_actor,p_job_id,p_revision,p_exports,p_acknowledged);
end$$;
revoke all on function public.ar_document_review(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_review(uuid,uuid,integer,jsonb,boolean) to service_role;
alter function public.ar_document_begin_upload(uuid,uuid,text,bigint,text) set schema ar_private;
alter function ar_private.ar_document_begin_upload(uuid,uuid,text,bigint,text) rename to ar_document_begin_upload_before_abandon_guard;
revoke all on function ar_private.ar_document_begin_upload_before_abandon_guard(uuid,uuid,text,bigint,text) from public,anon,authenticated,service_role;
create function public.ar_document_begin_upload(p_actor uuid,p_job_id uuid,p_storage_key text,p_bytes bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if j.discard_requested_at is not null then raise exception 'document_discard_pending';end if;
 return ar_private.ar_document_begin_upload_before_abandon_guard(p_actor,p_job_id,p_storage_key,p_bytes,p_sha256);
end$$;
revoke all on function public.ar_document_begin_upload(uuid,uuid,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_begin_upload(uuid,uuid,text,bigint,text) to service_role;
alter function public.ar_email_open(uuid,uuid,integer) set schema ar_private;
alter function ar_private.ar_email_open(uuid,uuid,integer) rename to ar_email_open_before_abandon_guard;
revoke all on function ar_private.ar_email_open_before_abandon_guard(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function public.ar_email_open(p_actor uuid,p_job_id uuid,p_document_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if j.discard_requested_at is not null then return jsonb_build_object('error','document_discard_pending');end if;
 return ar_private.ar_email_open_before_abandon_guard(p_actor,p_job_id,p_document_revision);
end$$;
revoke all on function public.ar_email_open(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_email_open(uuid,uuid,integer) to service_role;
create or replace function ar_private.document_transient_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(new);j public.ar_document_jobs;jid uuid;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if tg_table_name in('ar_document_files','document_uploads','document_revisions') then jid:=(v->>'job_id')::uuid;
 elsif tg_table_name='ar_email_drafts' then jid:=(v->>'document_job_id')::uuid;
 elsif tg_table_name in('ar_email_attachments','gmail_draft_attempts','mail_deliveries') then select document_job_id into jid from public.ar_email_drafts where id=(v->>'draft_id')::uuid;
 elsif tg_table_name='drive_archives' then jid:=(v->>'document_job_id')::uuid;
 end if;
 if jid is null then return new;end if;
 select * into j from public.ar_document_jobs where id=jid for update;
 if j.lifecycle<>'transient' then return new;end if;
 if j.discard_requested_at is not null and tg_table_name not in('ar_document_files','document_uploads') then raise exception 'document_discard_pending';end if;
 if j.closed_at is not null and not (tg_table_name='document_uploads' and exists(select 1 from ar_private.document_transient_uploads u where u.job_id=jid and u.storage_key=v->>'storage_key' and not u.registered and not u.cancelled and u.byte_count=(v->>'byte_count')::bigint and u.sha256=v->>'sha256')) then raise exception 'document_closed';end if;
 if tg_table_name='drive_archives' then raise exception 'document_archive_retired';end if;
 if tg_table_name='document_revisions' and v->>'project_key' is not null or tg_table_name='document_uploads' and v->>'mime'='application/json' then raise exception 'document_project_retired';end if;
 if tg_table_name in('document_uploads','ar_email_attachments') then
  update ar_private.document_transient_uploads set registered=true where storage_key=new.storage_key and job_id=jid and byte_count=new.byte_count and sha256=new.sha256 and not cancelled;
  if not found then raise exception 'document_upload_intent_missing';end if;
 end if;
 return new;
end$$;
