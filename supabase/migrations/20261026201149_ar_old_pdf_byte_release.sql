-- Closed temporary supplemental copies use preparation closure, not AR balance.
-- Keep the installed combined-reference handling and unused-disposition policy.
do $$declare d text:=pg_get_functiondef('ar_private.retention_transient_before_unused(uuid,text,text)'::regprocedure);begin
 if strpos(d,'(originals|exports)/')=0 or strpos(d,'elsif r.kind=''email_draft'' then')=0 then raise exception 'pdf_release_transient_definition_drift';end if;
 d:=replace(d,'(originals|exports)/','(originals|exports|email)/');
 d:=replace(d,'elsif r.kind=''email_draft'' then','elsif r.kind in(''email_draft'',''email_attachment'') then');
 if strpos(d,' minimum:=j.closed_at;')=0 then raise exception 'pdf_release_normal_shared_guard_drift';end if;
 d:=replace(d,' minimum:=j.closed_at;',$q$ if exists(select 1 from ar_private.drive_archive_files where storage_key=p_key)
  or exists(select 1 from ar_private.remittance_diagnostics where storage_key=p_key) then return jsonb_build_object('error','retention_shared_reference');end if;
 minimum:=j.closed_at;$q$);
 execute d;
end$$;
do $$declare oid regprocedure;d text;begin
 foreach oid in array array['public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure,'public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure] loop
  d:=pg_get_functiondef(oid);if strpos(d,'(originals|exports)/')=0 then raise exception 'pdf_release_candidate_definition_drift';end if;
  execute replace(d,'(originals|exports)/','(originals|exports|email)/');
 end loop;
end$$;

-- One private operator-installed approval, exactly four normal and sixteen
-- exceptional members. No default IDs, caller email, employee endpoint or purge.
create table ar_private.pdf_release_cohort(
 id uuid primary key, singleton boolean not null default true unique check(singleton),
 owner uuid not null references auth.users(id),members jsonb not null,
 registered_at timestamptz not null default clock_timestamp());
create table ar_private.pdf_release_members(
 job_id uuid primary key references public.ar_document_jobs(id),cohort_id uuid not null references ar_private.pdf_release_cohort(id),
 class text not null check(class in('closed','exception')),identity_hash text not null);
create table ar_private.pdf_release_objects(
 object_id uuid primary key,cohort_id uuid not null references ar_private.pdf_release_cohort(id),job_id uuid not null references ar_private.pdf_release_members(job_id),
 storage_key text not null unique,target jsonb not null,reference_fingerprint text not null,already_deleted boolean not null default false);
create table ar_private.pdf_release_commits(
 cohort_id uuid primary key references ar_private.pdf_release_cohort(id),command_id uuid not null unique,
 inventory_digest text not null,result jsonb not null,released_at timestamptz not null default clock_timestamp());
create function ar_private.pdf_release_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'pdf_release_immutable';end$$;
do $$declare t text;begin
 foreach t in array array['pdf_release_cohort','pdf_release_members','pdf_release_objects','pdf_release_commits'] loop
  execute format('alter table ar_private.%I enable row level security',t);
  execute format('revoke all on ar_private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger pdf_release_immutable before update or delete on ar_private.%I for each row execute function ar_private.pdf_release_immutable()',t);
 end loop;
end$$;
create function ar_private.pdf_released(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from ar_private.pdf_release_members b join ar_private.pdf_release_commits c on c.cohort_id=b.cohort_id where b.job_id=p_job);
$$;
-- Resolve every reference, including the draft-id (not attachment-id) receipt.
create function ar_private.pdf_reference_jobs(p_kind text,p_id uuid) returns uuid[] language sql stable set search_path='' as $$
 select case
 when p_kind='document_original' then array(select job_id from public.ar_document_files where id=p_id)
 when p_kind in('document_upload','document_job','document_revision') then array[p_id]
 when p_kind in('email_draft','email_attachment') then array(select document_job_id from public.ar_email_drafts where id=p_id)
 when p_kind='mail_delivery' then array(select d.document_job_id from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where m.id=p_id)
 when p_kind='combined_delivery' then array(select document_job_id from ar_private.combined_delivery_members where delivery_id=p_id order by document_job_id)
 else array[]::uuid[] end;
