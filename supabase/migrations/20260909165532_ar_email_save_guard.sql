create or replace function public.ar_email_save(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;
begin
 if p_purpose is null or p_purpose not in ('billing','collection') or not ar_private.valid_recipients(p_recipients) or p_subject is null or length(p_subject)>998 or p_subject~E'[\\r\\n]' or p_body is null or length(p_body)>100000 then return jsonb_build_object('error','email_invalid');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id;
 if j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 if d.purpose=p_purpose and d.recipients=p_recipients and d.subject=p_subject and d.body=p_body then return public.ar_email_get(p_actor,p_id);end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in ('creating','uncertain')) then return jsonb_build_object('error','email_handoff_pending');end if;
 update public.ar_email_drafts set purpose=p_purpose,recipients=p_recipients,subject=p_subject,body=p_body,revision=revision+1,updated_at=now() where id=p_id;
 return public.ar_email_get(p_actor,p_id);
end $$;
