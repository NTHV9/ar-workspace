-- Additive, private closing-date observations. No backdated seeds or history pruning.
create table ar_private.dashboard_daily_captures(
 hotel text not null check(hotel in('KAT','TSK')),day date not null,run_id uuid not null references ar_private.refresh_runs(id),
 source_at timestamptz not null,captured_at timestamptz not null,complete boolean not null,reason text,policy jsonb not null,accounts jsonb not null default '[]',
 primary key(hotel,day),check(day=(source_at at time zone 'Asia/Bangkok')::date),check(day=(captured_at at time zone 'Asia/Bangkok')::date)
);
create table ar_private.dashboard_daily_invoices(
 hotel text not null,day date not null,account_id text not null,invoice_id text not null,account_no text,account_name text not null,account_type text not null,
 invoice_no text,folio_no text,guest text,transaction_date date not null,open numeric(18,2) not null,original numeric(18,2),age integer,
 billing_required boolean,credit_term integer,first_billing_date date,due_date date,latest_stage text,latest_stage_label text,latest_sent_at timestamptz,
 verified boolean not null,primary key(hotel,day,account_id,invoice_id),foreign key(hotel,day) references ar_private.dashboard_daily_captures(hotel,day)
);
create index dashboard_daily_scope on ar_private.dashboard_daily_invoices(day,hotel,account_type,account_id);
create index ar_sent_events_dashboard_scope on public.ar_sent_events(hotel,account_id,sent_at desc,delivery_id desc) where purpose='collection';
create table ar_private.dashboard_capture_state(
 hotel text primary key check(hotel in('KAT','TSK')),attempted_at timestamptz,reason text
);
insert into ar_private.dashboard_capture_state(hotel) values('KAT'),('TSK');
alter table ar_private.dashboard_daily_captures enable row level security;
alter table ar_private.dashboard_daily_invoices enable row level security;
alter table ar_private.dashboard_capture_state enable row level security;
revoke all on ar_private.dashboard_daily_captures,ar_private.dashboard_daily_invoices,ar_private.dashboard_capture_state from public,anon,authenticated,service_role;

-- The view is never exposed, including to service_role. It is evaluated by the protected readers/capturer only.
create view ar_private.dashboard_current_invoices as
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
 where i.collection_role<>'child' and (i.open>0 or i.verification_state not in('verified','cleared') or i.collection_role='unverified');
revoke all on ar_private.dashboard_current_invoices from public,anon,authenticated,service_role;

create function ar_private.dashboard_today_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (case when tg_op='DELETE' then old.day else new.day end)<>(clock_timestamp() at time zone 'Asia/Bangkok')::date
  or tg_op='UPDATE' and row(old.hotel,old.day) is distinct from row(new.hotel,new.day) then raise exception 'dashboard_history_immutable';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
create trigger dashboard_capture_today before insert or update or delete on ar_private.dashboard_daily_captures for each row execute function ar_private.dashboard_today_guard();
create trigger dashboard_invoice_today before insert or update or delete on ar_private.dashboard_daily_invoices for each row execute function ar_private.dashboard_today_guard();

-- Fixed limits bound both retained tuples and physical relations; existing DB safety margin remains authoritative.
create function ar_private.dashboard_budget_allows(p_rows bigint,p_days bigint,p_bytes bigint,p_database bigint,p_limit numeric) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_rows between 0 and 200000 and p_days between 0 and 3660 and p_bytes between 0 and 67108864
  and p_database>=0 and (p_limit is null or p_database<=p_limit),false)
$$;
create function ar_private.dashboard_capture(p_run_id uuid,p_expected integer) returns void language plpgsql security definer set search_path='' as $$
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
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,reason,policy,accounts)
 values(r.hotel,d,r.id,r.finished_at,clock_timestamp(),ok,case when not ok then 'source_scope_incomplete' end,coalesce(policy,'[]'),accounts)
 on conflict(hotel,day) do update set run_id=excluded.run_id,source_at=excluded.source_at,captured_at=excluded.captured_at,complete=excluded.complete,reason=excluded.reason,policy=excluded.policy,accounts=excluded.accounts;
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