$$;
create function ar_private.pdf_release_identity(p_job uuid) returns text language sql stable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('job',to_jsonb(j),
 'drafts',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.ar_email_drafts d where d.document_job_id=j.id),
 'mail',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from ar_private.mail_deliveries m where m.draft_id in(select id from public.ar_email_drafts where document_job_id=j.id) or exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=m.id and b.document_job_id=j.id)),
 'attempts',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from ar_private.gmail_draft_attempts g join public.ar_email_drafts d on d.id=g.draft_id where d.document_job_id=j.id),
 'files',(select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from public.ar_document_files f where f.job_id=j.id),
 'revisions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.revision),'[]') from ar_private.document_revisions v where v.job_id=j.id),
 'intents',(select coalesce(jsonb_agg(to_jsonb(u) order by u.storage_key),'[]') from ar_private.document_transient_uploads u where u.job_id=j.id))::text,'UTF8')),'hex')
 from public.ar_document_jobs j where j.id=p_job;
$$;
create function ar_private.pdf_release_problem(p_actor uuid,p_cohort uuid,p_job uuid,p_class text) returns text language plpgsql stable set search_path='' as $$
declare j public.ar_document_jobs;m ar_private.mail_deliveries;e jsonb;f jsonb;n integer:=0;r record;ids uuid[];
begin
 select * into j from public.ar_document_jobs where id=p_job and owner=p_actor;
 if not found or j.lifecycle<>'transient' then return 'document_forbidden';end if;
 if exists(select 1 from ar_private.unused_preparation_dispositions where job_id=j.id) then return 'pdf_release_prior_disposition';end if;
 if j.state in('queued','running','uncertain') or exists(select 1 from public.ar_document_files where job_id=j.id and state in('pending','generating','uncertain')) then return 'document_generation_pending';end if;
 if exists(select 1 from ar_private.document_transient_uploads where job_id=j.id and not registered and not cancelled)
 or exists(select 1 from ar_private.storage_upload_operations where split_part(object_key,'/',2)=j.id::text and not verified) then return 'document_upload_pending';end if;
 if exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts d on d.id=g.draft_id where d.document_job_id=j.id) then return 'pdf_release_legacy_attempt';end if;
 if exists(select 1 from ar_private.drive_archives where document_job_id=j.id)
 or exists(select 1 from ar_private.drive_archive_files where split_part(storage_key,'/',2)=j.id::text)
 or exists(select 1 from ar_private.remittance_diagnostics where split_part(storage_key,'/',2)=j.id::text) then return 'retention_shared_reference';end if;
 for m in select x.* from ar_private.mail_deliveries x where x.draft_id in(select id from public.ar_email_drafts where document_job_id=j.id)
 or exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=x.id and b.document_job_id=j.id) loop
  n:=n+1;
  if p_class='closed' then return 'document_mail_pending';end if;
  -- awaiting_evidence/pending may still have an in-flight provider operation.
  if m.state not in('created','review_required') or m.mode not in('draft','send') or m.draft_send_claimed_at is not null then return 'document_mail_pending';end if;
  e:=m.snapshot->'expected';
  if jsonb_typeof(e) is distinct from 'object' or e->>'mailbox' is distinct from m.mailbox or e->>'sender' is distinct from ar_private.gmail_sender(m.mailbox)
   or e->>'messageId' is distinct from m.message_id or jsonb_typeof(e->'recipients') is distinct from 'object'
   or jsonb_typeof(e->'recipients'->'to') is distinct from 'array' or jsonb_array_length(e->'recipients'->'to')=0
   or jsonb_typeof(e->'recipients'->'cc') is distinct from 'array' or jsonb_typeof(e->'recipients'->'bcc') is distinct from 'array'
   or jsonb_typeof(e->'subject') is distinct from 'string' or jsonb_typeof(e->'body') is distinct from 'string'
   or jsonb_typeof(e->'files') is distinct from 'array' or jsonb_array_length(e->'files')=0 then return 'pdf_release_evidence_incomplete';end if;
  for f in select value from jsonb_array_elements(e->'files') loop
   if coalesce(f->>'name','')='' or coalesce(f->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(f->>'byte_count','')!~'^[1-9][0-9]{0,8}$' then return 'pdf_release_evidence_incomplete';end if;
  end loop;
  if m.combined_preparation_id is null then
   if e->'recipients' is distinct from m.snapshot->'draft'->'recipients' or e->>'subject' is distinct from m.snapshot->'draft'->>'subject' or e->>'body' is distinct from m.snapshot->'draft'->>'body'
    or exists(select 1 from jsonb_array_elements(coalesce(m.snapshot->'draft'->'exports','[]')||coalesce(m.snapshot->'draft'->'attachments','[]')) x
     where not exists(select 1 from jsonb_array_elements(e->'files') ef where ef->>'name'=x->>'name' and ef->'byte_count'=x->'byte_count' and ef->>'sha256'=x->>'sha256'))
    or jsonb_typeof(m.snapshot->'manifest') is distinct from 'array' or jsonb_array_length(m.snapshot->'manifest')=0
    or jsonb_typeof(m.snapshot->'workflow') is distinct from 'array' or jsonb_array_length(m.snapshot->'workflow')<>cardinality(j.invoice_ids)
    or jsonb_array_length(m.snapshot->'manifest')<>cardinality(j.invoice_ids)
    or (select count(distinct wf->>'invoice_id') from jsonb_array_elements(m.snapshot->'workflow') wf where wf->>'invoice_id'=any(j.invoice_ids) and jsonb_typeof(wf->'revision')='number' and jsonb_typeof(wf->'billing_required')='boolean' and jsonb_typeof(wf->'credit_term')='number')<>cardinality(j.invoice_ids)
    or (select count(distinct mf->>'id') from jsonb_array_elements(m.snapshot->'manifest') mf where mf->>'id'=any(j.invoice_ids))<>cardinality(j.invoice_ids)
    or m.snapshot->'draft'->'invoice_ids' is distinct from to_jsonb(j.invoice_ids)
    or m.snapshot->'draft'->>'document_job_id' is distinct from j.id::text then return 'pdf_release_evidence_incomplete';end if;
  elsif exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=m.id and
    (not exists(select 1 from ar_private.pdf_release_members x where x.cohort_id=p_cohort and x.job_id=b.document_job_id and x.class='exception')
     or jsonb_array_length(b.workflow)<>cardinality(b.invoice_ids) or jsonb_array_length(b.manifest)<>cardinality(b.invoice_ids))) then return 'retention_shared_reference';end if;
 end loop;
 if p_class='closed' and (j.closed_at is null or j.closed_reason<>'discarded') then return 'document_not_closed';end if;
 if p_class='exception' and n=0 then return 'pdf_release_evidence_incomplete';end if;
 for r in select * from ar_private.retention_storage_references where split_part(storage_key,'/',2)=j.id::text loop
  ids:=ar_private.pdf_reference_jobs(r.kind,r.reference_id);
  if r.owner is distinct from p_actor or cardinality(ids)=0 or exists(select 1 from unnest(ids) q(id) where not exists(select 1 from ar_private.pdf_release_members b where b.cohort_id=p_cohort and b.job_id=q.id)) then return 'retention_shared_reference';end if;
 end loop;
 return null;
