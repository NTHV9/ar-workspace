-- Preserve the same private workspace message when a batch reconfirms its PDFs.
-- Gmail handoffs are immutable: only never-handed-off drafts may be rebound.
create function public.ar_email_rebind(p_actor uuid,p_id uuid,p_revision integer,p_job_id uuid,p_document_revision integer,p_max_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs;d public.ar_email_drafts;total_bytes bigint;total_files integer;staff uuid;headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if headers?'x-ar-actor' then
  if jsonb_typeof(headers->'x-ar-actor') is distinct from 'string' or headers->>'x-ar-actor'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return jsonb_build_object('error','email_forbidden');end if;
  staff:=ar_private.request_staff();if staff is null then return jsonb_build_object('error','email_forbidden');end if;
 end if;
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if staff is not null and (p_actor is distinct from ar_private.access_owner() or not j.hotel=any(ar_private.access_hotels((ar_private.access_member(staff)).regions))) then return jsonb_build_object('error','email_forbidden');end if;
 if j.closed_at is not null then return jsonb_build_object('error','document_closed');end if;
 if j.discard_requested_at is not null then return jsonb_build_object('error','document_discard_pending');end if;
 if p_document_revision is null or j.revision<>p_document_revision or not j.acknowledged or j.state<>'ready' or jsonb_array_length(j.exports)=0 then return jsonb_build_object('error','email_package_not_reviewed');end if;
 if row(d.document_job_id,d.hotel,d.account_id,d.invoice_ids) is distinct from row(j.id,j.hotel,j.account_id,j.invoice_ids) then return jsonb_build_object('error','email_forbidden');end if;
 if p_revision is null or p_revision<0 then return jsonb_build_object('error','email_revision_conflict');end if;
 -- A repeat after a lost response is a read, never another revision.
 if d.document_revision=j.revision then
  return public.ar_email_get(p_actor,d.id);
 end if;
 if d.revision<>p_revision or d.document_revision>j.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=d.id)
 or exists(select 1 from ar_private.mail_deliveries where draft_id=d.id)
 or ar_private.document_pending_mail(j.id) then return jsonb_build_object('error','email_handoff_pending');end if;
 if exists(select 1 from ar_private.document_transient_uploads where job_id=j.id and not registered and not cancelled) then return jsonb_build_object('error','document_upload_pending');end if;
 if exists(select 1 from public.ar_email_drafts where owner=p_actor and document_job_id=j.id and document_revision=j.revision and id<>d.id) then return jsonb_build_object('error','email_revision_conflict');end if;
 select count(*),coalesce(sum(bytes),0) into total_files,total_bytes from(
  select (value->>'byte_count')::bigint as bytes from jsonb_array_elements(j.exports)
  union all select byte_count from public.ar_email_attachments where draft_id=d.id and not removed
 )f;
 if p_max_bytes is null or p_max_bytes not between 1 and 12582912 or total_files>50 or total_bytes>p_max_bytes then return jsonb_build_object('error','email_too_large');end if;
 update public.ar_email_drafts set document_revision=j.revision,exports=j.exports,revision=revision+1,updated_at=clock_timestamp() where id=d.id;
 return public.ar_email_get(p_actor,d.id);
end$$;
revoke all on function public.ar_email_rebind(uuid,uuid,integer,uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.ar_email_rebind(uuid,uuid,integer,uuid,integer,bigint) to service_role;
