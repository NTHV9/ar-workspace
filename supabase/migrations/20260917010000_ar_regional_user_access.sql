-- Approved login identities are distinct from the existing shared business/mailbox owner.
create table ar_private.access_members(
 email text primary key check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 administrator boolean not null default false,active boolean not null default true,
 regions text[] not null check(cardinality(regions) between 1 and 2 and regions<@array['phuket','khao-lak']::text[] and (cardinality(regions)=1 or regions[1]<>regions[2])),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 check(administrator=(email='ar@katathani.com')),
 check(not administrator or (active and regions=array['phuket','khao-lak']::text[]))
);
insert into ar_private.access_members(email,administrator,regions) values('ar@katathani.com',true,array['phuket','khao-lak']);
create table ar_private.access_changes(command_id uuid primary key,actor uuid not null,email text not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default now());
create table ar_private.access_requests(id bigint generated always as identity primary key,actor uuid not null,workspace_owner uuid not null,method text not null,path text not null,scope_hotels text[] not null,authorized_at timestamptz not null default now());
alter table ar_private.access_members enable row level security;
alter table ar_private.access_changes enable row level security;
alter table ar_private.access_requests enable row level security;
revoke all on ar_private.access_members,ar_private.access_changes,ar_private.access_requests from public,anon,authenticated,service_role;

create function ar_private.access_owner() returns uuid language sql stable security definer set search_path='' as $$
 select id from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
$$;
create function ar_private.access_member(p_actor uuid) returns ar_private.access_members language sql stable security definer set search_path='' as $$
 select m from ar_private.access_members m join auth.users u on lower(u.email)=m.email where u.id=p_actor and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and m.active;
