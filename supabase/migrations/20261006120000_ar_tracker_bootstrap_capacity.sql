-- Keep bootstrap atomic while avoiding growing-ledger scans and repeated no-op
-- writes. The already-applied tracker migrations remain unchanged.
create index tracker_conflicts_review_lookup on ar_private.tracker_conflicts(region,row_key,field,status,reason);
create index tracker_stage_facts_lookup on ar_private.tracker_accepted_facts(hotel,account_id,invoice_id,actual_date desc)
 where field in('U','V','W') and actual_date is not null;

-- The fresh-plan boundary covers only growing keyed integration ledgers. Source,
-- Register and authorization queries retain their existing caller planning mode.
create function ar_private.tracker_ledger_row(p_region text,p_key text) returns ar_private.tracker_rows
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
declare locked_row ar_private.tracker_rows;begin
 select r.* into locked_row from ar_private.tracker_rows r where r.region=p_region and r.row_key=p_key for update;
 return locked_row;
end $$;
create function ar_private.tracker_ledger_reference_ack(p_region text,p_key text,p_field text,p_sheet jsonb,p_web jsonb) returns boolean
language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 return exists(select 1 from ar_private.tracker_conflicts c where c.region=p_region and c.row_key=p_key and c.field=p_field and c.reason='reference_difference' and c.status='resolved' and c.sheet_value is not distinct from p_sheet and c.web_value is not distinct from p_web);
end $$;
create function ar_private.tracker_ledger_fence_pending(p_region text,p_key text) returns boolean
language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 return exists(select 1 from ar_private.tracker_conflicts c where c.region=p_region and c.row_key=p_key and c.field='identity' and c.reason='web_changed_since_preview' and c.status='pending');
end $$;
create function ar_private.tracker_ledger_resolve(p_region text,p_key text,p_fields text[],p_reason text default null) returns void
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=p_key and field=any(p_fields) and status='pending' and (p_reason is null or reason=p_reason);
end $$;
create function ar_private.tracker_ledger_flush(p_region text,p_key text,p_baseline jsonb,p_web jsonb) returns void
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 update ar_private.tracker_rows set baseline=baseline||p_baseline,web_values=p_web where region=p_region and row_key=p_key;
end $$;
create function ar_private.tracker_ledger_requeue(p_hotel text,p_account text,p_invoice text,p_fields text[]) returns void
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice and field=any(p_fields) and state='conflict';
end $$;
revoke all on function ar_private.tracker_ledger_row(text,text),ar_private.tracker_ledger_reference_ack(text,text,text,jsonb,jsonb),ar_private.tracker_ledger_fence_pending(text,text),ar_private.tracker_ledger_resolve(text,text,text[],text),ar_private.tracker_ledger_flush(text,text,jsonb,jsonb),ar_private.tracker_ledger_requeue(text,text,text,text[]) from public,anon,authenticated,service_role;
create function ar_private.tracker_ledger_conflict(p_region text,p_key text,p_field text,p_reason text,p_sheet jsonb,p_web jsonb,p_base jsonb,p_mode text) returns void
language plpgsql volatile security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
begin
 if p_mode='v0' then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value) values(p_region,p_key,'identity',p_reason,p_sheet) on conflict(region,row_key,field) where status='pending' do nothing;
 elsif p_mode='v1' then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason) values(p_region,p_key,'identity','web_changed_since_preview') on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,revision=ar_private.tracker_conflicts.revision+1;
 elsif p_mode='v2' then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,p_key,p_field,'invalid_source_field',p_sheet,p_web,p_base) on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,sheet_value=excluded.sheet_value,revision=ar_private.tracker_conflicts.revision+1;
 elsif p_mode='v3' then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,p_key,p_field,'invalid_source_field',p_sheet,p_web,p_base) on conflict(region,row_key,field) where status='pending' do nothing;
 elsif p_mode='v4' then
  insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,p_key,p_field,case when p_field in('S','T','AA') then 'reference_difference' when p_field='Y' and p_sheet#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then 'unmapped_tracking_status' else 'concurrent_or_unmapped_edit' end,p_sheet,p_web,p_base)
    on conflict(region,row_key,field) where status='pending' do update set sheet_value=excluded.sheet_value,web_value=excluded.web_value,baseline=excluded.baseline,revision=ar_private.tracker_conflicts.revision+1;
 else raise exception 'tracker_invalid';end if;
