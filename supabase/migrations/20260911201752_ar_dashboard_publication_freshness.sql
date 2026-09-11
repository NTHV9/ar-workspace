-- Latest refresh attempts do not invalidate an already committed full-hotel publication.
-- Queue/claim/failure leave last_success_at intact; the publisher validates the entire
-- staged scope before atomically writing accounts/invoices and that publication time.
-- Account-only publications remain scoped and do not advance full-hotel sourceAt.
-- Existing account/invoice verification, positive-root scope, history and permissions stay intact.
create or replace function public.ar_dashboard_balances(p_actor uuid,p_as_of date,p_hotel text default null,p_account text default null,p_type text default null,p_metric text default null,p_stage text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Bangkok')::date;mode text;missing jsonb;source_at timestamptz;capture_at timestamptz;complete boolean;result jsonb;reason text;policy jsonb;refreshing jsonb:='[]';failed jsonb:='[]';
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_as_of is null or not isfinite(p_as_of) or p_as_of<date '0001-01-01' or p_as_of>date '9999-12-31'
  or p_hotel is not null and p_hotel not in('KAT','TSK') or p_account is not null and (p_hotel is null or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_metric is not null and p_metric not in('open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled')
  or p_stage is not null and p_stage!~'^(Friendly|Follow 1|Follow 2|Follow 3|Final|round_[a-z0-9][a-z0-9_-]{0,63})$'
  or p_stage is not null and p_metric is not null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','dashboard_invalid');end if;
 mode:=case when p_as_of=today then 'current' when p_as_of<today and exists(select 1 from ar_private.dashboard_daily_captures where day=p_as_of and (p_hotel is null or hotel=p_hotel)) then 'snapshot' else 'unavailable' end;
 if mode='current' then
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.last_success_at is null),'[]'),min(s.last_success_at),max(s.last_success_at),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status in('queued','running')),'[]'),
   coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status='failed'),'[]')
  into missing,source_at,capture_at,refreshing,failed from(values('KAT'::text),('TSK'::text))h(hotel) left join public.ar_refresh_state s on s.hotel=h.hotel where p_hotel is null or h.hotel=p_hotel;
  select rounds into policy from ar_private.collection_policy_versions where version=(select version from ar_private.collection_policy_head where singleton);
  reason:=case when missing<>'[]'::jsonb then 'source_scope_incomplete' end;
 else
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where c.hotel is null or not c.complete),'[]'),min(c.source_at),max(c.captured_at),max(c.reason)
  into missing,source_at,capture_at,reason from(values('KAT'::text),('TSK'::text))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where p_hotel is null or h.hotel=p_hotel;
  select c.policy into policy from ar_private.dashboard_daily_captures c where c.day=p_as_of and (p_hotel is null or c.hotel=p_hotel) order by c.captured_at desc,c.hotel limit 1;
  reason:=coalesce(reason,case when p_as_of>today then 'future_date' when missing<>'[]'::jsonb then 'uncaptured_date' end);
 end if;
 complete:=mode<>'unavailable' and missing='[]'::jsonb;
 if mode='current' and exists(select 1 from public.ar_accounts a where (p_hotel is null or hotel=p_hotel) and (p_account is null or id=p_account) and (p_type is null or type=p_type) and verification_state<>'verified') then complete:=false;reason:='source_scope_incomplete';end if;
 if p_account is not null and (mode='current' and not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account)
  or mode='snapshot' and not exists(select 1 from ar_private.dashboard_daily_captures c cross join lateral jsonb_array_elements(c.accounts)a where c.hotel=p_hotel and c.day=p_as_of and a->>'id'=p_account)) then complete:=false;reason:='account_scope_unavailable';end if;
 if mode='current' then
  -- Account refreshes publish scoped rows without advancing full-hotel sourceAt.
  select greatest(capture_at,max(a.synced_at),max(i.synced_at)) into capture_at
  from public.ar_accounts a left join public.ar_invoices i on i.hotel=a.hotel and i.account_id=a.id
  where (p_hotel is null or a.hotel=p_hotel) and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(w.updated_at),max(s.updated_at)) into capture_at from public.ar_invoice_workflow w join public.ar_accounts a on a.hotel=w.hotel and a.id=w.account_id left join public.ar_account_settings s on s.hotel=w.hotel and s.account_id=w.account_id where (p_hotel is null or w.hotel=p_hotel) and (p_account is null or w.account_id=p_account) and (p_type is null or a.type=p_type);
  select greatest(capture_at,max(c.captured_at)) into capture_at from ar_private.dashboard_daily_captures c where c.day=today and (p_hotel is null or c.hotel=p_hotel);
 end if;
 with source as materialized(
  select c.* from ar_private.dashboard_current_invoices c where mode='current' and (p_hotel is null or c.hotel=p_hotel) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
  union all select c.hotel,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.invoice_no,c.folio_no,c.guest,c.transaction_date,c.open,c.original,c.age,c.billing_required,c.credit_term,c.first_billing_date,c.due_date,c.latest_stage,c.latest_stage_label,c.latest_sent_at,c.verified from ar_private.dashboard_daily_invoices c where mode='snapshot' and day=p_as_of and (p_hotel is null or c.hotel=p_hotel) and (p_account is null or c.account_id=p_account) and (p_type is null or c.account_type=p_type)
 ),scope as materialized(
  select s.*,ar_private.dashboard_metric_membership(s.open,s.verified,s.billing_required,s.credit_term,s.first_billing_date,s.due_date,s.age,p_as_of) as memberships from source s where (p_hotel is null or s.hotel=p_hotel) and (p_account is null or s.account_id=p_account) and (p_type is null or s.account_type=p_type)
 ),quality as(select count(*) filter(where not verified) as unverified,complete and count(*) filter(where not verified)=0 as valid,
  count(*) filter(where verified and open>0 and age is null) as unknown_age,
  count(*) filter(where verified and open>0 and (billing_required is null or (not billing_required or first_billing_date is not null) and due_date is null)) as unknown_due from scope),
 metrics as(select k.key,k.ordinality,case when q.valid and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then count(s.invoice_id) end as count,
  case when q.valid and (k.key not in('over60','over60_unbilled') or q.unknown_age=0) and (k.key<>'past_due' or q.unknown_due=0) then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount
  from unnest(array['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled']) with ordinality k(key,ordinality) cross join quality q left join scope s on k.key=any(s.memberships) group by k.key,k.ordinality,q.valid,q.unknown_age,q.unknown_due),
 stage_keys as(select v->>'key' as key,v->>'label' as label,n as ordinal from jsonb_array_elements(coalesce(policy,'[]')) with ordinality p(v,n) where (v->>'active')::boolean
  union all select key,label,1000 from(select distinct on(s.latest_stage) s.latest_stage as key,s.latest_stage_label as label from scope s where s.latest_stage is not null and not exists(select 1 from jsonb_array_elements(coalesce(policy,'[]'))p where p->>'key'=s.latest_stage and (p->>'active')::boolean) order by s.latest_stage,s.latest_sent_at desc)s),
 stages as(select k.key,k.label,k.ordinal,case when q.valid then count(s.invoice_id) end as count,case when q.valid then ar_private.financial_money(coalesce(sum(s.open),0)) end as amount from stage_keys k cross join quality q left join scope s on s.latest_stage=k.key and s.verified and s.open>0 group by k.key,k.label,k.ordinal,q.valid),
 matched as materialized(select * from scope where (p_metric is null or p_metric=any(memberships)) and (p_stage is null or latest_stage=p_stage and verified and open>0))
 select jsonb_build_object('asOfDate',p_as_of,'mode',mode,'capturedAt',capture_at,'sourceAt',source_at,'complete',q.valid,'missingHotels',missing,'freshness',jsonb_build_object('refreshingHotels',refreshing,'failedHotels',failed),'reason',coalesce(reason,case when not q.valid then 'source_scope_incomplete' end),
 'metrics',(select jsonb_agg(jsonb_build_object('key',key,'count',count,'amount',amount) order by ordinality) from metrics),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by ordinal,key) from stages),'[]'),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,'invoiceId',invoice_id,'invoiceNo',invoice_no,'folioNo',folio_no,'guest',guest,'transactionDate',transaction_date,'open',ar_private.financial_money(open),'original',ar_private.financial_money(original),'age',age,'billingRequired',billing_required,'firstBillingDate',first_billing_date,'dueDate',due_date,'latestStage',latest_stage,'latestStageLabel',latest_stage_label,'latestSentAt',latest_sent_at,'verified',verified) order by open desc,hotel,account_id,invoice_id) from(select * from matched order by open desc,hotel,account_id,invoice_id offset p_offset limit p_limit)p),'[]'),
 'total',(select count(*) from matched),'unverified',q.unverified) into result from quality q;
 return jsonb_strip_nulls(result-'rows'-'metrics'-'stages')||jsonb_build_object('capturedAt',capture_at,'sourceAt',source_at,'rows',result->'rows','metrics',result->'metrics','stages',result->'stages');
end$$;

revoke all on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer) to service_role;
