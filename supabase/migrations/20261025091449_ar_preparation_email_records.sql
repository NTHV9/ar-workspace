-- Account email evidence is not a resumable document-work backlog. Preserve the
-- legacy evidence projection and business history; filter before counting/paging.
do $$
declare definition text:=pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure);needle text;
begin
 needle:=$s$p_section not in ('history','documents')$s$;
 if strpos(definition,needle)=0 then raise exception 'Account workspace section guard changed';end if;
 definition:=replace(definition,needle,$s$p_section not in ('history','documents','email_records')$s$);
 needle:=$s$m.id as delivery_id,m.state as delivery_state$s$;
 if strpos(definition,needle)=0 then raise exception 'Account email evidence projection changed';end if;
 definition:=replace(definition,needle,$s$m.id as delivery_id,m.mode as delivery_mode,coalesce(m.state,(select a.state from ar_private.gmail_draft_attempts a where a.draft_id=d.id order by a.created_at desc,a.id desc limit 1)) as delivery_state$s$);
 needle:=$s$select id,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries$s$;
 if strpos(definition,needle)=0 then raise exception 'Account delivery lookup changed';end if;
 definition:=replace(definition,needle,$s$select id,mode,state,reason,sent_at,reconcile_checked_at from ar_private.mail_deliveries$s$);
 needle:=$s$where j.owner=p_actor and j.hotel=p_hotel and j.account_id=p_account$s$;
 if strpos(definition,needle)=0 then raise exception 'Account scope predicate changed';end if;
 definition:=replace(definition,needle,needle||$s$ and (p_section<>'email_records' or m.id is not null or exists(select 1 from ar_private.gmail_draft_attempts a where a.draft_id=d.id))$s$);
 execute definition;
end$$;

-- Request text cleanup only for future explicit discards. No backfill or
-- retrospective sweep of older closed business/preparation records.
alter table public.ar_document_jobs add column discard_text_pending boolean not null default false;
create function ar_private.mark_discarded_message_cleanup() returns trigger language plpgsql set search_path='' as $$
begin
 if old.closed_at is null and new.closed_at is not null and new.closed_reason='discarded' and new.lifecycle='transient' then new.discard_text_pending:=true;end if;
 return new;
end$$;
revoke all on function ar_private.mark_discarded_message_cleanup() from public,anon,authenticated,service_role;
create trigger ar_mark_discarded_message_cleanup before update of closed_at on public.ar_document_jobs for each row execute function ar_private.mark_discarded_message_cleanup();

-- Closed preparations remain immutable except acknowledging this one cleanup
-- flag. Neither reopening nor changing any business/package field is permitted.
do $$
declare definition text:=pg_get_functiondef('ar_private.document_lifecycle_guard()'::regprocedure);needle text;
begin
 needle:=$s$if old.closed_at is not null and new is distinct from old then raise exception 'document_closed';end if;$s$;
 if strpos(definition,needle)=0 then raise exception 'Closed document lifecycle guard changed';end if;
 definition:=replace(definition,needle,$s$if old.closed_at is not null and new is distinct from old and not
  (old.lifecycle='transient' and old.closed_reason='discarded' and old.discard_text_pending and not new.discard_text_pending
   and (to_jsonb(new)-'discard_text_pending')=(to_jsonb(old)-'discard_text_pending')) then raise exception 'document_closed';end if;$s$);
 execute definition;
end$$;