$$;
create function ar_private.access_hotels(p_regions text[]) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(h order by ordinal),'{}'::text[]) from unnest(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']) with ordinality t(h,ordinal)
 where (h in('KAT','TSK') and 'phuket'=any(p_regions)) or (h in('TLKL','WAKL','TLFO','TSAN') and 'khao-lak'=any(p_regions));
$$;
create function public.ar_access_self(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;owner_id uuid;
begin m:=ar_private.access_member(p_actor);owner_id:=ar_private.access_owner();
 if m.email is null or owner_id is null then return null;end if;
 return jsonb_build_object('email',m.email,'administrator',m.administrator,'regions',m.regions,'revision',m.revision,'workspaceOwnerId',owner_id);
end$$;

-- Existing authenticated table/RPC/storage policies remain administrator-only.
-- New members cannot bypass the Worker and service-only authorization through PostgREST.
create or replace function ar_private.restrict_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (lower(old.email)='ar@katathani.com') is distinct from (lower(new.email)='ar@katathani.com') then raise exception 'The administrator identity is protected';end if;
 if coalesce(new.is_anonymous,false) or not exists(select 1 from ar_private.access_members where email=lower(coalesce(new.email,'')) and active) then raise exception 'This application is restricted to approved accounts';end if;
 return new;
end$$;
create trigger ar_restrict_updated_user before update of email,is_anonymous on auth.users for each row execute function ar_private.restrict_user();

create function public.ar_access_list(p_actor uuid,p_offset integer default 0,p_limit integer default 25,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;n bigint;
begin
 if p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_offset<0 or p_offset>1000000 or p_limit<1 or p_limit>100 or length(p_search)>254 then raise exception 'access_invalid';end if;
 select count(*) into n from ar_private.access_members where strpos(email,lower(p_search))>0;
 select coalesce(jsonb_agg(v order by administrator desc,email),'[]'::jsonb) into result from(
 select m.administrator,m.email,jsonb_build_object('email',m.email,'administrator',m.administrator,'active',m.active,'regions',m.regions,'revision',m.revision,'registered',exists(select 1 from auth.users u where lower(u.email)=m.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))) v
 from ar_private.access_members m where strpos(email,lower(p_search))>0 order by administrator desc,email limit p_limit offset p_offset)s;
 return jsonb_build_object('rows',result,'total',n);
end$$;
create function public.ar_access_save(p_actor uuid,p_command uuid,p_email text,p_regions text[],p_active boolean,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;c ar_private.access_changes;request jsonb;result jsonb;normalized text:=lower(btrim(p_email));regions text[];
begin
 if p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_command is null or p_email is null or normalized!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized)>254 or normalized ~ '[[:cntrl:]]' or p_regions is null or cardinality(p_regions) not between 1 and 2 or array_position(p_regions,null) is not null or not p_regions<@array['phuket','khao-lak']::text[] or (cardinality(p_regions)=2 and p_regions[1]=p_regions[2]) or p_active is null or p_revision is null or p_revision<0 then raise exception 'access_invalid';end if;
 select array_agg(r order by n) into regions from unnest(array['phuket','khao-lak']) with ordinality t(r,n) where r=any(p_regions);
 request:=jsonb_build_object('email',normalized,'regions',regions,'active',p_active,'revision',p_revision);
 perform pg_advisory_xact_lock(hashtextextended('ar_access_command:'||p_command::text,0));
 select * into c from ar_private.access_changes where command_id=p_command;
 if found then if c.actor<>p_actor or c.request is distinct from request then raise exception 'access_command_conflict';end if;return c.result;end if;
 if normalized='ar@katathani.com' then raise exception 'access_administrator_locked';end if;
 perform pg_advisory_xact_lock(hashtextextended('ar_access_email:'||normalized,0));
 select * into m from ar_private.access_members where email=normalized for update;
 if coalesce(m.revision,0)<>p_revision then raise exception 'access_revision_conflict';end if;
 insert into ar_private.access_members(email,regions,active) values(normalized,regions,p_active)
 on conflict(email) do update set regions=excluded.regions,active=excluded.active,revision=access_members.revision+1,updated_at=now() returning * into m;
 result:=jsonb_build_object('email',m.email,'administrator',false,'regions',m.regions,'active',m.active,'revision',m.revision,'registered',exists(select 1 from auth.users where lower(email)=m.email and email_confirmed_at is not null and not coalesce(is_anonymous,false)));
 insert into ar_private.access_changes values(p_command,p_actor,normalized,request,result,now());return result;
end$$;

create function public.ar_access_authorize(p_actor uuid,p_kind text,p_hotel text default null,p_region text default null,p_ref uuid default null,p_mail boolean default false,p_method text default 'GET',p_path text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb;owner_id uuid;allowed text[];scoped text[];target text;
begin
 member:=public.ar_access_self(p_actor);if member is null then raise exception 'access_forbidden';end if;
 owner_id:=(member->>'workspaceOwnerId')::uuid;select ar_private.access_hotels(array(select jsonb_array_elements_text(member->'regions'))) into allowed;
 if p_kind='hotel' then target:=p_hotel;
 elsif p_kind='region' then if p_region not in('phuket','khao-lak') or p_region is null then raise exception 'access_forbidden';end if;scoped:=ar_private.access_hotels(array[p_region]);
 elsif p_kind='global' then scoped:=allowed;
 elsif p_kind='document' then select hotel into target from public.ar_document_jobs where id=p_ref and owner=owner_id;
 elsif p_kind='email' then select hotel into target from public.ar_email_drafts where id=p_ref and owner=owner_id;
 elsif p_kind='delivery' then select d.hotel into target from ar_private.mail_deliveries l join public.ar_email_drafts d on d.id=l.draft_id where l.id=p_ref and l.owner=owner_id and d.owner=owner_id;
 elsif p_kind in('remittance','remittance_save') then select hotel into target from public.ar_remittances where id=p_ref and owner=owner_id;if target is null and p_kind='remittance_save' then target:=p_hotel;end if;
 elsif p_kind='remittance_command' then select r.hotel into target from ar_private.remittance_commands c join public.ar_remittances r on r.id=c.record_id where c.owner=owner_id and c.command_id=p_ref and r.owner=owner_id;
 elsif p_kind='exception_command' then select hotel into target from ar_private.invoice_exception_commands where actor=owner_id and command_id=p_ref;
 elsif p_kind='billing' then select hotel into target from ar_private.external_billing_records where id=p_ref and owner=owner_id;
 else raise exception 'access_forbidden';end if;
 -- An absent idempotency receipt is not a resource grant. Return its empty result
 -- directly from the gateway, avoiding a second lookup and any creation race.
 if target is null and p_kind in('remittance_command','exception_command') and p_method='GET' then return member||jsonb_build_object('scopeHotels',allowed,'missingCommand',true);end if;
 if scoped is null then
  if target is null or not target=any(allowed) or p_hotel is not null and p_hotel<>target then raise exception 'access_forbidden';end if;
  scoped:=array[target];
 end if;
 if not scoped<@allowed or cardinality(scoped)=0 then raise exception 'access_forbidden';end if;
 if p_region is not null and not scoped<@ar_private.access_hotels(array[p_region]) then raise exception 'access_forbidden';end if;
 if p_mail and not scoped<@array['KAT','TSK']::text[] then raise exception 'email_region_disabled';end if;
 if p_method not in('GET','POST','PUT','DELETE') or p_method is null or length(p_path)>1000 or p_path is null then raise exception 'access_invalid';end if;
 if p_method<>'GET' and p_actor<>owner_id then insert into ar_private.access_requests(actor,workspace_owner,method,path,scope_hotels) values(p_actor,owner_id,p_method,p_path,scoped);end if;
 return member||jsonb_build_object('scopeHotels',scoped);
end$$;

create function public.ar_access_rows(p_actor uuid,p_table text,p_hotels text[],p_account text default null,p_offset integer default 0,p_limit integer default 500) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m ar_private.access_members;result jsonb;ordering text;filter text:='';
begin
 m:=ar_private.access_member(p_actor);
 if m.email is null or p_hotels is null or cardinality(p_hotels)=0 or array_position(p_hotels,null) is not null or not p_hotels<@ar_private.access_hotels(m.regions) then raise exception 'access_forbidden';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>2147483000 or p_limit<1 or p_limit>500 or length(p_account)>200 then raise exception 'access_invalid';end if;
 if p_table='ar_invoices' then ordering:='hotel,account_id,id';filter:=' and open<>0 and collection_role<>''child''';
 elsif p_table='ar_collection_rows' then ordering:='hotel,account_id,id';
 elsif p_table in('ar_invoice_workflow','ar_invoice_exceptions') then ordering:='hotel,account_id,invoice_id';
 else raise exception 'access_forbidden';end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select * from public.%I where hotel=any($1) and ($2 is null or account_id=$2)%s order by %s limit $3 offset $4)x',p_table,filter,ordering) into result using p_hotels,p_account,p_limit,p_offset;
 return result;
end$$;
create function public.ar_access_selection(p_actor uuid,p_hotel text,p_account_id text,p_ids text[]) returns boolean language plpgsql security definer set search_path='' as $$
declare permitted jsonb;old_claim text;result boolean;
begin
 permitted:=public.ar_access_authorize(p_actor,'hotel',p_hotel);old_claim:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',permitted->>'workspaceOwnerId',true);
 result:=public.ar_validate_collection_selection(p_hotel,p_account_id,p_ids);
 perform set_config('request.jwt.claim.sub',coalesce(old_claim,''),true);return result;
end$$;

-- Durable SQL guard also protects delivery claims through the existing service API.
alter function public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb) rename to mail_claim_before_region_delivery;
alter function public.mail_claim_before_region_delivery(uuid,uuid,uuid,integer,text,text,text,jsonb) set schema ar_private;
revoke all on function ar_private.mail_claim_before_region_delivery(uuid,uuid,uuid,integer,text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_draft is not null and not exists(select 1 from public.ar_email_drafts where id=p_draft and owner=p_actor and hotel in('KAT','TSK')) then return jsonb_build_object('error','email_region_disabled');end if;
 if p_mode='test' and coalesce(p_expected#>>'{supplementalSource,draftId}','') ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and exists(select 1 from public.ar_email_drafts where id=(p_expected#>>'{supplementalSource,draftId}')::uuid and owner=p_actor and hotel not in('KAT','TSK')) then return jsonb_build_object('error','email_region_disabled');end if;
 return ar_private.mail_claim_before_region_delivery(p_actor,p_id,p_draft,p_revision,p_mode,p_stage,p_message_id,p_expected);
end$$;
alter function public.ar_gmail_attempt_claim(uuid,uuid,integer,text) rename to gmail_claim_before_region_delivery;
alter function public.gmail_claim_before_region_delivery(uuid,uuid,integer,text) set schema ar_private;
revoke all on function ar_private.gmail_claim_before_region_delivery(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
create function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ar_email_drafts where id=p_draft and owner=p_owner and hotel in('KAT','TSK')) then return jsonb_build_object('error','email_region_disabled');end if;
 return ar_private.gmail_claim_before_region_delivery(p_owner,p_draft,p_revision,p_message_id);
end$$;
revoke all on function ar_private.access_owner(),ar_private.access_member(uuid),ar_private.access_hotels(text[]) from public,anon,authenticated,service_role;
revoke all on function public.ar_access_self(uuid),public.ar_access_list(uuid,integer,integer,text),public.ar_access_save(uuid,uuid,text,text[],boolean,integer),public.ar_access_authorize(uuid,text,text,text,uuid,boolean,text,text),public.ar_access_rows(uuid,text,text[],text,integer,integer),public.ar_access_selection(uuid,text,text,text[]),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ar_access_self(uuid),public.ar_access_list(uuid,integer,integer,text),public.ar_access_save(uuid,uuid,text,text[],boolean,integer),public.ar_access_authorize(uuid,text,text,text,uuid,boolean,text,text),public.ar_access_rows(uuid,text,text[],text,integer,integer),public.ar_access_selection(uuid,text,text,text[]),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text) to service_role;
