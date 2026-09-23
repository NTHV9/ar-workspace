-- Position is shared by account management and personal signature settings.
alter table ar_private.access_members add column position text not null default '' check(length(position)<=100 and position !~ '[[:cntrl:]]');
do $$declare definition text;begin
 definition:=pg_get_functiondef('ar_private.access_public_member(ar_private.access_members)'::regprocedure);
 if strpos(definition,'''displayName'',m.display_name')=0 then raise exception 'member projection changed';end if;
 execute replace(definition,'''displayName'',m.display_name','''position'',m.position,''displayName'',m.display_name');
end$$;
create table ar_private.staff_position_commands(command_id uuid primary key,actor uuid not null,request jsonb not null,result jsonb not null);
alter table ar_private.staff_position_commands enable row level security;
revoke all on ar_private.staff_position_commands from public,anon,authenticated,service_role;
-- Personal signature settings; sent/prepared messages retain their own rich-body snapshot.
create table ar_private.email_signatures(actor uuid primary key,revision integer not null check(revision>0),enabled boolean not null,signature jsonb not null,updated_at timestamptz not null default now());
alter table ar_private.email_signatures enable row level security;
revoke all on ar_private.email_signatures from public,anon,authenticated,service_role;
create function public.ar_access_signature_get(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;s ar_private.email_signatures;
begin
 m:=ar_private.access_member(p_actor);if m.email is null then return null;end if;
 select * into s from ar_private.email_signatures where actor=p_actor;
 if found then return jsonb_build_object('revision',s.revision,'enabled',s.enabled,'signature',s.signature);end if;
 return jsonb_build_object('revision',0,'enabled',true,'signature',jsonb_build_object('staffId',p_actor,'name',coalesce(m.display_name,''),'title',m.position,'workplace',''));
end$$;
create function public.ar_access_signature_save(p_actor uuid,p_revision integer,p_enabled boolean,p_signature jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.email_signatures;v jsonb;
begin
 if (ar_private.access_member(p_actor)).email is null then return jsonb_build_object('error','access_forbidden');end if;
 if p_revision is null or p_revision<0 or p_enabled is null or jsonb_typeof(p_signature) is distinct from 'object' or p_signature->>'staffId' is distinct from p_actor::text then return jsonb_build_object('error','signature_invalid');end if;
 if p_signature-array['staffId','name','title','workplace']<>'{}'::jsonb then return jsonb_build_object('error','signature_invalid');end if;
 if exists(select 1 from jsonb_each(p_signature) where key in('name','title','workplace') and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>case when key='workplace' then 200 else 100 end or (value#>>'{}') ~ '[[:cntrl:]]')) or not p_signature ?& array['name','title','workplace'] then return jsonb_build_object('error','signature_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended('signature:'||p_actor::text,0));
 select * into s from ar_private.email_signatures where actor=p_actor for update;
 if found and s.enabled=p_enabled and s.signature=p_signature and s.revision in(p_revision,p_revision+1) then return public.ar_access_signature_get(p_actor);end if;
 if coalesce(s.revision,0)<>p_revision then return jsonb_build_object('error','signature_revision_conflict');end if;
 insert into ar_private.email_signatures(actor,revision,enabled,signature) values(p_actor,p_revision+1,p_enabled,p_signature) on conflict(actor) do update set revision=excluded.revision,enabled=excluded.enabled,signature=excluded.signature,updated_at=now();
 update ar_private.access_members set position=p_signature->>'title',revision=revision+1,updated_at=now() where auth_user_id=p_actor and position is distinct from p_signature->>'title';
 return public.ar_access_signature_get(p_actor);
end$$;
revoke all on function public.ar_access_signature_get(uuid),public.ar_access_signature_save(uuid,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.ar_access_signature_get(uuid),public.ar_access_signature_save(uuid,integer,boolean,jsonb) to service_role;

-- Keep concurrency revisions, but store only the current reusable template content.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('ar_private.template_save_before_policy(uuid,uuid,integer,jsonb)'::regprocedure);
 needle:='insert into public.ar_email_template_versions(template_id,revision,owner,content) values(p_id,next_revision,p_actor,p_content);';
 if strpos(definition,needle)=0 then raise exception 'template writer changed';end if;
 execute replace(definition,needle,'');
 definition:=pg_get_functiondef('ar_private.ar_email_save_before_threads(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb)'::regprocedure);
 needle:='if p_template_ref is not null and not exists(select 1 from public.ar_email_template_versions where owner=p_actor and template_id::text=p_template_ref->>''id'' and revision::text=p_template_ref->>''revision'' and content->>''name''=p_template_ref->>''name'')';
 if strpos(definition,needle)=0 then raise exception 'draft template reference guard changed';end if;
 execute replace(definition,needle,'if p_template_ref is not null and p_template_ref is distinct from d.template_ref and not exists(select 1 from public.ar_email_templates where owner=p_actor and id::text=p_template_ref->>''id'' and revision::text=p_template_ref->>''revision'' and content->>''name''=p_template_ref->>''name'')');
end$$;
create or replace function public.ar_template_list(p_actor uuid,p_id uuid default null,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n integer;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','template_invalid');end if;
 if p_id is not null and not exists(select 1 from public.ar_email_templates where id=p_id and owner=p_actor) then return jsonb_build_object('error','template_missing');end if;
 select coalesce(jsonb_agg(content||jsonb_build_object('id',id,'revision',revision,'updated_at',updated_at) order by updated_at desc,id),'[]') into rows from(select * from public.ar_email_templates where owner=p_actor and (p_id is null or id=p_id) order by updated_at desc,id limit 101 offset p_offset)s;
 n:=jsonb_array_length(rows);if n>100 then rows:=rows-100;end if;
 return jsonb_build_object('items',rows,'nextOffset',case when n>100 then p_offset+100 else null end);
end$$;
-- Old history removal is a separate explicit cutover, after confirming the retained head counts.
revoke all on public.ar_email_template_versions from authenticated;

create function public.ar_access_staff_save(p_actor uuid,p_command uuid,p_member uuid,p_email text,p_display_name text,p_regions text[],p_active boolean,p_revision integer,p_position text) returns jsonb language plpgsql security definer set search_path='' as $$
declare req jsonb;prior ar_private.staff_position_commands;r jsonb;m ar_private.access_members;title text:=btrim(p_position);
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if title is null or length(title)>100 or title ~ '[[:cntrl:]]' then raise exception 'access_invalid';end if;
 req:=jsonb_build_object('member',p_member,'email',p_email,'name',p_display_name,'regions',p_regions,'active',p_active,'revision',p_revision,'position',title);
 select * into prior from ar_private.staff_position_commands where command_id=p_command;
 if found then if prior.actor<>p_actor or prior.request is distinct from req then raise exception 'access_command_conflict';end if;return prior.result;end if;
 r:=public.ar_access_staff_save(p_actor,p_command,p_member,p_email,p_display_name,p_regions,p_active,p_revision);
 update ar_private.access_members set position=title where member_id=(r->>'memberId')::uuid returning * into m;
 update ar_private.email_signatures set signature=jsonb_set(signature,'{title}',to_jsonb(title)),revision=revision+1,updated_at=now() where actor=m.auth_user_id and signature->>'title' is distinct from title;
 r:=ar_private.access_public_member(m);insert into ar_private.staff_position_commands values(p_command,p_actor,req,r);return r;
end$$;
revoke all on function public.ar_access_staff_save(uuid,uuid,uuid,text,text,text[],boolean,integer,text) from public,anon,authenticated;
grant execute on function public.ar_access_staff_save(uuid,uuid,uuid,text,text,text[],boolean,integer,text) to service_role;
