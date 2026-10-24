-- Partial live candidates cannot disappear from the ambiguity pool merely
-- because their balance is verified. The selected target still needs evidence.
create or replace function ar_private.tracker_policy_match(p_row jsonb) returns table(account_id text,invoice_id text)
language sql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
 with candidates as materialized(
  select i.account_id,i.id,i.open,i.verification_state,i.folio_no,coalesce(a.account_no,a.id) as account_no
  from public.ar_invoices i join public.ar_accounts a on (a.hotel,a.id)=(i.hotel,i.account_id)
  where i.hotel=p_row->>'hotel' and i.invoice_no=p_row->>'invoiceNo'
  and (nullif(p_row->>'folio','') is null or i.folio_no=p_row->>'folio' or i.folio_no is null and (i.open<>0 or i.verification_state not in('verified','cleared')))
  and (nullif(p_row->>'transactionDate','') is null or i.transaction_date=(p_row->>'transactionDate')::date)
  and (coalesce(a.account_no,a.id)=p_row->>'accountNo' or nullif(p_row->>'folio','') is not null and nullif(p_row->>'transactionDate','') is not null)
 ), live as materialized(select * from candidates where open<>0 or verification_state not in('verified','cleared')),
 chosen as materialized(
  select * from live union all select * from candidates where not exists(select 1 from live)
  and (account_no=p_row->>'accountNo' or nullif(p_row->>'accountNo','') is null and nullif(p_row->>'folio','') is not null and nullif(p_row->>'transactionDate','') is not null)
 ) select c.account_id,c.id from chosen c where (select count(*) from chosen)=1
 and ar_private.tracker_source_eligible(p_row->>'hotel',c.account_id,c.id)
 and (nullif(p_row->>'folio','') is null or c.folio_no=p_row->>'folio');
$$;
revoke all on function ar_private.tracker_policy_match(jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
