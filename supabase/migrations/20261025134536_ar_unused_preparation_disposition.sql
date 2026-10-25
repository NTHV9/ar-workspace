-- Owner-confirmed unused preparations only. No accounting/history rows or provider
-- objects are deleted here. Existing managed retention owns byte deletion.
create table ar_private.unused_preparation_dispositions(
 job_id uuid primary key references public.ar_document_jobs(id),owner uuid not null references auth.users(id),
 revision integer not null,fingerprint text not null,snapshot_sha256 text not null check(snapshot_sha256~'^[0-9a-f]{64}$'),
 cutoff timestamptz not null,backup_manifest_sha256 text not null check(backup_manifest_sha256~'^[0-9a-f]{64}$'),
 backup_archive_sha256 text not null check(backup_archive_sha256~'^[0-9a-f]{64}$'),
 backup_metadata_sha256 text not null check(backup_metadata_sha256~'^[0-9a-f]{64}$'),
 objects jsonb not null check(jsonb_typeof(objects)='array'),retired_at timestamptz not null default clock_timestamp()
);
create table ar_private.unused_preparation_objects(
 object_id uuid primary key,job_id uuid not null references ar_private.unused_preparation_dispositions(job_id),
 storage_key text not null unique,target jsonb not null,reference_fingerprint text not null
);
create table ar_private.unused_preparation_text_cleanup(
 job_id uuid primary key references ar_private.unused_preparation_dispositions(job_id),completed_at timestamptz
);
alter table ar_private.unused_preparation_dispositions enable row level security;
alter table ar_private.unused_preparation_objects enable row level security;
alter table ar_private.unused_preparation_text_cleanup enable row level security;
revoke all on ar_private.unused_preparation_dispositions,ar_private.unused_preparation_objects,ar_private.unused_preparation_text_cleanup from public,anon,authenticated,service_role;
create function ar_private.unused_preparation_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'document_retirement_immutable';end$$;
create trigger unused_disposition_immutable before update or delete on ar_private.unused_preparation_dispositions for each row execute function ar_private.unused_preparation_immutable();
create trigger unused_object_immutable before update or delete on ar_private.unused_preparation_objects for each row execute function ar_private.unused_preparation_immutable();

-- This checks the *absence of use*, not invoice balance. The normal verified-zero
-- and calendar-month policy continues to apply to every non-disposition object.
create function ar_private.unused_preparation_problem(p_actor uuid,p_job_id uuid) returns text language plpgsql stable set search_path='' as $$
declare j public.ar_document_jobs;r record;linked uuid;
begin
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor;
 if not found then return 'document_forbidden';end if;
 if j.closed_reason='sent' or exists(select 1 from public.ar_email_drafts d where d.document_job_id=j.id and
  (exists(select 1 from ar_private.mail_deliveries m where m.draft_id=d.id) or exists(select 1 from ar_private.gmail_draft_attempts g where g.draft_id=d.id)))
 then return 'document_mail_pending';end if;
 if exists(select 1 from ar_private.drive_archives a where a.document_job_id=j.id) then return 'retention_shared_reference';end if;
 if exists(select 1 from ar_private.external_billing_records b where b.owner=j.owner and b.hotel=j.hotel and b.account_id=j.account_id
  and exists(select 1 from jsonb_array_elements(b.details->'lines') l where l->>'invoiceId'=any(j.invoice_ids))) then return 'document_business_history';end if;
 if j.state in('queued','running','uncertain') or exists(select 1 from public.ar_document_files f where f.job_id=j.id and f.state in('pending','generating','uncertain')) then return 'document_generation_pending';end if;
 if exists(select 1 from ar_private.document_transient_uploads u where u.job_id=j.id and not u.registered and not u.cancelled)
  or exists(select 1 from ar_private.storage_upload_operations b where split_part(b.object_key,'/',2)=j.id::text and not b.verified) then return 'document_upload_pending';end if;
 if exists(select 1 from ar_private.operations_budget_reservations b where b.owner=p_actor and b.state in('reserved','started')) then return 'retention_busy';end if;
 if exists(select 1 from public.ar_invoice_exceptions e where e.hotel=j.hotel and e.account_id=j.account_id and e.invoice_id=any(j.invoice_ids)
  and (e.held or e.needs_review or length(btrim(e.dispute))>0)) then return 'retention_held';end if;
 for r in select s.* from ar_private.retention_storage_references s where split_part(s.storage_key,'/',2)=j.id::text loop
  linked:=null;
  if r.kind='document_original' then select f.job_id into linked from public.ar_document_files f where f.id=r.reference_id;
  elsif r.kind in('document_upload','document_job','document_revision') then linked:=r.reference_id;
  elsif r.kind='email_draft' then select d.document_job_id into linked from public.ar_email_drafts d where d.id=r.reference_id;
  else return 'retention_shared_reference';end if;
  if linked is distinct from j.id or r.owner is distinct from p_actor then return 'retention_shared_reference';end if;
 end loop;
 if exists(select 1 from ar_private.remittance_files f where split_part(f.storage_key,'/',2)=j.id::text)
  or exists(select 1 from ar_private.remittance_diagnostics f where split_part(f.storage_key,'/',2)=j.id::text)
  or exists(select 1 from ar_private.drive_archive_files f where split_part(f.storage_key,'/',2)=j.id::text) then return 'retention_shared_reference';end if;
 return null;
