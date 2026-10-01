-- Read-only management reporting. Each ledger identity remains Hotel + Account.
create function public.ar_dashboard_management(p_actor uuid,p_from date,p_to date,p_hotel text default null,p_account text default null,p_type text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;entries jsonb;result jsonb;valid boolean;ages_known boolean;cohort_known boolean;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from<date '0001-01-01' or p_to>date '9999-12-31'
  or p_from>p_to or p_to-p_from>3660 or p_to>(current_timestamp at time zone 'Asia/Bangkok')::date then return jsonb_build_object('error','dashboard_invalid');end if;
 -- Reuse the established scope/identity/quality and historical snapshot fences.
 base:=public.ar_dashboard_balances(p_actor,p_to,p_hotel,p_account,p_type,null,null,0,1);
 if base ? 'error' then return base;end if;
 entries:=public.ar_dashboard_invoice_entries(p_actor,p_from,p_to,p_hotel,p_account,p_type,0,1);
 if entries ? 'error' then return entries;end if;
 valid:=coalesce((base->>'complete')::boolean,false) and coalesce((base->'openBalanceBreakdown'->>'creditCoverageComplete')::boolean,false);
 cohort_known:=coalesce((entries->'coverage'->>'complete')::boolean,false);
 with source as materialized(
  select c.* from ar_private.dashboard_current_invoices c where base->>'mode'='current'
   and ar_private.hotel_in_report_scope(c.hotel,p_hotel) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
  union all select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.invoice_no,c.folio_no,c.guest,c.transaction_date,c.open,c.original,c.age,c.billing_required,c.credit_term,c.first_billing_date,c.due_date,c.latest_stage,c.latest_stage_label,c.latest_sent_at,c.verified
   from ar_private.dashboard_daily_invoices c where base->>'mode'='snapshot' and c.day=p_to
   and ar_private.hotel_in_report_scope(c.hotel,p_hotel) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
 ), known as (select valid and not exists(select 1 from source where verified and open<>0 and age is null) as ages),
 bands as (select * from (values(0,'Up to 30',-2147483648,30),(1,'31 – 60',31,60),(2,'61 – 90',61,90),(3,'91 – 120',91,120),(4,'121 – 150',121,150),(5,'151+',151,2147483647))t(key,label,lo,hi)),
 hotel_rows as (
  select h.hotel,count(s.invoice_id) filter(where s.open<>0) as invoices,coalesce(sum(s.open),0) as net,
   count(s.invoice_id) filter(where s.open>0 and s.age>60) as over60,count(s.invoice_id) filter(where s.open>0 and s.age>90) as over90,
   count(s.invoice_id) filter(where s.open>0 and s.age between 61 and 90 and s.billing_required and (s.first_billing_date is null or s.first_billing_date>p_to)) as unbilled61,
   count(s.invoice_id) filter(where s.open<0) as credits,coalesce(sum(s.open) filter(where s.open<0),0) as credit
  from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join source s on s.hotel=h.hotel group by h.hotel
 ), groups as (
  select hotel,account_id,account_no,account_name,account_type,count(*) as invoices,sum(open) as amount,max(age) as oldest,
   count(*) filter(where billing_required and (first_billing_date is null or first_billing_date>p_to)) as unbilled,
   sum(open) filter(where billing_required and (first_billing_date is null or first_billing_date>p_to)) as unbilled_amount
  from source where verified and open>0 and age>60 group by hotel,account_id,account_no,account_name,account_type
 ), cohort as materialized(
  select i.hotel,i.original,i.open,
   case when i.original<0 then 'credit'
    when w.first_billing_date<=p_to then 'billed'
    when coalesce(w.account_setup_required,false) then 'setup'
    when not w.billing_required then 'not_required'
    when w.billing_required is null or w.credit_term is null then 'setup'
    else 'unbilled' end as status
  from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
  left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
  where i.transaction_date between p_from and p_to and ar_private.hotel_in_report_scope(i.hotel,p_hotel)
   and (p_account is null or i.account_id=p_account) and (p_type is null or a.type=p_type)
   and i.collection_role in('standalone','parent') and i.parent_invoice_id is null
   and (i.verification_state='verified' or i.verification_state='cleared' and i.open=0)
   and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0)
   and i.original not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
 ), cohort_status as (select * from (values('issued','New invoices'),('billed','Billed'),('unbilled','Not billed'),('not_required','Billing not required'),('setup','Setup needed'),('credit','Credits'))t(key,label))
 select jsonb_build_object(
  'from',p_from,'to',p_to,'complete',valid,'agesComplete',(select ages from known),'cohortComplete',cohort_known,
  'asOfDate',base->'asOfDate','mode',base->'mode','capturedAt',base->'capturedAt','sourceAt',base->'sourceAt','missingHotels',base->'missingHotels','freshness',base->'freshness','metrics',base->'metrics','openBalanceBreakdown',base->'openBalanceBreakdown',
  'hotels',(select jsonb_agg(jsonb_build_object('hotel',h.hotel,'count',case when valid then invoices end,'amount',case when valid then ar_private.financial_money(net) end,
    'credits',case when valid then credits end,'creditAmount',case when valid then ar_private.financial_money(credit) end,
    'over60',case when (select ages from known) then over60 end,'over90',case when (select ages from known) then over90 end,'unbilled61',case when (select ages from known) then unbilled61 end,
    'bands',(select jsonb_agg(jsonb_build_object('key',b.key,'label',b.label,'count',case when (select ages from known) then (select count(*) from source s where s.hotel=h.hotel and s.verified and s.open<>0 and s.age between b.lo and b.hi) end,
       'amount',case when (select ages from known) then (select ar_private.financial_money(coalesce(sum(open),0)) from source s where s.hotel=h.hotel and s.verified and s.age between b.lo and b.hi) end) order by b.key) from bands b)) order by array_position(ar_private.report_scope_hotels(p_hotel),h.hotel)) from hotel_rows h),
  'types',coalesce((select jsonb_agg(jsonb_build_object('type',g.account_type,'count',case when valid then g.invoices end,'amount',case when valid then ar_private.financial_money(g.amount) end,
    'over60',case when (select ages from known) then g.over60 end) order by g.amount desc,g.account_type) from (select account_type,count(*) filter(where open<>0) as invoices,sum(open) as amount,count(*) filter(where open>0 and age>60) as over60 from source group by account_type)g),'[]'),
  'cohort',(select jsonb_agg(jsonb_build_object('key',k.key,'label',k.label,'count',case when cohort_known then (select count(*) from cohort c where k.key='issued' or c.status=k.key) end,
    'amount',case when cohort_known then (select ar_private.financial_money(coalesce(sum(original),0)) from cohort c where k.key='issued' or c.status=k.key) end,
    'hotels',(select jsonb_agg(jsonb_build_object('hotel',h,'count',case when cohort_known then (select count(*) from cohort c where c.hotel=h and (k.key='issued' or c.status=k.key)) end,
      'amount',case when cohort_known then (select ar_private.financial_money(coalesce(sum(original),0)) from cohort c where c.hotel=h and (k.key='issued' or c.status=k.key)) end) order by array_position(ar_private.report_scope_hotels(p_hotel),h)) from unnest(ar_private.report_scope_hotels(p_hotel))h))) from cohort_status k),
  'accountsOver60',case when (select ages from known) then coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,
     'count',invoices,'amount',ar_private.financial_money(amount),'oldest',oldest,'unbilled',unbilled,'unbilledAmount',ar_private.financial_money(coalesce(unbilled_amount,0))) order by amount desc,hotel,account_id) from groups),'[]') else null end
 ) into result;
 return result;
end$$;
revoke all on function public.ar_dashboard_management(uuid,date,date,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_management(uuid,date,date,text,text,text) to service_role;
