-- Exited temporary bytes have immutable object/identity pins and an independent
-- admission/rebind fence. Their invoice identity must not lock a fresh PDF job
-- that has its own command, job and object namespace while old deletion settles.
-- Keep the transaction mutex and every exact-key/ordinary retention fence.
create or replace function ar_private.retention_write_allowed(p_actor uuid,p_hotel text,p_account text,p_invoice_ids text[],p_storage_keys text[] default '{}') returns boolean language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(61704,1439);
 if p_actor is null or p_invoice_ids is null or p_storage_keys is null or cardinality(p_invoice_ids)+cardinality(p_storage_keys)=0 then return false;end if;
 return not exists(
  select 1 from ar_private.retention_items r
  where r.owner=p_actor and r.state in('claimed','uncertain') and (
   r.storage_key=any(p_storage_keys)
   or (
    exists(select 1 from jsonb_array_elements(r.links)l where l->>'hotel'=p_hotel and l->>'accountId'=p_account and l->>'invoiceId'=any(p_invoice_ids))
    and not (
     r.store='supabase' and exists(
      select 1 from ar_private.preparation_retirement_objects o
      join ar_private.preparation_retirements retirement on retirement.id=o.retirement_id and retirement.owner=p_actor
      join ar_private.preparation_retirement_progress progress on progress.retirement_id=retirement.id and progress.state='released'
      join public.ar_document_jobs j on j.id=retirement.job_id and j.owner=p_actor and j.lifecycle='transient'
      where o.object_id::text=r.object_id and o.storage_key=r.storage_key
       and o.target=r.target and o.reference_fingerprint=r.reference_fingerprint
     )
    )
   )
  )
 );
end $$;
revoke all on function ar_private.retention_write_allowed(uuid,text,text,text[],text[]) from public,anon,authenticated,service_role;

-- The reference trigger must carry the actual new row's byte keys as well as
-- invoice identities. This keeps old-key rebinding blocked on remittance/Drive
-- paths too, even when a remittance does not have invoice lines yet.
do $patch$
declare definition text:=pg_get_functiondef('ar_private.retention_reference_guard()'::regprocedure);
 declaration text:='declare v jsonb:=';
 needle text:=$needle$if cardinality(ids)>0 and not ar_private.retention_write_allowed((scope->>'owner')::uuid,scope->>'hotel',scope->>'account_id',ids) then raise exception 'retention_busy';end if;$needle$;
 replacement text:=$replacement$select coalesce(array_agg(distinct key#>>'{}'),array[]::text[]) into write_keys from (
  select jsonb_path_query(v,'$.**.storage_key') as key
  union select jsonb_path_query(v,'$.**.storageKey')
  union select jsonb_path_query(v,'$.**.project_key')
 ) candidate where jsonb_typeof(key)='string';
 if cardinality(coalesce(ids,array[]::text[]))+cardinality(write_keys)>0
  and not ar_private.retention_write_allowed((scope->>'owner')::uuid,scope->>'hotel',scope->>'account_id',coalesce(ids,array[]::text[]),write_keys)
 then raise exception 'retention_busy';end if;$replacement$;
begin
 definition:=replace(definition,E'\r','');
 if (length(definition)-length(replace(definition,declaration,'')))/length(declaration)<>1
 or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'retired_file_reference_guard_drift';end if;
 definition:=replace(definition,declaration,'declare write_keys text[];v jsonb:=');
 execute replace(definition,needle,replacement);
end $patch$;
