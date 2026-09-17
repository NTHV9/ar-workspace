-- Login lifecycle only. Passwords are never arguments to these SQL functions.
alter table ar_private.access_members add column member_id uuid not null default gen_random_uuid() unique;
alter table ar_private.access_members add column username text unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
alter table ar_private.access_members add column account_kind text not null default 'email' check(account_kind in('email','username'));
alter table ar_private.access_members add column auth_user_id uuid unique;
alter table ar_private.access_members add column setup_state text not null default 'ready' check(setup_state in('ready','creating','deleting'));
alter table ar_private.access_members add column lifecycle_command uuid;
alter table ar_private.access_members add constraint access_login_shape check((account_kind='username')=(username is not null));
alter table ar_private.access_members add constraint access_admin_lifecycle check(not administrator or (setup_state='ready' and account_kind='email'));
do $$begin if exists(select m.email from ar_private.access_members m join auth.users u on lower(u.email)=m.email group by m.email having count(*)>1) then raise exception 'Ambiguous Auth identity; review before binding';end if;end$$;
update ar_private.access_members m set auth_user_id=u.id from auth.users u where lower(u.email)=m.email;

create table ar_private.access_lifecycle_commands(
 command_id uuid primary key,actor uuid not null,kind text not null check(kind in('create','delete')),member_id uuid not null,
 request jsonb not null,auth_user_id uuid,auth_email text not null,dispatched boolean not null default false,
 state text not null default 'pending' check(state in('pending','complete')),result jsonb,created_at timestamptz not null default now(),finished_at timestamptz
);
create table ar_private.access_removed(member_id uuid primary key,auth_user_id uuid,login text not null,account_kind text not null,regions text[] not null,removed_by uuid not null,removed_at timestamptz not null default now(),command_id uuid not null);
create table ar_private.access_login_limits(bucket_key text not null,window_start timestamptz not null,attempts integer not null,primary key(bucket_key,window_start));
alter table ar_private.access_lifecycle_commands enable row level security;
alter table ar_private.access_removed enable row level security;
alter table ar_private.access_login_limits enable row level security;
revoke all on ar_private.access_lifecycle_commands,ar_private.access_removed,ar_private.access_login_limits from public,anon,authenticated,service_role;

create function ar_private.access_public_member(m ar_private.access_members) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('memberId',m.member_id,'email',case when m.account_kind='email' then m.email else null end,'username',m.username,'accountKind',m.account_kind,'administrator',m.administrator,'active',m.active,'regions',m.regions,'revision',m.revision,'setupState',m.setup_state,'pendingCommand',case when m.setup_state<>'ready' then m.lifecycle_command else null end,'hasLoginAccount',exists(select 1 from auth.users u where u.id=m.auth_user_id),'registered',exists(select 1 from auth.users u where u.id=m.auth_user_id and lower(u.email)=m.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)));
$$;
create or replace function ar_private.access_member(p_actor uuid) returns ar_private.access_members language sql stable security definer set search_path='' as $$
 select m from ar_private.access_members m join auth.users u on u.id=m.auth_user_id and lower(u.email)=m.email where u.id=p_actor and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and m.active and m.setup_state='ready';
