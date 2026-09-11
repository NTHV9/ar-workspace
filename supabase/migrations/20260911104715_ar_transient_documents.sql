-- Fresh preparations retain business metadata but no editor projects.
alter table public.ar_document_jobs add column lifecycle text not null default 'legacy' check(lifecycle in('legacy','transient'));
alter table public.ar_document_jobs add column closed_at timestamptz;
alter table public.ar_document_jobs add column closed_reason text check(closed_reason in('sent','discarded'));
alter table public.ar_document_jobs add constraint document_closure_valid check((closed_at is null)=(closed_reason is null) and (closed_at is null or lifecycle='transient'));
alter table ar_private.document_revisions alter column project_key drop not null;
alter table ar_private.document_revisions drop constraint document_revisions_check;
alter table ar_private.document_revisions add constraint document_revisions_check check(project_key is null or ar_private.document_path(job_id,project_key));
create function ar_private.document_lifecycle_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.lifecycle:=case when current_setting('ar.document_lifecycle',true)='transient' then 'transient' else 'legacy' end;
 else
  if new.lifecycle<>old.lifecycle then raise exception 'document_lifecycle_immutable';end if;
  if old.closed_at is not null and new is distinct from old then raise exception 'document_closed';end if;
 end if;
 if new.lifecycle='transient' and new.project_key is not null then raise exception 'document_project_retired';end if;
 return new;
end$$;
create trigger document_lifecycle_guard before insert or update on public.ar_document_jobs for each row execute function ar_private.document_lifecycle_guard();