end $$;
revoke all on function ar_private.tracker_ledger_conflict(text,text,text,text,jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;

do $$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),E'\r','');
 needle:='merged jsonb;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_accumulator_declaration_drift';end if;
 definition:=replace(definition,needle,'merged jsonb;baseline_updates jsonb;resolved_fields text[];requeue_fields text[];');
 needle:='merged:=vals;needs_review:=false;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_accumulator_reset_drift';end if;
 definition:=replace(definition,needle,'merged:=vals;needs_review:=false;baseline_updates:=''{}''::jsonb;resolved_fields:=''{}'';requeue_fields:=''{}'';');

 -- All three-way decisions continue to read old.baseline, never the accumulator.
 -- Held/changed-identity/fence rows retain their existing early-continue behavior.
 needle:=$needle$update ar_private.tracker_rows set baseline=baseline||jsonb_build_object('Y',sv) where region=p_region and row_key=r->>'rowKey';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_reported_baseline_drift';end if;
 definition:=replace(definition,needle,'baseline_updates:=baseline_updates||jsonb_build_object(''Y'',sv);');
 needle:=$needle$update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(f,sv) where region=p_region and row_key=r->>'rowKey';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_equal_baseline_drift';end if;
 definition:=replace(definition,needle,'baseline_updates:=baseline_updates||jsonb_build_object(f,sv);');
 needle:=$needle$update ar_private.tracker_rows set baseline=baseline||jsonb_build_object(f,merged->f) where region=p_region and row_key=r->>'rowKey';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_history_baseline_drift';end if;
 definition:=replace(definition,needle,'baseline_updates:=baseline_updates||jsonb_build_object(f,merged->f);');

 -- These statements have no row triggers; resolving the same field set once at
 -- the row boundary preserves timestamps, immutable histories and requeue rules.
 needle:=$needle$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=f and status='pending';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'tracker_snapshot_resolution_set_drift';end if;
 definition:=replace(definition,needle,'resolved_fields:=array_append(resolved_fields,f);');
 needle:=$needle$update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=w.hotel and account_id=a and invoice_id=i and field=f and state='conflict';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_requeue_set_drift';end if;
 definition:=replace(definition,needle,'requeue_fields:=array_append(requeue_fields,f);');
 needle:=$needle$update ar_private.tracker_rows set web_values=merged||jsonb_build_object('_workflowRevision',w.revision) where region=p_region and row_key=r->>'rowKey';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_snapshot_ledger_flush_drift';end if;
 definition:=replace(definition,needle,$replacement$if cardinality(resolved_fields)>0 then
   update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=any(resolved_fields) and status='pending';
  end if;
  if cardinality(requeue_fields)>0 then
   update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=w.hotel and account_id=a and invoice_id=i and field=any(requeue_fields) and state='conflict';
  end if;
  update ar_private.tracker_rows set baseline=baseline||baseline_updates,web_values=merged||jsonb_build_object('_workflowRevision',w.revision) where region=p_region and row_key=r->>'rowKey';$replacement$);
 -- Preserve the locked original row for every three-way comparison.
 needle:=$needle$select * into old from ar_private.tracker_rows where region=p_region and row_key=r->>'rowKey' for update;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_row_lock_drift';end if;
 definition:=replace(definition,needle,'old:=ar_private.tracker_ledger_row(p_region,r->>''rowKey'');');
 needle:=$needle$exists(select 1 from ar_private.tracker_conflicts acknowledged where acknowledged.region=p_region and acknowledged.row_key=r->>'rowKey' and acknowledged.field=f and acknowledged.reason='reference_difference' and acknowledged.status='resolved' and acknowledged.sheet_value is not distinct from sv and acknowledged.web_value is not distinct from wv)$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_reference_ack_drift';end if;
 definition:=replace(definition,needle,'ar_private.tracker_ledger_reference_ack(p_region,r->>''rowKey'',f,sv,wv)');
 needle:=$needle$exists(select 1 from ar_private.tracker_conflicts where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='web_changed_since_preview' and status='pending')$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_fence_lookup_drift';end if;
 definition:=replace(definition,needle,'ar_private.tracker_ledger_fence_pending(p_region,r->>''rowKey'')');
 needle:=$needle$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='web_changed_since_preview' and status='pending';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_fence_resolution_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_resolve(p_region,r->>''rowKey'',array[''identity''],''web_changed_since_preview'');');
 needle:=$needle$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='identity' and reason='invoice_source_unverified' and status='pending';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_eligibility_resolution_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_resolve(p_region,r->>''rowKey'',array[''identity''],''invoice_source_unverified'');');
 needle:=$needle$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field='Y' and reason='unmapped_tracking_status' and status='pending';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_reported_resolution_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_resolve(p_region,r->>''rowKey'',array[''Y''],''unmapped_tracking_status'');');
 needle:=$needle$update ar_private.tracker_conflicts set status='resolved',resolved_at=now() where region=p_region and row_key=r->>'rowKey' and field=any(resolved_fields) and status='pending';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_resolution_flush_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_resolve(p_region,r->>''rowKey'',resolved_fields);');
 needle:=$needle$update ar_private.tracker_outbox set state='pending',updated_at=now() where hotel=w.hotel and account_id=a and invoice_id=i and field=any(requeue_fields) and state='conflict';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_requeue_flush_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_requeue(w.hotel,a,i,requeue_fields);');
 needle:=$needle$update ar_private.tracker_rows set baseline=baseline||baseline_updates,web_values=merged||jsonb_build_object('_workflowRevision',w.revision) where region=p_region and row_key=r->>'rowKey';$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_ledger_row_flush_drift';end if;
 definition:=replace(definition,needle,'perform ar_private.tracker_ledger_flush(p_region,r->>''rowKey'',baseline_updates,merged||jsonb_build_object(''_workflowRevision'',w.revision));');
 needle:=$needle$insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value) values(p_region,r->>'rowKey','identity',coalesce(r->>'holdReason','ambiguous_or_missing_identity'),r-array['fields','locator']) on conflict(region,row_key,field) where status='pending' do nothing;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_conflict_variant_0_drift';end if;
 definition:=replace(definition,needle,$replacement$perform ar_private.tracker_ledger_conflict(p_region,r->>'rowKey','identity',coalesce(r->>'holdReason','ambiguous_or_missing_identity'),r-array['fields','locator'],null,null,'v0');$replacement$);
 needle:=$needle$insert into ar_private.tracker_conflicts(region,row_key,field,reason) values(p_region,r->>'rowKey','identity','web_changed_since_preview') on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,revision=ar_private.tracker_conflicts.revision+1;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_conflict_variant_1_drift';end if;
 definition:=replace(definition,needle,$replacement$perform ar_private.tracker_ledger_conflict(p_region,r->>'rowKey','identity',coalesce(r->>'holdReason','ambiguous_or_missing_identity'),null,null,null,'v1');$replacement$);
 needle:=$needle$insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,'invalid_source_field',sv,wv,base) on conflict(region,row_key,field) where status='pending' do update set reason=excluded.reason,sheet_value=excluded.sheet_value,revision=ar_private.tracker_conflicts.revision+1;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_conflict_variant_2_drift';end if;
 definition:=replace(definition,needle,$replacement$perform ar_private.tracker_ledger_conflict(p_region,r->>'rowKey',f,coalesce(r->>'holdReason','ambiguous_or_missing_identity'),sv,wv,base,'v2');$replacement$);
 needle:=$needle$insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,'invalid_source_field',sv,wv,base) on conflict(region,row_key,field) where status='pending' do nothing;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'tracker_conflict_variant_3_drift';end if;
 definition:=replace(definition,needle,$replacement$perform ar_private.tracker_ledger_conflict(p_region,r->>'rowKey',f,coalesce(r->>'holdReason','ambiguous_or_missing_identity'),sv,wv,base,'v3');$replacement$);
 needle:=$needle$insert into ar_private.tracker_conflicts(region,row_key,field,reason,sheet_value,web_value,baseline) values(p_region,r->>'rowKey',f,case when f in('S','T','AA') then 'reference_difference' when f='Y' and sv#>>'{}' not in('Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other') then 'unmapped_tracking_status' else 'concurrent_or_unmapped_edit' end,sv,wv,base)
    on conflict(region,row_key,field) where status='pending' do update set sheet_value=excluded.sheet_value,web_value=excluded.web_value,baseline=excluded.baseline,revision=ar_private.tracker_conflicts.revision+1;$needle$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_conflict_variant_4_drift';end if;
 definition:=replace(definition,needle,$replacement$perform ar_private.tracker_ledger_conflict(p_region,r->>'rowKey',f,coalesce(r->>'holdReason','ambiguous_or_missing_identity'),sv,wv,base,'v4');$replacement$);
 execute definition;

 definition:=replace(pg_get_functiondef('ar_private.tracker_capture_current()'::regprocedure),E'\r','');
 needle:='-- Only today''s mutable observation changes; prior published snapshots stay intact.';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_stage_capture_guard_drift';end if;
 definition:=replace(definition,needle,$replacement$-- Only accepted U/V/W facts affect this stage-only projection.
 if new.field not in('U','V','W') and (tg_op<>'UPDATE' or old.field not in('U','V','W')) then return new;end if;
 -- Only today's mutable observation changes; prior published snapshots stay intact.$replacement$);
 needle:='and c.hotel=snap.hotel and c.account_id=snap.account_id and c.invoice_id=snap.invoice_id;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_stage_capture_projection_drift';end if;
 definition:=replace(definition,needle,$replacement$and c.hotel=snap.hotel and c.account_id=snap.account_id and c.invoice_id=snap.invoice_id
 and c.hotel=new.hotel and c.account_id=new.account_id and c.invoice_id=new.invoice_id
 and (snap.latest_stage,snap.latest_stage_label,snap.latest_sent_at) is distinct from (c.latest_stage,c.latest_stage_label,c.latest_sent_at);$replacement$);
 execute definition;
end $$;

-- No request/global planner settings change. The snapshot orchestrator keeps
-- its original planning mode; fresh plans are confined to keyed ledger helpers.
alter function public.ar_tracker_snapshot(uuid,text,uuid,jsonb) reset plan_cache_mode;

-- Keep the history foreign-key probes parameter-aware while facts grow within
-- this transaction. All trigger predicates, writes and constraints are intact.
alter function ar_private.tracker_accept_fact() set plan_cache_mode='force_custom_plan';
