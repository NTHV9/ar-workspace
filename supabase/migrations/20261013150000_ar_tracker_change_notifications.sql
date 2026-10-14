-- Service-only notification hints. No provider token or business payload is retained.
create table ar_private.tracker_watch_channels(
 channel uuid primary key,region text not null references ar_private.tracker_bindings(region),owner uuid not null,file_id text not null,
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),resource_id text,
 created_at timestamptz not null default now(),expires_at timestamptz,
 state text not null default 'prepared' check(state in('prepared','active')),
 early_sync boolean not null default false,last_message numeric(20,0) not null default 0
);
create index tracker_watch_region on ar_private.tracker_watch_channels(region,expires_at);
create table ar_private.tracker_wakes(
 region text primary key references ar_private.tracker_bindings(region),id uuid not null unique default gen_random_uuid(),
 owner uuid not null,file_id text not null,generation bigint not null default 1,consumed bigint not null default 0,
 running_generation bigint,running_until timestamptz,first_pending_at timestamptz not null default now(),
 due_at timestamptz not null default now(),failures integer not null default 0
);
alter table ar_private.tracker_watch_channels enable row level security;
alter table ar_private.tracker_wakes enable row level security;
revoke all on ar_private.tracker_watch_channels,ar_private.tracker_wakes from public,anon,authenticated,service_role;

create function ar_private.tracker_wake_enqueue(p_region text,p_owner uuid,p_file text) returns uuid language plpgsql security definer set search_path='' as $$
declare w ar_private.tracker_wakes;begin
 select * into w from ar_private.tracker_wakes where region=p_region for update;
 if w.region is null then
  insert into ar_private.tracker_wakes(region,owner,file_id) values(p_region,p_owner,p_file) returning * into w;
 elsif w.owner is distinct from p_owner or w.file_id is distinct from p_file then
  update ar_private.tracker_wakes set id=gen_random_uuid(),owner=p_owner,file_id=p_file,generation=1,consumed=0,running_generation=null,running_until=null,first_pending_at=now(),due_at=now(),failures=0 where region=p_region returning * into w;
 else
  update ar_private.tracker_wakes set generation=generation+1,
   id=case when generation=consumed and running_generation is null then gen_random_uuid() else id end,
   first_pending_at=case when generation=consumed then now() else first_pending_at end,
   due_at=case when generation=consumed then now() when running_generation is null and failures=0 then least(now(),first_pending_at+interval '15 seconds') else due_at end
   where region=p_region returning * into w;
 end if;return w.id;
end $$;
revoke all on function ar_private.tracker_wake_enqueue(text,uuid,text) from public,anon,authenticated,service_role;

