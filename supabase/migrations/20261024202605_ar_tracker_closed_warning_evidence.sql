-- Confirmed closure is durable evidence, not a requirement to re-fetch old PDFs.
-- Still reject missing/unknown source, conflicting live debt and changed identity.
do $patch$
declare definition text;needle text;
begin
 definition:=replace(pg_get_functiondef('ar_private.tracker_policy_match(jsonb)'::regprocedure),chr(13),'');
 needle:=$old$and (nullif(p_row->>'folio','') is null or i.folio_no=p_row->>'folio')$old$;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'tracker_policy_partial_source_drift';end if;
 execute replace(definition,needle,$new$and (nullif(p_row->>'folio','') is null or i.folio_no=p_row->>'folio' or i.folio_no is null and i.verification_state not in('verified','cleared'))$new$);
end $patch$;
create or replace function ar_private.tracker_retire_closed_warnings(p_region text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update ar_private.tracker_conflicts c set status='resolved',resolved_at=now()
 from ar_private.tracker_rows r
 join public.ar_invoices i on (i.hotel,i.account_id,i.id)=(r.hotel,r.account_id,r.invoice_id)
 join ar_private.invoice_verified_balances b on (b.hotel,b.account_id,b.invoice_id)=(i.hotel,i.account_id,i.id)
 where c.region=p_region and (c.region,c.row_key)=(r.region,r.row_key) and c.status='pending'
 and i.verification_state in('verified','cleared') and i.open=0
 and b.last_open=0 and b.zero_since is not null and b.verified_at<=now()
 and (r.identity->>'hotel',r.identity->>'invoiceNo',r.identity->>'folio',r.identity->>'transactionDate')=(i.hotel,i.invoice_no,i.folio_no,i.transaction_date::text)
 and (r.present and r.policy_identity_verified or not r.present and not exists(
  select 1 from ar_private.tracker_conflicts bad where (bad.region,bad.row_key)=(r.region,r.row_key) and bad.field='identity' and bad.status='pending'
  and (bad.sheet_value->>'hotel',bad.sheet_value->>'invoiceNo',bad.sheet_value->>'folio',bad.sheet_value->>'transactionDate') is distinct from (i.hotel,i.invoice_no,i.folio_no,i.transaction_date::text)))
 and not exists(select 1 from public.ar_invoices x where x.hotel=i.hotel and x.invoice_no=i.invoice_no and (x.folio_no=i.folio_no or x.folio_no is null) and x.transaction_date=i.transaction_date
  and (x.open<>0 or x.verification_state not in('verified','cleared')));
 get diagnostics n=row_count;return n;
end $$;
revoke all on function ar_private.tracker_retire_closed_warnings(text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
