-- Signed outstanding roots/standalone invoices, with unchanged positive-only collection work.
-- No current ledger write, historical rewrite, backfill, pruning, or provider action.
-- The fast constant default labels existing rows without updating guarded historical tuples.
alter table ar_private.dashboard_daily_captures add column inventory_version text not null default 'positive-v1' check(inventory_version in('positive-v1','signed-v1'));
alter table ar_private.dashboard_daily_captures alter column inventory_version set default 'signed-v1';
comment on column ar_private.dashboard_daily_captures.inventory_version is 'positive-v1 lacks negative inventory; signed-v1 is captured from the full nonzero non-child source. Workflow-only updates never upgrade this value.';

-- Read a single committed current snapshot. Native OPERA balances already exclude children.
-- Only the display count is derived; signed open/aging/over90 remain exactly as published.
create function public.ar_portfolio_accounts(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','portfolio_forbidden');end if;
 with counts as materialized(
  select hotel,account_id,count(*) as items from public.ar_invoices
  where hotel in('KAT','TSK') and open<>0 and collection_role<>'child' group by hotel,account_id
 ),accounts as(
  select a.hotel,a.id,to_jsonb(a)||jsonb_build_object('items',coalesce(c.items,0)) as value
  from public.ar_accounts a left join counts c on c.hotel=a.hotel and c.account_id=a.id where a.hotel in('KAT','TSK')
 )
 select jsonb_build_object('accounts',coalesce((select jsonb_agg(value order by hotel,id) from accounts),'[]'::jsonb),'source','opera',
  'status',case when exists(select 1 from public.ar_refresh_state where hotel in('KAT','TSK') and last_success_at is not null) then 'connected' else 'not_connected' end,
  'refresh',public.ar_refresh_status()) into result;
 return result;
end$$;
revoke all on function public.ar_portfolio_accounts(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_portfolio_accounts(uuid) to service_role;

create or replace view ar_private.dashboard_current_invoices as
 select i.hotel,i.account_id,i.id as invoice_id,a.account_no,a.name as account_name,a.type as account_type,
 i.invoice_no,i.folio_no,i.guest,i.transaction_date,i.open,i.original,i.age,w.billing_required,w.credit_term,w.first_billing_date,w.due_date,
 latest.stage as latest_stage,coalesce(latest.stage_snapshot->>'label',latest.stage) as latest_stage_label,latest.sent_at as latest_sent_at,
 coalesce(i.verification_state='verified' and i.collection_role in('standalone','parent') and a.verification_state='verified',false) as verified
 from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
 left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
 left join lateral(
  select e.stage,e.stage_snapshot,e.sent_at from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner
  where e.hotel=i.hotel and e.account_id=i.account_id and i.id=any(e.invoice_ids) and e.purpose='collection'
   and m.state='sent' and m.mode in('send','draft') and e.sent_at<=clock_timestamp() and ar_private.financial_actor(e.owner)
  order by e.sent_at desc,e.delivery_id desc limit 1
 ) latest on true
 where i.collection_role<>'child' and (i.open<>0 or i.verification_state not in('verified','cleared'));
revoke all on ar_private.dashboard_current_invoices from public,anon,authenticated,service_role;

create or replace function ar_private.dashboard_capture(p_run_id uuid,p_expected integer) returns void language plpgsql security definer set search_path='' as $$
declare r ar_private.refresh_runs;d date:=(clock_timestamp() at time zone 'Asia/Bangkok')::date;n bigint;existing bigint;days bigint;bytes bigint;cap numeric;ok boolean;policy jsonb;accounts jsonb;
begin
 select * into r from ar_private.refresh_runs where id=p_run_id;
 if r.status is distinct from 'succeeded' or r.account_id is not null or (r.finished_at at time zone 'Asia/Bangkok')::date<>d
  or not exists(select 1 from public.ar_refresh_state where hotel=r.hotel and run_id=r.id and status='succeeded') then return;end if;
 perform pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
 perform pg_advisory_xact_lock(61749,1);
 if exists(select 1 from ar_private.dashboard_daily_captures where hotel=r.hotel and day=d and source_at>r.finished_at) then return;end if;
 select count(*) into n from ar_private.dashboard_current_invoices where hotel=r.hotel;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'verified',verification_state='verified')),'[]') into accounts from public.ar_accounts where hotel=r.hotel;
 select count(*) into existing from ar_private.dashboard_daily_invoices where not(hotel=r.hotel and day=d);
 select count(*)+case when exists(select 1 from ar_private.dashboard_daily_captures where hotel=r.hotel and day=d) then 0 else 1 end into days from ar_private.dashboard_daily_captures;
 bytes:=pg_total_relation_size('ar_private.dashboard_daily_invoices')+pg_total_relation_size('ar_private.dashboard_daily_captures')+pg_total_relation_size('ar_private.dashboard_capture_state');
 select floor((limits->>'databaseBytes')::numeric*(100-(limits->>'safetyPercent')::numeric)/100) into cap from ar_private.operations_budget where singleton and activated_at is not null;
 -- Allow for one replacement batch plus index overhead, rather than relying only on current on-disk size.
 if not ar_private.dashboard_budget_allows(existing+n,days,bytes+n*2048+octet_length(accounts::text)*2+16384,pg_database_size(current_database())+n*2048+octet_length(accounts::text)*2+16384,cap) then
  update ar_private.dashboard_capture_state set attempted_at=clock_timestamp(),reason='history_budget_exceeded' where hotel=r.hotel;
  update ar_private.dashboard_daily_captures set complete=false,reason='history_budget_exceeded' where hotel=r.hotel and day=d;return;
 end if;
 select count(*)=p_expected and coalesce(bool_and(a.verification_state='verified' and a.synced_at>=r.started_at),true) into ok from public.ar_accounts a where a.hotel=r.hotel;
 select coalesce(rounds,'[]'::jsonb) into policy from ar_private.collection_policy_versions where version=(select version from ar_private.collection_policy_head where singleton);
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,reason,policy,accounts,inventory_version)
 values(r.hotel,d,r.id,r.finished_at,clock_timestamp(),ok,case when not ok then 'source_scope_incomplete' end,coalesce(policy,'[]'),accounts,'signed-v1')
 on conflict(hotel,day) do update set run_id=excluded.run_id,source_at=excluded.source_at,captured_at=excluded.captured_at,complete=excluded.complete,reason=excluded.reason,policy=excluded.policy,accounts=excluded.accounts,inventory_version=excluded.inventory_version;
 -- Only today's mutable observation is replaced. Past dates are guarded against edits/deletion.
 delete from ar_private.dashboard_daily_invoices where hotel=r.hotel and day=d;
 insert into ar_private.dashboard_daily_invoices select c.hotel,d,c.account_id,c.invoice_id,c.account_no,c.account_name,c.account_type,c.invoice_no,c.folio_no,c.guest,c.transaction_date,c.open,c.original,c.age,c.billing_required,c.credit_term,c.first_billing_date,c.due_date,c.latest_stage,c.latest_stage_label,c.latest_sent_at,c.verified from ar_private.dashboard_current_invoices c where c.hotel=r.hotel;
 update ar_private.dashboard_capture_state set attempted_at=clock_timestamp(),reason=null where hotel=r.hotel;
