-- Only a positively never-started, accepted Exit may seal generation admission.
-- Receipts describe never-created keys; they are not fabricated deletion ACKs.
create table ar_private.preparation_unstarted_cancellations(
 retirement_id uuid primary key references ar_private.preparation_retirements(id),
 job_id uuid not null unique references public.ar_document_jobs(id),owner uuid not null references auth.users(id),
 file_ids uuid[] not null check(cardinality(file_ids)>0 and array_position(file_ids,null) is null),
 captured_files_digest text not null check(captured_files_digest~'^[0-9a-f]{32}$'),
 cancelled_at timestamptz not null,
 reason text not null default 'exit_before_pdf_claim' check(reason='exit_before_pdf_claim')
);
alter table ar_private.preparation_unstarted_cancellations enable row level security;
revoke all on ar_private.preparation_unstarted_cancellations from public,anon,authenticated,service_role;
create trigger preparation_unstarted_immutable before update or delete on ar_private.preparation_unstarted_cancellations for each row execute function ar_private.pdf_release_immutable();

-- The parent finalizer holds global -> actor before this job/file row domain.
-- Pending is initial-only in the generation API; it is never a retry reset.
create function ar_private.cancel_unstarted_preparation(p_owner uuid,p_retirement uuid) returns boolean language plpgsql set search_path='' as $$
declare retirement ar_private.preparation_retirements;job public.ar_document_jobs;ids uuid[];initial_only boolean;cancel_time timestamptz;changed integer;closed jsonb;
begin
 select * into retirement from ar_private.preparation_retirements where id=p_retirement and owner=p_owner;
 if not found or retirement.authority<>'exit' or coalesce(retirement.original_response->>'outcome' in('pending','discarded'),false) is distinct from true then return false;end if;
 if exists(select 1 from ar_private.preparation_unstarted_cancellations c where c.retirement_id=retirement.id and c.job_id=retirement.job_id and c.owner=p_owner and c.captured_files_digest=md5((retirement.captured->'files')::text)) then return true;end if;
 select * into job from public.ar_document_jobs where id=retirement.job_id and owner=p_owner for update;
 if not found or job.lifecycle<>'transient' or job.closed_at is not null or job.state<>'queued' or job.discard_requested_at is null or job.acknowledged or job.project_key is not null or job.exports<>'[]'::jsonb then return false;end if;
 if jsonb_typeof(retirement.captured->'files') is distinct from 'array' or jsonb_typeof(retirement.captured->'keys') is distinct from 'array' or retirement.captured->'uploads' is distinct from '[]'::jsonb then return false;end if;
 perform 1 from public.ar_document_files f where f.job_id=job.id order by f.id for update;
 select array_agg(f.id order by f.id),bool_and(f.state='pending' and f.storage_key is null and f.byte_count is null and f.sha256 is null and f.error_code is null and f.created_at=f.updated_at) into ids,initial_only from public.ar_document_files f where f.job_id=job.id;
 if ids is null or initial_only is distinct from true or jsonb_array_length(retirement.captured->'files')<>cardinality(ids)
 or (select array_agg(distinct (snapshot->>'id')::uuid order by (snapshot->>'id')::uuid) from jsonb_array_elements(retirement.captured->'files')snapshot) is distinct from ids then return false;end if;
 if exists(select 1 from jsonb_array_elements(retirement.captured->'files')snapshot join public.ar_document_files f on f.id=(snapshot->>'id')::uuid and f.job_id=job.id
 where (snapshot-array['created_at','updated_at']) is distinct from (to_jsonb(f)-array['created_at','updated_at'])
 or (snapshot->>'created_at')::timestamptz is distinct from f.created_at or (snapshot->>'updated_at')::timestamptz is distinct from f.updated_at) then return false;end if;
 if jsonb_array_length(retirement.captured->'keys')<>cardinality(ids) or exists(select 1 from jsonb_array_elements_text(retirement.captured->'keys')k(value) where not exists(select 1 from unnest(ids)f(id) where k.value='jobs/'||job.id||'/originals/'||f.id||'.pdf')) then return false;end if;
 -- Any admitted byte/mail/shared-reference evidence makes this ineligible.
 if exists(select 1 from ar_private.document_transient_uploads where job_id=job.id)
 or exists(select 1 from ar_private.document_uploads where job_id=job.id)
 or exists(select 1 from ar_private.document_revisions where job_id=job.id)
 or exists(select 1 from public.ar_email_drafts where document_job_id=job.id)
 or exists(select 1 from ar_private.drive_archives where document_job_id=job.id)
 or exists(select 1 from ar_private.unused_preparation_dispositions where job_id=job.id)
 or exists(select 1 from ar_private.preparation_retirement_objects where retirement_id=retirement.id)
 or ar_private.document_pending_mail(job.id)
 or exists(select 1 from ar_private.storage_upload_operations where split_part(object_key,'/',2)=job.id::text)
 or exists(select 1 from storage.objects where bucket_id='ar-working-files' and name in(select jsonb_array_elements_text(retirement.captured->'keys')))
 or exists(select 1 from ar_private.retention_storage_references where storage_key in(select jsonb_array_elements_text(retirement.captured->'keys')))
 or exists(select 1 from ar_private.retention_items where storage_key in(select jsonb_array_elements_text(retirement.captured->'keys'))) then return false;end if;
 cancel_time:=clock_timestamp();
 insert into ar_private.preparation_unstarted_cancellations(retirement_id,job_id,owner,file_ids,captured_files_digest,cancelled_at) values(retirement.id,job.id,p_owner,ids,md5((retirement.captured->'files')::text),cancel_time);
 update public.ar_document_files set state='unavailable',error_code='cancelled_before_pdf_claim',updated_at=cancel_time where job_id=job.id and id=any(ids);
 get diagnostics changed=row_count;if changed<>cardinality(ids) then raise exception 'preparation_cancel_conflict';end if;
 perform ar_private.document_aggregate(job.id);
 closed:=public.ar_document_discard(p_owner,job.id);
 if closed->>'closed_reason' is distinct from 'discarded' then raise exception 'preparation_cancel_close_failed';end if;
 return true;