-- A durable upload intent fences closure across the provider request. Unknown
-- provider outcomes retain the exact intent and block cleanup, without a timeout.
create table ar_private.document_transient_uploads(
 storage_key text primary key,job_id uuid not null references public.ar_document_jobs(id),
 byte_count bigint not null check(byte_count between 1 and 104857600),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 registered boolean not null default false,cancelled boolean not null default false,recovery_checked_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
alter table ar_private.document_transient_uploads enable row level security;
revoke all on ar_private.document_transient_uploads from public,anon,authenticated,service_role;
create function ar_private.document_pending_mail(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.ar_email_drafts d join ar_private.mail_deliveries m on m.draft_id=d.id where d.document_job_id=p_job and m.state<>'sent')
 or exists(select 1 from public.ar_email_drafts d join ar_private.gmail_draft_attempts g on g.draft_id=d.id where d.document_job_id=p_job and not exists(select 1 from ar_private.mail_deliveries m where m.draft_id=d.id and m.revision=g.revision and m.state='sent'));
$$;
create function public.ar_document_begin_upload(p_actor uuid,p_job_id uuid,p_storage_key text,p_bytes bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;r ar_private.document_transient_uploads;inserted integer;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found or not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if j.closed_at is not null then raise exception 'document_closed';end if;
 if j.lifecycle<>'transient' then raise exception 'document_lifecycle_invalid';end if;
 if p_storage_key is null or p_storage_key !~ ('^jobs/'||j.id||'/(exports/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf|email/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})$') or p_bytes is null or p_sha256 is null then raise exception 'document_upload_invalid';end if;
 if not ar_private.retention_write_allowed(p_actor,j.hotel,j.account_id,j.invoice_ids,array[p_storage_key]) then raise exception 'retention_busy';end if;
 insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256) values(p_storage_key,p_job_id,p_bytes,p_sha256) on conflict do nothing;
 get diagnostics inserted=row_count;
 select * into r from ar_private.document_transient_uploads where storage_key=p_storage_key;
 if row(r.job_id,r.byte_count,r.sha256) is distinct from row(p_job_id,p_bytes,p_sha256) then raise exception 'document_upload_conflict';end if;
 if inserted=0 and not r.registered and not r.cancelled then raise exception 'document_upload_pending';end if;
 if r.cancelled then update ar_private.document_transient_uploads set cancelled=false where storage_key=p_storage_key;inserted:=1;end if;
 return jsonb_build_object('registered',r.registered,'created',inserted=1);
end$$;

-- Trigger-level fences also cover old RPCs and direct internal callers.
create function ar_private.document_transient_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
 if j.closed_at is not null and not (tg_table_name='document_uploads' and exists(select 1 from ar_private.document_transient_uploads u where u.job_id=jid and u.storage_key=v->>'storage_key' and not u.registered and not u.cancelled and u.byte_count=(v->>'byte_count')::bigint and u.sha256=v->>'sha256')) then raise exception 'document_closed';end if;
 if tg_table_name='drive_archives' then raise exception 'document_archive_retired';end if;
 if tg_table_name='document_revisions' and v->>'project_key' is not null or tg_table_name='document_uploads' and v->>'mime'='application/json' then raise exception 'document_project_retired';end if;
 if tg_table_name in('document_uploads','ar_email_attachments') then
  update ar_private.document_transient_uploads set registered=true where storage_key=new.storage_key and job_id=jid and byte_count=new.byte_count and sha256=new.sha256 and not cancelled;
  if not found then raise exception 'document_upload_intent_missing';end if;
 end if;
 return new;
end$$;
do $$declare name text;begin
 foreach name in array array['public.ar_document_files','ar_private.document_uploads','ar_private.document_revisions','public.ar_email_drafts','public.ar_email_attachments','ar_private.gmail_draft_attempts','ar_private.mail_deliveries','ar_private.drive_archives'] loop
  -- Mail updates reconcile already-claimed work; only creation requires open state.
  execute format('create trigger document_transient_reference_guard before insert %s on %s for each row execute function ar_private.document_transient_reference_guard()',case when name in('ar_private.mail_deliveries','ar_private.gmail_draft_attempts') then '' else 'or update' end,name);
 end loop;
end$$;

create function public.ar_document_review(p_actor uuid,p_job_id uuid,p_revision integer,p_exports jsonb,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs; e jsonb;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found or not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if j.closed_at is not null then raise exception 'document_closed';end if;
 if j.lifecycle<>'transient' then raise exception 'document_lifecycle_invalid';end if;
 if p_revision is null or p_revision<0 or p_acknowledged is distinct from true or jsonb_typeof(p_exports) is distinct from 'array' then raise exception 'document_review_invalid';end if;
 if jsonb_array_length(p_exports) not between 1 and 4001 then raise exception 'document_review_invalid';end if;
 if j.revision=p_revision+1 and j.exports=p_exports and j.acknowledged then return public.ar_document_get(j.id);end if;
 if p_revision<>j.revision then raise exception 'document_revision_conflict';end if;
 if j.state not in('ready','partial') or exists(select 1 from public.ar_document_files where job_id=j.id and state in('pending','generating')) then raise exception 'document_sources_unavailable';end if;
 if ar_private.document_pending_mail(j.id) then raise exception 'document_mail_pending';end if;
 for e in select value from jsonb_array_elements(p_exports) loop
   if jsonb_typeof(e)<>'object' or not(e ?& array['name','storage_key','byte_count','sha256'])
     or (e-array['name','storage_key','byte_count','sha256'])<>'{}'::jsonb
     or jsonb_typeof(e->'name')<>'string' or length(e->>'name') not between 1 and 200
     or jsonb_typeof(e->'storage_key')<>'string' or not ar_private.document_path(p_job_id,e->>'storage_key')
     or jsonb_typeof(e->'byte_count')<>'number' or (e->>'byte_count') !~ '^[0-9]{1,9}$'
     or jsonb_typeof(e->'sha256')<>'string' or (e->>'sha256') !~ '^[0-9a-f]{64}$' then raise exception 'document_export_invalid'; end if;
   if (e->>'byte_count')::bigint not between 1 and 104857600 then raise exception 'document_export_size_invalid'; end if;
   if not exists(select 1 from ar_private.document_uploads u where u.job_id=p_job_id and u.storage_key=e->>'storage_key'
     and u.mime='application/pdf' and u.byte_count=(e->>'byte_count')::bigint and u.sha256=e->>'sha256') then
     raise exception 'document_export_upload_mismatch'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_exports) export_row(value) group by export_row.value->>'storage_key' having count(*)>1) then raise exception 'document_export_duplicate'; end if;
 -- Append references for every revision; no storage objects or older revisions are removed.
 insert into ar_private.document_revisions(job_id,revision,project_key,exports,acknowledged)
 values(j.id,j.revision+1,null,p_exports,p_acknowledged);
 update public.ar_document_jobs set revision=revision+1,project_key=null,exports=p_exports,acknowledged=p_acknowledged,updated_at=now() where id=j.id;
 return public.ar_document_get(j.id);