exception when others then
 -- A supplemental history failure must not roll back the verified OPERA publication.
 begin
  update ar_private.dashboard_capture_state set attempted_at=clock_timestamp(),reason='history_capture_failed' where hotel=r.hotel;
  update ar_private.dashboard_daily_captures set complete=false,reason='history_capture_failed' where hotel=r.hotel and day=d;
 exception when others then null;end;
end$$;

create or replace function ar_private.dashboard_metric_membership(p_open numeric,p_verified boolean,p_billing boolean,p_credit integer,p_first date,p_due date,p_age integer,p_day date) returns text[] language sql immutable set search_path='' as $$
 select case when p_open>0 and p_verified then array_remove(array[
 'open',case when p_billing and p_first<=p_day then 'billed' end,
 case when p_billing and (p_first is null or p_first>p_day) then 'unbilled' end,
 case when not p_billing then 'not_required' end,case when p_billing is null or p_credit is null then 'setup' end,
 case when p_due<p_day then 'past_due' end,case when p_age>60 then 'over60' end,
 case when p_age>60 and p_billing and (p_first is null or p_first>p_day) then 'over60_unbilled' end],null) when p_open<0 and p_verified then array['open']::text[] else '{}'::text[] end
$$;

create or replace function public.ar_dashboard_balances(p_actor uuid,p_as_of date,p_hotel text default null,p_account text default null,p_type text default null,p_metric text default null,p_stage text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Bangkok')::date;mode text;missing jsonb;source_at timestamptz;capture_at timestamptz;complete boolean;result jsonb;reason text;policy jsonb;refreshing jsonb:='[]';failed jsonb:='[]';credit_coverage boolean:=false;
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
 -- Older observations contain positive invoices only; their credit inventory is unknown.
 credit_coverage:=mode='current' or mode='snapshot' and not exists(select 1 from(values('KAT'::text),('TSK'::text))h(hotel) left join ar_private.dashboard_daily_captures c on c.hotel=h.hotel and c.day=p_as_of where (p_hotel is null or h.hotel=p_hotel) and (c.hotel is null or c.inventory_version<>'signed-v1'));
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
end$$;

revoke all on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer) to service_role;