end$$;
create function public.ar_pdf_byte_release_preview(p_actor uuid,p_cohort_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c ar_private.pdf_release_cohort;b ar_private.pdf_release_members;o storage.objects;ctx jsonb;objects jsonb:='[]';identities jsonb:='[]';blockers jsonb:='[]';problem text;pinned ar_private.pdf_release_objects;begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 select * into c from ar_private.pdf_release_cohort where id=p_cohort_id and owner=p_actor;
 if not found then raise exception 'pdf_release_missing';end if;
 for b in select * from ar_private.pdf_release_members where cohort_id=c.id order by job_id loop
  identities:=identities||jsonb_build_array(jsonb_build_object('jobId',b.job_id,'class',b.class,'identity',ar_private.pdf_release_identity(b.job_id)));
  problem:=ar_private.pdf_release_problem(p_actor,c.id,b.job_id,b.class);
  if problem is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('jobId',b.job_id,'reason',problem));end if;
  if ar_private.pdf_release_identity(b.job_id) is distinct from b.identity_hash then blockers:=blockers||jsonb_build_array(jsonb_build_object('jobId',b.job_id,'reason','pdf_release_identity_changed'));end if;
  for o in select * from storage.objects where bucket_id='ar-working-files' and split_part(name,'/',2)=b.job_id::text order by id loop
   ctx:=ar_private.retention_context(p_actor,'supabase',o.id::text);
   select * into pinned from ar_private.pdf_release_objects where object_id=o.id and cohort_id=c.id;
   if ctx?'error' or pinned.object_id is null or ctx->'target' is distinct from pinned.target or ctx->>'referenceFingerprint' is distinct from pinned.reference_fingerprint then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('objectId',o.id,'reason',coalesce(ctx->>'error','pdf_release_object_changed')));
   end if;
   objects:=objects||jsonb_build_array(jsonb_build_object('objectId',o.id,'jobId',b.job_id,'class',b.class,'target',ctx->'target','referenceFingerprint',ctx->>'referenceFingerprint'));
  end loop;
 end loop;
 if exists(select 1 from ar_private.pdf_release_objects p where p.cohort_id=c.id and not p.already_deleted and not exists(select 1 from storage.objects so where so.id=p.object_id and so.bucket_id='ar-working-files')) then blockers:=blockers||jsonb_build_array(jsonb_build_object('reason','pdf_release_object_missing'));end if;
 return jsonb_build_object('cohortId',c.id,'objects',objects,'alreadyDeletedObjects',(select count(*) from ar_private.pdf_release_objects where cohort_id=c.id and already_deleted),'blockers',blockers,'inventoryDigest',encode(sha256(convert_to(jsonb_build_object('members',identities,'objects',objects)::text,'UTF8')),'hex'));