end$$;

create function public.ar_unused_preparation_preview(p_actor uuid,p_job_id uuid,p_cutoff timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ar_document_jobs;problem text;objects jsonb:='[]';o storage.objects;ctx jsonb;snapshot jsonb;
begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 if p_cutoff is null or p_cutoff>'2026-10-24T17:00:00Z'::timestamptz or p_cutoff>clock_timestamp() then raise exception 'document_request_invalid';end if;
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor;
 if not found then raise exception 'document_forbidden';end if;
 if j.created_at>=p_cutoff or j.updated_at>=p_cutoff then raise exception 'document_preparation_active';end if;
 if exists(select 1 from public.ar_email_drafts d where d.document_job_id=j.id and d.updated_at>=p_cutoff) then raise exception 'document_preparation_active';end if;
 problem:=ar_private.unused_preparation_problem(p_actor,j.id);if problem is not null then raise exception using message=problem;end if;
 if exists(select 1 from ar_private.retention_items i where i.owner=p_actor and i.store='supabase' and split_part(i.storage_key,'/',2)=j.id::text and i.state in('claimed','uncertain')) then raise exception 'retention_busy';end if;
 for o in select * from storage.objects where bucket_id='ar-working-files' and split_part(name,'/',2)=j.id::text order by id loop
  if not ar_private.retention_storage_key(o.name) or split_part(o.name,'/',1)<>'jobs' or split_part(o.name,'/',3) not in('originals','exports','projects') then raise exception 'retention_unknown_source';end if;
  ctx:=ar_private.retention_context(p_actor,'supabase',o.id::text);
  if ctx?'error' then raise exception using message=ctx->>'error';end if;
  objects:=objects||jsonb_build_array(jsonb_build_object('objectId',o.id,'key',o.name,'byteCount',(ctx->'target'->>'byteCount')::bigint,
   'sha256',ctx->'target'->>'sha256','updatedAt',o.updated_at,'etag',o.metadata->>'eTag','referenceFingerprint',ctx->>'referenceFingerprint'));
 end loop;
 snapshot:=jsonb_build_object('job',to_jsonb(j),
  'files',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from public.ar_document_files f where f.job_id=j.id),
  'revisions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.revision),'[]') from ar_private.document_revisions v where v.job_id=j.id),
  'uploads',(select coalesce(jsonb_agg(to_jsonb(u) order by u.storage_key),'[]') from ar_private.document_uploads u where u.job_id=j.id),
  'uploadIntents',(select coalesce(jsonb_agg(to_jsonb(u) order by u.storage_key),'[]') from ar_private.document_transient_uploads u where u.job_id=j.id),
  'drafts',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.ar_email_drafts d where d.document_job_id=j.id),
  'commands',(select coalesce(jsonb_agg(to_jsonb(c) order by c.command_key),'[]') from ar_private.document_commands c where c.job_id=j.id),
  'objects',objects);
 return jsonb_build_object('jobId',j.id,'revision',j.revision,'fingerprint',j.fingerprint,'snapshotSha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
  'objects',objects,'retired',exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id));