end $$;
revoke all on function ar_private.cancel_unstarted_preparation(uuid,uuid) from public,anon,authenticated,service_role;

-- Same claim row locks; a late worker gets a no-op, never a new render/upload.
do $patch$
declare definition text:=replace(pg_get_functiondef('public.ar_document_claim_file(uuid,uuid)'::regprocedure),E'\r','');needle text:=$needle$ if f.state='pending' then$needle$;
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'unstarted_claim_definition_drift';end if;
 execute replace(definition,needle,$replacement$ if exists(select 1 from ar_private.preparation_unstarted_cancellations where job_id=p_job_id) then
  return jsonb_build_object('claimed',false,'file',to_jsonb(f),'cancelled_before_claim',true);
 end if;
 if f.state='pending' then$replacement$);
end $patch$;

-- Existing missing/unknown-object protection only gains the exact never-created proof.
do $patch$
declare definition text:=replace(pg_get_functiondef('ar_private.preparation_finalize(uuid,uuid)'::regprocedure),E'\r','');
 lock_needle text:=E' begin\n select * into i';
 cancel_needle text:=$needle$ if p.state='released' then return ar_private.preparation_projection(i.job_id);end if;$needle$;
 missing_needle text:=$needle$and ri.delete_ack_at is not null)) then problem:='pdf_release_object_missing';end if;$needle$;
begin
 if (length(definition)-length(replace(definition,lock_needle,'')))/length(lock_needle)<>1
 or (length(definition)-length(replace(definition,cancel_needle,'')))/length(cancel_needle)<>1
 or (length(definition)-length(replace(definition,missing_needle,'')))/length(missing_needle)<>1 then raise exception 'unstarted_finalize_definition_drift';end if;
 definition:=replace(definition,lock_needle,E' begin\n perform pg_advisory_xact_lock(61704,1439);\n perform pg_advisory_xact_lock(hashtextextended(p_owner::text,735));\n select * into i');
 definition:=replace(definition,cancel_needle,cancel_needle||E'\n perform ar_private.cancel_unstarted_preparation(p_owner,i.id);');
 definition:=replace(definition,missing_needle,$replacement$and ri.delete_ack_at is not null)
 and not exists(select 1 from ar_private.preparation_unstarted_cancellations c join public.ar_document_files f on f.job_id=c.job_id and f.id=any(c.file_ids)
  where i.authority='exit' and c.retirement_id=i.id and c.job_id=i.job_id and c.owner=p_owner and c.captured_files_digest=md5((i.captured->'files')::text)
  and missing.value='jobs/'||i.job_id||'/originals/'||f.id||'.pdf' and f.state='unavailable' and f.error_code='cancelled_before_pdf_claim'
  and f.storage_key is null and f.byte_count is null and f.sha256 is null and f.updated_at=c.cancelled_at)) then problem:='pdf_release_object_missing';end if;$replacement$);
 execute definition;
end $patch$;
