-- Account-first protected Dashboard reads and stage-free management summaries.
-- Existing balances RPC remains unchanged; no financial/history writes or indexes.
-- Stage-free money source: same invoice/account/workflow identity and verification rules.
create or replace view ar_private.dashboard_current_balance_invoices with(security_invoker=true) as
 select i.hotel,i.account_id,i.id as invoice_id,a.account_no,a.name as account_name,a.type as account_type,
 i.invoice_no,i.folio_no,i.guest,i.transaction_date,i.open,i.original,i.age,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,
 null::text as latest_stage,null::text as latest_stage_label,null::timestamptz as latest_sent_at,
 coalesce(i.verification_state='verified' and i.collection_role in('standalone','parent') and a.verification_state='verified',false) as verified
 from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 where i.collection_role<>'child' and (i.open<>0 or i.verification_state not in('verified','cleared'));
revoke all on ar_private.dashboard_current_balance_invoices from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION ar_private.dashboard_balance_read(p_actor uuid, p_as_of date, p_hotel text DEFAULT NULL::text, p_account text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_metric text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50, p_age_min integer DEFAULT NULL, p_age_max integer DEFAULT NULL, p_accounts boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare today date:=(now() at time zone 'Asia/Bangkok')::date;mode text;missing jsonb;source_at timestamptz;capture_at timestamptz;complete boolean;result jsonb;reason text;policy jsonb;refreshing jsonb:='[]';failed jsonb:='[]';credit_coverage boolean:=false;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_as_of is null or not isfinite(p_as_of) or p_as_of<date '0001-01-01' or p_as_of>date '9999-12-31'
  or p_hotel is not null and cardinality(ar_private.report_scope_hotels(p_hotel))=0 or p_account is not null and (not ar_private.is_supported_hotel(p_hotel) or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_metric is not null and p_metric not in('open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled')
  or p_stage is not null and p_stage!~'^(Friendly|Follow 1|Follow 2|Follow 3|Final|round_[a-z0-9][a-z0-9_-]{0,63})$'
  or p_age_min is not null and p_age_min<0 or p_age_max is not null and p_age_max<0 or p_age_min is not null and p_age_max is not null and p_age_min>p_age_max or p_accounts is null
  or p_stage is not null and p_metric is not null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','dashboard_invalid');end if;
 mode:=case when p_as_of=today then 'current' when p_as_of<today and exists(select 1 from ar_private.dashboard_daily_captures where day=p_as_of and (ar_private.hotel_in_report_scope(hotel,p_hotel))) then 'snapshot' else 'unavailable' end;
 if mode='current' then
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.last_success_at is null),'[]'),min(s.last_success_at),max(s.last_success_at),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status in('queued','running')),'[]'),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status='failed'),'[]')
  into missing,source_at,capture_at,refreshing,failed from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join public.ar_refresh_state s on s.hotel=h.hotel where ar_private.hotel_in_report_scope(h.hotel,p_hotel);
  select rounds into policy from ar_private.collection_policy_versions where version=(select version from ar_private.collection_policy_head where singleton);
  reason:=case when missing<>'[]'::jsonb then 'source_scope_incomplete' end;
 else
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where c.hotel is null or not c.complete),'[]'),min(c.source_at),max(c.captured_at),max(c.reason)
  into missing,source_at,capture_at,reason from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where ar_private.hotel_in_report_scope(h.hotel,p_hotel);
  select c.policy into policy from ar_private.dashboard_daily_captures c where c.day=p_as_of and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) order by c.captured_at desc,c.hotel limit 1;
  reason:=coalesce(reason,case when p_as_of>today then 'future_date' when missing<>'[]'::jsonb then 'uncaptured_date' end);
 end if;
 -- Older observations contain positive invoices only; their credit inventory is unknown.
 credit_coverage:=mode='current' or mode='snapshot' and not exists(select 1 from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where (ar_private.hotel_in_report_scope(h.hotel,p_hotel)) and (c.hotel is null or c.inventory_version<>'signed-v1'));
 complete:=mode<>'unavailable' and missing='[]'::jsonb;
 if mode='current' and exists(select 1 from public.ar_accounts a where (ar_private.hotel_in_report_scope(hotel,p_hotel)) and (p_account is null or id=p_account) and (p_type is null or type=p_type) and verification_state<>'verified') then complete:=false;reason:='source_scope_incomplete';end if;
 if p_account is not null and (mode='current' and not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account)
  or mode='snapshot' and not exists(select 1 from ar_private.dashboard_daily_captures c cross join lateral jsonb_array_elements(c.accounts)a where c.hotel=p_hotel and c.day=p_as_of and a->>'id'=p_account)) then complete:=false;reason:='account_scope_unavailable';end if;
 if mode='current' then
  -- Account refreshes publish scoped rows without advancing full-hotel sourceAt.
  select greatest(capture_at,max(a.synced_at),max(i.synced_at)) into capture_at
  from public.ar_accounts a left join public.ar_invoices i on i.hotel=a.hotel and i.account_id=a.id
  where (ar_private.hotel_in_report_scope(a.hotel,p_hotel)) and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(w.updated_at),max(s.updated_at)) into capture_at from public.ar_invoice_workflow w join public.ar_accounts a on a.hotel=w.hotel and a.id=w.account_id left join public.ar_account_settings s on s.hotel=w.hotel and s.account_id=w.account_id where (ar_private.hotel_in_report_scope(w.hotel,p_hotel)) and (p_account is null or w.account_id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(c.captured_at)) into capture_at from ar_private.dashboard_daily_captures c where c.day=today and (ar_private.hotel_in_report_scope(c.hotel,p_hotel));
 end if;
 with source as materialized(
  select c.* from ar_private.dashboard_current_invoices c where mode='current' and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
  union all select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.invoice_no,c.folio_no,c.guest,c.transaction_date,c.open,c.original,c.age,c.billing_required,c.credit_term,c.first_billing_date,c.due_date,c.latest_stage,c.latest_stage_label,c.latest_sent_at,c.verified from ar_private.dashboard_daily_invoices c where mode='snapshot' and day=p_as_of and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
 ),scope as materialized(
  select s.*,ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of) as memberships from source s where (ar_private.hotel_in_report_scope(s.hotel,p_hotel)) and (p_account is null or s.account_id=p_account) and (p_type is null or s.account_type=p_type)
 ),quality as(select (p_age_min is null and p_age_max is null or count(*) filter(where age is null)=0) as ages_known,count(*) filter(where not verified) as unverified,complete and count(*) filter(where not verified)=0 as valid,
  count(*) filter(where verified and open>0 and age is null) as unknown_age,
  count(*) filter(where verified and open>0 and (billing_required is null or (not billing_required or first_billing_date is not null) and due_date is null)) as unknown_due from scope),
 metrics as(select k.key,k.ordinality,case when q.valid and (k.key<>'open' or credit_coverage) and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then count(s.invoice_id) end as count,
  case when q.valid and (k.key<>'open' or credit_coverage) and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount
  from unnest(array['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled']) with ordinality k(key,ordinality) cross join quality q left join scope s on k.key=any(s.memberships) group by k.key,k.ordinality,q.valid,q.unknown_age,q.unknown_due),
 stage_keys as(select v->>'key' as key,v->>'label' as label,n as ordinal from jsonb_array_elements(coalesce(policy,'[]')) with ordinality p(v,n) where (v->>'active')::boolean
  union all select key,label,1000 from(select distinct on(s.latest_stage) s.latest_stage as key,s.latest_stage_label as label from scope s where s.latest_stage is not null and not exists(select 1 from jsonb_array_elements(coalesce(policy,'[]'))p where p->>'key'=s.latest_stage and (p->>'active')::boolean) order by s.latest_stage,s.latest_sent_at desc)s),
 stages as(select k.key,k.label,k.ordinal,case when q.valid then count(s.invoice_id) end as count,case when q.valid then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount from stage_keys k cross join quality q left join scope s on s.latest_stage=k.key and s.verified and s.open>0 group by k.key,k.label,k.ordinal,q.valid),
 matched as materialized(select * from scope where (p_age_min is null or age>=p_age_min) and (p_age_max is null or age<=p_age_max) and (p_metric is null or p_metric=any(memberships)) and (p_stage is null or latest_stage=p_stage and verified and open>0))
 select jsonb_build_object('asOfDate',p_as_of,'mode',mode,'capturedAt',capture_at,'sourceAt',source_at,'complete',q.valid and q.ages_known,'missingHotels',missing,'freshness',jsonb_build_object('refreshingHotels',refreshing,'failedHotels',failed),'reason',coalesce(reason,case when not q.valid then 'source_scope_incomplete' when not q.ages_known then 'age_scope_incomplete' when not credit_coverage and mode='snapshot' then 'credit_snapshot_unavailable' end),
 'openBalanceBreakdown',jsonb_build_object('positive',jsonb_build_object('count',case when q.valid then (select count(*) from scope where verified and open>0) end,'amount',case when q.valid then (select ar_private.financial_money(coalesce(sum(open),0)) from scope where verified and open>0) end),'credit',jsonb_build_object('count',case when q.valid and credit_coverage then (select count(*) from scope where verified and open<0) end,'amount',case when q.valid and credit_coverage then (select ar_private.financial_money(coalesce(sum(open),0)) from scope where verified and open<0) end),'creditCoverageComplete',q.valid and credit_coverage),
 'metrics',(select jsonb_agg(jsonb_build_object('key',key,'count',count,'amount',amount) order by ordinality) from metrics),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by ordinal,key) from stages),'[]'),
 'rows',case when p_accounts then coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,'count',invoices,'amount',ar_private.financial_money(amount),'oldest',oldest,'verified',verified) order by amount desc nulls last,hotel,account_id) from(select * from (select hotel,account_id,min(account_no) as account_no,min(account_name) as account_name,min(account_type) as account_type,count(*) as invoices,case when bool_and(verified) then sum(open) end as amount,case when count(*) filter(where age is null)=0 then max(age) end as oldest,bool_and(verified) as verified from matched group by hotel,account_id)g order by amount desc nulls last,hotel,account_id offset p_offset limit p_limit)p),'[]') else coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,'invoiceId',invoice_id,'invoiceNo',invoice_no,'folioNo',folio_no,'guest',guest,'transactionDate',transaction_date,'open',ar_private.financial_money(open),'original',ar_private.financial_money(original),'age',age,'billingRequired',billing_required,'firstBillingDate',first_billing_date,'dueDate',due_date,'latestStage',latest_stage,'latestStageLabel',latest_stage_label,'latestSentAt',latest_sent_at,'verified',verified) order by open desc,hotel,account_id,invoice_id) from(select * from matched order by open desc,hotel,account_id,invoice_id offset p_offset limit p_limit)p),'[]') end,
 'total',case when p_accounts then (select count(*) from(select hotel,account_id from matched group by hotel,account_id)g) else (select count(*) from matched) end,'unverified',q.unverified) into result from quality q;
 return jsonb_strip_nulls(result-'rows'-'metrics'-'stages'-'openBalanceBreakdown')||jsonb_build_object('capturedAt',capture_at,'sourceAt',source_at,'rows',result->'rows','metrics',result->'metrics','stages',result->'stages','openBalanceBreakdown',result->'openBalanceBreakdown');