end$$;

create function public.ar_unused_preparation_retire(p_actor uuid,p_job_id uuid,p_expected_revision integer,p_expected_fingerprint text,p_expected_snapshot_sha256 text,p_cutoff timestamptz,
 p_backup_manifest_sha256 text,p_backup_archive_sha256 text,p_backup_metadata_sha256 text,p_objects jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare preview jsonb;prior ar_private.unused_preparation_dispositions;o jsonb;ctx jsonb;
begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 if p_backup_manifest_sha256 is null or p_backup_manifest_sha256!~'^[0-9a-f]{64}$' or p_backup_archive_sha256 is null or p_backup_archive_sha256!~'^[0-9a-f]{64}$'
  or p_backup_metadata_sha256 is null or p_backup_metadata_sha256!~'^[0-9a-f]{64}$' or p_expected_snapshot_sha256 is null or p_expected_snapshot_sha256!~'^[0-9a-f]{64}$'
  or p_expected_revision is null or p_expected_fingerprint is null or jsonb_typeof(p_objects) is distinct from 'array' then raise exception 'document_backup_required';end if;
 perform pg_advisory_xact_lock(61704,1439);
 perform 1 from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found then raise exception 'document_forbidden';end if;
 select * into prior from ar_private.unused_preparation_dispositions where job_id=p_job_id;
 if found then
  if row(prior.owner,prior.revision,prior.fingerprint,prior.snapshot_sha256,prior.cutoff,prior.backup_manifest_sha256,prior.backup_archive_sha256,prior.backup_metadata_sha256,prior.objects)
   is distinct from row(p_actor,p_expected_revision,p_expected_fingerprint,p_expected_snapshot_sha256,p_cutoff,p_backup_manifest_sha256,p_backup_archive_sha256,p_backup_metadata_sha256,p_objects) then raise exception 'document_retirement_conflict';end if;
  return jsonb_build_object('jobId',prior.job_id,'outcome','retired','retiredAt',prior.retired_at,'objectCount',jsonb_array_length(prior.objects));
 end if;
 preview:=public.ar_unused_preparation_preview(p_actor,p_job_id,p_cutoff);
 if (preview->>'revision')::integer is distinct from p_expected_revision or preview->>'fingerprint' is distinct from p_expected_fingerprint or preview->>'snapshotSha256' is distinct from p_expected_snapshot_sha256
  or preview->'objects' is distinct from p_objects then raise exception 'document_retirement_conflict';end if;
 insert into ar_private.unused_preparation_dispositions(job_id,owner,revision,fingerprint,snapshot_sha256,cutoff,backup_manifest_sha256,backup_archive_sha256,backup_metadata_sha256,objects)
 values(p_job_id,p_actor,p_expected_revision,p_expected_fingerprint,p_expected_snapshot_sha256,p_cutoff,p_backup_manifest_sha256,p_backup_archive_sha256,p_backup_metadata_sha256,p_objects) returning * into prior;
 for o in select value from jsonb_array_elements(p_objects) loop
  ctx:=ar_private.retention_context(p_actor,'supabase',o->>'objectId');
  insert into ar_private.unused_preparation_objects(object_id,job_id,storage_key,target,reference_fingerprint)
  values((o->>'objectId')::uuid,p_job_id,o->>'key',ctx->'target',o->>'referenceFingerprint');
 end loop;
 insert into ar_private.unused_preparation_text_cleanup(job_id) values(p_job_id);
 return jsonb_build_object('jobId',p_job_id,'outcome','retired','retiredAt',prior.retired_at,'objectCount',jsonb_array_length(p_objects));
end$$;

create function ar_private.unused_preparation_blanking(p_old jsonb,p_new jsonb,p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from ar_private.unused_preparation_text_cleanup where job_id=p_job and completed_at is null)
 and p_new->>'subject'='' and p_new->>'body'='' and p_new->>'rich_body' is null and p_new->>'template_ref' is null
 and p_new->'recipients'='{"to":[],"cc":[],"bcc":[]}'::jsonb
 and (p_new-array['subject','body','rich_body','template_ref','recipients','updated_at'])=(p_old-array['subject','body','rich_body','template_ref','recipients','updated_at']);
$$;
-- Fence even legacy work and cross-job references to disposed objects. The same
-- admission lock makes retirement atomic with review/save/provider claim writes.
create function ar_private.unused_preparation_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;jid uuid;k jsonb;
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if tg_table_name='ar_document_jobs' then jid:=(v->>'id')::uuid;
 elsif tg_table_name in('ar_document_files','document_uploads','document_revisions') then jid:=(v->>'job_id')::uuid;
 elsif tg_table_name='ar_email_drafts' then jid:=(v->>'document_job_id')::uuid;
 elsif tg_table_name in('ar_email_attachments','gmail_draft_attempts','mail_deliveries') then select document_job_id into jid from public.ar_email_drafts where id=(v->>'draft_id')::uuid;
 elsif tg_table_name='drive_archives' then jid:=(v->>'document_job_id')::uuid;end if;
 if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=jid) then
  if tg_op='UPDATE' and tg_table_name='ar_email_drafts' and ar_private.unused_preparation_blanking(to_jsonb(old),v,jid)
   and ar_private.unused_preparation_problem((v->>'owner')::uuid,jid) is null then return new;end if;
  raise exception 'document_closed';
 end if;
 if tg_op<>'DELETE' then
  for k in select value from jsonb_path_query(v,'$.**.storage_key') value union all select v->'project_key' where v->>'project_key' is not null loop
   if exists(select 1 from ar_private.unused_preparation_objects where storage_key=k#>>'{}') then raise exception 'retention_shared_reference';end if;
  end loop;
 end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
do $$declare name text;begin
 foreach name in array array['public.ar_document_jobs','public.ar_document_files','ar_private.document_uploads','ar_private.document_revisions','public.ar_email_drafts','public.ar_email_attachments','ar_private.gmail_draft_attempts','ar_private.mail_deliveries','ar_private.drive_archives','ar_private.drive_archive_files','ar_private.remittance_files','ar_private.remittance_diagnostics'] loop
  execute format('create trigger a_unused_preparation_guard before insert or update or delete on %s for each row execute function ar_private.unused_preparation_reference_guard()',name);
 end loop;
end$$;
-- Existing transient guard must recognize this exact deferred text clear before
-- its closed/discard checks. This does not reopen a document or rewrite its row.
do $$declare definition text:=pg_get_functiondef('ar_private.document_transient_reference_guard()'::regprocedure);needle text:=' if j.lifecycle<>''transient'' then return new;end if;';begin
 if strpos(definition,needle)=0 then raise exception 'Transient reference guard boundary changed';end if;
 definition:=replace(definition,needle,$s$ if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=jid) then
  if tg_op='UPDATE' and tg_table_name='ar_email_drafts' and ar_private.unused_preparation_blanking(to_jsonb(old),v,jid) then return new;end if;
  raise exception 'document_closed';end if;
$s$||needle);execute definition;
end$$;

