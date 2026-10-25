-- Read-only maintenance lookup: caller supplies two identities, never a path.
-- Canonical administrator and immutable source receipts are checked again here.
create function public.ar_document_backup_target(p_actor uuid,p_job_id uuid,p_object_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j public.ar_document_jobs;o storage.objects;receipt record;
begin
 if p_actor is null or p_actor is distinct from public.ar_financial_service_actor() then raise exception 'document_forbidden';end if;
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor;
 if not found then raise exception 'document_forbidden';end if;
 if j.closed_at is not null then raise exception 'document_closed';end if;
 if j.discard_requested_at is not null then raise exception 'document_discard_pending';end if;
 select * into o from storage.objects where id=p_object_id and bucket_id='ar-working-files';
 if not found or o.name !~ ('^jobs/'||j.id||'/(originals/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf|exports/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf|projects/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.json)$') then raise exception 'document_backup_unavailable';end if;
 select s.* into receipt from (
  select f.storage_key,f.byte_count,f.sha256,'application/pdf'::text as mime
   from public.ar_document_files f where f.job_id=j.id and f.state='ready' and f.storage_key=o.name
  union all
  -- Registration records server-verified upload bytes. It also covers a reviewed
  -- export/project later superseded, or an unused upload never saved in a revision.
  select u.storage_key,u.byte_count,u.sha256,u.mime from ar_private.document_uploads u
   where u.job_id=j.id and u.storage_key=o.name
 ) s;
 if not found or receipt.byte_count not between 1 and 104857600 or receipt.sha256 !~ '^[0-9a-f]{64}$' or coalesce(o.metadata->>'size','')!~'^[0-9]{1,15}$' then raise exception 'document_backup_unavailable';end if;
 if (o.metadata->>'size')::bigint<>receipt.byte_count or coalesce(o.metadata->>'mimetype',receipt.mime)<>receipt.mime then raise exception 'document_backup_unavailable';end if;
 -- Pre-budget originals have their original ready/upload receipt. When a managed
 -- reservation exists, its exact verified Storage identity must still agree.
 if exists(select 1 from ar_private.storage_upload_operations b where b.object_key=o.name and (not b.verified or b.owner<>p_actor or b.object_id is distinct from o.id or b.object_updated_at is distinct from o.updated_at or b.byte_count<>receipt.byte_count or b.sha256<>receipt.sha256 or b.mime<>receipt.mime)) then raise exception 'document_backup_unavailable';end if;
 return jsonb_build_object('job_id',j.id,'object_id',o.id,'storage_key',o.name,'byte_count',receipt.byte_count,'sha256',receipt.sha256,'mime',receipt.mime);
end$$;
revoke all on function public.ar_document_backup_target(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ar_document_backup_target(uuid,uuid,uuid) to service_role;