end$function$;
revoke all on function ar_private.dashboard_balance_read(uuid,date,text,text,text,text,text,integer,integer,integer,integer,boolean) from public,anon,authenticated,service_role;

create function public.ar_dashboard_balance_accounts(p_actor uuid,p_as_of date,p_hotel text default null,p_account text default null,p_type text default null,p_metric text default null,p_stage text default null,p_offset integer default 0,p_limit integer default 50,p_age_min integer default null,p_age_max integer default null) returns jsonb language sql stable security definer set search_path='' as $$
 select ar_private.dashboard_balance_read(p_actor,p_as_of,p_hotel,p_account,p_type,p_metric,p_stage,p_offset,p_limit,p_age_min,p_age_max,true);
$$;
revoke all on function public.ar_dashboard_balance_accounts(uuid,date,text,text,text,text,text,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_balance_accounts(uuid,date,text,text,text,text,text,integer,integer,integer,integer) to service_role;
create function public.ar_dashboard_balance_invoices(p_actor uuid,p_as_of date,p_hotel text default null,p_account text default null,p_type text default null,p_metric text default null,p_stage text default null,p_offset integer default 0,p_limit integer default 50,p_age_min integer default null,p_age_max integer default null) returns jsonb language sql stable security definer set search_path='' as $$
 select ar_private.dashboard_balance_read(p_actor,p_as_of,p_hotel,p_account,p_type,p_metric,p_stage,p_offset,p_limit,p_age_min,p_age_max,false);
$$;
revoke all on function public.ar_dashboard_balance_invoices(uuid,date,text,text,text,text,text,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_balance_invoices(uuid,date,text,text,text,text,text,integer,integer,integer,integer) to service_role;

CREATE OR REPLACE FUNCTION ar_private.dashboard_summary_balances(p_actor uuid, p_as_of date, p_hotel text DEFAULT NULL::text, p_account text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_metric text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare today date:=(now() at time zone 'Asia/Bangkok')::date;mode text;missing jsonb;source_at timestamptz;capture_at timestamptz;complete boolean;result jsonb;reason text;policy jsonb;refreshing jsonb:='[]';failed jsonb:='[]';credit_coverage boolean:=false;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_as_of is null or not isfinite(p_as_of) or p_as_of<date '0001-01-01' or p_as_of>date '9999-12-31'
  or p_hotel is not null and cardinality(ar_private.report_scope_hotels(p_hotel))=0 or p_account is not null and (not ar_private.is_supported_hotel(p_hotel) or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_metric is not null and p_metric not in('open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled')
  or p_stage is not null and p_stage!~'^(Friendly|Follow 1|Follow 2|Follow 3|Final|round_[a-z0-9][a-z0-9_-]{0,63})$'
  or p_stage is not null and p_metric is not null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','dashboard_invalid');end if;
 mode:=case when p_as_of=today then 'current' when p_as_of<today and exists(select 1 from ar_private.dashboard_daily_captures where day=p_as_of and (ar_private.hotel_in_report_scope(hotel,p_hotel))) then 'snapshot' else 'unavailable' end;
 if mode='current' then
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.last_success_at is null),'[]'),min(s.last_success_at),max(s.last_success_at),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status in('queued','running')),'[]'),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status='failed'),'[]')
  into missing,source_at,capture_at,refreshing,failed from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join public.ar_refresh_state s on s.hotel=h.hotel where ar_private.hotel_in_report_scope(h.hotel,p_hotel);
  select rounds into policy from ar_private.collection_policy_versions where version=(select version from ar_private.collection_policy_head where singleton);
  reason:=case when missing<>'[]'::jsonb then 'source_scope_incomplete' end;
 else
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where c.hotel is null or not c.complete),'[]'),min(c.source_at),max(c.captured_at),max(c.reason)
  into missing,source_at,capture_at,reason from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where ar_private.hotel_in_report_scope(h.hotel,p_hotel);
  select c.policy into policy from ar_private.dashboard_daily_captures c where c.day=p_as_of and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) order by c.captured_at desc,c.hotel limit 1;
  reason:=coalesce(reason,case when p_as_of>today then 'future_date' when missing<>'[]'::jsonb then 'uncaptured_date' end);
 end if;
 -- Older observations contain positive invoices only; their credit inventory is unknown.
 credit_coverage:=mode='current' or mode='snapshot' and not exists(select 1 from unnest(ar_private.report_scope_hotels(p_hotel))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where (ar_private.hotel_in_report_scope(h.hotel,p_hotel)) and (c.hotel is null or c.inventory_version<>'signed-v1'));
 complete:=mode<>'unavailable' and missing='[]'::jsonb;
 if mode='current' and exists(select 1 from public.ar_accounts a where (ar_private.hotel_in_report_scope(hotel,p_hotel)) and (p_account is null or id=p_account) and (p_type is null or type=p_type) and verification_state<>'verified') then complete:=false;reason:='source_scope_incomplete';end if;
 if p_account is not null and (mode='current' and not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account)
  or mode='snapshot' and not exists(select 1 from ar_private.dashboard_daily_captures c cross join lateral jsonb_array_elements(c.accounts)a where c.hotel=p_hotel and c.day=p_as_of and a->>'id'=p_account)) then complete:=false;reason:='account_scope_unavailable';end if;
 if mode='current' then
  -- Account refreshes publish scoped rows without advancing full-hotel sourceAt.
  select greatest(capture_at,max(a.synced_at),max(i.synced_at)) into capture_at
  from public.ar_accounts a left join public.ar_invoices i on i.hotel=a.hotel and i.account_id=a.id
  where (ar_private.hotel_in_report_scope(a.hotel,p_hotel)) and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(w.updated_at),max(s.updated_at)) into capture_at from public.ar_invoice_workflow w join public.ar_accounts a on a.hotel=w.hotel and a.id=w.account_id left join public.ar_account_settings s on s.hotel=w.hotel and s.account_id=w.account_id where (ar_private.hotel_in_report_scope(w.hotel,p_hotel)) and (p_account is null or w.account_id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(c.captured_at)) into capture_at from ar_private.dashboard_daily_captures c where c.day=today and (ar_private.hotel_in_report_scope(c.hotel,p_hotel));
 end if;
 with source as materialized(
  select c.* from ar_private.dashboard_current_balance_invoices c where mode='current' and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
  union all select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.invoice_no,c.folio_no,c.guest,c.transaction_date,c.open,c.original,c.age,c.billing_required,c.credit_term,c.first_billing_date,c.due_date,c.latest_stage,c.latest_stage_label,c.latest_sent_at,c.verified from ar_private.dashboard_daily_invoices c where mode='snapshot' and day=p_as_of and (ar_private.hotel_in_report_scope(c.hotel,p_hotel)) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
 ),scope as materialized(
  select s.*,ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of) as memberships from source s where (ar_private.hotel_in_report_scope(s.hotel,p_hotel)) and (p_account is null or s.account_id=p_account) and (p_type is null or s.account_type=p_type)
 ),quality as(select count(*) filter(where not verified) as unverified,complete and count(*) filter(where not verified)=0 as valid,
  count(*) filter(where verified and open>0 and age is null) as unknown_age,
  count(*) filter(where verified and open>0 and (billing_required is null or (not billing_required or first_billing_date is not null) and due_date is null)) as unknown_due from scope),
 metrics as(select k.key,k.ordinality,case when q.valid and (k.key<>'open' or credit_coverage) and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then count(s.invoice_id) end as count,
  case when q.valid and (k.key<>'open' or credit_coverage) and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount
  from unnest(array['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled']) with ordinality k(key,ordinality) cross join quality q left join scope s on k.key=any(s.memberships) group by k.key,k.ordinality,q.valid,q.unknown_age,q.unknown_due),
 stage_keys as(select v->>'key' as key,v->>'label' as label,n as ordinal from jsonb_array_elements(coalesce(policy,'[]')) with ordinality p(v,n) where (v->>'active')::boolean
  union all select key,label,1000 from(select distinct on(s.latest_stage) s.latest_stage as key,s.latest_stage_label as label from scope s where s.latest_stage is not null and not exists(select 1 from jsonb_array_elements(coalesce(policy,'[]'))p where p->>'key'=s.latest_stage and (p->>'active')::boolean) order by s.latest_stage,s.latest_sent_at desc)s),
 stages as(select k.key,k.label,k.ordinal,case when q.valid then count(s.invoice_id) end as count,case when q.valid then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount from stage_keys k cross join quality q left join scope s on s.latest_stage=k.key and s.verified and s.open>0 group by k.key,k.label,k.ordinal,q.valid),
 matched as materialized(select * from scope where (p_metric is null or p_metric=any(memberships)) and (p_stage is null or latest_stage=p_stage and verified and open>0))
 select jsonb_build_object('asOfDate',p_as_of,'mode',mode,'capturedAt',capture_at,'sourceAt',source_at,'complete',q.valid,'missingHotels',missing,'freshness',jsonb_build_object('refreshingHotels',refreshing,'failedHotels',failed),'reason',coalesce(reason,case when not q.valid then 'source_scope_incomplete' when not credit_coverage and mode='snapshot' then 'credit_snapshot_unavailable' end),
 'openBalanceBreakdown',jsonb_build_object('positive',jsonb_build_object('count',case when q.valid then (select count(*) from scope where verified and open>0) end,'amount',case when q.valid then (select ar_private.financial_money(coalesce(sum(open),0)) from scope where verified and open>0) end),'credit',jsonb_build_object('count',case when q.valid and credit_coverage then (select count(*) from scope where verified and open<0) end,'amount',case when q.valid and credit_coverage then (select ar_private.financial_money(coalesce(sum(open),0)) from scope where verified and open<0) end),'creditCoverageComplete',q.valid and credit_coverage),
 'metrics',(select jsonb_agg(jsonb_build_object('key',key,'count',count,'amount',amount) order by ordinality) from metrics),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by ordinal,key) from stages),'[]'),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,'invoiceId',invoice_id,'invoiceNo',invoice_no,'folioNo',folio_no,'guest',guest,'transactionDate',transaction_date,'open',ar_private.financial_money(open),'original',ar_private.financial_money(original),'age',age,'billingRequired',billing_required,'firstBillingDate',first_billing_date,'dueDate',due_date,'latestStage',latest_stage,'latestStageLabel',latest_stage_label,'latestSentAt',latest_sent_at,'verified',verified) order by open desc,hotel,account_id,invoice_id) from(select * from matched order by open desc,hotel,account_id,invoice_id offset p_offset limit p_limit)p),'[]'),
 'total',(select count(*) from matched),'unverified',q.unverified) into result from quality q;
 return jsonb_strip_nulls(result-'rows'-'metrics'-'stages'-'openBalanceBreakdown')||jsonb_build_object('capturedAt',capture_at,'sourceAt',source_at,'rows',result->'rows','metrics',result->'metrics','stages',result->'stages','openBalanceBreakdown',result->'openBalanceBreakdown');