-- This projection closes resumable UI/API paths while preserving the real legacy
-- lifecycle, original state, package, revision, fingerprint and timestamps.
create or replace function public.ar_document_get(p_job_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(j)||jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f) order by f.ordinal) from public.ar_document_files f where f.job_id=j.id),'[]'::jsonb))
 ||case when u.job_id is not null then jsonb_build_object('closed_at',coalesce(j.closed_at,u.retired_at),'closed_reason',coalesce(j.closed_reason,'discarded'),'retired',true) else '{}'::jsonb end
 from public.ar_document_jobs j left join ar_private.unused_preparation_dispositions u on u.job_id=j.id where j.id=p_job_id;
$$;
do $$declare definition text:=pg_get_functiondef('public.ar_email_open(uuid,uuid,integer)'::regprocedure);needle text:=' if j.discard_requested_at is not null then';begin
 if strpos(definition,needle)=0 then raise exception 'Email admission guard changed';end if;
 execute replace(definition,needle,$s$ if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=p_job_id) then return jsonb_build_object('error','document_closed');end if;
$s$||needle);
 definition:=pg_get_functiondef('public.ar_operations_queue(uuid,text,integer)'::regprocedure);needle:='j.closed_at is null and (j.state';
 if strpos(definition,needle)=0 then raise exception 'Operations queue boundary changed';end if;
 execute replace(definition,needle,'j.closed_at is null and not exists(select 1 from ar_private.unused_preparation_dispositions u where u.job_id=j.id) and (j.state');