-- Wrap the outermost publisher; retain every earlier publication/retained-zero/observation hook.
alter function public.ar_publish_refresh(uuid,integer) rename to publish_before_dashboard;
alter function public.publish_before_dashboard(uuid,integer) set schema ar_private;
revoke all on function ar_private.publish_before_dashboard(uuid,integer) from public,anon,authenticated,service_role;
create function public.ar_publish_refresh(p_run_id uuid,p_expected_accounts integer) returns void language plpgsql security definer set search_path='' as $$
declare prior text;
begin
 select status into prior from ar_private.refresh_runs where id=p_run_id;
 perform ar_private.publish_before_dashboard(p_run_id,p_expected_accounts);
 if prior is distinct from 'succeeded' then perform ar_private.dashboard_capture(p_run_id,p_expected_accounts);end if;
end$$;

-- Billing/history and actual SENT can occur after the source publication. Update only today's workflow fields.
create function ar_private.dashboard_workflow_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare d date:=(clock_timestamp() at time zone 'Asia/Bangkok')::date;cap numeric;bytes bigint;h text;a text;ids text[];n bigint;
begin
 if tg_table_name='ar_invoice_workflow' then h:=new.hotel;a:=new.account_id;ids:=array[new.invoice_id];
 else select e.hotel,e.account_id,e.invoice_ids into h,a,ids from public.ar_sent_events e where e.delivery_id=new.id and e.owner=new.owner;end if;
 select count(*) into n from ar_private.dashboard_daily_invoices where hotel=h and day=d and account_id=a and invoice_id=any(ids);
 if n=0 then return new;end if;
 perform pg_advisory_xact_lock(61749,1);
 bytes:=pg_total_relation_size('ar_private.dashboard_daily_invoices')+pg_total_relation_size('ar_private.dashboard_daily_captures')+pg_total_relation_size('ar_private.dashboard_capture_state');
 select floor((limits->>'databaseBytes')::numeric*(100-(limits->>'safetyPercent')::numeric)/100) into cap from ar_private.operations_budget where singleton and activated_at is not null;
 if not ar_private.dashboard_budget_allows(0,0,bytes+n*2048+8192,pg_database_size(current_database())+n*2048+8192,cap) then
  update ar_private.dashboard_daily_captures set complete=false,reason='history_budget_exceeded' where hotel=h and day=d;return new;
 end if;
 update ar_private.dashboard_daily_invoices snap set billing_required=c.billing_required,credit_term=c.credit_term,first_billing_date=c.first_billing_date,due_date=c.due_date,latest_stage=c.latest_stage,latest_stage_label=c.latest_stage_label,latest_sent_at=c.latest_sent_at
 from ar_private.dashboard_current_invoices c where snap.hotel=h and snap.account_id=a and snap.invoice_id=any(ids) and snap.day=d
 and c.hotel=snap.hotel and c.account_id=snap.account_id and c.invoice_id=snap.invoice_id;
 if found then update ar_private.dashboard_daily_captures set captured_at=clock_timestamp() where hotel=h and day=d;end if;return new;
exception when others then
 begin update ar_private.dashboard_daily_captures set complete=false,reason='workflow_capture_failed' where hotel=h and day=d;exception when others then null;end;return new;
end$$;
create trigger dashboard_capture_workflow after insert or update on public.ar_invoice_workflow for each row execute function ar_private.dashboard_workflow_capture();
-- SENT evidence is inserted before the delivery is finalized. Read it only after this final state transition.
create trigger dashboard_capture_confirmed_sent after update of state on ar_private.mail_deliveries for each row when(old.state is distinct from new.state and new.state='sent') execute function ar_private.dashboard_workflow_capture();

create function ar_private.dashboard_metric_membership(p_open numeric,p_verified boolean,p_billing boolean,p_credit integer,p_first date,p_due date,p_age integer,p_day date) returns text[] language sql immutable set search_path='' as $$
 select case when p_open>0 and p_verified then array_remove(array[
 'open',case when p_billing and p_first<=p_day then 'billed' end,
 case when p_billing and (p_first is null or p_first>p_day) then 'unbilled' end,
 case when not p_billing then 'not_required' end,case when p_billing is null or p_credit is null then 'setup' end,
 case when p_due<p_day then 'past_due' end,case when p_age>60 then 'over60' end,
 case when p_age>60 and p_billing and (p_first is null or p_first>p_day) then 'over60_unbilled' end],null) else '{}'::text[] end
$$;

