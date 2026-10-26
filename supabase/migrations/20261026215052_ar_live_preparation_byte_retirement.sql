-- Fresh Exit and trusted completion retire admission independently of byte eligibility.
-- No historical intent backfill; B's public singleton20 approval policy is unchanged.
create table ar_private.preparation_retirements(
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.ar_document_jobs(id),owner uuid not null,
 actor uuid not null,session_id uuid,exit_command uuid unique,delivery_id uuid,
 authority text not null check(authority in('exit','completion')),original_response jsonb not null,
 captured jsonb not null,accepted_at timestamptz not null default clock_timestamp(),
 check((authority='exit' and session_id is not null and exit_command is not null and delivery_id is null) or (authority='completion' and delivery_id is not null and exit_command is null)));
create table ar_private.preparation_retirement_progress(
 retirement_id uuid primary key references ar_private.preparation_retirements(id),state text not null default 'pending' check(state in('pending','blocked','released')),
 blocker text,released_at timestamptz,checked_at timestamptz not null default clock_timestamp());
create table ar_private.preparation_retirement_objects(
 object_id uuid primary key,retirement_id uuid not null references ar_private.preparation_retirements(id),storage_key text not null unique,target jsonb not null,reference_fingerprint text not null);
create table ar_private.preparation_exit_receipts(exit_command uuid primary key,owner uuid not null,actor uuid not null,session_id uuid not null,job_id uuid not null,response jsonb not null);
create table ar_private.preparation_exit_commands(
 exit_command uuid primary key,owner uuid not null,actor uuid not null,session_id uuid not null,authorized boolean not null,command_key uuid not null,hotel text not null,payload_digest text not null,
 unique(owner,command_key));
do $$declare t text;begin
 foreach t in array array['preparation_retirements','preparation_retirement_progress','preparation_retirement_objects','preparation_exit_commands','preparation_exit_receipts'] loop
  execute format('alter table ar_private.%I enable row level security',t);execute format('revoke all on ar_private.%I from public,anon,authenticated,service_role',t);
  if t<>'preparation_retirement_progress' then execute format('create trigger preparation_immutable before update or delete on ar_private.%I for each row execute function ar_private.pdf_release_immutable()',t);end if;
 end loop;
end$$;
create function ar_private.preparation_retired(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from ar_private.preparation_retirements where job_id=p_job);
$$;
-- Retain B's own predicate and extend its private consumers to C's separate receipts.
alter function ar_private.pdf_released(uuid) rename to pdf_released_before_preparation;
create function ar_private.pdf_released(p_job uuid) returns boolean language sql stable set search_path='' as $$
 select ar_private.pdf_released_before_preparation(p_job) or exists(select 1 from ar_private.preparation_retirements i join ar_private.preparation_retirement_progress p on p.retirement_id=i.id where i.job_id=p_job and p.state='released');
$$;
create function ar_private.preparation_reference_authorized(p_owner uuid,p_job uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.ar_document_jobs j where j.id=p_job and j.owner=p_owner and j.lifecycle='transient' and
 (exists(select 1 from ar_private.preparation_retirements i join ar_private.preparation_retirement_progress p on p.retirement_id=i.id where i.job_id=j.id and (p.state='released' or p.blocker='retention_shared_reference')) or ar_private.pdf_released(j.id) or (j.closed_at is not null and j.closed_reason in('sent','discarded') and not ar_private.document_pending_mail(j.id))));
