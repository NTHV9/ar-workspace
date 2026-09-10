create table ar_private.source_observation_state(singleton boolean primary key default true check(singleton),tracking_started_at timestamptz not null default clock_timestamp());
insert into ar_private.source_observation_state(singleton) values(true);
alter table ar_private.source_observation_state enable row level security;
revoke all on ar_private.source_observation_state from public,anon,authenticated,service_role;
-- Observations are not payment events. Capture only actual source publications.
create table ar_private.daily_ar_captures(
 hotel text not null check(hotel in('KAT','TSK')),day date not null,run_id uuid not null references ar_private.refresh_runs(id),source_at timestamptz not null,captured_at timestamptz not null,expected_accounts integer not null,complete boolean not null,
 primary key(hotel,day)
);
create table ar_private.daily_ar_accounts(
 hotel text not null,day date not null,account_id text not null,account_name text not null,account_type text not null,net_open numeric(18,2),over90 numeric(18,2),aging jsonb,source_at timestamptz,verified boolean not null,run_id uuid not null references ar_private.refresh_runs(id),
 primary key(hotel,day,account_id),foreign key(hotel,day) references ar_private.daily_ar_captures(hotel,day)
);
create table ar_private.invoice_balance_observations(
 id bigint generated always as identity primary key,hotel text not null,account_id text not null,invoice_id text not null,account_name text not null,account_type text not null,invoice_no text,
 kind text not null check(kind in('first_observed_zero','observed_cleared','observed_reopened')),previous_verified_at timestamptz,observed_at timestamptz not null,previous_open numeric(18,2),observed_open numeric(18,2) not null,
 unique(hotel,account_id,invoice_id,observed_at,kind)
);
create index invoice_balance_observations_scope on ar_private.invoice_balance_observations(hotel,account_id,observed_at desc,id);
alter table ar_private.daily_ar_captures enable row level security;
alter table ar_private.daily_ar_accounts enable row level security;
alter table ar_private.invoice_balance_observations enable row level security;
revoke all on ar_private.daily_ar_captures,ar_private.daily_ar_accounts,ar_private.invoice_balance_observations from public,anon,authenticated,service_role;
create trigger invoice_balance_observations_immutable before update or delete on ar_private.invoice_balance_observations for each row execute function ar_private.financial_immutable();
create function ar_private.capture_invoice_balance_observation() returns trigger language plpgsql security definer set search_path='' as $$
declare transition text;
begin
 if tg_op='INSERT' then if new.last_open=0 then transition:='first_observed_zero';end if;
 elsif old.last_open>0 and new.last_open=0 then transition:='observed_cleared';
 elsif old.last_open=0 and new.last_open>0 then transition:='observed_reopened';end if;
 if transition is not null then
  insert into ar_private.invoice_balance_observations(hotel,account_id,invoice_id,account_name,account_type,invoice_no,kind,previous_verified_at,observed_at,previous_open,observed_open)
  select new.hotel,new.account_id,new.invoice_id,a.name,a.type,i.invoice_no,transition,case when tg_op='UPDATE' then old.verified_at end,new.verified_at,case when tg_op='UPDATE' then old.last_open end,new.last_open
  from public.ar_accounts a join public.ar_invoices i on i.hotel=a.hotel and i.account_id=a.id and i.id=new.invoice_id where a.hotel=new.hotel and a.id=new.account_id and i.collection_role in('standalone','parent') on conflict do nothing;
 end if;return new;
end$$;
create trigger ar_capture_balance_observation after insert or update on ar_private.invoice_verified_balances for each row execute function ar_private.capture_invoice_balance_observation();