-- Allow only exact blanking of never-attempted content on a closed discarded
-- transient job; all identity, package, signature and revision fields stay equal.
do $$
declare definition text:=pg_get_functiondef('ar_private.document_transient_reference_guard()'::regprocedure);needle text;
begin
 needle:=$s$ if j.lifecycle<>'transient' then return new;end if;$s$;
 if strpos(definition,needle)=0 then raise exception 'Transient reference guard boundary changed';end if;
 definition:=replace(definition,needle,needle||$s$
 if tg_op='UPDATE' and tg_table_name='ar_email_drafts' and j.closed_at is not null and j.closed_reason='discarded' and j.discard_text_pending
 and v->>'subject'='' and v->>'body'='' and v->>'rich_body' is null and v->>'template_ref' is null and v->'recipients'='{"to":[],"cc":[],"bcc":[]}'::jsonb
 and (to_jsonb(new)-array['subject','body','rich_body','template_ref','recipients','updated_at'])=(to_jsonb(old)-array['subject','body','rich_body','template_ref','recipients','updated_at'])
 and not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=j.id)
 and not exists(select 1 from ar_private.gmail_draft_attempts a join public.ar_email_drafts d on d.id=a.draft_id where d.document_job_id=j.id) then return new;end if;
$s$);
 execute definition;
end$$;

-- Runs after the discard transaction releases its admission/job locks. Skip a
-- draft held by an in-flight save; the durable pending flag permits later retry.
-- Never add a draft-row lock to the discard/admission transaction itself.
create function ar_private.scrub_discarded_messages(p_actor uuid,p_job_id uuid,p_limit integer) returns integer language plpgsql security definer set search_path='' as $$
declare jid uuid;did uuid;cleaned integer:=0;
begin
 if not ar_private.invoice_exception_actor(p_actor) then raise exception 'document_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;
 for jid in select j.id from public.ar_document_jobs j where j.owner=p_actor and j.lifecycle='transient' and j.closed_reason='discarded' and j.closed_at is not null and j.discard_text_pending
  and (p_job_id is null or j.id=p_job_id) order by j.closed_at,j.id limit p_limit loop
  if not exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=jid)
  and not exists(select 1 from ar_private.gmail_draft_attempts a join public.ar_email_drafts d on d.id=a.draft_id where d.document_job_id=jid) then
   for did in select d.id from public.ar_email_drafts d where d.owner=p_actor and d.document_job_id=jid
    and (d.subject<>'' or d.body<>'' or d.rich_body is not null or d.template_ref is not null or d.recipients<>'{"to":[],"cc":[],"bcc":[]}'::jsonb)
    order by d.id limit p_limit for update skip locked loop
    update public.ar_email_drafts set subject='',body='',rich_body=null,template_ref=null,recipients='{"to":[],"cc":[],"bcc":[]}'::jsonb,updated_at=clock_timestamp() where id=did;
    cleaned:=cleaned+1;
   end loop;
  end if;
  if exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where d.document_job_id=jid)
   or exists(select 1 from ar_private.gmail_draft_attempts a join public.ar_email_drafts d on d.id=a.draft_id where d.document_job_id=jid)
   or not exists(select 1 from public.ar_email_drafts d where d.document_job_id=jid and (d.subject<>'' or d.body<>'' or d.rich_body is not null or d.template_ref is not null or d.recipients<>'{"to":[],"cc":[],"bcc":[]}'::jsonb)) then
   update public.ar_document_jobs set discard_text_pending=false where id=jid;
  end if;
 end loop;
 return cleaned;
end$$;
revoke all on function ar_private.scrub_discarded_messages(uuid,uuid,integer) from public,anon,authenticated,service_role;

-- Both paths run even when no storage object remains. Text cleanup never relies
-- on a particular file being present, and uses the existing exact-owner checks.
do $$
declare oid regprocedure;definition text;needle text;
begin
 foreach oid in array array['public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure,'public.ar_document_cleanup_candidates(uuid,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(oid);needle:=$s$ if p_limit is null or p_limit not between 1 and 25 then raise exception 'document_request_invalid';end if;$s$;
  if strpos(definition,needle)=0 then raise exception 'Cleanup validation boundary changed';end if;
  definition:=replace(definition,needle,needle||case when oid='public.ar_document_cleanup_job_candidates(uuid,uuid,integer)'::regprocedure then E'\n perform ar_private.scrub_discarded_messages(p_actor,p_job_id,p_limit);' else E'\n perform ar_private.scrub_discarded_messages(p_actor,null,p_limit);' end);
  execute definition;
 end loop;
end$$;
