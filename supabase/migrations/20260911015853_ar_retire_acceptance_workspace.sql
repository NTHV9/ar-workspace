-- Owner-requested removal of the disposable one-Account/three-Invoice scenario.
-- Its actual provider files/containers must already be verified absent.
do $$
declare s ar_private.acceptance_sessions;settled jsonb;test_accounts bigint;
begin
 if exists(select 1 from ar_private.acceptance_sessions where state in('prepared','active')) then raise exception 'acceptance_still_active';end if;
 if exists(select 1 from storage.buckets where id='ar-acceptance-files') or exists(select 1 from storage.objects where bucket_id='ar-acceptance-files') then raise exception 'acceptance_provider_files_remaining';end if;
 select * into s from ar_private.acceptance_sessions where summary->>'phase'='providers_removed';
 if found then
  if (select count(*) from ar_private.acceptance_sessions where summary->>'phase'='providers_removed')<>1 or s.summary->>'folderDeleteAcknowledged'<>'true' or s.summary->>'bucketDeleteAcknowledged'<>'true' or s.recipient_hash is not null or s.fixture<>'{}' then raise exception 'acceptance_cleanup_unconfirmed';end if;
  if (select count(*) from ar_acceptance_20260911.ar_accounts)<>1 or exists(select 1 from ar_acceptance_20260911.ar_accounts where hotel<>'KAT' or id<>'SYN-'||s.id::text) or (select count(*) from ar_acceptance_20260911.ar_invoices)<>3 or exists(select 1 from ar_acceptance_20260911.ar_invoices where account_id<>'SYN-'||s.id::text or open<>0) then raise exception 'acceptance_scope_changed';end if;
  if exists(select 1 from ar_acceptance_private_20260911.retention_items where state<>'deleted') or (select count(*) from ar_acceptance_private_20260911.retention_items)<>(s.summary->>'retainedFilesDeleted')::bigint then raise exception 'acceptance_retention_unconfirmed';end if;
 elsif exists(select 1 from ar_private.acceptance_sessions where completed_at is null) then raise exception 'acceptance_closeout_missing';
 else
  -- Fresh migration replay: the disposable namespaces contain definitions only.
  if to_regclass('ar_acceptance_20260911.ar_accounts') is not null then select count(*) into test_accounts from ar_acceptance_20260911.ar_accounts;if test_accounts<>0 then raise exception 'unregistered_acceptance_data';end if;end if;
 end if;
 drop schema if exists ar_acceptance_20260911 cascade;
 drop schema if exists ar_acceptance_private_20260911 cascade;
 if s.id is not null then
  -- Exact bytes are gone. Managed-read egress remains charged; local measurement
  -- below captures the remaining audit/catalog bytes rather than guessing them.
  settled:=public.ar_operations_budget_finish(s.owner,s.budget_id,jsonb_build_object('storedBytes',0,'egressBytes',(s.summary->>'managedEgressUpperBound')::bigint,'databaseBytes',0));
  if settled->>'state'<>'finished' or settled?'error' then raise exception 'acceptance_budget_unconfirmed';end if;
  update ar_private.acceptance_sessions set completed_at=clock_timestamp(),clock_offset_days=0,summary=summary||jsonb_build_object('phase','complete','namespacesRemoved',true,'budgetSettled',true) where id=s.id;
  perform public.ar_operations_budget_refresh_local(s.owner);
 end if;
end$$;