create function public.ar_tracker_watch_prepare(p_region text,p_channel uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.tracker_bindings;begin
 if p_channel is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'tracker_watch_invalid';end if;
 select * into b from ar_private.tracker_bindings where region=p_region for update;
 if b.region is null or not b.enabled or not b.bootstrap_confirmed or b.owner is distinct from ar_private.access_owner() then return jsonb_build_object('status','disabled');end if;
 if exists(select 1 from ar_private.tracker_watch_channels where region=p_region and owner=b.owner and file_id=b.file_id and state='active' and expires_at>now()+interval '2 hours') then return jsonb_build_object('status','current');end if;
 if exists(select 1 from ar_private.tracker_watch_channels where region=p_region and owner=b.owner and file_id=b.file_id and state='prepared' and created_at>now()-interval '10 minutes') then return jsonb_build_object('status','busy');end if;
 -- Only expired integration-owned registrations are pruned; active overlap survives.
 delete from ar_private.tracker_watch_channels where region=p_region and (expires_at<now() or (state='prepared' and created_at<now()-interval '1 day'));
 insert into ar_private.tracker_watch_channels(channel,region,owner,file_id,token_hash) values(p_channel,p_region,b.owner,b.file_id,p_token_hash);
 return jsonb_build_object('status','prepared','owner',b.owner,'fileId',b.file_id);
end $$;

create function public.ar_tracker_watch_activate(p_channel uuid,p_resource text,p_expiration timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.tracker_watch_channels;b ar_private.tracker_bindings;j uuid;begin
 if p_resource is null or length(p_resource) not between 1 and 256 or p_resource ~ '[[:cntrl:]]' or p_expiration is null or p_expiration<=now() or p_expiration>now()+interval '1 day 5 minutes' then raise exception 'tracker_watch_invalid';end if;
 select * into c from ar_private.tracker_watch_channels where channel=p_channel;
 select * into b from ar_private.tracker_bindings where region=c.region for update;
 select * into c from ar_private.tracker_watch_channels where channel=p_channel for update;
 if c.channel is null or not b.enabled or not b.bootstrap_confirmed or b.owner is distinct from c.owner or b.file_id is distinct from c.file_id or b.owner is distinct from ar_private.access_owner() then return jsonb_build_object('status','disabled');end if;
 if c.state='active' then
  if c.resource_id is distinct from p_resource or c.expires_at is distinct from p_expiration then raise exception 'tracker_watch_binding_changed';end if;
  return jsonb_build_object('status','active','region',c.region,'owner',c.owner);
 end if;
 update ar_private.tracker_watch_channels set state='active',resource_id=p_resource,expires_at=p_expiration where channel=p_channel;
 j:=ar_private.tracker_wake_enqueue(c.region,c.owner,c.file_id);
 return jsonb_build_object('status','active','region',c.region,'owner',c.owner,'id',j);
end $$;

create function public.ar_tracker_watch_notify(p_channel uuid,p_token_hash text,p_resource text,p_message text,p_state text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.tracker_watch_channels;b ar_private.tracker_bindings;j uuid;n numeric;begin
 if p_channel is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_resource is null or length(p_resource) not between 1 and 256 or p_resource ~ '[[:cntrl:]]' or p_message is null or p_message !~ '^[0-9]{1,20}$' or p_state is null or length(p_state)>32 then return jsonb_build_object('status','invalid');end if;
 n:=p_message::numeric;if n<=0 or n>18446744073709551615 then return jsonb_build_object('status','invalid');end if;
 select * into c from ar_private.tracker_watch_channels where channel=p_channel;
 select * into b from ar_private.tracker_bindings where region=c.region for update;
 select * into c from ar_private.tracker_watch_channels where channel=p_channel for update;
 if c.channel is null or c.token_hash<>p_token_hash or b.region is null or not b.enabled or not b.bootstrap_confirmed or b.owner is distinct from c.owner or b.file_id is distinct from c.file_id or b.owner is distinct from ar_private.access_owner() then return jsonb_build_object('status','invalid');end if;
 if p_state not in('sync','update','change') then return jsonb_build_object('status','ignored');end if;
 if c.state='prepared' then
  if p_state<>'sync' or c.created_at<now()-interval '10 minutes' then return jsonb_build_object('status','ignored');end if;
  update ar_private.tracker_watch_channels set early_sync=true where channel=p_channel;
  return jsonb_build_object('status','accepted');
 end if;
 if c.resource_id is distinct from p_resource or c.expires_at<=now() then return jsonb_build_object('status','invalid');end if;
 if n<=c.last_message then return jsonb_build_object('status','ignored');end if;
 update ar_private.tracker_watch_channels set last_message=n where channel=p_channel;
 j:=ar_private.tracker_wake_enqueue(c.region,c.owner,c.file_id);
 return jsonb_build_object('status','accepted','id',j,'region',c.region);
end $$;

create function public.ar_tracker_wake_pending() returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.tracker_bindings;r jsonb;begin
 -- Lock in the same order as callbacks; rotate crashed Workflow identities.
 for b in select * from ar_private.tracker_bindings order by region for update loop
  update ar_private.tracker_wakes set id=gen_random_uuid(),running_generation=null,running_until=null,due_at=now(),failures=least(failures+1,10) where region=b.region and running_generation is not null and running_until<=now();
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'region',w.region)),'[]') into r from ar_private.tracker_wakes w join ar_private.tracker_bindings binding using(region)
 where w.generation>w.consumed and w.running_generation is null and w.due_at<=now() and binding.enabled and binding.bootstrap_confirmed and w.owner=binding.owner and w.file_id=binding.file_id and binding.owner=ar_private.access_owner();return r;
end $$;

