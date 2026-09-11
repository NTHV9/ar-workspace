create or replace function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;a ar_private.gmail_draft_attempts;
begin select * into d from public.ar_email_drafts where id=p_draft and owner=p_owner for update;if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if not j.acknowledged or j.revision<>d.document_revision or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 select * into a from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision;
 if found then return to_jsonb(a)||jsonb_build_object('claimed',false);end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and state in ('creating','uncertain')) then return jsonb_build_object('error','email_handoff_pending');end if;
 insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values(p_draft,p_revision,p_message_id) returning * into a;return to_jsonb(a)||jsonb_build_object('claimed',true);
end $$;
