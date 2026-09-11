alter table public.ar_email_attachments add column inspection jsonb not null default '{}'::jsonb;

create function public.ar_email_attachment_record(p_actor uuid,p_id uuid,p_file_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(a) from public.ar_email_attachments a join public.ar_email_drafts d on d.id=a.draft_id where d.owner=p_actor and d.id=p_id and a.id=p_file_id;
$$;

create function public.ar_email_attachment_add_v2(p_actor uuid,p_id uuid,p_revision integer,p_file_id uuid,p_name text,p_key text,p_mime text,p_bytes bigint,p_sha256 text,p_inspection jsonb,p_budget bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;a public.ar_email_attachments;used bigint;files integer;
begin
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if j.revision<>d.document_revision or not j.acknowledged or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 if p_file_id is null or p_name is null or length(p_name) not between 1 and 200 or p_name<>btrim(p_name) or p_name~'[[:cntrl:]/\\]' or p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg') or p_bytes is null or p_bytes not between 1 and 20971520 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_key is null or p_key<>('jobs/'||d.document_job_id||'/email/'||d.id||'/'||p_file_id) or p_budget is null or p_budget not between 1 and 12582912 or p_inspection is null or jsonb_typeof(p_inspection)<>'object' or p_inspection->>'version' is distinct from '1' then return jsonb_build_object('error','attachment_invalid');end if;
 select * into a from public.ar_email_attachments where id=p_file_id;
 if found then
  if a.draft_id=p_id and not a.removed and a.name=p_name and a.mime=p_mime and a.byte_count=p_bytes and a.sha256=p_sha256 and a.storage_key=p_key then return public.ar_email_get(p_actor,p_id);end if;
  return jsonb_build_object('error','attachment_command_conflict');
 end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and state<>'sent') or exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in ('creating','created','uncertain')) then return jsonb_build_object('error','email_handoff_pending');end if;
 select coalesce(sum(byte_count),0),count(*) into used,files from public.ar_email_attachments where draft_id=p_id and not removed;
 select used+coalesce(sum((value->>'byte_count')::bigint),0) into used from jsonb_array_elements(d.exports);
 if used+p_bytes>p_budget or files+jsonb_array_length(d.exports)+1>50 then return jsonb_build_object('error','email_too_large');end if;
 insert into public.ar_email_attachments(id,draft_id,name,storage_key,mime,byte_count,sha256,inspection) values(p_file_id,p_id,p_name,p_key,p_mime,p_bytes,p_sha256,p_inspection);
 update public.ar_email_drafts set revision=revision+1,updated_at=now() where id=p_id;return public.ar_email_get(p_actor,p_id);
end $$;

create or replace function public.ar_email_attachment_remove(p_actor uuid,p_id uuid,p_revision integer,p_file_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;a public.ar_email_attachments;
begin
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 select * into a from public.ar_email_attachments where id=p_file_id and draft_id=p_id;
 if not found then return jsonb_build_object('error','email_attachment_missing');end if;
 if a.removed then return public.ar_email_get(p_actor,p_id);end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 if exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and state<>'sent') or exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in ('creating','created','uncertain')) then return jsonb_build_object('error','email_handoff_pending');end if;
 update public.ar_email_attachments set removed=true where id=p_file_id;
 update public.ar_email_drafts set revision=revision+1,updated_at=now() where id=p_id;return public.ar_email_get(p_actor,p_id);
end $$;
-- Retire the unused, less strict placeholder writer. Physical objects remain
-- private; removal affects only the current message, not sent evidence.
revoke execute on function public.ar_email_attachment_add(uuid,uuid,integer,uuid,text,text,text,bigint,text) from service_role;
revoke all on function public.ar_email_attachment_record(uuid,uuid,uuid),public.ar_email_attachment_add_v2(uuid,uuid,integer,uuid,text,text,text,bigint,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.ar_email_attachment_record(uuid,uuid,uuid),public.ar_email_attachment_add_v2(uuid,uuid,integer,uuid,text,text,text,bigint,text,jsonb,bigint) to service_role;