end$$;

-- No draft row lock is taken by the retirement transaction. Maintenance skips
-- admitted saves and retries; the immutable receipt remains after text removal.
create function ar_private.scrub_unused_preparation_messages(p_actor uuid,p_job_id uuid,p_limit integer) returns integer language plpgsql security definer set search_path='' as $$
declare jid uuid;did uuid;n integer:=0;
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 for jid in select u.job_id from ar_private.unused_preparation_text_cleanup c join ar_private.unused_preparation_dispositions u on u.job_id=c.job_id
  where u.owner=p_actor and c.completed_at is null and (p_job_id is null or u.job_id=p_job_id) order by u.retired_at,u.job_id limit p_limit loop
  if ar_private.unused_preparation_problem(p_actor,jid) is not null then continue;end if;
  for did in select id from public.ar_email_drafts where document_job_id=jid and owner=p_actor
   and (subject<>'' or body<>'' or rich_body is not null or template_ref is not null or recipients<>'{"to":[],"cc":[],"bcc":[]}'::jsonb)
   order by id limit p_limit for update skip locked loop
   update public.ar_email_drafts set subject='',body='',rich_body=null,template_ref=null,recipients='{"to":[],"cc":[],"bcc":[]}',updated_at=clock_timestamp() where id=did;n:=n+1;
  end loop;
  if not exists(select 1 from public.ar_email_drafts where document_job_id=jid and (subject<>'' or body<>'' or rich_body is not null or template_ref is not null or recipients<>'{"to":[],"cc":[],"bcc":[]}'::jsonb)) then
   update ar_private.unused_preparation_text_cleanup set completed_at=clock_timestamp() where job_id=jid;
  end if;
 end loop;return n;
end$$;

alter function ar_private.retention_transient_eligibility(uuid,text,text) rename to retention_transient_before_unused;
create function ar_private.retention_transient_eligibility(p_actor uuid,p_store text,p_key text) returns jsonb language plpgsql stable set search_path='' as $$
declare u ar_private.unused_preparation_objects;d ar_private.unused_preparation_dispositions;ctx jsonb;problem text;
begin
 if p_store<>'supabase' then return ar_private.retention_transient_before_unused(p_actor,p_store,p_key);end if;
 select * into u from ar_private.unused_preparation_objects where storage_key=p_key;
 if not found then return ar_private.retention_transient_before_unused(p_actor,p_store,p_key);end if;
 select * into d from ar_private.unused_preparation_dispositions where job_id=u.job_id and owner=p_actor;
 if not found then return jsonb_build_object('error','retention_forbidden');end if;
 problem:=ar_private.unused_preparation_problem(p_actor,d.job_id);if problem is not null then return jsonb_build_object('error',problem);end if;
 ctx:=ar_private.retention_context(p_actor,'supabase',u.object_id::text);
 if ctx?'error' then return ctx;end if;
 if ctx->'target' is distinct from u.target then return jsonb_build_object('error','retention_identity_mismatch');end if;
 if ctx->>'referenceFingerprint' is distinct from u.reference_fingerprint then return jsonb_build_object('error','retention_references_changed');end if;
 return jsonb_build_object('complete',true,'transient',true,'minimumEligibleAt',d.retired_at);
end$$;

-- An already-backed retirement is also a terminal discard receipt for the two
-- existing HTTP commands. Their Worker handler can run exact-job managed cleanup
-- immediately, including legacy objects; no separate destructive endpoint exists.
do $$declare oid regprocedure;definition text;needle text:=' if j.lifecycle<>''transient'' then raise exception ''document_lifecycle_invalid'';end if;';replacement text;begin
 foreach oid in array array['public.ar_document_abandon(uuid,uuid)'::regprocedure,'public.ar_document_discard(uuid,uuid)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);if strpos(definition,needle)=0 then raise exception 'Document discard lifecycle boundary changed';end if;
  replacement:=case when oid='public.ar_document_abandon(uuid,uuid)'::regprocedure then
   $s$ if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id and owner=p_actor) then return jsonb_build_object('job',public.ar_document_get(j.id),'outcome','discarded');end if;
