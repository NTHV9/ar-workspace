-- Private, replaceable report summaries. Source ledgers and business history are untouched.
create table ar_private.period_summary_generation(singleton boolean primary key default true check(singleton), revision bigint not null default 1);
insert into ar_private.period_summary_generation(singleton) values(true);
create table ar_private.period_summary_cache(
 owner uuid not null,region text not null check(region in('phuket','khao-lak')),
 date_from date not null,date_to date not null,account_type text not null default '',segment text not null,
 generation bigint not null,computed_at timestamptz not null,expires_at timestamptz not null,preset boolean not null,
 value jsonb not null check(octet_length(value::text)<=131072),
 primary key(owner,region,date_from,date_to,account_type,segment)
);
revoke all on ar_private.period_summary_generation,ar_private.period_summary_cache from public,anon,authenticated,service_role;
alter table ar_private.period_summary_generation enable row level security;
alter table ar_private.period_summary_cache enable row level security;
create function ar_private.invalidate_period_summaries() returns trigger language plpgsql security definer set search_path='' as $$
begin update ar_private.period_summary_generation set revision=revision+1 where singleton;return null;end $$;
revoke all on function ar_private.invalidate_period_summaries() from public,anon,authenticated,service_role;
-- Statement-level invalidation is transactional: rollback never invalidates a committed cache.
-- Stage/work tables do not invalidate summaries until their publication reaches these source tables.
do $$ declare name text;begin
 foreach name in array array[
 'public.ar_accounts','public.ar_invoices','public.ar_invoice_workflow','public.ar_account_settings','public.ar_refresh_state','public.ar_sent_events',
 'ar_private.external_billing_records','ar_private.collection_policy_head','ar_private.collection_policy_versions',
 'ar_private.dashboard_daily_captures','ar_private.dashboard_daily_invoices','ar_private.dashboard_capture_state',
 'ar_private.financial_accounts','ar_private.financial_invoice_entries','ar_private.financial_payments','ar_private.financial_applications','ar_private.financial_publications'
 ] loop
  execute format('create trigger ar_invalidate_period_summaries after insert or update or delete or truncate on %s for each statement execute function ar_private.invalidate_period_summaries()',name::regclass);
 end loop;
end $$;
create trigger ar_invalidate_period_sent after update of state on ar_private.mail_deliveries for each row when(old.state is distinct from new.state and (old.state='sent' or new.state='sent')) execute function ar_private.invalidate_period_summaries();
create trigger ar_invalidate_period_deleted_sent after delete on ar_private.mail_deliveries for each row when(old.state='sent') execute function ar_private.invalidate_period_summaries();