end;
$$;


create function public.ar_document_discard(p_actor uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;
begin
 perform pg_advisory_xact_lock(61704,1439);
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found or not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if j.lifecycle<>'transient' then raise exception 'document_lifecycle_invalid';end if;
 if j.closed_at is not null then return public.ar_document_get(j.id);end if;
 if j.state in('queued','running') or exists(select 1 from public.ar_document_files where job_id=j.id and state in('pending','generating')) then raise exception 'document_generation_pending';end if;
 if ar_private.document_pending_mail(j.id) then raise exception 'document_mail_pending';end if;
 if exists(select 1 from ar_private.document_transient_uploads where job_id=j.id and not registered and not cancelled) then raise exception 'document_upload_pending';end if;
 update public.ar_document_jobs set closed_at=clock_timestamp(),closed_reason='discarded' where id=j.id;
 return public.ar_document_get(j.id);
end$$;
create function ar_private.document_close_sent() returns trigger language plpgsql security definer set search_path='' as $$
declare jid uuid;
begin
 if new.state='sent' and old.state<>'sent' and new.mode<>'test' then
  select document_job_id into jid from public.ar_email_drafts where id=new.draft_id;
  if not ar_private.document_pending_mail(jid) then
   update public.ar_document_jobs set closed_at=clock_timestamp(),closed_reason='sent' where id=jid and lifecycle='transient' and closed_at is null;
  end if;
 end if;return new;
end$$;
create trigger document_close_sent after update of state on ar_private.mail_deliveries for each row execute function ar_private.document_close_sent();

-- This fast policy applies only to exact original/export receipts from transient
-- jobs. Every shared reference must independently be closed transient work.
-- Supplemental/remittance/Drive/legacy receipts retain the original month policy.
create function ar_private.retention_transient_eligibility(p_actor uuid,p_store text,p_key text) returns jsonb language plpgsql stable set search_path='' as $$
declare j public.ar_document_jobs;r record;other_job public.ar_document_jobs;d public.ar_email_drafts;m ar_private.mail_deliveries;minimum timestamptz;
begin
 if p_store<>'supabase' or p_key !~ '^jobs/[0-9a-f-]{36}/(originals|exports)/' then return null;end if;
 select * into j from public.ar_document_jobs where id::text=split_part(p_key,'/',2) and owner=p_actor;
 if not found or j.lifecycle<>'transient' then return null;end if;
 if j.closed_at is null then return jsonb_build_object('error','retention_pending_documents');end if;
 minimum:=j.closed_at;
 if ar_private.document_pending_mail(j.id) or exists(select 1 from ar_private.document_transient_uploads where job_id=j.id and not registered and not cancelled) then return jsonb_build_object('error','retention_pending_mail');end if;
 for r in select * from ar_private.retention_storage_references where storage_key=p_key loop
  if r.owner<>p_actor then return jsonb_build_object('error','retention_shared_reference');end if;
  other_job:=null;
  if r.kind='document_original' then select q.* into other_job from public.ar_document_jobs q join public.ar_document_files f on f.job_id=q.id where f.id=r.reference_id;
  elsif r.kind in('document_upload','document_job','document_revision') then select * into other_job from public.ar_document_jobs where id=r.reference_id;
  elsif r.kind='email_draft' then
   select * into d from public.ar_email_drafts where id=r.reference_id;
   select * into other_job from public.ar_document_jobs where id=d.document_job_id;
   -- An unsent local composer may be discarded, but external attempts remain protected.
   if ar_private.document_pending_mail(d.document_job_id) then return jsonb_build_object('error','retention_pending_mail');end if;
  elsif r.kind='mail_delivery' then
   select * into m from ar_private.mail_deliveries where id=r.reference_id;
   if m.state<>'sent' then return jsonb_build_object('error','retention_pending_mail');end if;
   select q.* into other_job from public.ar_document_jobs q join public.ar_email_drafts x on x.document_job_id=q.id where x.id=m.draft_id;
  else return jsonb_build_object('error','retention_shared_reference');end if;
  if other_job.id is null or other_job.lifecycle<>'transient' or other_job.closed_at is null then return jsonb_build_object('error','retention_shared_reference');end if;
  minimum:=greatest(minimum,other_job.closed_at);
 end loop;
 return jsonb_build_object('complete',true,'transient',true,'minimumEligibleAt',minimum);
end$$;

create or replace function ar_private.retention_refresh(p_actor uuid,p_id uuid,p_age integer) returns ar_private.retention_items language plpgsql set search_path='' as $$
declare r ar_private.retention_items;ctx jsonb;e jsonb;why text;since timestamptz;due timestamptz;minimum timestamptz;refs text;v_links jsonb;new_state text;
begin
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return null;end if;
 if r.state in('claimed','uncertain','deleted') then return r;end if;
 ctx:=ar_private.retention_context(p_actor,r.store,r.object_id);why:=ctx->>'error';refs:=r.reference_fingerprint;v_links:=r.links;minimum:=r.minimum_eligible_at;
 if why is null and ctx->'target' is distinct from r.target then why:='retention_identity_mismatch';end if;
 if why is null then
  refs:=ctx->>'referenceFingerprint';v_links:=ctx->'links';minimum:=(ctx->>'minimumEligibleAt')::timestamptz;
  e:=coalesce(ar_private.retention_transient_eligibility(p_actor,r.store,r.storage_key),ar_private.retention_eligibility(p_actor,v_links,p_age));why:=e->>'error';minimum:=greatest(minimum,(e->>'minimumEligibleAt')::timestamptz);
 end if;
 if why is null and minimum>clock_timestamp() then why:='retention_source_unknown';end if;
 if why='retention_source_stale' and r.eligible_since is not null and r.eligible_since>=minimum and refs=r.reference_fingerprint then since:=r.eligible_since;due:=r.due_at;new_state:='blocked';
 elsif why is not null then since:=null;due:=null;new_state:='blocked';
 else
  since:=r.eligible_since;
  if since is null or since<minimum or refs<>r.reference_fingerprint then since:=clock_timestamp();end if;
  due:=case when e->>'transient'='true' then since else ar_private.retention_month(since) end;new_state:='waiting';why:=case when due<=clock_timestamp() then 'retention_due' else 'retention_waiting' end;
 end if;
 if row(r.state,r.reason,r.eligible_since,r.due_at,r.reference_fingerprint,r.links,r.minimum_eligible_at) is distinct from row(new_state,why,since,due,refs,v_links,minimum) then
  update ar_private.retention_items set state=new_state,reason=why,eligible_since=since,due_at=due,reference_fingerprint=refs,links=v_links,minimum_eligible_at=minimum,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
  perform ar_private.retention_event(r,case when new_state='blocked' then 'blocked' else 'eligibility_observed' end);
 end if;return r;
end $$;



create or replace function public.ar_retention_arm(p_actor uuid,p_id uuid,p_claim uuid,p_source_max_age integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.retention_items;ctx jsonb;e jsonb;why text;minimum timestamptz;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','retention_forbidden');end if;
 if p_source_max_age is null or p_source_max_age not between 60 and 7200 then return jsonb_build_object('error','retention_invalid');end if;
 perform pg_advisory_xact_lock(61704,1439);
 select * into r from ar_private.retention_items where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','retention_missing');end if;
 if r.claim_id is distinct from p_claim or p_claim is null then return jsonb_build_object('error','retention_claim_lost');end if;
 if r.state<>'claimed' or r.claim_phase<>'inspect' or r.lease_until<=clock_timestamp() then return jsonb_build_object('proceed',false,'item',ar_private.retention_item_json(r));end if;
 ctx:=ar_private.retention_context(p_actor,r.store,r.object_id);why:=ctx->>'error';
 if why is null and ctx->'target' is distinct from r.target then why:='retention_identity_mismatch';end if;
 if why is null and ctx->>'referenceFingerprint'<>r.reference_fingerprint then why:='retention_references_changed';end if;
 if why is null then e:=coalesce(ar_private.retention_transient_eligibility(p_actor,r.store,r.storage_key),ar_private.retention_eligibility(p_actor,ctx->'links',p_source_max_age));why:=e->>'error';minimum:=greatest((ctx->>'minimumEligibleAt')::timestamptz,(e->>'minimumEligibleAt')::timestamptz);end if;
 if why is null and (r.eligible_since is null or r.eligible_since<minimum or r.due_at>clock_timestamp()) then why:='retention_waiting';end if;
 if why is not null then
  update ar_private.retention_items set state='blocked',reason=why,
   eligible_since=case when why='retention_source_stale' and r.eligible_since>=minimum then eligible_since else null end,
   due_at=case when why='retention_source_stale' and r.eligible_since>=minimum then due_at else null end,
   claim_id=null,claim_phase=null,lease_until=null,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
  perform ar_private.retention_event(r,'dispatch_blocked');return jsonb_build_object('proceed',false,'item',ar_private.retention_item_json(r));
 end if;
 update ar_private.retention_items set claim_phase='armed',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 perform ar_private.retention_event(r,'dispatch_armed');return jsonb_build_object('proceed',true,'item',ar_private.retention_item_json(r));
end $$;



-- Bounded scheduled cursor: oldest unchecked exact objects are processed first.
create table ar_private.transient_cleanup_checks(object_id uuid primary key,checked_at timestamptz not null default clock_timestamp());
alter table ar_private.transient_cleanup_checks enable row level security;
revoke all on ar_private.transient_cleanup_checks from public,anon,authenticated,service_role;
create function public.ar_document_cleanup_candidates(p_actor uuid,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;ids uuid[];
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 select array_agg(id) into ids from (
  select cnd.id from (
   select o.id from storage.objects o join public.ar_document_jobs j on j.id::text=split_part(o.name,'/',2)
   where o.bucket_id='ar-working-files' and j.owner=p_actor and j.lifecycle='transient' and j.closed_at is not null
   and o.name~'^jobs/[0-9a-f-]{36}/(originals|exports)/' and exists(select 1 from ar_private.retention_storage_receipts r where r.storage_key=o.name)
   union
   select r.object_id::uuid from ar_private.retention_items r join public.ar_document_jobs j on j.id::text=split_part(r.storage_key,'/',2)
   where r.owner=p_actor and r.store='supabase' and r.state<>'deleted' and j.lifecycle='transient' and j.closed_at is not null
   and r.storage_key~'^jobs/[0-9a-f-]{36}/(originals|exports)/'
  )cnd left join ar_private.transient_cleanup_checks c on c.object_id=cnd.id
  order by c.checked_at nulls first,cnd.id limit p_limit
 )s;
 insert into ar_private.transient_cleanup_checks(object_id) select unnest(ids) on conflict(object_id) do update set checked_at=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object('objectId',x.id,'itemId',r.id)),'[]') into result from unnest(ids)x(id) left join ar_private.retention_items r on r.store='supabase' and r.object_id=x.id::text;
 return result;
end$$;
-- RLS bytes protection remains in force even if a client bypasses the Worker.
alter policy ar_private_file_read on storage.objects to authenticated using (
 bucket_id='ar-working-files' and (select ar_private.is_member()) and (
 name like 'validation/%' or (split_part(name,'/',1)='jobs' and exists (
 select 1 from public.ar_document_jobs j where j.id::text=split_part(name,'/',2) and j.owner=(select auth.uid()) and j.closed_at is null
 and (j.lifecycle='legacy' or split_part(name,'/',3)<>'projects')))));
revoke all on function ar_private.document_lifecycle_guard(),ar_private.document_pending_mail(uuid),ar_private.document_transient_reference_guard(),ar_private.document_close_sent(),ar_private.retention_transient_eligibility(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_document_begin_upload(uuid,uuid,text,bigint,text),public.ar_document_review(uuid,uuid,integer,jsonb,boolean),public.ar_document_discard(uuid,uuid),public.ar_document_cleanup_candidates(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_begin_upload(uuid,uuid,text,bigint,text),public.ar_document_review(uuid,uuid,integer,jsonb,boolean),public.ar_document_discard(uuid,uuid),public.ar_document_cleanup_candidates(uuid,integer) to service_role;

create or replace function public.ar_email_get(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('document_closed_at',j.closed_at,'document_lifecycle',j.lifecycle,'thread',t.choice,'billing_method',s.billing_method,'billing_portal',s.billing_portal,'billing_instructions',coalesce(s.billing_instructions,''),'collection_instructions',coalesce(s.collection_instructions,''),'package_changed',j.revision<>d.document_revision or not j.acknowledged,'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.ar_email_attachments a where a.draft_id=d.id and not a.removed),'[]'::jsonb))
 from public.ar_email_drafts d join public.ar_document_jobs j on j.id=d.document_job_id left join public.ar_account_settings s on s.hotel=d.hotel and s.account_id=d.account_id left join ar_private.email_thread_choices t on t.draft_id=d.id and t.owner=d.owner where d.id=p_id and d.owner=p_actor;
$$;

-- Read-only account evidence. Existing event provenance is not reclassified as new activity.
create or replace function public.ar_account_workspace_read(p_actor uuid,p_hotel text,p_account text,p_section text,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','account_workspace_forbidden'); end if;
 if p_hotel is null or p_hotel not in ('KAT','TSK') or p_account is null or length(p_account) not between 1 and 200 or p_section is null or p_section not in ('history','documents') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','account_workspace_invalid'); end if;
 if not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account) then return jsonb_build_object('error','account_workspace_missing'); end if;
 if p_section='history' then
  with entries as materialized (
   select 'sent:'||e.delivery_id as id,e.sent_at as recorded_at,'Verified Gmail send' as source,e.purpose,e.stage,
    (e.sent_at at time zone 'Asia/Bangkok')::date as actual_date,e.invoice_ids, e.open_at_send as amount,
    d.document_job_id as job_id,null::integer as revision,null::date as first_billing_date,null::date as reminder_date,
    jsonb_build_object('subject',m.snapshot->'draft'->>'subject','body',m.snapshot->'draft'->>'body','recipients',m.snapshot->'draft'->'recipients') as message,e.stage_snapshot
   from public.ar_sent_events e left join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner
   left join public.ar_email_drafts d on d.id=m.draft_id and d.owner=e.owner
   where e.owner=p_actor and e.hotel=p_hotel and e.account_id=p_account
   union all
   select 'history:'||h.invoice_id||':'||h.revision,h.recorded_at,'Manual history correction','history',h.details->>'last_reminder_stage',
    null::date,array[h.invoice_id],null::numeric,null::uuid,h.revision,
    (h.details->>'first_billing_date')::date,(h.details->>'last_reminder_date')::date,null::jsonb,h.details->'last_reminder_stage_snapshot'
   from ar_private.invoice_workflow_history h where h.hotel=p_hotel and h.account_id=p_account and h.actor=p_actor and h.details->>'source' is distinct from 'gmail_sent'
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc,r.id) from (select * from entries order by recorded_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from entries)) into result;
 else
  with entries as materialized (
   select j.id,j.lifecycle,j.closed_at,j.closed_reason,j.created_at,j.updated_at,j.content,j.layout,j.purpose,j.state,j.revision,j.acknowledged,j.statement_source,cardinality(j.invoice_ids) as invoice_count,
    d.id as draft_id,d.revision as draft_revision,d.subject,
    m.id as delivery_id,m.state as delivery_state,m.reason as delivery_reason,m.sent_at,m.reconcile_checked_at,
    coalesce(t.choice->>'threadId','')<>'' as has_thread
   from public.ar_document_jobs j
   left join lateral (select * from public.ar_email_drafts where document_job_id=j.id and owner=p_actor order by document_revision desc,created_at desc,id desc limit 1) d on true
   left join lateral (select id,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries where owner=p_actor and draft_id=d.id order by created_at desc,id desc limit 1) m on true
   left join ar_private.email_thread_choices t on t.draft_id=d.id and t.owner=p_actor
   where j.owner=p_actor and j.hotel=p_hotel and j.account_id=p_account
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (select * from entries order by created_at desc,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from entries)) into result;
 end if;
 return result||jsonb_build_object('hotel',p_hotel,'accountId',p_account,'section',p_section,'offset',p_offset,'limit',p_limit);
end $$;
revoke all on function public.ar_account_workspace_read(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ar_account_workspace_read(uuid,text,text,text,integer,integer) to service_role;

create function public.ar_document_pending_uploads(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 with selected as materialized(select u.storage_key from ar_private.document_transient_uploads u join public.ar_document_jobs j on j.id=u.job_id join storage.objects o on o.bucket_id='ar-working-files' and o.name=u.storage_key where j.owner=p_actor and not u.registered and not u.cancelled order by u.recovery_checked_at nulls first,u.created_at,u.storage_key limit 5),
 checked as(update ar_private.document_transient_uploads u set recovery_checked_at=clock_timestamp() from selected s where u.storage_key=s.storage_key returning u.job_id,u.storage_key,u.byte_count,u.sha256)
 select coalesce(jsonb_agg(to_jsonb(checked)),'[]') into result from checked;
 return result;
end$$;
revoke all on function public.ar_document_pending_uploads(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_pending_uploads(uuid) to service_role;

-- Discarded uncertain generation is terminal metadata, no longer active dedup scope.
drop index public.ar_document_active_scope;
create unique index ar_document_active_scope on public.ar_document_jobs(owner,fingerprint) where state in('queued','running','uncertain') and closed_at is null;
create or replace function ar_private.document_create_before_source_policy(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare template_id text; payload jsonb; prior ar_private.document_commands; j public.ar_document_jobs; snap jsonb; total numeric; nm text; fp text;
begin
 if p_statement_source is null or p_statement_source not in ('native','workspace') or (p_statement_source='workspace' and p_content='invoices') then raise exception 'document_request_invalid'; end if;
 if p_statement_source='workspace' then select version into template_id from ar_private.statement_templates where hotel=p_hotel and active; if template_id is null then raise exception 'document_statement_template_missing'; end if; end if;
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
   raise exception 'document_owner_denied'; end if;
 if p_command_key is null or p_hotel is null or p_hotel not in ('KAT','TSK') or p_account_id is null or length(p_account_id) not between 1 and 200
   or p_content is null or p_content not in ('statement','invoices','both') or p_layout is null or p_layout not in ('combined','statement_bundle','separate')
   or p_purpose is null or p_purpose not in ('billing','collection') or p_ids is null or array_ndims(p_ids)<>1
   or cardinality(p_ids) not between 1 and 4000 or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v)
   or exists(select 1 from unnest(p_ids) v where v is null or length(v) not between 1 and 200) then raise exception 'document_request_invalid'; end if;
 payload:=jsonb_build_object('hotel',p_hotel,'account_id',p_account_id,'ids',p_ids,'content',p_content,'layout',p_layout,'purpose',p_purpose,'statement_source',p_statement_source,'template_version',template_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into prior from ar_private.document_commands where owner=p_owner and command_key=p_command_key;
 if found then
   if prior.payload<>payload then raise exception 'document_command_conflict'; end if;
   return public.ar_document_get(prior.job_id);
 end if;
 -- Selection order is binding; differently ordered manifests are different work.
 fp:=md5(payload::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||fp,61706));
 -- Coordinate with atomic refresh publication; capture exactly one current selection snapshot.
 perform pg_catalog.pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
 select jsonb_agg(to_jsonb(i) order by ids.ordinal),sum(i.open) into snap,total
 from unnest(p_ids) with ordinality ids(id,ordinal)
 join public.ar_invoices i on i.hotel=p_hotel and i.account_id=p_account_id and i.id=ids.id and i.collection_selectable;
 if snap is null or jsonb_array_length(snap)<>cardinality(p_ids) then raise exception 'document_selection_invalid'; end if;
 select name into nm from public.ar_accounts where hotel=p_hotel and id=p_account_id;
 if not found then raise exception 'document_account_missing'; end if;
 select * into j from public.ar_document_jobs where owner=p_owner and fingerprint=fp and state in ('queued','running','uncertain') and closed_at is null for update;
 if found then
   insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
   return public.ar_document_get(j.id);
 end if;
 insert into public.ar_document_jobs(owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,statement_source,template_version)
 values(p_owner,p_command_key,p_hotel,p_account_id,nm,p_ids,p_content,p_layout,p_purpose,fp,snap,total,p_statement_source,template_id) returning * into j;
 if p_content in ('statement','both') then insert into public.ar_document_files(job_id,ordinal,kind) values(j.id,0,'statement'); end if;
 if p_content in ('invoices','both') then
   insert into public.ar_document_files(job_id,ordinal,kind,invoice_id) select j.id,ordinal::integer,'invoice',id from unnest(p_ids) with ordinality ids(id,ordinal);
 end if;
 insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
 return public.ar_document_get(j.id);
end;
$$;

-- Successful unlinked supplemental bytes remain preserved; observation only
-- releases the in-flight write fence, never attaches/deletes a customer file.
create function public.ar_document_observe_supplemental_upload(p_actor uuid,p_key text,p_sha256 text) returns boolean language plpgsql security definer set search_path='' as $$
declare u ar_private.document_transient_uploads;
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 perform pg_advisory_xact_lock_shared(61704,1439);
 select x.* into u from ar_private.document_transient_uploads x join public.ar_document_jobs j on j.id=x.job_id where x.storage_key=p_key and j.owner=p_actor and not x.cancelled for update of x;
 if not found or split_part(p_key,'/',3)<>'email' or u.sha256 is distinct from p_sha256 or not exists(select 1 from storage.objects o where o.bucket_id='ar-working-files' and o.name=p_key and o.metadata->>'size'=u.byte_count::text) then raise exception 'document_upload_conflict';end if;
 update ar_private.document_transient_uploads set registered=true where storage_key=p_key;
 return true;
end$$;
revoke all on function public.ar_document_observe_supplemental_upload(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_observe_supplemental_upload(uuid,text,text) to service_role;

-- Only the Worker that created this exact intent can report a proven pre-dispatch
-- failure. Retain the audit row; absence after an attempted POST never reaches this RPC.
create function public.ar_document_cancel_undispatched_upload(p_actor uuid,p_job_id uuid,p_key text,p_sha256 text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 perform pg_advisory_xact_lock_shared(61704,1439);
 perform 1 from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found then raise exception 'document_forbidden';end if;
 if exists(select 1 from storage.objects where bucket_id='ar-working-files' and name=p_key) then return false;end if;
 update ar_private.document_transient_uploads set cancelled=true where job_id=p_job_id and storage_key=p_key and sha256=p_sha256 and not registered;
 return found;
end$$;
revoke all on function public.ar_document_cancel_undispatched_upload(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_cancel_undispatched_upload(uuid,uuid,text,text) to service_role;

-- Verified supplemental intents retain exact orphan receipts under the original month policy.
create or replace view ar_private.retention_storage_receipts as
 select f.storage_key,j.owner,j.hotel,j.account_id,j.invoice_ids,f.byte_count,f.sha256,f.created_at as recorded_at,(f.state='ready') as ready,'document_original'::text as kind,f.id as reference_id
 from public.ar_document_files f join public.ar_document_jobs j on j.id=f.job_id where f.storage_key is not null
 union all
 select f.storage_key,j.owner,j.hotel,j.account_id,j.invoice_ids,f.byte_count,f.sha256,f.created_at,true,'document_upload',j.id
 from ar_private.document_uploads f join public.ar_document_jobs j on j.id=f.job_id
 union all
 select f.storage_key,d.owner,d.hotel,d.account_id,d.invoice_ids,f.byte_count,f.sha256,f.created_at,true,'email_attachment',d.id
 from public.ar_email_attachments f join public.ar_email_drafts d on d.id=f.draft_id
 union all
 select f.storage_key,r.owner,r.hotel,r.account_id,array(select l.invoice_id from public.ar_remittance_lines l where l.record_id=r.id order by l.position),f.byte_count,f.sha256,f.created_at,(f.ready_at is not null),'remittance_file',r.id
 from ar_private.remittance_files f join public.ar_remittances r on r.id=f.record_id
 union all
 select u.storage_key,j.owner,j.hotel,j.account_id,j.invoice_ids,u.byte_count,u.sha256,u.created_at,true,'document_upload',j.id
 from ar_private.document_transient_uploads u join public.ar_document_jobs j on j.id=u.job_id
 where u.registered and not u.cancelled and split_part(u.storage_key,'/',3)='email';

-- Versioned opt-in keeps the pre-deployment Worker on legacy behavior during
-- database-first rollout. Joined/replayed legacy jobs retain their lifecycle.
create function public.ar_document_create_v4(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text,p_statement_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_setting text:=current_setting('ar.document_lifecycle',true);result jsonb;
begin
 perform set_config('ar.document_lifecycle','transient',true);
 result:=public.ar_document_create_v3(p_owner,p_command_key,p_hotel,p_account_id,p_ids,p_content,p_layout,p_purpose,p_statement_source);
 perform set_config('ar.document_lifecycle',coalesce(previous_setting,''),true);
 return result;
end$$;
revoke all on function public.ar_document_create_v4(uuid,uuid,text,text,text[],text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_document_create_v4(uuid,uuid,text,text,text[],text,text,text,text) to service_role;
