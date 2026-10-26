-- Normalized, private provider evidence. No provider observations or credentials are migration defaults.
create table ar_private.provider_alert_settings(provider text primary key check(provider in('cloudflare','supabase')),warning_percent integer not null check(warning_percent between 1 and 100),revision bigint not null default 0 check(revision>=0));
insert into ar_private.provider_alert_settings(provider,warning_percent) values('cloudflare',80),('supabase',50);
create table ar_private.provider_alert_commands(command_id uuid primary key,actor uuid not null references auth.users(id),input jsonb not null,result jsonb not null,recorded_at timestamptz not null default now());
create table ar_private.provider_snapshots(provider text not null references ar_private.provider_alert_settings(provider),revision bigint not null check(revision>0),snapshot jsonb not null check(octet_length(snapshot::text)<=65536),cycle_evidence jsonb,verified_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),primary key(provider,revision));
alter table ar_private.provider_alert_settings enable row level security;
alter table ar_private.provider_alert_commands enable row level security;
alter table ar_private.provider_snapshots enable row level security;
revoke all on ar_private.provider_alert_settings,ar_private.provider_alert_commands,ar_private.provider_snapshots from public,anon,authenticated,service_role;

-- Check the real trusted Worker actor independently of legacy workspace-owner mapping.
create function ar_private.provider_admin(p_actor uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then return false;end if;
 if headers?'x-ar-actor' and headers->>'x-ar-actor' is distinct from p_actor::text then return false;end if;
 return exists(select 1 from auth.users u join ar_private.access_members m on m.email=lower(u.email) where u.id=p_actor and lower(u.email)='ar@katathani.com' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and m.active and m.administrator);
exception when others then return false;
end$$;

create function ar_private.provider_snapshot_valid(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare m jsonb;k text;ids text[]:='{}';start_time timestamptz;end_time timestamptz;
begin
 if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>65536 or (s-array['planLabel','metrics'])<>'{}'::jsonb or not(s?'planLabel' and s?'metrics') or (s->'planLabel'<>'null'::jsonb and (jsonb_typeof(s->'planLabel')<>'string' or length(s->>'planLabel') not between 1 and 160)) or jsonb_typeof(s->'metrics') is distinct from 'array' or jsonb_array_length(s->'metrics') not between 1 and 64 then return false;end if;
 for m in select value from jsonb_array_elements(s->'metrics') loop
  if jsonb_typeof(m) is distinct from 'object' or (select count(*) from jsonb_object_keys(m))<>19 or (m-array['id','label','product','unit','used','included','scope','scopeLabel','periodStart','periodEnd','periodLabel','periodBasis','observedAt','verifiedAt','staleAfter','source','sourceLabel','precision','state'])<>'{}'::jsonb then return false;end if;
  -- 19 keys comprise the contract; checked below with exact membership.
  foreach k in array array['id','label','product','scopeLabel','periodLabel','verifiedAt','staleAfter','unit','scope','periodBasis','source','precision','state'] loop
   if jsonb_typeof(m->k) is distinct from 'string' or length(m->>k) not between 1 and 160 or m->>k ~ '[[:cntrl:]]' then return false;end if;
  end loop;
  if m->>'id' !~ '^[a-z][a-z0-9_-]{0,79}$' or m->>'id'=any(ids) then return false;end if;ids:=array_append(ids,m->>'id');
  if m->>'unit' not in('count','ms','bytes','GB','GB-month') or m->>'scope' not in('account','organization','project') or m->>'periodBasis' not in('billing-cycle','instantaneous','unknown') or m->>'source' not in('provider_snapshot','provider_api') or m->>'precision' not in('exact','rounded') or m->>'state' not in('available','stale') then return false;end if;
  if m->>'sourceLabel' is distinct from (case m->>'source' when 'provider_snapshot' then 'Last verified' else 'Provider API' end) then return false;end if;
  foreach k in array array['used','included'] loop
   if m->k<>'null'::jsonb and (jsonb_typeof(m->k)<>'number' or (m->>k)::numeric<0 or (m->>k)::numeric>1e30) then return false;end if;
  end loop;
  foreach k in array array['observedAt','verifiedAt','staleAfter','periodStart','periodEnd'] loop
   if m->k<>'null'::jsonb then
    if jsonb_typeof(m->k)<>'string' or m->>k !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$' or not isfinite((m->>k)::timestamptz) then return false;end if;
   end if;
  end loop;
  if (m->'observedAt'='null'::jsonb and m->'used'<>'null'::jsonb) or m->'verifiedAt'='null'::jsonb or m->'staleAfter'='null'::jsonb or (m->>'observedAt')::timestamptz>(m->>'verifiedAt')::timestamptz or (m->>'staleAfter')::timestamptz<=(m->>'verifiedAt')::timestamptz then return false;end if;
  if (m->'periodStart'='null'::jsonb) is distinct from (m->'periodEnd'='null'::jsonb) then return false;end if;
  if m->'periodStart'<>'null'::jsonb then
   start_time:=(m->>'periodStart')::timestamptz;end_time:=(m->>'periodEnd')::timestamptz;if start_time>=end_time or m->>'periodBasis'<>'billing-cycle' then return false;end if;
  end if;
 end loop;return true;
exception when others then return false;
end$$;

create function public.ar_provider_usage_read(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not ar_private.provider_admin(p_actor) then return jsonb_build_object('error','provider_forbidden');end if;
 select jsonb_build_object('providers',jsonb_agg(jsonb_build_object('provider',a.provider,'warningPercent',a.warning_percent,'settingsRevision',a.revision,'planLabel',s.snapshot->'planLabel','metrics',coalesce(s.snapshot->'metrics','[]'::jsonb)) order by a.provider)) into result from ar_private.provider_alert_settings a left join lateral(select snapshot from ar_private.provider_snapshots where provider=a.provider order by revision desc limit 1)s on true;
 return result;
end$$;

create function public.ar_provider_alert_save(p_actor uuid,p_provider text,p_warning_percent integer,p_expected_revision bigint,p_command_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_setting ar_private.provider_alert_settings;receipt ar_private.provider_alert_commands;input jsonb;result jsonb;
begin
 if not ar_private.provider_admin(p_actor) then return jsonb_build_object('error','provider_forbidden');end if;
 if p_provider is null or p_provider not in('cloudflare','supabase') or p_warning_percent is null or p_warning_percent not between 1 and 100 or p_expected_revision is null or p_expected_revision<0 or p_command_id is null then return jsonb_build_object('error','provider_invalid');end if;
 -- Serialize global command identities across both provider rows as well as same-provider updates.
 perform pg_advisory_xact_lock(18524012,2);
 input:=jsonb_build_object('provider',p_provider,'warningPercent',p_warning_percent,'expectedRevision',p_expected_revision);
 select * into receipt from ar_private.provider_alert_commands where command_id=p_command_id;
 if found then
  if receipt.actor is distinct from p_actor or receipt.input is distinct from input then return jsonb_build_object('error','provider_command_conflict');end if;return receipt.result;
 end if;
 select * into current_setting from ar_private.provider_alert_settings where provider=p_provider for update;
 result:=jsonb_build_object('provider',p_provider,'warningPercent',current_setting.warning_percent,'revision',current_setting.revision);
 if current_setting.revision<>p_expected_revision then result:=jsonb_build_object('error','provider_revision_conflict','latest',result);
 else
  update ar_private.provider_alert_settings set warning_percent=p_warning_percent,revision=revision+1 where provider=p_provider returning jsonb_build_object('provider',provider,'warningPercent',warning_percent,'revision',revision) into result;
 end if;
 insert into ar_private.provider_alert_commands(command_id,actor,input,result) values(p_command_id,p_actor,input,result);
 return result;
end$$;

-- Operator/service only. Browser APIs never call this RPC. Date-only cycle transitions
-- require verified nonoverlapping provider dates, without inventing timezone instants.
create function public.ar_provider_snapshot_write(p_actor uuid,p_provider text,p_expected_revision bigint,p_snapshot jsonb,p_cycle_evidence jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_snapshot ar_private.provider_snapshots;m jsonb;previous jsonb;cycle_changed boolean;
begin
 if not ar_private.provider_admin(p_actor) then return jsonb_build_object('error','provider_forbidden');end if;
 if p_provider is null or p_provider not in('cloudflare','supabase') or p_expected_revision is null or p_expected_revision<0 or not ar_private.provider_snapshot_valid(p_snapshot) then return jsonb_build_object('error','provider_snapshot_invalid');end if;
 if p_cycle_evidence is not null then
  if jsonb_typeof(p_cycle_evidence) is distinct from 'object' or octet_length(p_cycle_evidence::text)>1024 or (select count(*) from jsonb_object_keys(p_cycle_evidence))<>4 or (p_cycle_evidence-array['previousPeriodLabel','periodLabel','previousEndDate','startDate'])<>'{}'::jsonb or jsonb_typeof(p_cycle_evidence->'previousPeriodLabel') is distinct from 'string' or jsonb_typeof(p_cycle_evidence->'periodLabel') is distinct from 'string' or length(p_cycle_evidence->>'previousPeriodLabel') not between 1 and 160 or length(p_cycle_evidence->>'periodLabel') not between 1 and 160 or coalesce(p_cycle_evidence->>'previousEndDate','') !~ '^\d{4}-\d\d-\d\d$' or coalesce(p_cycle_evidence->>'startDate','') !~ '^\d{4}-\d\d-\d\d$' or (p_cycle_evidence->>'startDate')::date<(p_cycle_evidence->>'previousEndDate')::date then return jsonb_build_object('error','provider_cycle_conflict');end if;
 end if;
 perform 1 from ar_private.provider_alert_settings where provider=p_provider for update;
 select * into current_snapshot from ar_private.provider_snapshots where provider=p_provider order by revision desc limit 1;
 if coalesce(current_snapshot.revision,0)<>p_expected_revision then return jsonb_build_object('error','provider_revision_conflict');end if;
 if current_snapshot.snapshot is not null then
  -- Missing metrics cannot erase earlier evidence; unavailable source writes are rejected.
  if exists(select from jsonb_array_elements(current_snapshot.snapshot->'metrics') old where not exists(select from jsonb_array_elements(p_snapshot->'metrics') new where new->>'id'=old->>'id')) then return jsonb_build_object('error','provider_snapshot_invalid');end if;
  for m in select value from jsonb_array_elements(p_snapshot->'metrics') loop
   select value into previous from jsonb_array_elements(current_snapshot.snapshot->'metrics') where value->>'id'=m->>'id';
   if previous is null then continue;end if;
   if previous->'used'<>'null'::jsonb and m->'used'='null'::jsonb or previous->'included'<>'null'::jsonb and m->'included'='null'::jsonb then return jsonb_build_object('error','provider_snapshot_invalid');end if;
   if m->>'unit' is distinct from previous->>'unit' or m->>'scope' is distinct from previous->>'scope' or m->>'scopeLabel' is distinct from previous->>'scopeLabel' or m->>'product' is distinct from previous->>'product' or m->>'periodBasis' is distinct from previous->>'periodBasis' then return jsonb_build_object('error','provider_observation_conflict');end if;
   if coalesce((m->>'observedAt')::timestamptz,'-infinity'::timestamptz)<coalesce((previous->>'observedAt')::timestamptz,'-infinity'::timestamptz) or (m->>'verifiedAt')::timestamptz<(previous->>'verifiedAt')::timestamptz then return jsonb_build_object('error','provider_observation_conflict');end if;
   if (m->>'observedAt')::timestamptz=(previous->>'observedAt')::timestamptz and (m->'used' is distinct from previous->'used' or m->'included' is distinct from previous->'included') then return jsonb_build_object('error','provider_observation_conflict');end if;
   cycle_changed:=m->>'periodBasis'='billing-cycle' and (m->>'periodLabel' is distinct from previous->>'periodLabel' or m->'periodStart' is distinct from previous->'periodStart' or m->'periodEnd' is distinct from previous->'periodEnd');
   if cycle_changed then
    if m->'periodStart'<>'null'::jsonb and previous->'periodEnd'<>'null'::jsonb then
     if (m->>'periodStart')::timestamptz<(previous->>'periodEnd')::timestamptz then return jsonb_build_object('error','provider_cycle_conflict');end if;
    else
     if p_cycle_evidence is null or jsonb_typeof(p_cycle_evidence)<>'object' or (p_cycle_evidence-array['previousPeriodLabel','periodLabel','previousEndDate','startDate'])<>'{}'::jsonb or p_cycle_evidence->>'previousPeriodLabel' is distinct from previous->>'periodLabel' or p_cycle_evidence->>'periodLabel' is distinct from m->>'periodLabel' or coalesce(p_cycle_evidence->>'previousEndDate','') !~ '^\d{4}-\d\d-\d\d$' or coalesce(p_cycle_evidence->>'startDate','') !~ '^\d{4}-\d\d-\d\d$' or (p_cycle_evidence->>'startDate')::date<(p_cycle_evidence->>'previousEndDate')::date then return jsonb_build_object('error','provider_cycle_conflict');end if;
    end if;
   end if;
  end loop;
 end if;
 if p_cycle_evidence is not null and octet_length(p_cycle_evidence::text)>1024 then return jsonb_build_object('error','provider_cycle_conflict');end if;
 insert into ar_private.provider_snapshots(provider,revision,snapshot,cycle_evidence,verified_by) values(p_provider,p_expected_revision+1,p_snapshot,p_cycle_evidence,p_actor);
 return jsonb_build_object('provider',p_provider,'revision',p_expected_revision+1);
exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('error','provider_cycle_conflict');
end$$;
revoke all on function ar_private.provider_admin(uuid),ar_private.provider_snapshot_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ar_provider_usage_read(uuid),public.ar_provider_alert_save(uuid,text,integer,bigint,uuid),public.ar_provider_snapshot_write(uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ar_provider_usage_read(uuid),public.ar_provider_alert_save(uuid,text,integer,bigint,uuid),public.ar_provider_snapshot_write(uuid,text,bigint,jsonb,jsonb) to service_role;



