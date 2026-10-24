-- Current warning work is distinct from retained warning history. No provider,
-- financial amount, current date, actual Sent or recipient mutation occurs here.
alter table ar_private.tracker_conflicts drop constraint tracker_conflicts_status_check;
alter table ar_private.tracker_conflicts add constraint tracker_conflicts_status_check check(status in('pending','resolved','archived'));
alter table ar_private.tracker_conflicts add column retirement_reason text check(retirement_reason in('sheet_row_removed','verified_zero'));
alter table ar_private.tracker_rows add column warning_observed_identity jsonb;
update ar_private.tracker_rows r set warning_observed_identity=r.identity
 where r.policy_identity_verified and not exists(select 1 from ar_private.tracker_conflicts c where (c.region,c.row_key)=(r.region,r.row_key) and c.field='identity' and c.status='pending');

-- An unresolved row retains its old ledger mapping; independently retain the
-- latest provider identity, even when matching fails. A warning hint is historical.
do $patch$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('public.ar_tracker_snapshot(uuid,text,uuid,jsonb)'::regprocedure),chr(13),'');
 needle:='set policy_identity_verified=(match_count=1),';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_warning_observation_drift';end if;
 execute replace(definition,needle,$new$set warning_observed_identity=jsonb_build_object('hotel',r->>'hotel','accountNo',r->>'accountNo','invoiceNo',r->>'invoiceNo','folio',r->>'folio','transactionDate',r->>'transactionDate'),policy_identity_verified=(match_count=1),$new$);
end $patch$;

-- Internal ledger IDs and durable zero evidence establish closure. Optional
-- Folio cannot contradict when absent, but cannot hide compatible live debt.
create function ar_private.tracker_warning_closed(p_region text,p_key text) returns boolean
language sql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
 select exists(
  select 1 from ar_private.tracker_rows r
  join public.ar_invoices i on(i.hotel,i.account_id,i.id)=(r.hotel,r.account_id,r.invoice_id)
  join public.ar_accounts a on(a.hotel,a.id)=(i.hotel,i.account_id)
  join ar_private.invoice_verified_balances b on(b.hotel,b.account_id,b.invoice_id)=(i.hotel,i.account_id,i.id)
  cross join lateral(select coalesce(r.warning_observed_identity,r.identity) as actual) observed
  where (r.region,r.row_key)=(p_region,p_key)
  and i.verification_state in('verified','cleared') and i.open=0
  and b.last_open=0 and b.zero_since is not null and b.verified_at<=now()
  and (observed.actual->>'hotel',observed.actual->>'invoiceNo',observed.actual->>'transactionDate')=(i.hotel,i.invoice_no,i.transaction_date::text)
  and (nullif(observed.actual->>'folio','') is null or i.folio_no is null or observed.actual->>'folio'=i.folio_no)
  and (nullif(observed.actual->>'accountNo','') is null or observed.actual->>'accountNo'=coalesce(a.account_no,a.id)
   or r.policy_identity_verified and nullif(observed.actual->>'folio','') is not null and observed.actual->>'folio'=i.folio_no)
  and (r.warning_observed_identity is not null or not exists(select 1 from ar_private.tracker_conflicts bad where (bad.region,bad.row_key)=(r.region,r.row_key) and bad.field='identity' and bad.status='pending'))
  and not exists(select 1 from public.ar_invoices x
   where x.hotel=i.hotel and x.invoice_no=i.invoice_no and x.transaction_date=i.transaction_date
   and (nullif(observed.actual->>'folio','') is null or i.folio_no is null or x.folio_no is null or x.folio_no=i.folio_no)
   and (x.open<>0 or x.verification_state not in('verified','cleared')))
 );
$$;
revoke all on function ar_private.tracker_warning_closed(text,text) from public,anon,authenticated,service_role;

-- Both count and page queries consume this exact current projection. A newly
-- confirmed zero disappears immediately, without waiting for another Sheet edit.
create view ar_private.tracker_current_conflicts as
 select c.* from ar_private.tracker_conflicts c join ar_private.tracker_rows r on(r.region,r.row_key)=(c.region,c.row_key)
 where c.status='pending' and r.present and not ar_private.tracker_warning_closed(c.region,c.row_key);
revoke all on ar_private.tracker_current_conflicts from public,anon,authenticated,service_role;

create function ar_private.tracker_archive_inactive_warnings(p_region text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update ar_private.tracker_conflicts c
 set status='archived',retirement_reason=case when not r.present then 'sheet_row_removed' else 'verified_zero' end,resolved_at=now(),revision=c.revision+1
 from ar_private.tracker_rows r where (r.region,r.row_key)=(c.region,c.row_key) and c.region=p_region and c.status='pending'
 and (not r.present or ar_private.tracker_warning_closed(c.region,c.row_key));
 get diagnostics n=row_count;return n;
end $$;
revoke all on function ar_private.tracker_archive_inactive_warnings(text) from public,anon,authenticated,service_role;

-- Preserve the established completed-membership hook and its authorization/lease.
create or replace function ar_private.tracker_retire_closed_warnings(p_region text) returns integer
language sql security definer set search_path='' as $$
 select ar_private.tracker_archive_inactive_warnings(p_region);
$$;
revoke all on function ar_private.tracker_retire_closed_warnings(text) from public,anon,authenticated,service_role;

do $patch$
declare definition text;signature text;expected integer;
begin
 for signature,expected in select * from(values('public.ar_tracker_status(uuid,text)',2),('public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid)',1)) q(signature,expected) loop
  definition:=replace(pg_get_functiondef(signature::regprocedure),chr(13),'');
  if (length(definition)-length(replace(definition,'ar_private.tracker_conflicts','')))/length('ar_private.tracker_conflicts')<>expected then raise exception 'tracker_current_warning_read_drift: %',signature;end if;
  execute replace(definition,'ar_private.tracker_conflicts','ar_private.tracker_current_conflicts');
 end loop;
end $patch$;

-- Retain exact records and retirement reasons; never delete business history.
select ar_private.tracker_archive_inactive_warnings('phuket');
select ar_private.tracker_archive_inactive_warnings('khao-lak');
notify pgrst,'reload schema';