$s$ else $s$ if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id and owner=p_actor) then return public.ar_document_get(j.id);end if;
$s$ end;
  execute replace(definition,needle,replacement||needle);
 end loop;
end$$;

-- Reuse both existing exact-object maintenance entrypoints (10 rows in Worker).
-- Only receipt-pinned objects join this queue; all other legacy/Drive policy stays.
do $$declare oid regprocedure;definition text;needle text;addition text;begin
 foreach oid in array array['public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure,'public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);
  needle:=' if p_limit is null or p_limit not between 1 and 25 then raise exception ''document_request_invalid'';end if;';
  if strpos(definition,needle)=0 then raise exception 'Cleanup validation boundary changed';end if;
  definition:=replace(definition,needle,needle||case when oid='public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure then E'\n perform ar_private.scrub_unused_preparation_messages(p_actor,null,p_limit);' else E'\n perform ar_private.scrub_unused_preparation_messages(p_actor,p_job_id,p_limit);' end);
  needle:=')cnd left join';if strpos(definition,needle)=0 then raise exception 'Cleanup rotation boundary changed';end if;
  addition:=$s$ union select u.object_id from ar_private.unused_preparation_objects u join ar_private.unused_preparation_dispositions d on d.job_id=u.job_id
   where d.owner=p_actor and (exists(select 1 from storage.objects o where o.id=u.object_id and o.bucket_id='ar-working-files')
    or exists(select 1 from ar_private.retention_items r where r.store='supabase' and r.object_id=u.object_id::text and r.state<>'deleted'))$s$;
  if oid='public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure then
   addition:=addition||' and u.job_id=p_job_id';
   needle:='and lifecycle=''transient'' and closed_at is not null)';
   if strpos(definition,needle)=0 then raise exception 'Exact-job cleanup guard changed';end if;
   definition:=replace(definition,needle,'and ((lifecycle=''transient'' and closed_at is not null) or exists(select 1 from ar_private.unused_preparation_dispositions d where d.job_id=p_job_id and d.owner=p_actor)))');
  end if;
  definition:=replace(definition,')cnd left join',addition||E'\n )cnd left join');execute definition;
 end loop;
end$$;

-- The explicit unused receipt owns cleanup from retirement onward. Older retry
-- queues must not attempt to rewrite an immutable retired job or spend their
-- bounded window returning the same already-retired abandon request forever.
do $$declare oid regprocedure;definition text;needle text;begin
 foreach oid in array array['ar_private.scrub_discarded_messages(uuid,uuid,integer)'::regprocedure,'public.ar_document_finalize_abandoned(uuid,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);needle:='where j.owner=p_actor and j.lifecycle=';
  if strpos(definition,needle)=0 then raise exception 'Prior preparation cleanup boundary changed';end if;
  execute replace(definition,needle,'where j.owner=p_actor and not exists(select 1 from ar_private.unused_preparation_dispositions d where d.job_id=j.id) and j.lifecycle=');
 end loop;
end$$;

revoke all on function ar_private.unused_preparation_immutable(),ar_private.unused_preparation_problem(uuid,uuid),ar_private.unused_preparation_blanking(jsonb,jsonb,uuid),ar_private.unused_preparation_reference_guard(),ar_private.scrub_unused_preparation_messages(uuid,uuid,integer),ar_private.retention_transient_before_unused(uuid,text,text),ar_private.retention_transient_eligibility(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_unused_preparation_preview(uuid,uuid,timestamptz),public.ar_unused_preparation_retire(uuid,uuid,integer,text,text,timestamptz,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_unused_preparation_preview(uuid,uuid,timestamptz),public.ar_unused_preparation_retire(uuid,uuid,integer,text,text,timestamptz,text,text,text,jsonb) to service_role;