$$;
create or replace function public.ar_access_self(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;owner_id uuid;
begin m:=ar_private.access_member(p_actor);owner_id:=ar_private.access_owner();if m.email is null or owner_id is null then return null;end if;return ar_private.access_public_member(m)||jsonb_build_object('workspaceOwnerId',owner_id);end$$;
create or replace function ar_private.restrict_user() returns trigger language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;
begin
 if tg_op='UPDATE' and (lower(old.email)='ar@katathani.com') is distinct from (lower(new.email)='ar@katathani.com') then raise exception 'The administrator identity is protected';end if;
 select * into m from ar_private.access_members where email=lower(coalesce(new.email,'')) for update;
 if m.email is null or coalesce(new.is_anonymous,false) or m.setup_state='deleting' then raise exception 'This application is restricted to approved accounts';end if;
 if m.setup_state='creating' then
  if new.id is distinct from m.auth_user_id then raise exception 'Reserved administrator-created identity';end if;
 elsif not m.active then raise exception 'This application is restricted to approved accounts';
 elsif m.auth_user_id is null and m.account_kind='email' then
  update ar_private.access_members set auth_user_id=new.id where member_id=m.member_id;
 elsif m.auth_user_id is distinct from new.id then raise exception 'Login identity mismatch';end if;
 return new;
end$$;
create or replace function public.ar_access_list(p_actor uuid,p_offset integer default 0,p_limit integer default 25,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;n bigint;
begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_offset is null or p_limit is null or p_search is null or p_offset<0 or p_offset>1000000 or p_limit<1 or p_limit>100 or length(p_search)>254 then raise exception 'access_invalid';end if;
 select count(*) into n from ar_private.access_members where strpos(coalesce(username,email),lower(p_search))>0;
 select coalesce(jsonb_agg(v order by administrator desc,login),'[]'::jsonb) into result from(select m.administrator,coalesce(m.username,m.email) login,ar_private.access_public_member(m) v from ar_private.access_members m where strpos(coalesce(username,email),lower(p_search))>0 order by administrator desc,login limit p_limit offset p_offset)s;
 return jsonb_build_object('rows',result,'total',n);
end$$;

-- Keep the prior email-approval route, but never let it reactivate an unfinished deletion/create.
alter function public.ar_access_save(uuid,uuid,text,text[],boolean,integer) rename to access_save_before_lifecycle;
alter function public.access_save_before_lifecycle(uuid,uuid,text,text[],boolean,integer) set schema ar_private;
revoke all on function ar_private.access_save_before_lifecycle(uuid,uuid,text,text[],boolean,integer) from public,anon,authenticated,service_role;
create function public.ar_access_save(p_actor uuid,p_command uuid,p_email text,p_regions text[],p_active boolean,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if lower(btrim(p_email)) like '%@users.ar-workspace.invalid' then raise exception 'access_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('ar_access_email:'||lower(btrim(p_email)),0));
 if exists(select 1 from ar_private.access_members where email=lower(btrim(p_email)) and setup_state<>'ready') then raise exception 'access_lifecycle_pending';end if;
 saved:=ar_private.access_save_before_lifecycle(p_actor,p_command,p_email,p_regions,p_active,p_revision);
 if (select count(*) from auth.users where lower(email)=lower(btrim(p_email)))>1 then raise exception 'access_auth_unverified';end if;
 update ar_private.access_members m set auth_user_id=u.id from auth.users u where m.email=lower(btrim(p_email)) and lower(u.email)=m.email and m.auth_user_id is null and m.setup_state='ready';
 return saved;
end$$;
create function public.ar_access_edit(p_actor uuid,p_command uuid,p_member uuid,p_regions text[],p_active boolean,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 select * into m from ar_private.access_members where member_id=p_member for update;
 if not found then raise exception 'access_user_missing';end if;if m.setup_state<>'ready' then raise exception 'access_lifecycle_pending';end if;
 perform ar_private.access_save_before_lifecycle(p_actor,p_command,m.email,p_regions,p_active,p_revision);
 select * into m from ar_private.access_members where member_id=p_member;return ar_private.access_public_member(m);
end$$;

create function ar_private.access_command_view(c ar_private.access_lifecycle_commands) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('commandId',c.command_id,'kind',c.kind,'memberId',c.member_id,'authUserId',c.auth_user_id,'authEmail',c.auth_email,'dispatched',c.dispatched,'state',c.state,'result',c.result,'member',(select ar_private.access_public_member(m) from ar_private.access_members m where m.member_id=c.member_id));
$$;
create function public.ar_access_create_begin(p_actor uuid,p_command uuid,p_login text,p_regions text[],p_revision integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;c ar_private.access_lifecycle_commands;login text:=lower(btrim(p_login));kind text;requested_regions text[];request jsonb;auth_id uuid;auth_email text;
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_command is null or login is null or length(login)>254 or login like '%@users.ar-workspace.invalid' or p_revision is null or p_revision<0 or p_regions is null or cardinality(p_regions) not between 1 and 2 or array_position(p_regions,null) is not null or not p_regions<@array['phuket','khao-lak']::text[] or (cardinality(p_regions)=2 and p_regions[1]=p_regions[2]) then raise exception 'access_invalid';end if;
 kind:=case when strpos(login,'@')>0 then 'email' else 'username' end;
 if kind='email' and login!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or kind='username' and login!~'^[a-z0-9][a-z0-9._-]{2,31}$' then raise exception 'access_login_invalid';end if;
 if login='ar@katathani.com' then raise exception 'access_administrator_locked';end if;
 select array_agg(r order by n) into requested_regions from unnest(array['phuket','khao-lak']) with ordinality t(r,n) where r=any(p_regions);
 request:=jsonb_build_object('login',login,'regions',requested_regions,'revision',p_revision);
 perform pg_advisory_xact_lock(hashtextextended('ar_access_lifecycle_command:'||p_command,0));
 select * into c from ar_private.access_lifecycle_commands where command_id=p_command;
 if found then if c.actor<>p_actor or c.kind<>'create' or c.request is distinct from request then raise exception 'access_command_conflict';end if;return ar_private.access_command_view(c);end if;
 perform pg_advisory_xact_lock(hashtextextended('ar_access_email:'||login,0));
 select * into m from ar_private.access_members where (kind='email' and email=login) or (kind='username' and username=login) for update;
 if found then
  if m.administrator then raise exception 'access_administrator_locked';end if;
  if m.setup_state<>'ready' then raise exception 'access_lifecycle_pending';end if;
  if m.auth_user_id is not null or exists(select 1 from auth.users where lower(email)=m.email) then raise exception 'access_user_exists';end if;
  if m.revision<>p_revision then raise exception 'access_revision_conflict';end if;
 elsif p_revision<>0 then raise exception 'access_revision_conflict';end if;
 if kind='email' and exists(select 1 from auth.users where lower(email)=login) then raise exception 'access_user_exists';end if;
 auth_id:=gen_random_uuid();auth_email:=case when kind='email' then login else auth_id::text||'@users.ar-workspace.invalid' end;
 if m.member_id is null then
  insert into ar_private.access_members(email,username,account_kind,regions,active,auth_user_id,setup_state,lifecycle_command) values(auth_email,case when kind='username' then login else null end,kind,requested_regions,false,auth_id,'creating',p_command) returning * into m;
 else
  update ar_private.access_members set regions=requested_regions,active=false,auth_user_id=auth_id,setup_state='creating',lifecycle_command=p_command,revision=revision+1,updated_at=now() where member_id=m.member_id returning * into m;
 end if;
 insert into ar_private.access_lifecycle_commands(command_id,actor,kind,member_id,request,auth_user_id,auth_email) values(p_command,p_actor,'create',m.member_id,request,auth_id,auth_email) returning * into c;
 return ar_private.access_command_view(c);
end$$;
create function public.ar_access_create_dispatch(p_actor uuid,p_command uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 update ar_private.access_lifecycle_commands c set dispatched=true where command_id=p_command and actor=p_actor and kind='create' and state='pending' and not dispatched and exists(select 1 from ar_private.access_members m where m.member_id=c.member_id and m.setup_state='creating' and m.lifecycle_command=c.command_id);
 return found;
end$$;
create function public.ar_access_create_finish(p_actor uuid,p_command uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.access_lifecycle_commands;m ar_private.access_members;payload jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 select * into c from ar_private.access_lifecycle_commands where command_id=p_command and actor=p_actor and kind='create' for update;
 if not found then raise exception 'access_user_missing';end if;if c.state='complete' then return c.result;end if;
 select * into m from ar_private.access_members where member_id=c.member_id for update;
 if m.setup_state is distinct from 'creating' or m.lifecycle_command is distinct from c.command_id then raise exception 'access_lifecycle_pending';end if;
 if not exists(select 1 from auth.users where id=c.auth_user_id and lower(email)=c.auth_email and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'access_auth_unverified';end if;
 update ar_private.access_members set active=true,setup_state='ready',revision=revision+1,updated_at=now() where member_id=m.member_id returning * into m;
 payload:=jsonb_build_object('state','complete','kind','create','member',ar_private.access_public_member(m));
 update ar_private.access_lifecycle_commands set state='complete',result=payload,finished_at=now() where command_id=p_command;return payload;
end$$;
create function public.ar_access_delete_begin(p_actor uuid,p_command uuid,p_member uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;c ar_private.access_lifecycle_commands;request jsonb:=jsonb_build_object('memberId',p_member,'revision',p_revision);
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_command is null or p_member is null or p_revision is null or p_revision<1 then raise exception 'access_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('ar_access_lifecycle_command:'||p_command,0));
 select * into c from ar_private.access_lifecycle_commands where command_id=p_command;
 if found then if c.actor<>p_actor or c.kind<>'delete' or c.request is distinct from request then raise exception 'access_command_conflict';end if;return ar_private.access_command_view(c);end if;
 select * into m from ar_private.access_members where member_id=p_member for update;
 if not found then raise exception 'access_user_missing';end if;
 if m.administrator or m.auth_user_id=ar_private.access_owner() then raise exception 'access_administrator_locked';end if;
 if m.revision<>p_revision then raise exception 'access_revision_conflict';end if;
 if m.setup_state='deleting' then raise exception 'access_lifecycle_pending';end if;
 update ar_private.access_members set active=false,setup_state='deleting',lifecycle_command=p_command,revision=revision+1,updated_at=now() where member_id=p_member returning * into m;
 insert into ar_private.access_lifecycle_commands(command_id,actor,kind,member_id,request,auth_user_id,auth_email) values(p_command,p_actor,'delete',p_member,request,m.auth_user_id,m.email) returning * into c;
 return ar_private.access_command_view(c);
end$$;
create function public.ar_access_delete_finish(p_actor uuid,p_command uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ar_private.access_lifecycle_commands;m ar_private.access_members;payload jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 select * into c from ar_private.access_lifecycle_commands where command_id=p_command and actor=p_actor and kind='delete' for update;
 if not found then raise exception 'access_user_missing';end if;if c.state='complete' then return c.result;end if;
 select * into m from ar_private.access_members where member_id=c.member_id for update;
 if m.administrator or m.setup_state is distinct from 'deleting' or m.lifecycle_command is distinct from p_command then raise exception 'access_lifecycle_pending';end if;
 if exists(select 1 from auth.users where id=c.auth_user_id) then raise exception 'access_auth_unverified';end if;
 insert into ar_private.access_removed values(m.member_id,m.auth_user_id,coalesce(m.username,m.email),m.account_kind,m.regions,p_actor,now(),p_command);
 delete from ar_private.access_members where member_id=m.member_id;
 payload:=jsonb_build_object('state','complete','kind','delete','memberId',c.member_id);
 update ar_private.access_lifecycle_commands set state='complete',result=payload,finished_at=now() where command_id=p_command;return payload;
end$$;
create function public.ar_access_command_get(p_actor uuid,p_command uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c ar_private.access_lifecycle_commands;
begin if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;select * into c from ar_private.access_lifecycle_commands where command_id=p_command and actor=p_actor;if not found then raise exception 'access_user_missing';end if;return ar_private.access_command_view(c);end$$;

create function public.ar_access_password_target(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('authUserId',m.auth_user_id,'authEmail',m.email) from ar_private.access_members m join auth.users u on u.id=m.auth_user_id and lower(u.email)=m.email where m.username=lower(p_username) and m.account_kind='username' and m.active and m.setup_state='ready' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
$$;
create function public.ar_access_login_limit(p_identity text,p_network text) returns integer language plpgsql security definer set search_path='' as $$
declare bucket timestamptz:=date_trunc('minute',clock_timestamp());n integer;ip_n integer;
begin
 if p_identity!~'^[a-f0-9]{64}$' or p_network!~'^[a-f0-9]{64}$' or p_identity is null or p_network is null then raise exception 'access_invalid';end if;
 delete from ar_private.access_login_limits where (bucket_key,window_start) in(select bucket_key,window_start from ar_private.access_login_limits where window_start<bucket-interval '10 minutes' order by window_start limit 100);
 insert into ar_private.access_login_limits values('i:'||p_network,bucket,1) on conflict(bucket_key,window_start) do update set attempts=access_login_limits.attempts+1 returning attempts into ip_n;
 insert into ar_private.access_login_limits values('u:'||p_identity,bucket,1) on conflict(bucket_key,window_start) do update set attempts=access_login_limits.attempts+1 returning attempts into n;
 if n>10 or ip_n>30 then return greatest(1,ceil(extract(epoch from(bucket+interval '1 minute'-clock_timestamp())))::integer);end if;return 0;
end$$;
revoke all on function ar_private.access_public_member(ar_private.access_members),ar_private.access_command_view(ar_private.access_lifecycle_commands) from public,anon,authenticated,service_role;
revoke all on function public.ar_access_save(uuid,uuid,text,text[],boolean,integer),public.ar_access_edit(uuid,uuid,uuid,text[],boolean,integer),public.ar_access_create_begin(uuid,uuid,text,text[],integer),public.ar_access_create_dispatch(uuid,uuid),public.ar_access_create_finish(uuid,uuid),public.ar_access_delete_begin(uuid,uuid,uuid,integer),public.ar_access_delete_finish(uuid,uuid),public.ar_access_command_get(uuid,uuid),public.ar_access_password_target(text),public.ar_access_login_limit(text,text) from public,anon,authenticated;
grant execute on function public.ar_access_save(uuid,uuid,text,text[],boolean,integer),public.ar_access_edit(uuid,uuid,uuid,text[],boolean,integer),public.ar_access_create_begin(uuid,uuid,text,text[],integer),public.ar_access_create_dispatch(uuid,uuid),public.ar_access_create_finish(uuid,uuid),public.ar_access_delete_begin(uuid,uuid,uuid,integer),public.ar_access_delete_finish(uuid,uuid),public.ar_access_command_get(uuid,uuid),public.ar_access_password_target(text),public.ar_access_login_limit(text,text) to service_role;