create function public.ar_dashboard_balances(p_actor uuid,p_as_of date,p_hotel text default null,p_account text default null,p_type text default null,p_metric text default null,p_stage text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Bangkok')::date;mode text;missing jsonb;source_at timestamptz;capture_at timestamptz;complete boolean;result jsonb;reason text;policy jsonb;
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
  select coalesce(jsonb_agg(h.hotel order by h.hotel) filter(where s.status is distinct from 'succeeded' or s.last_success_at is null),'[]'),min(s.last_success_at),max(s.last_success_at)
  into missing,source_at,capture_at from(values('KAT'::text),('TSK'::text))h(hotel) left join public.ar_refresh_state s on s.hotel=h.hotel where p_hotel is null or h.hotel=p_hotel;
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
 select jsonb_build_object('asOfDate',p_as_of,'mode',mode,'capturedAt',capture_at,'sourceAt',source_at,'complete',q.valid,'missingHotels',missing,'reason',coalesce(reason,case when not q.valid then 'source_scope_incomplete' end),
 'metrics',(select jsonb_agg(jsonb_build_object('key',key,'count',count,'amount',amount) order by ordinality) from metrics),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',label,'count',count,'amount',amount) order by ordinal,key) from stages),'[]'),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountNo',account_no,'accountName',account_name,'accountType',account_type,'invoiceId',invoice_id,'invoiceNo',invoice_no,'folioNo',folio_no,'guest',guest,'transactionDate',transaction_date,'open',ar_private.financial_money(open),'original',ar_private.financial_money(original),'age',age,'billingRequired',billing_required,'firstBillingDate',first_billing_date,'dueDate',due_date,'latestStage',latest_stage,'latestStageLabel',latest_stage_label,'latestSentAt',latest_sent_at,'verified',verified) order by open desc,hotel,account_id,invoice_id) from(select * from matched order by open desc,hotel,account_id,invoice_id offset p_offset limit p_limit)p),'[]'),
 'total',(select count(*) from matched),'unverified',q.unverified) into result from quality q;
 return jsonb_strip_nulls(result-'rows'-'metrics'-'stages')||jsonb_build_object('capturedAt',capture_at,'sourceAt',source_at,'rows',result->'rows','metrics',result->'metrics','stages',result->'stages');
end$$;

revoke all on function ar_private.dashboard_today_guard(),ar_private.dashboard_budget_allows(bigint,bigint,bigint,bigint,numeric),ar_private.dashboard_capture(uuid,integer),ar_private.dashboard_workflow_capture(),ar_private.dashboard_metric_membership(numeric,boolean,boolean,integer,date,date,integer,date) from public,anon,authenticated,service_role;
revoke all on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer),public.ar_publish_refresh(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer),public.ar_publish_refresh(uuid,integer) to service_role;

