create or replace function public.ar_document_fail_file(p_job_id uuid,p_file_id uuid,p_code text,p_uncertain boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.ar_document_files; target text;
begin
 if p_code is null or p_code !~ '^[a-zA-Z0-9_]{1,100}$' or p_uncertain is null then raise exception 'document_error_invalid'; end if;
 target:=case when p_uncertain then 'uncertain' else 'unavailable' end;
 perform 1 from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 select * into f from public.ar_document_files where id=p_file_id and job_id=p_job_id for update;
 if not found then raise exception 'document_file_missing'; end if;
 -- Evaluate interruption ambiguity under the current file lock, not a caller snapshot.
 if p_code='document_workflow_interrupted' and f.state='generating' then target:='uncertain'; end if;
 if f.state='ready' then return public.ar_document_get(p_job_id); end if;
 if f.state='unavailable' then
   if target<>f.state or p_code<>f.error_code then raise exception 'document_result_conflict'; end if;
   return public.ar_document_get(p_job_id);
 end if;
 -- Pending can be classified unavailable before an unsupported report is requested.
 -- An uncertain native request can never become retryable through failure handling.
 if f.state='uncertain' then target:='uncertain'; end if;
 update public.ar_document_files set state=target,error_code=p_code,updated_at=now() where id=f.id;
 perform ar_private.document_aggregate(p_job_id);
 return public.ar_document_get(p_job_id);
end;
$$;