end$$;

create function public.ar_pdf_byte_release_register(p_actor uuid,p_cohort_id uuid,p_members jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_members jsonb;b jsonb;jid uuid;o storage.objects;ctx jsonb;problem text;begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 if p_cohort_id is null or jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members)<>20
  or (select count(distinct x->>'jobId') from jsonb_array_elements(p_members)x)<>20
  or (select count(*) from jsonb_array_elements(p_members)x where x->>'class'='closed')<>4
  or (select count(*) from jsonb_array_elements(p_members)x where x->>'class'='exception')<>16
  or exists(select 1 from jsonb_array_elements(p_members)x where coalesce(x->>'jobId','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or x-array['jobId','class']<>'{}'::jsonb) then raise exception 'pdf_release_cohort_invalid';end if;
 select jsonb_agg(x order by x->>'jobId') into v_members from jsonb_array_elements(p_members)x;
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 if exists(select 1 from ar_private.pdf_release_cohort) then
  if not exists(select 1 from ar_private.pdf_release_cohort where id=p_cohort_id and owner=p_actor and pdf_release_cohort.members=v_members) then raise exception 'pdf_release_cohort_conflict';end if;
  return public.ar_pdf_byte_release_preview(p_actor,p_cohort_id);
 end if;
 perform 1 from public.ar_document_jobs where id in(select (x->>'jobId')::uuid from jsonb_array_elements(v_members)x) order by id for update;
 insert into ar_private.pdf_release_cohort(id,owner,members) values(p_cohort_id,p_actor,v_members);
 for b in select value from jsonb_array_elements(v_members) loop
  jid:=(b->>'jobId')::uuid;
  if not exists(select 1 from public.ar_document_jobs where id=jid and owner=p_actor) then raise exception 'document_forbidden';end if;
  insert into ar_private.pdf_release_members(job_id,cohort_id,class,identity_hash) values(jid,p_cohort_id,b->>'class',ar_private.pdf_release_identity(jid));
 end loop;
 for b in select value from jsonb_array_elements(v_members) loop
  jid:=(b->>'jobId')::uuid;problem:=ar_private.pdf_release_problem(p_actor,p_cohort_id,jid,b->>'class');
  if problem is not null then raise exception using message=problem;end if;
  for o in select * from storage.objects where bucket_id='ar-working-files' and split_part(name,'/',2)=jid::text order by id loop
   if not ar_private.retention_storage_key(o.name) or split_part(o.name,'/',3) not in('originals','exports','email') then raise exception 'retention_unknown_source';end if;
   if split_part(o.name,'/',3)='email' and not exists(select 1 from public.ar_email_attachments a where a.storage_key=o.name and a.mime='application/pdf') then raise exception 'retention_unknown_source';end if;
   ctx:=ar_private.retention_context(p_actor,'supabase',o.id::text);if ctx?'error' then raise exception using message=ctx->>'error';end if;
   if exists(select 1 from ar_private.retention_items where store='supabase' and object_id=o.id::text and state in('claimed','uncertain','deleted')) then raise exception 'retention_busy';end if;
   insert into ar_private.pdf_release_objects(object_id,cohort_id,job_id,storage_key,target,reference_fingerprint) values(o.id,p_cohort_id,jid,o.name,ctx->'target',ctx->>'referenceFingerprint');
  end loop;
 end loop;
 insert into ar_private.pdf_release_objects(object_id,cohort_id,job_id,storage_key,target,reference_fingerprint,already_deleted)
 select ri.object_id::uuid,p_cohort_id,b.job_id,ri.storage_key,ri.target,ri.reference_fingerprint,true
 from ar_private.retention_items ri join ar_private.pdf_release_members b on b.job_id::text=split_part(ri.storage_key,'/',2) and b.cohort_id=p_cohort_id
 where ri.owner=p_actor and ri.store='supabase' and ri.state='deleted' and ri.deleted_at is not null
 and split_part(ri.storage_key,'/',3) in('originals','exports','email') and not exists(select 1 from storage.objects so where so.bucket_id='ar-working-files' and (so.id::text=ri.object_id or so.name=ri.storage_key))
 on conflict(object_id) do nothing;
 if (select count(*) from ar_private.pdf_release_objects where cohort_id=p_cohort_id)>200 then raise exception 'pdf_release_cohort_invalid';end if;
 return public.ar_pdf_byte_release_preview(p_actor,p_cohort_id);
end$$;

create function public.ar_pdf_byte_release_commit(p_actor uuid,p_cohort_id uuid,p_command_id uuid,p_inventory_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.pdf_release_commits;p jsonb;result jsonb;begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 if p_command_id is null or p_inventory_digest is null or p_inventory_digest!~'^[0-9a-f]{64}$' then raise exception 'pdf_release_command_invalid';end if;
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 if not exists(select 1 from ar_private.pdf_release_cohort where id=p_cohort_id and owner=p_actor) then raise exception 'pdf_release_missing';end if;
 select * into c from ar_private.pdf_release_commits where cohort_id=p_cohort_id;
 if found then
  if c.command_id is distinct from p_command_id or c.inventory_digest is distinct from p_inventory_digest then raise exception 'pdf_release_command_conflict';end if;
  return c.result;
 end if;
 perform 1 from public.ar_document_jobs where id in(select job_id from ar_private.pdf_release_members where cohort_id=p_cohort_id) order by id for update;
 perform 1 from public.ar_email_drafts where document_job_id in(select job_id from ar_private.pdf_release_members where cohort_id=p_cohort_id) order by id for update;
 perform 1 from ar_private.mail_deliveries where draft_id in(select d.id from public.ar_email_drafts d join ar_private.pdf_release_members b on b.job_id=d.document_job_id where b.cohort_id=p_cohort_id) or id in(select m.delivery_id from ar_private.combined_delivery_members m join ar_private.pdf_release_members b on b.job_id=m.document_job_id where b.cohort_id=p_cohort_id) order by id for update;
 p:=public.ar_pdf_byte_release_preview(p_actor,p_cohort_id);
 if p->'blockers'<>'[]'::jsonb or p->>'inventoryDigest' is distinct from p_inventory_digest then raise exception 'pdf_release_inventory_changed';end if;
 result:=jsonb_build_object('accepted',true,'cohortId',p_cohort_id,'commandId',p_command_id,'inventoryDigest',p_inventory_digest,'requestedObjects',jsonb_array_length(p->'objects'),'alreadyDeletedObjects',p->'alreadyDeletedObjects','deletedObjects',0);
 insert into ar_private.pdf_release_commits(cohort_id,command_id,inventory_digest,result) values(p_cohort_id,p_command_id,p_inventory_digest,result);
 return result;
end$$;

create function public.ar_pdf_byte_release_status(p_actor uuid,p_cohort_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(ar_private.gmail_admin(p_actor),false) or p_actor is distinct from public.ar_financial_service_actor() or not exists(select 1 from ar_private.pdf_release_cohort where id=p_cohort_id and owner=p_actor) then raise exception 'document_forbidden';end if;
 return jsonb_build_object('accepted',exists(select 1 from ar_private.pdf_release_commits where cohort_id=p_cohort_id),'objects',
 (select coalesce(jsonb_agg(jsonb_build_object('objectId',o.object_id,'jobId',o.job_id,'class',b.class,'byteCount',o.target->'byteCount','state',coalesce(r.state,'requested'),'claimPhase',r.claim_phase,'deletedAt',r.deleted_at,'deleteAcknowledged',r.delete_ack_at is not null) order by o.object_id),'[]')
 from ar_private.pdf_release_objects o join ar_private.pdf_release_members b on b.job_id=o.job_id left join ar_private.retention_items r on r.store='supabase' and r.object_id=o.object_id::text where o.cohort_id=p_cohort_id));
end$$;

-- Fence local admission without freezing proof/status/history progression.
create function ar_private.pdf_release_fence() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;previous jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;ids uuid[]:=array[]::uuid[];jid uuid;member jsonb;frozen boolean:=false;begin
 if not pg_try_advisory_xact_lock_shared(61704,1439) then raise exception 'document_busy';end if;
 if tg_table_name='ar_document_jobs' then ids:=array[(v->>'id')::uuid];
 elsif tg_table_name in('ar_document_files','document_uploads','document_transient_uploads','document_revisions') then ids:=array[(v->>'job_id')::uuid,(previous->>'job_id')::uuid];
 elsif tg_table_name='ar_email_drafts' then ids:=array[(v->>'document_job_id')::uuid,(previous->>'document_job_id')::uuid];
 elsif tg_table_name='combined_delivery_members' then
  ids:=array[(v->>'document_job_id')::uuid]||array(select document_job_id from ar_private.combined_delivery_members where delivery_id=(v->>'delivery_id')::uuid);
 elsif tg_table_name='combined_email_preparations' then
  for member in select value from jsonb_array_elements(coalesce(v->'members','[]')||coalesce(previous->'members','[]')) loop ids:=array_append(ids,(member->>'documentJobId')::uuid);end loop;
 else
  select array_agg(distinct d.document_job_id) into ids from public.ar_email_drafts d where d.id in((v->>'draft_id')::uuid,(previous->>'draft_id')::uuid);
  if tg_table_name='mail_deliveries' then
   ids:=coalesce(ids,array[]::uuid[])||array(select document_job_id from ar_private.combined_delivery_members where delivery_id=(v->>'id')::uuid);
   if v->>'combined_preparation_id' is not null then ids:=ids||array(select (x->>'documentJobId')::uuid from ar_private.combined_email_preparations p cross join lateral jsonb_array_elements(p.members)x where p.id=(v->>'combined_preparation_id')::uuid);end if;
  end if;
 end if;
 -- A fresh outside job/draft may not rebind a released object's key either.
 for member in select x from jsonb_path_query(v,'$.**.storage_key') x union select x from jsonb_path_query(v,'$.**.storageKey') x loop
  if jsonb_typeof(member)='string' and (member#>>'{}')~'^jobs/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/' then ids:=array_append(ids,split_part(member#>>'{}','/',2)::uuid);end if;
 end loop;
 select exists(select 1 from unnest(ids) x(id) where ar_private.pdf_released(x.id)) into frozen;
 if not frozen then if tg_op='DELETE' then return old;end if;return new;end if;
 if tg_table_name='mail_deliveries' and tg_op='UPDATE' then
  if (to_jsonb(new)-array['state','gmail_id','gmail_draft_id','sent_at','reason','provider_receipt_id','verified_sent_evidence','reconcile_checked_at'])
   is distinct from (to_jsonb(old)-array['state','gmail_id','gmail_draft_id','sent_at','reason','provider_receipt_id','verified_sent_evidence','reconcile_checked_at']) then raise exception 'pdf_release_evidence_immutable';end if;
  return new;
 end if;
 if tg_table_name='ar_document_jobs' and tg_op='UPDATE' then
  if new.closed_reason='sent' and new.closed_at is not null
   and (to_jsonb(new)-array['closed_at','closed_reason'])=(to_jsonb(old)-array['closed_at','closed_reason'])
   and not ar_private.document_pending_mail(new.id) and exists(select 1 from ar_private.sent_scope_facts where document_job_id=new.id) then return new;end if;
 end if;
 raise exception 'document_bytes_released';
end$$;

-- Keep completed packages out of local retry/text cleanup. Evidence is retained.
create function ar_private.pdf_release_metadata_update(p_table text,p_old jsonb,p_new jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare jid uuid;begin
 if p_table='mail_deliveries' then
  if (p_new-array['state','gmail_id','gmail_draft_id','sent_at','reason','provider_receipt_id','verified_sent_evidence','reconcile_checked_at'])
   is distinct from (p_old-array['state','gmail_id','gmail_draft_id','sent_at','reason','provider_receipt_id','verified_sent_evidence','reconcile_checked_at']) then return false;end if;
  return exists(select 1 from public.ar_email_drafts d where d.id=(p_old->>'draft_id')::uuid and ar_private.pdf_released(d.document_job_id))
   or exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=(p_old->>'id')::uuid and ar_private.pdf_released(b.document_job_id));
 elsif p_table='ar_document_jobs' then
  jid:=(p_old->>'id')::uuid;
  return ar_private.pdf_released(jid) and p_new->>'closed_reason'='sent' and p_new->>'closed_at' is not null
   and (p_new-array['closed_at','closed_reason'])=(p_old-array['closed_at','closed_reason'])
   and not ar_private.document_pending_mail(jid) and exists(select 1 from ar_private.sent_scope_facts where document_job_id=jid);
 end if;
 return false;
end$$;
-- Existing armed deletion fences remain for all reference/identity changes.
-- Only metadata confirmation of this immutable released package bypasses the
-- byte-use mutex; it neither reads nor needs the disappearing local PDFs.
do $$declare d text:=pg_get_functiondef('ar_private.retention_reference_guard()'::regprocedure);begin
 if strpos(d,E'begin\n if tg_table_name')=0 then raise exception 'pdf_release_retention_guard_drift';end if;
 execute replace(d,E'begin\n if tg_table_name',E'begin\n if tg_op=''UPDATE'' then\n  if ar_private.pdf_release_metadata_update(tg_table_name,to_jsonb(old),to_jsonb(new)) then perform pg_advisory_xact_lock_shared(61704,1439);return new;end if;\n end if;\n if tg_table_name');
end$$;
do $$declare d text;begin
 d:=pg_get_functiondef('ar_private.scrub_discarded_messages(uuid,uuid,integer)'::regprocedure);
 if strpos(d,'where j.owner=p_actor')=0 then raise exception 'pdf_release_scrub_definition_drift';end if;
 execute replace(d,'where j.owner=p_actor','where j.owner=p_actor and not ar_private.pdf_released(j.id)');
 d:=pg_get_functiondef('public.ar_operations_queue(uuid,text,integer)'::regprocedure);
 if strpos(d,'j.closed_at is null and')=0 then raise exception 'pdf_release_queue_definition_drift';end if;
 execute replace(d,'j.closed_at is null and','j.closed_at is null and not ar_private.pdf_released(j.id) and');
end$$;

-- One bounded existing-maintenance pass, never a global customer scan.
create function public.ar_pdf_byte_release_candidates(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('objectId',o.object_id,'itemId',r.id) order by o.object_id),'[]')
 from ar_private.pdf_release_objects o join ar_private.pdf_release_cohort c on c.id=o.cohort_id and c.owner=p_actor
 join ar_private.pdf_release_commits a on a.cohort_id=c.id
 left join ar_private.retention_items r on r.store='supabase' and r.object_id=o.object_id::text where r.state is distinct from 'deleted');
end$$;
do $$declare t text;begin
 foreach t in array array['public.ar_document_jobs','public.ar_document_files','public.ar_email_drafts','public.ar_email_attachments','ar_private.document_uploads','ar_private.document_transient_uploads','ar_private.document_revisions','ar_private.mail_deliveries','ar_private.gmail_draft_attempts','ar_private.combined_delivery_members','ar_private.combined_email_preparations'] loop
  execute format('create trigger aaa_pdf_release_fence before insert or update or delete on %s for each row execute function ar_private.pdf_release_fence()',t);
 end loop;
end$$;

-- The same pinned target/reference checks run at enrollment, claim and arm.
alter function ar_private.retention_transient_eligibility(uuid,text,text) rename to retention_transient_before_pdf_release;
create function ar_private.retention_transient_eligibility(p_actor uuid,p_store text,p_key text) returns jsonb language plpgsql stable set search_path='' as $$
declare o ar_private.pdf_release_objects;ctx jsonb;r record;ids uuid[];released timestamptz;begin
 if p_store='supabase' then
  select x.* into o from ar_private.pdf_release_objects x join ar_private.pdf_release_members b on b.job_id=x.job_id and b.class='exception'
   join ar_private.pdf_release_cohort c on c.id=x.cohort_id and c.owner=p_actor join ar_private.pdf_release_commits a on a.cohort_id=c.id where x.storage_key=p_key;
  if found then
   ctx:=ar_private.retention_context(p_actor,'supabase',o.object_id::text);
   if ctx?'error' then return ctx;end if;
   if ctx->'target' is distinct from o.target or ctx->>'referenceFingerprint' is distinct from o.reference_fingerprint then return jsonb_build_object('error','retention_identity_mismatch');end if;
   if exists(select 1 from ar_private.document_transient_uploads u where u.job_id=o.job_id and not u.registered and not u.cancelled)
    or exists(select 1 from ar_private.storage_upload_operations u where split_part(u.object_key,'/',2)=o.job_id::text and not u.verified) then return jsonb_build_object('error','document_upload_pending');end if;
   for r in select * from ar_private.retention_storage_references where storage_key=p_key loop
    ids:=ar_private.pdf_reference_jobs(r.kind,r.reference_id);
    if r.owner is distinct from p_actor or cardinality(ids)=0 or exists(select 1 from unnest(ids)x(id) where not exists(select 1 from ar_private.pdf_release_members b where b.job_id=x.id and b.cohort_id=o.cohort_id)) then return jsonb_build_object('error','retention_shared_reference');end if;
   end loop;
   select released_at into released from ar_private.pdf_release_commits where cohort_id=o.cohort_id;
   return jsonb_build_object('complete',true,'transient',true,'minimumEligibleAt',released);
  end if;
 end if;
 return ar_private.retention_transient_before_pdf_release(p_actor,p_store,p_key);
end$$;

-- Both established candidate paths include only committed exact object IDs.
do $$declare oid regprocedure;d text;addition text;begin
 foreach oid in array array['public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure,'public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure] loop
  d:=pg_get_functiondef(oid);if strpos(d,')cnd left join')=0 then raise exception 'pdf_release_candidate_drift';end if;
  addition:=' union select o.object_id from ar_private.pdf_release_objects o join ar_private.pdf_release_cohort c on c.id=o.cohort_id join ar_private.pdf_release_commits a on a.cohort_id=c.id where c.owner=p_actor and not exists(select 1 from ar_private.retention_items r where r.store=''supabase'' and r.object_id=o.object_id::text and r.state=''deleted'')';
  if oid='public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure then
   addition:=addition||' and o.job_id=p_job_id';
   if strpos(d,'or exists(select 1 from ar_private.unused_preparation_dispositions d where d.job_id=p_job_id and d.owner=p_actor)')=0 then raise exception 'pdf_release_exact_candidate_gate_drift';end if;
   d:=replace(d,'or exists(select 1 from ar_private.unused_preparation_dispositions d where d.job_id=p_job_id and d.owner=p_actor)','or ar_private.pdf_released(p_job_id) or exists(select 1 from ar_private.unused_preparation_dispositions d where d.job_id=p_job_id and d.owner=p_actor)');
  end if;
  execute replace(d,')cnd left join',addition||E'\n )cnd left join');
 end loop;
end$$;

-- Separate projection; real lifecycle/closure and mail labels are untouched.
do $$declare d text;begin
 d:=pg_get_functiondef('public.ar_document_get(uuid)'::regprocedure);
 if strpos(d,'select to_jsonb(j)||')=0 then raise exception 'pdf_release_document_projection_drift';end if;
 execute replace(d,'select to_jsonb(j)||','select to_jsonb(j)||jsonb_build_object(''bytes_released'',ar_private.pdf_released(j.id))||');
 d:=pg_get_functiondef('public.ar_email_get(uuid,uuid)'::regprocedure);
 if strpos(d,'select to_jsonb(d)||')=0 then raise exception 'pdf_release_email_projection_drift';end if;
 execute replace(d,'select to_jsonb(d)||','select to_jsonb(d)||jsonb_build_object(''bytes_released'',ar_private.pdf_released(d.document_job_id))||');
end$$;
-- Direct member Storage reads follow the same irreversible local-use boundary.
create function ar_private.pdf_release_read_allowed(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ar_document_jobs j where j.id=p_job and j.owner=(select auth.uid())) and not ar_private.pdf_released(p_job);
$$;
alter policy ar_private_file_read on storage.objects to authenticated using (
 bucket_id='ar-working-files' and (select ar_private.is_member()) and (
 name like 'validation/%' or (split_part(name,'/',1)='jobs' and exists (
 select 1 from public.ar_document_jobs j where j.id::text=split_part(name,'/',2) and j.owner=(select auth.uid()) and j.closed_at is null
 and ar_private.pdf_release_read_allowed(j.id) and (j.lifecycle='legacy' or split_part(name,'/',3)<>'projects')))));
revoke all on function ar_private.pdf_release_read_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function ar_private.pdf_release_read_allowed(uuid) to authenticated;
-- A stale pre-upload caller cannot create a fresh managed write reservation.
do $$declare d text:=pg_get_functiondef('public.ar_document_backup_target(uuid,uuid,uuid)'::regprocedure);needle text:=' if j.closed_at is not null then';begin
 if strpos(d,needle)=0 then raise exception 'pdf_release_backup_definition_drift';end if;
 execute replace(d,needle,' if ar_private.pdf_released(j.id) then raise exception ''document_bytes_released'';end if;'||E'\n'||needle);
end$$;
do $$declare d text:=pg_get_functiondef('public.ar_storage_write_begin(uuid,uuid,text,bigint,text,text,jsonb)'::regprocedure);begin
 if strpos(d,E'begin\n if not ar_private.storage_key_valid')=0 then raise exception 'pdf_release_storage_write_drift';end if;
 execute replace(d,E'begin\n if not ar_private.storage_key_valid',E'begin\n if p_key~''^jobs/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/'' and ar_private.pdf_released(split_part(p_key,''/'',2)::uuid) then return jsonb_build_object(''error'',''storage_file_expired'');end if;\n if not ar_private.storage_key_valid');
end$$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='ar_private' and p.proname in('pdf_release_immutable','pdf_released','pdf_reference_jobs','pdf_release_identity','pdf_release_problem','pdf_release_fence','pdf_release_metadata_update','retention_transient_before_pdf_release','retention_transient_eligibility'))
  or (n.nspname='public' and p.proname like 'ar_pdf_byte_release_%') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  if f::text like 'ar_pdf_byte_release_%' or f::text like 'public.ar_pdf_byte_release_%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end$$;