$$;
-- Factor B's exact complete-evidence checks once. B passes live=false and retains
-- every original class/cohort/state restriction. C supplies independent authority.
do $$declare d text:=pg_get_functiondef('ar_private.pdf_release_problem(uuid,uuid,uuid,text)'::regprocedure);begin
 d:=replace(d,'FUNCTION ar_private.pdf_release_problem(p_actor uuid, p_cohort uuid, p_job uuid, p_class text)','FUNCTION ar_private.preparation_release_problem(p_actor uuid, p_cohort uuid, p_job uuid, p_class text, p_live boolean)');
 if strpos(d,'FUNCTION ar_private.preparation_release_problem')=0 then raise exception 'preparation_evidence_definition_drift';end if;
 d:=replace(d,'if exists(select 1 from ar_private.unused_preparation_dispositions','if not p_live and exists(select 1 from ar_private.unused_preparation_dispositions');
 d:=replace(d,'if p_class=''closed'' then return ''document_mail_pending'';end if;','if not p_live and p_class=''closed'' then return ''document_mail_pending'';end if;');
 d:=replace(d,'if m.state not in(''created'',''review_required'') or m.mode not in(''draft'',''send'') or m.draft_send_claimed_at is not null then','if m.mode not in(''draft'',''send'') or (not p_live and (m.state not in(''created'',''review_required'') or m.draft_send_claimed_at is not null)) then');
 d:=replace(d, 'if j.state in', 'if not (p_live and p_class=''proof'') and (j.state in');
 d:=replace(d, 'state in(''pending'',''generating'',''uncertain'')) then return ''document_generation_pending'';', 'state in(''pending'',''generating'',''uncertain''))) then return ''document_generation_pending'';');
 d:=replace(d, 'if exists(select 1 from ar_private.document_transient_uploads', 'if not (p_live and p_class=''proof'') and (exists(select 1 from ar_private.document_transient_uploads');
 d:=replace(d, 'and not verified) then return ''document_upload_pending'';', 'and not verified)) then return ''document_upload_pending'';');
 d:=replace(d, ' for r in select * from ar_private.retention_storage_references', ' if p_live and p_class=''proof'' then return null;end if;'||E'\n for r in select * from ar_private.retention_storage_references');
 d:=replace(d,'if p_class=''exception'' and n=0 then','if not p_live and p_class=''exception'' and n=0 then');
 d:=replace(d,'if p_class=''closed'' and (j.closed_at is null or j.closed_reason<>''discarded'') then','if not p_live and p_class=''closed'' and (j.closed_at is null or j.closed_reason<>''discarded'') then');
 d:=replace(d,'not exists(select 1 from ar_private.pdf_release_members x where x.cohort_id=p_cohort and x.job_id=b.document_job_id and x.class=''exception'')','not (exists(select 1 from ar_private.pdf_release_members x where x.cohort_id=p_cohort and x.job_id=b.document_job_id and x.class=''exception'') or p_live and (p_class=''proof'' or b.document_job_id=p_job or ar_private.preparation_reference_authorized(p_actor,b.document_job_id)))');
 d:=replace(d,'not exists(select 1 from ar_private.pdf_release_members b where b.cohort_id=p_cohort and b.job_id=q.id)','not (exists(select 1 from ar_private.pdf_release_members b where b.cohort_id=p_cohort and b.job_id=q.id) or p_live and (q.id=p_job or ar_private.preparation_reference_authorized(p_actor,q.id)))');
 execute d;
end$$;
create or replace function ar_private.pdf_release_problem(p_actor uuid,p_cohort uuid,p_job uuid,p_class text) returns text language sql stable set search_path='' as $$
 select ar_private.preparation_release_problem(p_actor,p_cohort,p_job,p_class,false);
$$;
-- Capture existing identities, including exact results of already-admitted sources/uploads.
create function ar_private.preparation_capture(p_job uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f)) from public.ar_document_files f where job_id=p_job),'[]'::jsonb),
 'uploads',coalesce((select jsonb_agg(to_jsonb(u)) from ar_private.document_transient_uploads u where job_id=p_job),'[]'::jsonb),
 'keys',coalesce((select jsonb_agg(distinct k) from (
  select storage_key k from public.ar_document_files where job_id=p_job and storage_key is not null
  union select 'jobs/'||p_job||'/originals/'||id||'.pdf' from public.ar_document_files where job_id=p_job and state in('pending','generating','uncertain')
  union select storage_key from ar_private.document_transient_uploads where job_id=p_job
  union select x->>'storage_key' from public.ar_document_jobs j cross join lateral jsonb_array_elements(j.exports) x where j.id=p_job
  union select x->>'storage_key' from public.ar_email_drafts d cross join lateral jsonb_array_elements(d.exports) x where d.document_job_id=p_job
  union select a.storage_key from public.ar_email_attachments a join public.ar_email_drafts d on d.id=a.draft_id where d.document_job_id=p_job
  union select x->>'storage_key' from ar_private.document_revisions r cross join lateral jsonb_array_elements(r.exports)x where r.job_id=p_job
 )keys where k is not null),'[]'::jsonb));