-- New Invoices retains Bill Date, signed original values and zero/cleared rows.
-- Exclude child detail rows as well as their already-excluded measured totals.
create or replace function public.ar_dashboard_invoice_entries(p_actor uuid,p_from date,p_to date,p_hotel text default null,p_account text default null,p_type text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 result jsonb;summary jsonb;source_complete boolean;complete boolean;last_success timestamptz;last_checked timestamptz;
 last_status text;last_error text;known numeric;unknowns bigint;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_from<date '0001-01-01' or p_to>date '9999-12-31' or p_from>p_to or p_to-p_from>3660
  or p_to>(current_timestamp at time zone 'Asia/Bangkok')::date
  or p_hotel is not null and p_hotel not in('KAT','TSK')
  or p_account is not null and (p_hotel is null or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200
  then return jsonb_build_object('error','dashboard_invalid');end if;

 -- A failed/in-progress attempt does not erase an earlier verified current
 -- publication. Missing full-hotel source coverage cannot become a known zero.
 select bool_and(r.last_success_at is not null),case when bool_and(r.last_success_at is not null) then min(r.last_success_at) end
 into source_complete,last_success
 from (values('KAT'::text),('TSK'::text)) h(hotel) left join public.ar_refresh_state r on r.hotel=h.hotel
 where p_hotel is null or h.hotel=p_hotel;
 select case when r.status in('queued','running','succeeded','failed') then r.status end,r.error_code into last_status,last_error
 from public.ar_refresh_state r where p_hotel is null or r.hotel=p_hotel order by r.last_attempt_at desc nulls last,r.hotel limit 1;
 select source_complete and coalesce(bool_and(a.verification_state='verified' or a.verification_state='cleared' and a.open=0),true),min(a.synced_at)
 into source_complete,last_checked from public.ar_accounts a
 where (p_hotel is null or a.hotel=p_hotel) and (p_account is null or a.id=p_account) and (p_type is null or a.type=p_type);

 with filtered as materialized (
  select i.*,a.name as account_name,a.type as account_type,a.account_no,
   (i.verification_state='verified' or i.verification_state='cleared' and i.open=0)
    and (a.verification_state='verified' or a.verification_state='cleared' and a.open=0) as observed,
   i.collection_role in('standalone','parent') and i.parent_invoice_id is null as root
  from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id
  where i.collection_role<>'child' and i.transaction_date between p_from and p_to
   and (p_hotel is null or i.hotel=p_hotel) and (p_account is null or i.account_id=p_account) and (p_type is null or a.type=p_type)
 ), classified as materialized (
  select *,observed and root and original not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
   and open not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) as measured
  from filtered
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
   'hotel',i.hotel,'accountId',i.account_id,'transactionId',i.id,'kind','invoice','transactionDate',i.transaction_date,
   'accountName',i.account_name,'accountType',i.account_type,'accountNo',i.account_no,'invoiceNo',i.invoice_no,'folioNo',i.folio_no,
   'originalAmount',ar_private.financial_money(i.original),'openAmount',ar_private.financial_money(i.open),
   'currentAmount',ar_private.financial_money(i.current_amount),'cumulativePayments',ar_private.financial_money(i.applied_amount),
   'currency','THB','invoiceType',null,'postingDate',null,'revenueDate',null,'transferDate',null,'transferredIn',null,'transferredOut',null,'closeDate',null,
   'compressed',i.compressed,'parentInvoiceNo',i.parent_invoice_no,'collectionRole',i.collection_role,
   'entryClassification',case when i.root or i.collection_role='child' then 'invoice' else 'unclassified' end,
   'sourceStatus',case when i.observed then 'observed' else 'not_observed' end,'lastObservedAt',i.synced_at,'lastCheckedAt',i.synced_at
  ) order by i.transaction_date desc,i.hotel,i.account_id,i.id)
  from (select * from classified order by transaction_date desc,hotel,account_id,id offset p_offset limit p_limit) i),'[]'::jsonb),
  'total',count(*)),coalesce(sum(original) filter(where measured),0),count(*) filter(where collection_role<>'child' and not measured),
  jsonb_build_object('rows',count(*),'measuredRows',count(*) filter(where measured),'invoiceCount',count(*) filter(where measured),
   'paymentCount',0,'notObserved',count(*) filter(where collection_role<>'child' and not observed),'unknownSourceDates',0,
   'compressedChildren',count(*) filter(where collection_role='child'),'openingBalances',0,'credits',count(*) filter(where measured and open<0))
 into result,known,unknowns,summary from classified;
 complete:=source_complete and unknowns=0;
 summary:=summary||jsonb_build_object('knownAmount',ar_private.financial_money(known),'amount',case when complete then ar_private.financial_money(known) end,
  'unknownAmounts',unknowns,'amountBasis','original_invoice_amount','dateBasis','invoice_transaction_date',
  'receiptClassification','unknown','applicationDatesVerified',false,'coverageComplete',complete);
 return result||jsonb_build_object('view','invoice_entries','source','portfolio','summary',summary,'coverage',jsonb_build_object(
  'source','portfolio','complete',complete,'from',p_from,'to',p_to,'lastSuccessAt',last_success,'lastCheckedAt',last_checked,
  'lastAttemptStatus',last_status,'lastError',last_error));
end$$;
revoke all on function public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer) to service_role;