end$function$;
revoke all on function ar_private.dashboard_summary_balances(uuid,date,text,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;

-- Read-only management reporting. Each ledger identity remains Hotel + Account.
create or replace function public.ar_dashboard_management(p_actor uuid,p_from date,p_to date,p_hotel text default null,p_account text default null,p_type text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;entries jsonb;result jsonb;valid boolean;ages_known boolean;cohort_known boolean;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from<date '0001-01-01' or p_to>date '9999-12-31'
  or p_from>p_to or p_to-p_from>3660 or p_to>(current_timestamp at time zone 'Asia/Bangkok')::date then return jsonb_build_object('error','dashboard_invalid');end if;
 -- Reuse the established scope/identity/quality and historical snapshot fences.
 base:=ar_private.dashboard_summary_balances(p_actor,p_to,p_hotel,p_account,p_type,null,null,0,1);
 if base ? 'error' then return base;end if;
 entries:=public.ar_dashboard_invoice_entries(p_actor,p_from,p_to,p_hotel,p_account,p_type,0,1);
 if entries ? 'error' then return entries;end if;
 valid:=coalesce((base->>'complete')::boolean,false) and coalesce((base->'openBalanceBreakdown'->>'creditCoverageComplete')::boolean,false);
 cohort_known:=coalesce((entries->'coverage'->>'complete')::boolean,false);
 with source as materialized(
  select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.open,c.age,c.billing_required,c.first_billing_date,c.verified from ar_private.dashboard_current_balance_invoices c where base->>'mode'='current'
   and ar_private.hotel_in_report_scope(c.hotel,p_hotel) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
  union all select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.open,c.age,c.billing_required,c.first_billing_date,c.verified
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
