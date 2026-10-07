-- Supabase CLI was unavailable in the approved offline workspace; the ordered
-- filename was reserved explicitly. No historical actor/timestamp backfill.
do $$
begin
 if md5(replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),chr(13),''))<>'e045baa9ba5e63412e318c8830a09fd4'
 or md5(replace(pg_get_functiondef('public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure),chr(13),''))<>'16542cee9b5ee3dc5eec111e454a21df'
 or md5(replace(pg_get_functiondef('public.ar_invoice_register_save(uuid,text,text,text,jsonb)'::regprocedure),chr(13),''))<>'523433c17b8939a4cbeff13fc6d94830'
 or md5(replace(pg_get_functiondef('public.ar_invoice_register_history(uuid,text,text,text,integer)'::regprocedure),chr(13),''))<>'6fe3340fe0704491721da9cbaa3ab198' then raise exception 'tracker_reaudit_definition_drift';end if;
end $$;

alter table ar_private.invoice_register_history add column command_id uuid;
create unique index invoice_register_history_command on ar_private.invoice_register_history(command_id) where command_id is not null;
create table ar_private.tracker_register_history_source(
 history_id bigint primary key references ar_private.invoice_register_history(id),
 command_id uuid not null unique references ar_private.invoice_register_commands(command_id),
 region text not null check(region in('phuket','khao-lak')),row_key text not null,
 hotel text not null,account_id text not null,invoice_id text not null,
 import_kind text not null check(import_kind in('automatic','reviewed'))
);
alter table ar_private.tracker_register_history_source enable row level security;
revoke all on ar_private.tracker_register_history_source from public,anon,authenticated,service_role;

create function ar_private.tracker_ledger_recover_identity(p_region text,p_key text) returns void
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 update ar_private.tracker_conflicts set status='resolved',resolved_at=now()
 where region=p_region and row_key=p_key and field='identity' and status='pending'
 and reason in('ambiguous_or_missing_identity','incomplete_identity','provider_identity_requires_review','source_row_missing','invoice_source_unverified');
end $$;
revoke all on function ar_private.tracker_ledger_recover_identity(text,text) from public,anon,authenticated,service_role;

-- Only the tracker import/resolver calls this private bridge. The exact command
-- UUID is captured by Register's own history INSERT, never inferred from time,
-- adjacent rows, actor labels or an equal before/after payload.
create function ar_private.tracker_register_save(p_actor uuid,p_region text,p_key text,p_kind text,p_hotel text,p_account text,p_invoice text,p_input jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare owner_id uuid;cmd uuid;result jsonb;history_id bigint;history_count integer;prior ar_private.tracker_register_history_source;
begin
 owner_id:=ar_private.tracker_authorize(p_actor,p_region);
 if p_kind is null or p_kind not in('automatic','reviewed') or not exists(select 1 from ar_private.tracker_rows where region=p_region and row_key=p_key and hotel=p_hotel and account_id=p_account and invoice_id=p_invoice) then raise exception 'tracker_provenance_scope';end if;
 cmd:=(p_input->>'commandId')::uuid;if cmd is null then raise exception 'tracker_provenance_command';end if;
 result:=public.ar_invoice_register_save(p_actor,p_hotel,p_account,p_invoice,p_input);
 if result?'error' then return result;end if;
 select count(*),min(h.id) into history_count,history_id from ar_private.invoice_register_history h where h.command_id=cmd and h.actor=p_actor and h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice;
 if history_count<>1 then raise exception 'tracker_provenance_history';end if;
 select * into prior from ar_private.tracker_register_history_source where command_id=cmd;
 if prior.history_id is not null then
  if (prior.history_id,prior.region,prior.row_key,prior.hotel,prior.account_id,prior.invoice_id,prior.import_kind) is distinct from (history_id,p_region,p_key,p_hotel,p_account,p_invoice,p_kind) then raise exception 'tracker_provenance_command';end if;
 elsif result->>'replayed'='true' then
  -- A pre-existing unmapped/manual command cannot be relabeled by replay.
  raise exception 'tracker_provenance_untracked_replay';
 else
  insert into ar_private.tracker_register_history_source(history_id,command_id,region,row_key,hotel,account_id,invoice_id,import_kind) values(history_id,cmd,p_region,p_key,p_hotel,p_account,p_invoice,p_kind);
 end if;
 return result;
end $$;
revoke all on function ar_private.tracker_register_save(uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated,service_role;

do $$
declare definition text;needle text;replacement text;
begin
 definition:=replace(pg_get_functiondef('public.ar_invoice_register_save(uuid,text,text,text,jsonb)'::regprocedure),chr(13),'');
 needle:='insert into ar_private.invoice_register_history(actor,hotel,account_id,invoice_id,before_value,after_value) values(p_actor,p_hotel,p_account,p_invoice,ar_private.invoice_register_values(before_row),ar_private.invoice_register_values(r));';
 replacement:='insert into ar_private.invoice_register_history(actor,hotel,account_id,invoice_id,before_value,after_value,command_id) values(p_actor,p_hotel,p_account,p_invoice,ar_private.invoice_register_values(before_row),ar_private.invoice_register_values(r),cmd);';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_register_command_definition_drift';end if;
 execute replace(definition,needle,replacement);

 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),chr(13),'');
 needle:='  perform ar_private.tracker_ledger_resolve(p_region,r->>''rowKey'',array[''identity''],''invoice_source_unverified'');';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_identity_early_resolution_drift';end if;
 definition:=replace(definition,needle,'');
 -- This point is after unique eligible matching, immutable binding validation
 -- and the preview/workflow revision fence. Earlier continue branches stay held.
 needle:='  floor_day:=ar_private.tracker_billing_floor(w.hotel,a,i);';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_identity_recovery_definition_drift';end if;
 definition:=replace(definition,needle,'  perform ar_private.tracker_ledger_recover_identity(p_region,r->>''rowKey'');'||chr(10)||needle);
 needle:='res:=public.ar_invoice_register_save(p_actor,w.hotel,a,i,jsonb_build_object(';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_automatic_provenance_definition_drift';end if;
 definition:=replace(definition,needle,'res:=ar_private.tracker_register_save(p_actor,p_region,r->>''rowKey'',''automatic'',w.hotel,a,i,jsonb_build_object(');
 execute definition;

 definition:=replace(pg_get_functiondef('public.ar_tracker_resolve(uuid,text,uuid,integer,text)'::regprocedure),chr(13),'');
 needle:='result:=public.ar_invoice_register_save(p_actor,r.hotel,r.account_id,r.invoice_id,jsonb_build_object(';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_reviewed_provenance_definition_drift';end if;
 execute replace(definition,needle,'result:=ar_private.tracker_register_save(p_actor,p_region,r.row_key,''reviewed'',r.hotel,r.account_id,r.invoice_id,jsonb_build_object(');

 definition:=replace(pg_get_functiondef('public.ar_invoice_register_history(uuid,text,text,text,integer)'::regprocedure),chr(13),'');
 needle:=$needle$select h.id,h.recorded_at,h.before_value,h.after_value,ar_private.staff_label(h.actor) as actor,'register'::text as source,null::text as "sourceTrackingStatusBefore",null::text as "sourceTrackingStatusAfter"
 from ar_private.invoice_register_history h where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice$needle$;
 replacement:=$replacement$select h.id,h.recorded_at,h.before_value,h.after_value,
 case when provenance.history_id is not null then 'Sheet record · editor unavailable; imported by '||ar_private.staff_label(h.actor) when h.command_id is null then 'Source not recorded · recorded by '||ar_private.staff_label(h.actor) else ar_private.staff_label(h.actor) end as actor,
 case when provenance.history_id is not null then 'sheet_import' when h.command_id is null then 'legacy_unclassified' else 'register' end::text as source,null::text as "sourceTrackingStatusBefore",null::text as "sourceTrackingStatusAfter"
 from ar_private.invoice_register_history h left join ar_private.tracker_register_history_source provenance on provenance.history_id=h.id and provenance.command_id=h.command_id and provenance.hotel=h.hotel and provenance.account_id=h.account_id and provenance.invoice_id=h.invoice_id
 where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice$replacement$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_history_reader_definition_drift';end if;
 execute replace(definition,needle,replacement);
end $$;