alter function public.ar_publish_refresh(uuid,integer) rename to publish_refresh_before_daily_capture;
alter function public.publish_refresh_before_daily_capture(uuid,integer) set schema ar_private;
revoke all on function ar_private.publish_refresh_before_daily_capture(uuid,integer) from public,anon,authenticated,service_role;
create function public.ar_publish_refresh(p_run_id uuid,p_expected_accounts integer) returns void language plpgsql security definer set search_path='' as $$
declare r ar_private.refresh_runs;d date;complete boolean;
begin
 perform ar_private.publish_refresh_before_daily_capture(p_run_id,p_expected_accounts);
 select * into r from ar_private.refresh_runs where id=p_run_id;
 if r.status<>'succeeded' or r.account_id is not null or not exists(select 1 from public.ar_refresh_state where hotel=r.hotel and run_id=r.id and status='succeeded') then return;end if;
 d:=(r.finished_at at time zone 'Asia/Bangkok')::date;
 if exists(select 1 from ar_private.daily_ar_captures where hotel=r.hotel and day=d and (run_id=p_run_id or source_at>r.finished_at)) then return;end if;
 select coalesce(bool_and(verification_state='verified' and synced_at>=r.started_at),true) and count(*)=p_expected_accounts into complete from public.ar_accounts where hotel=r.hotel;
 insert into ar_private.daily_ar_captures(hotel,day,run_id,source_at,captured_at,expected_accounts,complete) values(r.hotel,d,r.id,r.finished_at,clock_timestamp(),p_expected_accounts,complete)
 on conflict(hotel,day) do update set run_id=excluded.run_id,source_at=excluded.source_at,captured_at=excluded.captured_at,expected_accounts=excluded.expected_accounts,complete=excluded.complete;
 insert into ar_private.daily_ar_accounts(hotel,day,account_id,account_name,account_type,net_open,over90,aging,source_at,verified,run_id)
 select a.hotel,d,a.id,a.name,a.type,a.open,a.over90,a."agingBuckets",a.synced_at,a.verification_state='verified' and a.synced_at>=r.started_at,r.id from public.ar_accounts a where a.hotel=r.hotel
 on conflict(hotel,day,account_id) do update set account_name=excluded.account_name,account_type=excluded.account_type,net_open=excluded.net_open,over90=excluded.over90,aging=excluded.aging,source_at=excluded.source_at,verified=excluded.verified,run_id=excluded.run_id;
end$$;
revoke all on function public.ar_publish_refresh(uuid,integer) from public,anon,authenticated;
grant execute on function public.ar_publish_refresh(uuid,integer) to service_role;
revoke all on function ar_private.capture_invoice_balance_observation() from public,anon,authenticated,service_role;

