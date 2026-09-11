-- Seal disposable acceptance data only after actual file retention has completed.
-- Keep minimal provider receipts for recovery; never retain addresses or bodies.
create function public.ar_acceptance_close_begin(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;receipts jsonb;usage_bytes bigint;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','acceptance_inactive');end if;
 if s.state='complete' and s.summary->>'phase' in('closing','providers_removed','complete') then
  return jsonb_build_object('id',s.id,'owner',s.owner,'folder',s.drive_folder_id,'parent',s.parent_folder_id,'summary',s.summary);
 end if;
 if s.state<>'active' or not s.bucket_verified or s.drive_folder_id is null or s.parent_folder_id is null then return jsonb_build_object('error','acceptance_not_prepared');end if;
 if (select count(*) from ar_acceptance_20260911.ar_accounts)<>1 or
    exists(select 1 from ar_acceptance_20260911.ar_accounts where hotel<>'KAT' or id<>s.fixture->>'accountId') or
    (select count(*) from ar_acceptance_20260911.ar_invoices)<>3 or
    exists(select 1 from ar_acceptance_20260911.ar_invoices where account_id<>s.fixture->>'accountId' or open<>0 or verification_state<>'cleared' or collection_role not in('standalone','parent')) then return jsonb_build_object('error','acceptance_source_incomplete');end if;
 if exists(select 1 from ar_acceptance_private_20260911.retention_items where state<>'deleted') or
    not exists(select 1 from ar_acceptance_private_20260911.retention_items where store='drive' and state='deleted') or
    exists(select 1 from storage.objects where bucket_id='ar-acceptance-files') then return jsonb_build_object('error','acceptance_files_remaining');end if;
 if exists(select 1 from ar_acceptance_20260911.ar_document_jobs where state<>'ready' or not acknowledged) or
    exists(select 1 from ar_acceptance_private_20260911.mail_deliveries where state<>'sent') or
    exists(select 1 from ar_acceptance_private_20260911.refresh_runs where status in('queued','running')) or
    exists(select 1 from ar_acceptance_private_20260911.financial_runs where status in('queued','running')) or
    exists(select 1 from ar_acceptance_private_20260911.drive_archive_files where state not in('verified','trashed')) or
    exists(select 1 from ar_acceptance_private_20260911.operations_budget_reservations where state in('reserved','started')) then return jsonb_build_object('error','acceptance_work_remaining');end if;
 select coalesce(jsonb_agg(jsonb_build_object('deliveryId',id,'gmailId',gmail_id,'sentAt',sent_at) order by sent_at),'[]') into receipts from ar_acceptance_private_20260911.mail_deliveries where owner=p_actor and state='sent';
 select coalesce(sum((actual->>'egressBytes')::bigint),0) into usage_bytes from ar_acceptance_private_20260911.operations_budget_reservations where state='finished';
 update ar_private.acceptance_sessions set state='complete',recipient_hash=null,fixture='{}',summary=jsonb_build_object(
  'phase','closing','sealedAt',clock_timestamp(),'receipts',receipts,'managedEgressUpperBound',usage_bytes,
  'retainedFilesDeleted',(select count(*) from ar_acceptance_private_20260911.retention_items),
  'folderDeleteAcknowledged',false,'bucketDeleteAcknowledged',false) where id=p_id returning * into s;
 return jsonb_build_object('id',s.id,'owner',s.owner,'folder',s.drive_folder_id,'parent',s.parent_folder_id,'summary',s.summary);
end$$;
create function public.ar_acceptance_close_record(p_actor uuid,p_id uuid,p_step text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='complete' for update;
 if not found or s.summary->>'phase' not in('closing','providers_removed') then return jsonb_build_object('error','acceptance_inactive');end if;
 if p_step='folder' then s.summary:=s.summary||'{"folderDeleteAcknowledged":true}';
 elsif p_step='bucket' then
  if exists(select 1 from storage.buckets where id='ar-acceptance-files') then return jsonb_build_object('error','acceptance_bucket_present');end if;
  s.summary:=s.summary||'{"bucketDeleteAcknowledged":true}';
 elsif p_step='verified' then
  if s.summary->>'folderDeleteAcknowledged'<>'true' or s.summary->>'bucketDeleteAcknowledged'<>'true' then return jsonb_build_object('error','acceptance_cleanup_unconfirmed');end if;
  s.summary:=s.summary||jsonb_build_object('phase','providers_removed','providerCleanupAt',clock_timestamp());
 else return jsonb_build_object('error','acceptance_invalid');end if;
 update ar_private.acceptance_sessions set summary=s.summary where id=p_id;
 return s.summary;
end$$;
revoke all on function public.ar_acceptance_close_begin(uuid,uuid),public.ar_acceptance_close_record(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_acceptance_close_begin(uuid,uuid),public.ar_acceptance_close_record(uuid,uuid,text) to service_role;

alter function public.ar_recovery_sent_match(uuid,jsonb) rename to ar_recovery_sent_match_v2;
revoke all on function public.ar_recovery_sent_match_v2(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.ar_recovery_sent_match(p_actor uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;input_row jsonb;receipt jsonb;matches integer;
begin
 result:=public.ar_recovery_sent_match_v2(p_actor,p_rows);if jsonb_typeof(result)<>'array' then return result;end if;
 for input_row in select value from jsonb_array_elements(p_rows) loop
  select count(*) into matches from ar_private.acceptance_sessions s cross join lateral jsonb_array_elements(coalesce(s.summary->'receipts','[]')) r
   where s.owner=p_actor and s.state='complete' and r->>'gmailId'=input_row->>'gmailId' and
   (input_row->>'deliveryId' is null or r->>'deliveryId'=input_row->>'deliveryId');
  if matches<>1 then continue;end if;
  -- Never obscure a real business receipt that needs reconciliation.
  if exists(select 1 from jsonb_array_elements(result) r where r->>'gmailId'=input_row->>'gmailId' and r->>'state'<>'missing_receipt') then continue;end if;
  select r into receipt from ar_private.acceptance_sessions s cross join lateral jsonb_array_elements(coalesce(s.summary->'receipts','[]')) r
   where s.owner=p_actor and s.state='complete' and r->>'gmailId'=input_row->>'gmailId' and
   (input_row->>'deliveryId' is null or r->>'deliveryId'=input_row->>'deliveryId');
  result:=(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(result) r where r->>'gmailId'<>input_row->>'gmailId');
  result:=result||jsonb_build_array(jsonb_build_object('deliveryId',receipt->>'deliveryId','gmailId',receipt->>'gmailId','sentAt',input_row->>'sentAt','state','isolated_test','matchedBy','sealed_test_receipt'));
 end loop;return result;
end$$;
revoke all on function public.ar_recovery_sent_match(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_recovery_sent_match(uuid,jsonb) to service_role;