create function public.ar_dashboard_region_cached_segment(p_actor uuid,p_from date,p_to date,p_type text,p_region text,p_segment text)
 returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare g bigint;current_g bigint;v jsonb;cached ar_private.period_summary_cache;stamp timestamptz;cap numeric;d date:=(now() at time zone 'Asia/Bangkok')::date;is_preset boolean;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_region is null or p_region not in('phuket','khao-lak') or p_segment is null or p_segment not in('balances','activity','external','entries','payments','paid')
 or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from<date '0001-01-01' or p_from>p_to or p_to>d or p_to-p_from>3660
 or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]') then return jsonb_build_object('error','dashboard_invalid');end if;
 select revision into g from ar_private.period_summary_generation where singleton;
 select * into cached from ar_private.period_summary_cache where owner=p_actor and region=p_region and date_from=p_from and date_to=p_to and account_type=coalesce(p_type,'') and segment=p_segment;
 if found and cached.generation=g and cached.expires_at>clock_timestamp() then return cached.value;end if;
 -- Coalesce simultaneous cold requests for this exact comparison group only.
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('period-summary',p_actor,p_region,p_from,p_to,p_type,p_segment)::text,0));
 select revision into g from ar_private.period_summary_generation where singleton;
 select * into cached from ar_private.period_summary_cache where owner=p_actor and region=p_region and date_from=p_from and date_to=p_to and account_type=coalesce(p_type,'') and segment=p_segment;
 if found and cached.generation=g and cached.expires_at>clock_timestamp() then return cached.value;end if;
 v:=public.ar_dashboard_region_segment(p_actor,p_from,p_to,p_type,p_region,p_segment);
 if v?'error' or v->'total'->p_segment is null or v->'total'->p_segment='null'::jsonb
 or exists(select 1 from jsonb_array_elements(v->'hotels') h where h->p_segment is null or h->p_segment='null'::jsonb) then return v;end if;
 -- Preserve incomplete coverage as-is; successful reading does not imply complete financial evidence.
 if octet_length(v::text)>131072 then return v;end if;
 select floor((limits->>'databaseBytes')::numeric*(100-(limits->>'safetyPercent')::numeric)/100) into cap from ar_private.operations_budget where singleton and activated_at is not null and not blocked;
 if cap is null or pg_database_size(current_database())+octet_length(v::text)*2+16384>cap then return v;end if;
 begin
 -- Serialize only bounded eviction/upsert, never the expensive source query.
 perform pg_advisory_xact_lock(hashtextextended('period-summary-capacity',0));
 select revision into current_g from ar_private.period_summary_generation where singleton;
 if current_g<>g then return v;end if;
 stamp:=clock_timestamp();
 is_preset:=p_type is null and ((p_to=d and p_from in(d,date_trunc('month',d)::date)) or (p_from=(date_trunc('month',d)-interval '1 month')::date and p_to=date_trunc('month',d)::date-1));
 delete from ar_private.period_summary_cache where expires_at<=stamp;
 delete from ar_private.period_summary_cache where (owner,region,date_from,date_to,account_type,segment) in(
  select owner,region,date_from,date_to,account_type,segment from ar_private.period_summary_cache
  order by preset desc,computed_at desc,owner,region,date_from,date_to,account_type,segment offset 191
 );
 insert into ar_private.period_summary_cache values(p_actor,p_region,p_from,p_to,coalesce(p_type,''),p_segment,g,stamp,stamp+case when is_preset then interval '1 day' else interval '30 minutes' end,is_preset,v)
 on conflict(owner,region,date_from,date_to,account_type,segment) do update set generation=excluded.generation,computed_at=excluded.computed_at,expires_at=excluded.expires_at,preset=excluded.preset,value=excluded.value;
 exception when others then return v;end;
 return v;
end $$;

create function public.ar_period_summary_plan(p_region text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;g bigint;d date:=(now() at time zone 'Asia/Bangkok')::date;items jsonb;begin
 if p_region is not null and p_region not in('phuket','khao-lak') then return jsonb_build_object('error','dashboard_invalid');end if;
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then return jsonb_build_object('actor',null,'tasks','[]'::jsonb);end if;
 select revision into g from ar_private.period_summary_generation where singleton;
 with ranges as(select distinct * from(values(d,d),(date_trunc('month',d)::date,d),((date_trunc('month',d)-interval '1 month')::date,date_trunc('month',d)::date-1)) v(f,t)),
 wanted as(select region,f,t,segment from unnest(array['phuket','khao-lak']) r(region) cross join ranges cross join unnest(array['entries','activity','balances','external','payments','paid']) s(segment) where p_region is null or region=p_region)
 select coalesce(jsonb_agg(jsonb_build_object('region',w.region,'from',w.f,'to',w.t,'segment',w.segment) order by w.region,w.t desc,w.f desc,w.segment),'[]') into items
 from wanted w where not exists(select 1 from ar_private.period_summary_cache c where c.owner=actor and c.region=w.region and c.date_from=w.f and c.date_to=w.t and c.account_type='' and c.segment=w.segment and c.generation=g and c.expires_at>clock_timestamp());
 return jsonb_build_object('actor',actor,'tasks',items);
end $$;
create function public.ar_period_summary_stats() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('entries',count(*),'payloadBytes',coalesce(sum(octet_length(value::text)),0),'storageBytes',pg_total_relation_size('ar_private.period_summary_cache')+pg_total_relation_size('ar_private.period_summary_generation'),
 'currentEntries',count(*) filter(where generation=(select revision from ar_private.period_summary_generation where singleton) and expires_at>clock_timestamp()),'maxEntries',192,'maxPayloadBytesPerEntry',131072) from ar_private.period_summary_cache;
$$;
revoke all on function public.ar_dashboard_region_cached_segment(uuid,date,date,text,text,text),public.ar_period_summary_plan(text),public.ar_period_summary_stats() from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_region_cached_segment(uuid,date,date,text,text,text),public.ar_period_summary_plan(text),public.ar_period_summary_stats() to service_role;