-- Payment transaction dates define the cohort. Applications remain their currently observed mapping.
create function public.ar_dashboard_payment_invoices(p_actor uuid,p_from date,p_to date,p_hotel text default null,p_account text default null,p_type text default null,p_offset integer default 0,p_limit integer default 50)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare coverage boolean;result jsonb;source_at timestamptz;account_known boolean;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from<date '0001-01-01' or p_to>date '9999-12-31' or p_from>p_to or p_to-p_from>3660
  or p_hotel is not null and p_hotel not in('KAT','TSK') or p_account is not null and (p_hotel is null or length(p_account) not between 1 and 200 or p_account<>btrim(p_account) or p_account~'[[:cntrl:]]')
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','dashboard_invalid');end if;
 select not exists(select 1 from(values('KAT'::text),('TSK'::text))h(hotel) cross join generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d
  where (p_hotel is null or h.hotel=p_hotel) and not exists(select 1 from ar_private.financial_publications pub where pub.hotel=h.hotel and pub.period_complete and d::date between pub.source_from and pub.source_to)) into coverage;
 account_known:=p_account is null or exists(select 1 from ar_private.financial_accounts where hotel=p_hotel and account_id=p_account);
 select min(latest) into source_at from(select h.hotel,max(pub.published_at) as latest from(values('KAT'::text),('TSK'::text))h(hotel)
  left join ar_private.financial_publications pub on pub.hotel=h.hotel and pub.source_from<=p_to and pub.source_to>=p_from where p_hotel is null or h.hotel=p_hotel group by h.hotel)s;
 with payments as materialized(
  select p.*,c.name as account_name,c.type as account_type,
   coalesce(p.source_status='observed' and p.source_date is not null and p.amount is not null and p.applied_amount is not null
    and p.source_data->>'transfer'='none_reported' and m.unknowns=0 and m.amount=-p.applied_amount,true=false) as mapping_verified
  from ar_private.financial_payments p join ar_private.financial_accounts c on c.hotel=p.hotel and c.account_id=p.account_id
  cross join lateral(select coalesce(sum(a.applied_amount),0) as amount,count(*) filter(where a.applied_amount is null or a.source_status<>'observed' or a.last_observed_at<p.last_observed_at
   or i.transaction_id is null or i.source_status<>'observed' or i.source_data->>'entryClassification' is null or i.source_data->>'entryClassification'='unclassified' or i.source_data->>'collectionRole'='unverified') as unknowns
   from ar_private.financial_applications a left join ar_private.financial_invoice_entries i on i.hotel=a.hotel and i.account_id=a.account_id and i.transaction_id=a.invoice_id
   where a.hotel=p.hotel and a.account_id=p.account_id and a.payment_id=p.transaction_id)m
  where (p_hotel is null or p.hotel=p_hotel) and (p_account is null or p.account_id=p_account) and (p_type is null or c.type=p_type)
   and (p.source_date is null or p.source_date between p_from and p_to)
 ),quality as(select coverage and account_known and count(*) filter(where not mapping_verified)=0 as complete,count(*) filter(where not mapping_verified) as unknowns,
   case when coverage and account_known and count(*) filter(where not mapping_verified)=0 then ar_private.financial_money(coalesce(sum(-amount) filter(where amount>0),0)) end as corrections from payments),
 linked as materialized(
  select p.hotel,p.account_id,p.account_name,p.account_type,a.invoice_id,i.source_data->>'invoiceNo' as invoice_no,i.source_data->>'folioNo' as folio_no,
   a.applied_amount,p.transaction_id as payment_id,p.amount<0 and a.applied_amount>0 as credit_payment,p.mapping_verified and a.source_status='observed' and i.source_status='observed' as verified
  from payments p join ar_private.financial_applications a on a.hotel=p.hotel and a.account_id=p.account_id and a.payment_id=p.transaction_id
  join ar_private.financial_invoice_entries i on i.hotel=a.hotel and i.account_id=a.account_id and i.transaction_id=a.invoice_id
  where (p.amount<0 and a.applied_amount>0 or p.amount>0 and a.applied_amount<0) and i.source_data->>'entryClassification'='invoice' and i.source_data->>'collectionRole' in('standalone','parent')
 ),grouped as materialized(select hotel,account_id,account_name,account_type,invoice_id,invoice_no,folio_no,bool_and(verified) as verified,
   case when bool_and(verified) then sum(applied_amount) end as amount,count(distinct payment_id) filter(where credit_payment) as payment_count from linked group by hotel,account_id,account_name,account_type,invoice_id,invoice_no,folio_no
   having sum(applied_amount)>0 and count(*) filter(where credit_payment)>0)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('hotel',hotel,'accountId',account_id,'accountName',account_name,'accountType',account_type,'invoiceId',invoice_id,'invoiceNo',invoice_no,'folioNo',folio_no,'amount',ar_private.financial_money(amount),'paymentCount',payment_count,'verified',verified) order by hotel,account_id,invoice_id) from(select * from grouped order by hotel,account_id,invoice_id offset p_offset limit p_limit)p),'[]'),
  'total',(select count(*) from grouped),'summary',jsonb_build_object('count',case when q.complete then (select count(*) from grouped where verified) end,'amount',case when q.complete then ar_private.financial_money((select coalesce(sum(amount),0) from grouped)) end,'signedCorrections',q.corrections),
  'complete',q.complete,'reason',case when not account_known then 'account_scope_unavailable' when not coverage then 'payment_source_coverage_missing' when not q.complete then 'payment_mapping_unavailable' end,'sourceAt',source_at,'unknownMappings',q.unknowns,'amountBasis','current_allocation_for_payment_date_cohort') into result from quality q;
 if result->'reason'='null'::jsonb then result:=result-'reason';end if;return result;
end$$;
revoke all on function public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer) to service_role;
