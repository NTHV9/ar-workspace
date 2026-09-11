-- Reports are projections of verified delivery evidence and current OPERA facts.
-- Existing events retain unknown account types; today's type is never backfilled as history.
alter table public.ar_sent_events add column account_name_recorded text, add column account_type_recorded text;

create function ar_private.capture_sent_report_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select m.snapshot->'draft'->>'account_name' into new.account_name_recorded from ar_private.mail_deliveries m where m.id=new.delivery_id and m.owner=new.owner;
 select a.type into new.account_type_recorded from public.ar_accounts a where a.hotel=new.hotel and a.id=new.account_id;
 return new;
end $$;
create trigger ar_capture_sent_report_context before insert on public.ar_sent_events for each row execute function ar_private.capture_sent_report_context();
revoke all on function ar_private.capture_sent_report_context() from public,anon,authenticated;

create function ar_private.preserve_sent_report_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='ar_sent_events' then raise exception 'sent_evidence_immutable';end if;
 if old.state='sent' then raise exception 'sent_evidence_immutable';end if;
 return new;
end $$;
create trigger ar_preserve_sent_event before update or delete on public.ar_sent_events for each row execute function ar_private.preserve_sent_report_evidence();
create trigger ar_preserve_sent_manifest before update of snapshot,owner,mode,stage on ar_private.mail_deliveries for each row execute function ar_private.preserve_sent_report_evidence();
revoke all on function ar_private.preserve_sent_report_evidence() from public,anon,authenticated;

