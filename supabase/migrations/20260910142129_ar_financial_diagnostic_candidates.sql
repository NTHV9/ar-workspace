-- Backend-only read sampling. No business/source rows or diagnostic payloads are written.
create function public.ar_financial_diagnostic_candidates(p_hotel text,p_limit integer default 2) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_hotel is null or p_hotel not in('KAT','TSK') or p_limit is null or p_limit not between 1 and 2 then
  return jsonb_build_object('error','financial_diagnostic_invalid');
 end if;
 with eligible as materialized (
  select i.hotel,i.account_id,i.id,i.invoice_no,i.open,i.applied_amount,i.transaction_date
  from public.ar_invoices i where i.hotel=p_hotel and i.verification_state in('verified','cleared')
   and i.collection_role in('standalone','parent') and i.open>=0 and (i.verification_state<>'cleared' or i.open=0)
 ), ranked as (
  select a.id,count(i.id) filter(where i.applied_amount<>0) as applied_count,
   coalesce(bool_or(i.open>0),false) and coalesce(bool_or(i.open=0),false) as mixed,
   max(i.transaction_date) as latest
  from public.ar_accounts a left join eligible i on i.hotel=a.hotel and i.account_id=a.id
  where a.hotel=p_hotel and a.currency='THB' and a.verification_state in('verified','cleared')
  group by a.id order by (count(i.id) filter(where i.applied_amount<>0)>0) desc,
   (coalesce(bool_or(i.open>0),false) and coalesce(bool_or(i.open=0),false)) desc,
   count(i.id) filter(where i.applied_amount<>0) desc,max(i.transaction_date) desc nulls last,a.id limit p_limit
 ), selected as (
  select r.*,sample.id as invoice_id,sample.invoice_no
  from ranked r left join lateral (
   select i.id,i.invoice_no from eligible i where i.account_id=r.id and i.applied_amount<>0
   order by i.transaction_date desc,i.id limit 1
  ) sample on true
 )
 select jsonb_build_object('hotel',p_hotel,'accounts',coalesce(jsonb_agg(jsonb_build_object('accountId',s.id,'invoiceTransactionId',s.invoice_id,'invoiceNo',s.invoice_no)
  order by (s.applied_count>0) desc,s.mixed desc,s.applied_count desc,s.latest desc nulls last,s.id),'[]'::jsonb)) into result from selected s;
 return result;
end $$;
revoke all on function public.ar_financial_diagnostic_candidates(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_financial_diagnostic_candidates(text,integer) to service_role;