create function public.ar_tracker_wake_begin(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w ar_private.tracker_wakes;b ar_private.tracker_bindings;begin
 select * into w from ar_private.tracker_wakes where id=p_id;
 select * into b from ar_private.tracker_bindings where region=w.region for update;
 select * into w from ar_private.tracker_wakes where id=p_id for update;
 if w.id is null or b.region is null or not b.enabled or not b.bootstrap_confirmed or w.owner is distinct from b.owner or w.file_id is distinct from b.file_id or b.owner is distinct from ar_private.access_owner() or w.generation<=w.consumed or w.due_at>now() then return jsonb_build_object('status','obsolete');end if;
 if w.running_generation is null then update ar_private.tracker_wakes set running_generation=generation,running_until=now()+interval '10 minutes' where id=p_id returning * into w;end if;
 return jsonb_build_object('status','ready','region',w.region,'owner',w.owner,'fileId',w.file_id,'generation',w.running_generation::text);
end $$;

-- The service calls this only after confirming the exact Workflow is terminal.
-- A crash before begin must not strand an otherwise non-running wake forever.
create function public.ar_tracker_wake_restart(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w ar_private.tracker_wakes;b ar_private.tracker_bindings;begin
 select * into w from ar_private.tracker_wakes where id=p_id;
 select * into b from ar_private.tracker_bindings where region=w.region for update;
 select * into w from ar_private.tracker_wakes where id=p_id for update;
 if w.id is null or b.region is null or not b.enabled or not b.bootstrap_confirmed or w.owner is distinct from b.owner or w.file_id is distinct from b.file_id or b.owner is distinct from ar_private.access_owner() or w.generation<=w.consumed or w.running_generation is not null then return jsonb_build_object('status','ignored');end if;
 update ar_private.tracker_wakes set id=gen_random_uuid(),due_at=now() where id=p_id;
 return jsonb_build_object('status','restarted');
end $$;

create function public.ar_tracker_wake_finish(p_id uuid,p_generation text,p_success boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare w ar_private.tracker_wakes;b ar_private.tracker_bindings;begin
 select * into w from ar_private.tracker_wakes where id=p_id;
 select * into b from ar_private.tracker_bindings where region=w.region for update;
 select * into w from ar_private.tracker_wakes where id=p_id for update;
 if w.id is null or p_success is null or w.running_generation is null or w.running_generation::text is distinct from p_generation or b.region is null or not b.enabled or not b.bootstrap_confirmed or w.owner is distinct from b.owner or w.file_id is distinct from b.file_id or b.owner is distinct from ar_private.access_owner() then return jsonb_build_object('status','obsolete');end if;
 update ar_private.tracker_wakes set consumed=case when p_success then running_generation else consumed end,
  id=case when not p_success or generation>running_generation then gen_random_uuid() else id end,
  running_generation=null,running_until=null,failures=case when p_success then 0 else least(failures+1,10) end,
  first_pending_at=now(),due_at=now()+case when p_success then interval '0 seconds' else least(interval '5 minutes',interval '30 seconds'*(2^least(failures,4))) end where id=p_id;
 return jsonb_build_object('status','finished','retryAfterSeconds',case when p_success then 0 else least(300,30*(2^least(w.failures,4)))::integer end);
end $$;
revoke all on function public.ar_tracker_watch_prepare(text,uuid,text),public.ar_tracker_watch_activate(uuid,text,timestamptz),public.ar_tracker_watch_notify(uuid,text,text,text,text),public.ar_tracker_wake_pending(),public.ar_tracker_wake_begin(uuid),public.ar_tracker_wake_restart(uuid),public.ar_tracker_wake_finish(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.ar_tracker_watch_prepare(text,uuid,text),public.ar_tracker_watch_activate(uuid,text,timestamptz),public.ar_tracker_watch_notify(uuid,text,text,text,text),public.ar_tracker_wake_pending(),public.ar_tracker_wake_begin(uuid),public.ar_tracker_wake_restart(uuid),public.ar_tracker_wake_finish(uuid,text,boolean) to service_role;

-- Realtime publishes a tiny, region-scoped committed revision only.
create table public.ar_tracker_publications(region text primary key check(region in('phuket','khao-lak')),revision bigint not null,published_at timestamptz not null default now());
alter table public.ar_tracker_publications enable row level security;
revoke all on public.ar_tracker_publications from public,anon,authenticated,service_role;
grant select on public.ar_tracker_publications to authenticated;
create function ar_private.tracker_publication_visible(p_region text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_region=any((ar_private.access_member(auth.uid())).regions),false) and ar_private.access_owner() is not null;
$$;
revoke all on function ar_private.tracker_publication_visible(text) from public,anon,service_role;
grant execute on function ar_private.tracker_publication_visible(text) to authenticated;
create policy tracker_publication_region on public.ar_tracker_publications for select to authenticated using(ar_private.tracker_publication_visible(region));
create function ar_private.tracker_publish_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ar_tracker_publications(region,revision) select new.region,revision from ar_private.tracker_data_revisions where region=new.region
 on conflict(region) do update set revision=excluded.revision,published_at=now() where ar_tracker_publications.revision is distinct from excluded.revision;
 return new;
end $$;
revoke all on function ar_private.tracker_publish_revision() from public,anon,authenticated,service_role;
create trigger tracker_publish_revision after update of last_success_at on ar_private.tracker_bindings for each row when(new.last_success_at is not null and old.last_success_at is distinct from new.last_success_at) execute function ar_private.tracker_publish_revision();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.ar_tracker_publications;end if;
end $$;