$$;
create function ar_private.preparation_projection(p_job uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('accepted',true,'retirementId',i.id,'jobId',i.job_id,'byteState',p.state,'reason',p.blocker) from ar_private.preparation_retirements i join ar_private.preparation_retirement_progress p on p.retirement_id=i.id where i.job_id=p_job;
$$;
create function ar_private.preparation_accept(p_owner uuid,p_actor uuid,p_job uuid,p_session uuid,p_exit uuid,p_delivery uuid,p_response jsonb) returns uuid language plpgsql set search_path='' as $$
 declare i ar_private.preparation_retirements;new_id uuid:=gen_random_uuid();begin
 select * into i from ar_private.preparation_retirements where job_id=p_job;
 if found then return i.id;end if;
 insert into ar_private.preparation_retirements(id,job_id,owner,actor,session_id,exit_command,delivery_id,authority,original_response,captured)
 values(new_id,p_job,p_owner,p_actor,p_session,p_exit,p_delivery,case when p_exit is null then 'completion' else 'exit' end,p_response||jsonb_build_object('preparationRetirement',jsonb_build_object('accepted',true,'retirementId',new_id)),ar_private.preparation_capture(p_job)) returning * into i;
 insert into ar_private.preparation_retirement_progress(retirement_id) values(i.id);return i.id;
end$$;
create function ar_private.preparation_finalize(p_owner uuid,p_id uuid) returns jsonb language plpgsql set search_path='' as $$
 declare i ar_private.preparation_retirements;p ar_private.preparation_retirement_progress;problem text;o storage.objects;ctx jsonb;k text;r record;ids uuid[];
 begin
 select * into i from ar_private.preparation_retirements where id=p_id and owner=p_owner; if not found then raise exception 'document_forbidden';end if;
 select * into p from ar_private.preparation_retirement_progress where retirement_id=i.id for update;
 if p.state='released' then return ar_private.preparation_projection(i.job_id);end if;
 problem:=ar_private.preparation_release_problem(p_owner,null,i.job_id,'exception',true);
 -- A combined frozen expected manifest must actually cover each captured member.
 if problem is null and exists(select 1 from ar_private.combined_delivery_members b join ar_private.mail_deliveries m on m.id=b.delivery_id where b.document_job_id=i.job_id and
  (jsonb_typeof(b.member_snapshot->'files') is distinct from 'array' or jsonb_array_length(b.member_snapshot->'files')=0 or exists(select 1 from jsonb_array_elements(b.member_snapshot->'files')f where not exists(select 1 from jsonb_array_elements(m.snapshot#>'{expected,files}')ef where ef->>'name'=f->>'name' and ef->>'sha256'=f->>'sha256' and ef->'byte_count'=f->'byteCount')))) then problem:='pdf_release_evidence_incomplete';end if;
 if problem is null then
  for r in select rf.* from ar_private.retention_storage_references rf where i.job_id=any(ar_private.pdf_reference_jobs(rf.kind,rf.reference_id)) and split_part(rf.storage_key,'/',2)=i.job_id::text loop
   if not (i.captured->'keys'?r.storage_key) then problem:='retention_identity_mismatch';exit;end if;
  end loop;
 end if;
 if problem is null and exists(select 1 from jsonb_array_elements_text(i.captured->'keys') missing(value) where not exists(select 1 from storage.objects so where so.bucket_id='ar-working-files' and so.name=missing.value) and not exists(select 1 from ar_private.retention_items ri where ri.storage_key=missing.value and ri.owner=p_owner and ri.state='deleted' and ri.delete_ack_at is not null)) then problem:='pdf_release_object_missing';end if;
 if problem is null then
  -- Exact captured keys only: no Account, age, directory or prefix discovery.
  for o in select * from storage.objects where bucket_id='ar-working-files' and name in(select jsonb_array_elements_text(i.captured->'keys')) order by id loop
   ctx:=ar_private.retention_context(p_owner,'supabase',o.id::text);
   if ctx?'error' then problem:=ctx->>'error';exit;end if;
   if not ar_private.retention_storage_key(o.name) or split_part(o.name,'/',3) not in('originals','exports','email') then problem:='retention_unknown_source';exit;end if;
   if exists(select 1 from ar_private.retention_items where store='supabase' and object_id=o.id::text and state in('claimed','uncertain','deleted')) then problem:='retention_busy';exit;end if;
  end loop;
 end if;
 if problem is null then
  for o in select * from storage.objects where bucket_id='ar-working-files' and name in(select jsonb_array_elements_text(i.captured->'keys')) order by id loop
   ctx:=ar_private.retention_context(p_owner,'supabase',o.id::text);
   insert into ar_private.preparation_retirement_objects(object_id,retirement_id,storage_key,target,reference_fingerprint) values(o.id,i.id,o.name,ctx->'target',ctx->>'referenceFingerprint') on conflict(object_id) do nothing;
  end loop;
  update ar_private.preparation_retirement_progress set state='released',blocker=null,released_at=clock_timestamp(),checked_at=clock_timestamp() where retirement_id=i.id;
 else update ar_private.preparation_retirement_progress set state='blocked',blocker=problem,checked_at=clock_timestamp() where retirement_id=i.id;
 end if;
 return ar_private.preparation_projection(i.job_id);
 end$$;
-- Original response and authority never change; replay never calls abandon again.
create function public.ar_document_exit(p_actor uuid,p_owner uuid,p_job_id uuid,p_exit_command uuid,p_session uuid,p_current_session uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare i ar_private.preparation_retirements;c ar_private.preparation_exit_commands;r jsonb;rid uuid;j public.ar_document_jobs;saved ar_private.preparation_exit_receipts;
 begin
 if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-ar-actor',p_actor::text) is distinct from p_actor::text or p_exit_command is null or p_session is null or p_owner is distinct from ar_private.access_owner() or not public.ar_access_session_valid(p_actor,coalesce(p_current_session,p_session)) then raise exception 'document_forbidden';end if;
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_owner::text,735));
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_owner for update;
 if not found or j.lifecycle<>'transient' then raise exception 'document_forbidden';end if;
 perform public.ar_access_authorize(p_actor,'hotel',j.hotel);
 select * into saved from ar_private.preparation_exit_receipts where exit_command=p_exit_command;
 if found then if saved.actor<>p_actor or saved.owner<>p_owner or saved.job_id<>p_job_id or saved.session_id<>p_session then raise exception 'document_exit_conflict';end if;return saved.response;end if;
 select * into i from ar_private.preparation_retirements where job_id=p_job_id or exit_command=p_exit_command;
 if found then
  if i.job_id<>p_job_id or i.owner<>p_owner or (i.exit_command=p_exit_command and (i.actor<>p_actor or i.session_id<>p_session)) then raise exception 'document_exit_conflict';end if;
  insert into ar_private.preparation_exit_receipts values(p_exit_command,p_owner,p_actor,p_session,p_job_id,i.original_response);return i.original_response;
 end if;
 select * into c from ar_private.preparation_exit_commands where exit_command=p_exit_command and authorized;
 if found and (c.actor<>p_actor or c.owner<>p_owner or c.session_id<>p_session or not exists(select 1 from ar_private.document_commands dc where dc.owner=c.owner and dc.command_key=c.command_key and dc.job_id=p_job_id)) then raise exception 'document_exit_conflict';end if;
 if exists(select 1 from ar_private.document_commands dc join ar_private.document_command_exits t using(owner,command_key) where dc.job_id=p_job_id and dc.owner=p_owner and not exists(select 1 from ar_private.preparation_exit_commands ec where ec.owner=t.owner and ec.command_key=t.command_key and ec.exit_command=p_exit_command and ec.authorized)) then
  -- An old/unmarked tombstone cannot be upgraded by presenting a new marker.
  select jsonb_build_object('job',jsonb_build_object('id',p_job_id),'outcome',t.settled_outcome) into r from ar_private.document_commands dc join ar_private.document_command_exits t using(owner,command_key) where dc.job_id=p_job_id and dc.owner=p_owner;if r->>'outcome' is null then r:=public.ar_document_abandon(p_owner,p_job_id);end if;insert into ar_private.preparation_exit_receipts values(p_exit_command,p_owner,p_actor,p_session,p_job_id,r);return r;
 end if;
 r:=public.ar_document_abandon(p_owner,p_job_id);
 rid:=ar_private.preparation_accept(p_owner,p_actor,p_job_id,p_session,p_exit_command,null,r);
 perform ar_private.preparation_finalize(p_owner,rid);select original_response into r from ar_private.preparation_retirements where id=rid;insert into ar_private.preparation_exit_receipts values(p_exit_command,p_owner,p_actor,p_session,p_job_id,r);return r;
 end$$;
create function public.ar_document_command_exit(p_actor uuid,p_owner uuid,p_command_key uuid,p_hotel text,p_payload_digest text,p_exit_command uuid,p_session uuid,p_current_session uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r jsonb;c ar_private.preparation_exit_commands;fresh boolean;begin
 if p_exit_command is null or p_session is null or not public.ar_access_session_valid(p_actor,coalesce(p_current_session,p_session)) then raise exception 'document_forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into c from ar_private.preparation_exit_commands where exit_command=p_exit_command or (owner=p_owner and command_key=p_command_key);
 if found and (c.exit_command<>p_exit_command or c.owner<>p_owner or c.actor<>p_actor or c.session_id<>p_session or c.command_key<>p_command_key or c.hotel<>p_hotel or c.payload_digest<>p_payload_digest) then raise exception 'document_exit_conflict';end if;
 if exists(select 1 from ar_private.preparation_retirements i where i.exit_command=p_exit_command and not exists(select 1 from ar_private.document_commands dc where dc.owner=p_owner and dc.command_key=p_command_key and dc.job_id=i.job_id)) then raise exception 'document_exit_conflict';end if;
 fresh:=not exists(select 1 from ar_private.document_command_exits where owner=p_owner and command_key=p_command_key);
 r:=public.ar_document_command_abandon(p_actor,p_owner,p_command_key,p_hotel,p_payload_digest);
 if c.exit_command is null then insert into ar_private.preparation_exit_commands(exit_command,owner,actor,session_id,authorized,command_key,hotel,payload_digest) values(p_exit_command,p_owner,p_actor,p_session,fresh,p_command_key,p_hotel,p_payload_digest);end if;
 return r;
 end$$;
-- Pending local retirement permits only exact captured operations to settle.
-- Reuse the existing B graph/rebind resolver; its final release fence stays installed.
do $$declare d text:=pg_get_functiondef('ar_private.pdf_release_fence()'::regprocedure);begin
 d:=replace(d,'FUNCTION ar_private.pdf_release_fence()','FUNCTION ar_private.preparation_admission_fence()');
 d:=replace(d,'ar_private.pdf_released(x.id)','ar_private.preparation_retired(x.id)');
 d:=replace(d,$q$ raise exception 'document_bytes_released';$q$,$q$
 if tg_table_name='ar_document_files' and tg_op='UPDATE' and exists(select 1 from ar_private.preparation_retirements i cross join lateral jsonb_array_elements(i.captured->'files')f where i.job_id=(v->>'job_id')::uuid and f->>'id'=v->>'id' and f->>'state' in('pending','generating','uncertain'))
  and (v-array['state','storage_key','byte_count','sha256','error_code','updated_at'])=(previous-array['state','storage_key','byte_count','sha256','error_code','updated_at'])
  and (v->>'storage_key' is null or v->>'storage_key'='jobs/'||(v->>'job_id')||'/originals/'||(v->>'id')||'.pdf') then return new;end if;
 if tg_table_name='ar_document_jobs' and tg_op='UPDATE' then
  if (v-array['state','updated_at'])=(previous-array['state','updated_at']) then return new;end if;
  if new.closed_reason='discarded' and new.closed_at is not null and exists(select 1 from ar_private.preparation_retirements i where i.job_id=new.id and i.original_response->>'outcome' in('pending','discarded'))
   and (v-array['closed_at','closed_reason','updated_at','exports'])=(previous-array['closed_at','closed_reason','updated_at','exports']) and (new.exports=old.exports or new.exports='[]'::jsonb) and not ar_private.document_pending_mail(new.id)
   and not exists(select 1 from public.ar_document_files where job_id=new.id and state in('pending','generating','uncertain'))
   and not exists(select 1 from ar_private.document_transient_uploads where job_id=new.id and not registered and not cancelled) then return new;end if;
 end if;
 if tg_table_name='document_transient_uploads' and tg_op='UPDATE' and (v-array['registered','recovery_checked_at'])=(previous-array['registered','recovery_checked_at'])
  and exists(select 1 from ar_private.preparation_retirements i cross join lateral jsonb_array_elements(i.captured->'uploads')u where i.job_id=(v->>'job_id')::uuid and u->>'storage_key'=v->>'storage_key' and u->'byte_count'=v->'byte_count' and u->>'sha256'=v->>'sha256') then return new;end if;
 if tg_table_name in('document_uploads','ar_email_attachments') and tg_op='INSERT' and exists(select 1 from ar_private.preparation_retirements i cross join lateral jsonb_array_elements(i.captured->'uploads')u where i.job_id=any(ids) and u->>'storage_key'=v->>'storage_key' and u->'byte_count'=v->'byte_count' and u->>'sha256'=v->>'sha256' and u->>'cancelled'='false' and u->>'registered'='false') then return new;end if;
 raise exception 'document_preparation_retired';$q$);
 execute d;
end$$;
do $$declare t text;begin
 foreach t in array array['public.ar_document_jobs','public.ar_document_files','public.ar_email_drafts','public.ar_email_attachments','ar_private.document_uploads','ar_private.document_transient_uploads','ar_private.document_revisions','ar_private.mail_deliveries','ar_private.gmail_draft_attempts','ar_private.combined_delivery_members','ar_private.combined_email_preparations'] loop
  execute format('create trigger aab_preparation_admission_fence before insert or update or delete on %s for each row execute function ar_private.preparation_admission_fence()',t);
 end loop;
end$$;
create function ar_private.preparation_write_allowed(p_job uuid,p_key text) returns boolean language sql stable set search_path='' as $$
 select not ar_private.preparation_retired(p_job) or exists(select 1 from ar_private.preparation_retirements i where i.job_id=p_job and
 (exists(select 1 from jsonb_array_elements(i.captured->'files')f join public.ar_document_files live on live.id=(f->>'id')::uuid where live.job_id=p_job and live.state in('pending','generating','uncertain') and f->>'state' in('pending','generating','uncertain') and p_key='jobs/'||p_job||'/originals/'||live.id||'.pdf')
 or exists(select 1 from jsonb_array_elements(i.captured->'uploads')u join ar_private.document_transient_uploads live on live.storage_key=u->>'storage_key' where live.job_id=p_job and live.storage_key=p_key and not live.registered and not live.cancelled and u->>'registered'='false' and u->>'cancelled'='false')));
$$;
do $$declare d text:=pg_get_functiondef('public.ar_storage_write_begin(uuid,uuid,text,bigint,text,text,jsonb)'::regprocedure);begin
 if strpos(d,'ar_private.pdf_released(split_part(p_key,''/'',2)::uuid)')=0 then raise exception 'preparation_write_definition_drift';end if;
 execute replace(d,'ar_private.pdf_released(split_part(p_key,''/'',2)::uuid)','(ar_private.pdf_released(split_part(p_key,''/'',2)::uuid) or not ar_private.preparation_write_allowed(split_part(p_key,''/'',2)::uuid,p_key))');
end$$;
-- Persisted receipt or independently verified Sent is the authority, never a UI flag.
create function public.ar_preparation_complete(p_actor uuid,p_delivery uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare m ar_private.mail_deliveries;e jsonb;proof jsonb;jid uuid;rid uuid;result jsonb:='[]';begin
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_delivery and owner=p_actor for update;
 if not found or m.mode='test' then return jsonb_build_object('accepted',false);end if;
 e:=m.snapshot->'expected';proof:=m.verified_sent_evidence;
 if jsonb_typeof(e) is distinct from 'object' or e->>'mailbox' is distinct from m.mailbox or e->>'sender' is distinct from ar_private.gmail_sender(m.mailbox) or e->>'messageId' is distinct from m.message_id
 or jsonb_typeof(e->'files') is distinct from 'array' or jsonb_array_length(e->'files')=0 or exists(select 1 from jsonb_array_elements(e->'files')f where coalesce(f->>'name','')='' or coalesce(f->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(f->>'byte_count','')!~'^[1-9][0-9]{0,8}$') then return jsonb_build_object('accepted',false);end if;
 if not coalesce(((m.provider_receipt_id~'^[A-Za-z0-9_-]{1,200}$' and (m.mode='send' or m.mode='draft' and m.draft_send_claimed_at is not null))
 or (jsonb_typeof(proof)='object' and proof->>'gmailId'~'^[A-Za-z0-9_-]{1,200}$' and proof->>'mailbox'=m.mailbox and (proof->>'sentAt')::timestamptz between m.created_at-interval '5 minutes' and now()+interval '5 minutes')),false) then return jsonb_build_object('accepted',false);end if;
 -- Sorted existing job domain; a trusted combined completion covers its own exact members.
 for jid in select document_job_id from public.ar_email_drafts where id=m.draft_id union select document_job_id from ar_private.combined_delivery_members where delivery_id=m.id order by 1 loop
  perform 1 from public.ar_document_jobs where id=jid and owner=p_actor and lifecycle='transient' for update;
  if found and ar_private.preparation_release_problem(p_actor,null,jid,'proof',true) is not null then return jsonb_build_object('accepted',false);end if;
 end loop;
 for jid in select document_job_id from public.ar_email_drafts where id=m.draft_id union select document_job_id from ar_private.combined_delivery_members where delivery_id=m.id order by 1 loop
  if exists(select 1 from public.ar_document_jobs where id=jid and owner=p_actor and lifecycle='transient') then rid:=ar_private.preparation_accept(p_actor,p_actor,jid,null,null,m.id,jsonb_build_object('job',public.ar_document_get(jid),'outcome',case when (select closed_at from public.ar_document_jobs where id=jid) is null then 'protected' else 'discarded' end));end if;
 end loop;
 for rid in select i.id from ar_private.preparation_retirements i where i.owner=p_actor and (i.delivery_id=m.id or i.job_id in(select document_job_id from public.ar_email_drafts where id=m.draft_id union select document_job_id from ar_private.combined_delivery_members where delivery_id=m.id)) order by i.job_id loop
  result:=result||jsonb_build_array(ar_private.preparation_finalize(p_actor,rid));
 end loop;
 return jsonb_build_object('accepted',jsonb_array_length(result)>0,'jobs',result);
 end$$;
-- Only already accepted intents or original marked command tombstones are revisited.
create function public.ar_preparation_retirement_maintain(p_actor uuid,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c record;r jsonb;rid uuid;result jsonb:='[]';begin
 if p_actor is distinct from public.ar_financial_service_actor() or p_limit not between 1 and 25 then raise exception 'document_forbidden';end if;
 perform pg_advisory_xact_lock(61704,1439);perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 -- No61705 lock in this transaction. Underlying A maintenance has already settled
 -- known command outcomes; transfer their preaccepted authority, never re-abandon.
 for c in select ec.*,dc.job_id,t.settled_outcome from ar_private.preparation_exit_commands ec join ar_private.document_commands dc using(owner,command_key) join ar_private.document_command_exits t using(owner,command_key)
 where ec.owner=p_actor and ec.authorized and t.settled_outcome is not null and not exists(select 1 from ar_private.preparation_retirements i where i.job_id=dc.job_id) order by dc.job_id limit p_limit loop
  r:=jsonb_build_object('job',jsonb_build_object('id',c.job_id),'outcome',c.settled_outcome);
  perform ar_private.preparation_accept(p_actor,c.actor,c.job_id,c.session_id,c.exit_command,null,r);
 end loop;
 for rid in select i.id from ar_private.preparation_retirements i join ar_private.preparation_retirement_progress p on p.retirement_id=i.id where i.owner=p_actor and p.state<>'released' order by p.checked_at,i.id limit p_limit loop
  result:=result||jsonb_build_array(ar_private.preparation_finalize(p_actor,rid));
 end loop;return result;
 end$$;
-- Same retention inspect/hash/delete/ACK: C supplies only pinned exact object IDs.
alter function ar_private.retention_transient_eligibility(uuid,text,text) rename to retention_transient_before_preparation;
create function ar_private.retention_transient_eligibility(p_actor uuid,p_store text,p_key text) returns jsonb language plpgsql stable set search_path='' as $$
 declare o ar_private.preparation_retirement_objects;i ar_private.preparation_retirements;ctx jsonb;r record;ids uuid[];released timestamptz;begin
 if p_store='supabase' then
  select x.* into o from ar_private.preparation_retirement_objects x join ar_private.preparation_retirements t on t.id=x.retirement_id join ar_private.preparation_retirement_progress p on p.retirement_id=t.id where x.storage_key=p_key and t.owner=p_actor and p.state='released';
  if found then
   ctx:=ar_private.retention_context(p_actor,'supabase',o.object_id::text);if ctx?'error' then return ctx;end if;
   if ctx->'target' is distinct from o.target or ctx->>'referenceFingerprint' is distinct from o.reference_fingerprint then return jsonb_build_object('error','retention_identity_mismatch');end if;
   for r in select * from ar_private.retention_storage_references where storage_key=p_key loop
    ids:=ar_private.pdf_reference_jobs(r.kind,r.reference_id);
    if r.owner is distinct from p_actor or cardinality(ids)=0 or exists(select 1 from unnest(ids)x(id) where not ar_private.preparation_reference_authorized(p_actor,x.id)) then return jsonb_build_object('error','retention_shared_reference');end if;
   end loop;
   select p.released_at into released from ar_private.preparation_retirement_progress p where p.retirement_id=o.retirement_id;
   return jsonb_build_object('complete',true,'transient',true,'minimumEligibleAt',released);
  end if;
 end if;return ar_private.retention_transient_before_preparation(p_actor,p_store,p_key);
 end$$;
create function public.ar_preparation_retirement_candidates(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when p_actor=public.ar_financial_service_actor() then
 (select coalesce(jsonb_agg(jsonb_build_object('objectId',q.object_id,'itemId',q.id)),'[]') from
 (select o.object_id,r.id from ar_private.preparation_retirement_objects o join ar_private.preparation_retirements i on i.id=o.retirement_id join ar_private.preparation_retirement_progress p on p.retirement_id=i.id
 left join ar_private.retention_items r on r.store='supabase' and r.object_id=o.object_id::text where i.owner=p_actor and p.state='released' and r.state is distinct from 'deleted' order by r.updated_at nulls first,o.object_id limit 10)q) else '[]'::jsonb end;
$$;
-- Existing GETs carry admission retirement separately from byte release.
do $$declare d text;begin
 d:=pg_get_functiondef('public.ar_document_get(uuid)'::regprocedure);execute replace(d,'select to_jsonb(j)||','select to_jsonb(j)||jsonb_build_object(''preparation_retirement'',ar_private.preparation_projection(j.id))||');
 d:=pg_get_functiondef('public.ar_email_get(uuid,uuid)'::regprocedure);execute replace(d,'select to_jsonb(d)||','select to_jsonb(d)||jsonb_build_object(''preparation_retirement'',ar_private.preparation_projection(d.document_job_id))||');
end$$;
-- Member direct reads and backup cannot resume retired local work while waiting.
create or replace function ar_private.pdf_release_read_allowed(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ar_document_jobs j where j.id=p_job and j.owner=(select auth.uid())) and not ar_private.pdf_released(p_job) and not ar_private.preparation_retired(p_job);
$$;
do $$declare d text:=pg_get_functiondef('public.ar_document_backup_target(uuid,uuid,uuid)'::regprocedure);begin
 execute replace(d,'if ar_private.pdf_released(j.id) then','if ar_private.pdf_released(j.id) or ar_private.preparation_retired(j.id) then');
end$$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='ar_private' and (p.proname like 'preparation_%' or p.proname in('pdf_released_before_preparation','retention_transient_before_preparation','pdf_released','pdf_release_problem')))
 or (n.nspname='public' and p.proname in('ar_document_exit','ar_document_command_exit','ar_preparation_complete','ar_preparation_retirement_maintain','ar_preparation_retirement_candidates')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 if f::text like 'ar_%' or f::text like 'public.ar_%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end$$;
-- C uses the established exact-job cleanup API as well as scheduled rotation.
do $$declare f regprocedure;d text;addition text;begin
 foreach f in array array['public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure,'public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure] loop
 d:=pg_get_functiondef(f);if strpos(d,')cnd left join')=0 then raise exception 'preparation_candidate_definition_drift';end if;
 addition:=' union select o.object_id from ar_private.preparation_retirement_objects o join ar_private.preparation_retirements i on i.id=o.retirement_id join ar_private.preparation_retirement_progress p on p.retirement_id=i.id where i.owner=p_actor and p.state=''released'' and not exists(select 1 from ar_private.retention_items r where r.store=''supabase'' and r.object_id=o.object_id::text and r.state=''deleted'')';
 if f='public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure then addition:=addition||' and i.job_id=p_job_id';end if;
 execute replace(d,')cnd left join',addition||E'\n )cnd left join');
 end loop;
end$$;
create function ar_private.preparation_delivery_projection(p_delivery uuid) returns jsonb language sql stable set search_path='' as $$
 with jobs as(select document_job_id id from public.ar_email_drafts where id=(select draft_id from ar_private.mail_deliveries where id=p_delivery)
 union select document_job_id from ar_private.combined_delivery_members where delivery_id=p_delivery)
 select case when count(*)>0 and bool_and(ar_private.preparation_retired(id)) then jsonb_build_object('accepted',true) else null end from jobs;
$$;
do $$declare f regprocedure;d text;begin
 foreach f in array array['public.ar_mail_get(uuid,uuid)'::regprocedure,'public.ar_mail_for_draft(uuid,uuid,integer)'::regprocedure] loop
 d:=pg_get_functiondef(f);if strpos(d,'select to_jsonb(m)')=0 then raise exception 'preparation_mail_projection_drift';end if;
 execute replace(d,'select to_jsonb(m)','select to_jsonb(m)||jsonb_build_object(''preparationRetirement'',ar_private.preparation_delivery_projection(m.id))');
 end loop;
 d:=pg_get_functiondef('public.ar_combined_email_get(uuid,uuid)'::regprocedure);
 if strpos(d,'''gmailAccepted'',')=0 then raise exception 'preparation_combined_projection_drift';end if;
 execute replace(d,'''gmailAccepted'',','''preparationRetirement'',ar_private.preparation_delivery_projection(m.id),''gmailAccepted'',');
end$$;
revoke all on function ar_private.preparation_delivery_projection(uuid) from public,anon,authenticated,service_role;