create function public.ar_observation_reports(p_actor uuid,p_view text,p_hotel text default null,p_account text default null,p_type text default null,p_from date default null,p_to date default null,p_over60 boolean default false,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','observations_forbidden');end if;
 if p_view is null or p_view not in('daily_ar','balance_observations','timing','options') or p_hotel is not null and p_hotel not in('KAT','TSK') or p_account is not null and p_hotel is null or p_from>p_to or p_to-p_from>3660 or p_over60 is null or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 200 then return jsonb_build_object('error','observations_invalid');end if;
 if p_view='options' then
  with all_options as(select hotel,id as account_id,name as account_name,type as account_type from public.ar_accounts union select hotel,account_id,account_name,account_type from ar_private.daily_ar_accounts union select hotel,account_id,account_name,account_type from ar_private.invoice_balance_observations),filtered as materialized(select * from all_options where (p_hotel is null or hotel=p_hotel) and (p_account is null or account_id=p_account) and (p_type is null or account_type=p_type))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x) order by hotel,account_name,account_type,account_id) from(select * from filtered order by hotel,account_name,account_type,account_id offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from filtered),'summary','{}'::jsonb) into result;
 elsif p_view='daily_ar' then
  with matched as materialized(select a.*,c.captured_at,c.source_at as publication_at,c.complete as hotel_complete,c.expected_accounts from ar_private.daily_ar_accounts a join ar_private.daily_ar_captures c on c.hotel=a.hotel and c.day=a.day
   where (p_hotel is null or a.hotel=p_hotel) and (p_account is null or a.account_id=p_account) and (p_type is null or a.account_type=p_type) and (p_from is null or a.day>=p_from) and (p_to is null or a.day<=p_to)),
  daily as(select day,hotel,count(*) as accounts,count(*) filter(where not verified) as unverified,max(publication_at) as publication_at,case when bool_and(verified) and (p_account is not null or p_type is not null or bool_and(hotel_complete)) then ar_private.financial_money(sum(net_open)) end as net_open,case when bool_and(verified) then ar_private.financial_money(sum(over90)) end as over90 from matched group by day,hotel)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('net_open',ar_private.financial_money(x.net_open),'over90',ar_private.financial_money(x.over90)) order by day desc,hotel,account_id) from (select * from matched order by day desc,hotel,account_id offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from matched),'summary',jsonb_build_object('days',(select count(distinct day) from matched),'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day,hotel) from daily d),'[]'::jsonb),'basis','latest_actual_capture_per_thai_day')) into result;
 elsif p_view='balance_observations' then
  with matched as materialized(select *, (observed_at at time zone 'Asia/Bangkok')::date as observation_date from ar_private.invoice_balance_observations
   where (p_hotel is null or hotel=p_hotel) and (p_account is null or account_id=p_account) and (p_type is null or account_type=p_type) and (p_from is null or (observed_at at time zone 'Asia/Bangkok')::date>=p_from) and (p_to is null or (observed_at at time zone 'Asia/Bangkok')::date<=p_to))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('previous_open',ar_private.financial_money(x.previous_open),'observed_open',ar_private.financial_money(x.observed_open)) order by observed_at desc,id desc) from(select * from matched order by observed_at desc,id desc offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from matched),'summary',jsonb_build_object('cleared',(select count(*) from matched where kind='observed_cleared'),'reopened',(select count(*) from matched where kind='observed_reopened'),'firstObservedZero',(select count(*) from matched where kind='first_observed_zero'),'basis','observation_time_not_payment_time')) into result;
 else
  with matched as materialized(select i.hotel,i.account_id,i.id as invoice_id,i.invoice_no,i.folio_no,a.name as account_name,a.type as account_type,i.open,i.age as opera_age,i.verification_state,w.first_billing_date,w.due_date,w.last_reminder_date,
   case when w.billing_required and w.first_billing_date is null then (now() at time zone 'Asia/Bangkok')::date-w.base_date end as unbilled_days,
   w.first_billing_date-w.base_date as first_billing_delay,
   case when w.due_date is not null then greatest(0,(now() at time zone 'Asia/Bangkok')::date-w.due_date) end as overdue_days,
   (now() at time zone 'Asia/Bangkok')::date-w.last_reminder_date as since_reminder_days,
   w.billing_required and w.first_billing_date is null as unbilled,w.billing_required and w.first_billing_date is null and i.age>60 as unbilled_over60
   from public.ar_invoices i join public.ar_accounts a on a.hotel=i.hotel and a.id=i.account_id left join public.ar_invoice_workflow w on w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id
   where i.open>0 and i.collection_role in('standalone','parent') and (p_hotel is null or i.hotel=p_hotel) and (p_account is null or i.account_id=p_account) and (p_type is null or a.type=p_type)),
  filtered as materialized(select * from matched where not p_over60 or unbilled_over60)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('open',ar_private.financial_money(x.open)) order by opera_age desc nulls last,hotel,account_id,invoice_id) from(select * from filtered order by opera_age desc nulls last,hotel,account_id,invoice_id offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from filtered),
   'summary',jsonb_build_object('invoices',(select count(*) from filtered),'unbilled',(select count(*) from filtered where unbilled),'over60Unbilled',(select count(*) from filtered where unbilled_over60),'over60Amount',(select ar_private.financial_money(coalesce(sum(open),0)) from filtered where unbilled_over60),'unknownAge',(select count(*) from matched where unbilled and opera_age is null),'sourceUnverified',(select count(*) from filtered where verification_state<>'verified'),'basis','current_recorded_dates_and_opera_age')) into result;
 end if;return result||jsonb_build_object('view',p_view,'trackingStartedAt',(select tracking_started_at from ar_private.source_observation_state where singleton));
end$$;
revoke all on function public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer) to service_role;
