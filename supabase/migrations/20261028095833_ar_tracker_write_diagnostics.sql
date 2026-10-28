-- Bounded operational attribution on existing private queue records only.
-- No provider text, identity values, URLs or versions are accepted as metadata.
alter table ar_private.tracker_outbox add column write_diagnostics jsonb not null default '{}'::jsonb
 check(jsonb_typeof(write_diagnostics)='object' and octet_length(write_diagnostics::text)<=1024);

create function public.ar_tracker_write_diagnostic(p_actor uuid,p_region text,p_lock uuid,p_ids uuid[],p_code text,p_mutation_started boolean,p_upstream_status integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid;entry jsonb;recorded integer;
begin
 o:=ar_private.tracker_authorize(p_actor,p_region);
 if p_ids is null or cardinality(p_ids) not between 1 and 100 or array_position(p_ids,null) is not null
  or (select count(distinct id) from unnest(p_ids)id)<>cardinality(p_ids)
  or (p_code='adapter_exception_unknown' and p_mutation_started is not null or p_code<>'adapter_exception_unknown' and p_mutation_started is null)
  or p_upstream_status is not null and p_upstream_status not between 100 and 599
  or p_code is null or not p_code=any(array['cas_disabled','missing_etag','not_editable','snapshot_changed','row_identity_changed','cell_preimage_changed','formula_or_missing_cell','cell_metadata_unsupported','signed_workbook','patch_rejected','cas_412','readback_changed','upload_transport_unknown','upload_http_unknown','readback_unavailable','adapter_exception_unknown'])
  then raise exception 'tracker_diagnostic_invalid';end if;
 if not exists(select 1 from ar_private.tracker_bindings where region=p_region and owner=o and lock_id=p_lock and lock_until>now()) then raise exception 'tracker_lock_lost';end if;
 if (select count(*) from ar_private.tracker_outbox q where q.id=any(p_ids) and q.owner=o and q.hotel=any(ar_private.access_hotels(array[p_region])))<>cardinality(p_ids) then raise exception 'tracker_forbidden';end if;
 entry:=jsonb_build_object('code',p_code,'at',now(),'mutationStarted',p_mutation_started,'upstreamStatus',p_upstream_status);
 update ar_private.tracker_outbox q set write_diagnostics=jsonb_build_object('first',coalesce(q.write_diagnostics->'first',entry),'last',entry)
 where q.id=any(p_ids) and q.owner=o and q.hotel=any(ar_private.access_hotels(array[p_region])) and q.state<>'written';
 get diagnostics recorded=row_count;
 return jsonb_build_object('recorded',recorded);
end$$;
revoke all on function public.ar_tracker_write_diagnostic(uuid,text,uuid,uuid[],text,boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_tracker_write_diagnostic(uuid,text,uuid,uuid[],text,boolean,integer) to service_role;