create view ar_private.report_sent_invoices as
 select e.owner,e.delivery_id,e.hotel,e.account_id,ids.invoice_id,e.sent_at,(e.sent_at at time zone 'Asia/Bangkok')::date as sent_date,
 coalesce(e.account_name_recorded,m.snapshot->'draft'->>'account_name',e.account_id) as account_name,
 coalesce(e.account_type_recorded,'Not recorded') as account_type,
 e.purpose,e.stage,case when e.purpose='billing' then case when w.fact is null then 'Billing classification unavailable' when w.fact->>'first_billing_date' is null then 'First billing' else 'Rebilling' end else e.stage end as kind,
 manifest.item->>'invoice_no' as invoice_no,manifest.item->>'folio_no' as folio_no,
 case when jsonb_typeof(manifest.item->'open')='number' then (manifest.item->>'open')::numeric else null end as amount,
 w.fact->>'first_billing_date' as first_billing_date_before_send
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in ('send','draft')
 cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 left join lateral (select value as item from jsonb_array_elements(m.snapshot->'manifest') where value->>'id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) manifest on true
 left join lateral (select value as fact from jsonb_array_elements(m.snapshot->'workflow') where value->>'invoice_id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) w on true;
revoke all on ar_private.report_sent_invoices from public,anon,authenticated;
create index ar_sent_events_report_date on public.ar_sent_events(owner,sent_at desc,delivery_id);

create function public.ar_reports_read(p_actor uuid,p_mode text,p_hotel text default null,p_account text default null,p_type text default null,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 50,p_invoice text default null,p_kind text default null)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','reports_forbidden');end if;
 if p_mode not in ('activity','current','options') or p_mode is null or p_hotel is not null and p_hotel not in ('KAT','TSK') or p_account is not null and p_hotel is null or p_invoice is not null and (p_account is null or p_hotel is null) or p_from>p_to or p_limit is null or p_limit<1 or p_limit>200 or p_offset is null or p_offset<0 then return jsonb_build_object('error','reports_invalid');end if;
 if p_mode='options' then
  with options as (
   select hotel,id as account_id,name as account_name,type as account_type from public.ar_accounts
   union select hotel,account_id,account_name,account_type from ar_private.report_sent_invoices where owner=p_actor
  ), filtered as (select * from options where p_hotel is null or hotel=p_hotel)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(o)) from (select * from filtered order by hotel,account_name,account_id,account_type offset p_offset limit p_limit) o),'[]'::jsonb),'total',(select count(*) from filtered),'offset',p_offset,'limit',p_limit) into result;
 elsif p_mode='activity' then
  with matched as materialized (
   select * from ar_private.report_sent_invoices where owner=p_actor and (p_hotel is null or hotel=p_hotel) and (p_account is null or account_id=p_account) and (p_type is null or account_type=p_type) and (p_from is null or sent_date>=p_from) and (p_to is null or sent_date<=p_to) and (p_invoice is null or invoice_id=p_invoice) and (p_kind is null or kind=p_kind)
  ), daily as (select sent_date,count(*) as invoices,count(distinct delivery_id) as messages,case when count(*)=count(amount) then sum(amount) end as amount from matched group by sent_date), kinds as (select kind,count(*) as invoices,case when count(*)=count(amount) then sum(amount) end as amount from matched group by kind)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)-'owner') from (select * from matched order by sent_at desc,delivery_id desc,invoice_id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from matched),'offset',p_offset,'limit',p_limit,
   'summary',jsonb_build_object('invoices',(select count(*) from matched),'uniqueInvoices',(select count(distinct (hotel,account_id,invoice_id)) from matched),'messages',(select count(distinct delivery_id) from matched),'amount',(select case when count(*)=count(amount) then coalesce(sum(amount),0) end from matched),'missingAmounts',(select count(*) from matched where amount is null),'daily',coalesce((select jsonb_agg(to_jsonb(d) order by sent_date desc) from daily d),'[]'::jsonb),'kinds',coalesce((select jsonb_agg(to_jsonb(k) order by kind) from kinds k),'[]'::jsonb))) into result;
 else
  with scoped_accounts as materialized (select * from public.ar_accounts where (p_hotel is null or hotel=p_hotel) and (p_account is null or id=p_account) and (p_type is null or type=p_type)), base as materialized (
   select c.*,coalesce(latest.kind,'No verified send') as latest_stage,latest.sent_at as last_sent_at
   from public.ar_collection_rows c join scoped_accounts a on a.hotel=c.hotel and a.id=c.account_id
   left join lateral (select kind,sent_at from ar_private.report_sent_invoices s where s.owner=p_actor and s.hotel=c.hotel and s.account_id=c.account_id and s.invoice_id=c.id order by (purpose='collection') desc,sent_at desc,delivery_id desc limit 1) latest on true
   where c.collection_role<>'child' and (p_invoice is null or c.id=p_invoice)
  ), matched as materialized (select * from base where p_kind is null or latest_stage=p_kind), stages as (select latest_stage as kind,count(*) as invoices,sum(open) as amount from matched group by latest_stage), hotels as (
   select hotel,count(*) as accounts,sum(open) as open,sum(over90) as over90,min(synced_at) as oldest_sync,count(*) filter(where verification_state<>'verified') as unverified_accounts from scoped_accounts group by hotel
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from matched order by open desc,hotel,account_id,id offset p_offset limit p_limit) r),'[]'::jsonb),'total',(select count(*) from matched),'offset',p_offset,'limit',p_limit,'asOf',(now() at time zone 'Asia/Bangkok')::date,
   'summary',jsonb_build_object('invoices',(select count(*) from matched),'amount',(select coalesce(sum(open),0) from matched),'unverified',(select count(*) from matched where verification_state<>'verified' or not collection_selectable),'unbilled',(select count(*) from matched where (workflow->>'billing_required')::boolean and workflow->>'first_billing_date' is null),'urgent',(select count(*) from matched where latest_stage='Final'),'stages',coalesce((select jsonb_agg(to_jsonb(s) order by kind) from stages s),'[]'::jsonb),'hotels',coalesce((select jsonb_agg(to_jsonb(h) order by hotel) from hotels h),'[]'::jsonb))) into result;
 end if;
 return result;
end $$;
revoke all on function public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text) to service_role;
