-- Named, allowlisted Google identities. No Google mailbox credentials are changed.
alter table ar_private.access_members add column display_name text check(display_name is null or (length(btrim(display_name)) between 1 and 100 and display_name !~ '[[:cntrl:]]'));
create table ar_private.staff_identities(actor uuid primary key,email text not null,display_name text);
alter table ar_private.staff_identities enable row level security;
revoke all on ar_private.staff_identities from public,anon,authenticated,service_role;
create function ar_private.staff_identity_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.auth_user_id is not null then
  insert into ar_private.staff_identities values(new.auth_user_id,new.email,new.display_name)
  on conflict(actor) do update set email=excluded.email,display_name=excluded.display_name;
 end if;return new;
end$$;
create trigger staff_identity_capture after insert or update on ar_private.access_members for each row execute function ar_private.staff_identity_capture();
insert into ar_private.staff_identities select auth_user_id,email,display_name from ar_private.access_members where auth_user_id is not null;
create function ar_private.staff_label(p_actor uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(display_name,email) from ar_private.staff_identities where actor=p_actor),'Staff');
$$;
create table ar_private.staff_commands(command_id uuid primary key,actor uuid not null,request jsonb not null,result jsonb not null);
alter table ar_private.staff_commands enable row level security;
revoke all on ar_private.staff_commands from public,anon,authenticated,service_role;
create function public.ar_access_staff_save(p_actor uuid,p_command uuid,p_member uuid,p_email text,p_display_name text,p_regions text[],p_active boolean,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;prior ar_private.staff_commands;req jsonb;res jsonb;login text:=lower(btrim(p_email));name text:=btrim(p_display_name);
begin
 perform pg_advisory_xact_lock(hashtextextended('ar_access_membership_write',0));
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_command is null or name is null or length(name) not between 1 and 100 or name ~ '[[:cntrl:]]' then raise exception 'access_invalid';end if;
 req:=jsonb_build_object('member',p_member,'email',login,'name',name,'regions',p_regions,'active',p_active,'revision',p_revision);
 select * into prior from ar_private.staff_commands where command_id=p_command;
 if found then if prior.actor<>p_actor or prior.request is distinct from req then raise exception 'access_command_conflict';end if;return prior.result;end if;
 if p_member is not null then
  select * into m from ar_private.access_members where member_id=p_member for update;
  if not found then raise exception 'access_user_missing';end if;
  if m.account_kind<>'email' then raise exception 'access_invalid';end if;
  login:=m.email;
 end if;
 if login='ar@katathani.com' then raise exception 'access_administrator_locked';end if;
 perform public.ar_access_save(p_actor,p_command,login,p_regions,p_active,p_revision);
 update ar_private.access_members set display_name=name where email=login returning * into m;
 res:=ar_private.access_public_member(m);
 insert into ar_private.staff_commands values(p_command,p_actor,req,res);return res;
end$$;
revoke all on function public.ar_access_staff_save(uuid,uuid,uuid,text,text,text[],boolean,integer) from public,anon,authenticated;
grant execute on function public.ar_access_staff_save(uuid,uuid,uuid,text,text,text[],boolean,integer) to service_role;
-- Disabled during additive rollout; explicitly arm only when Google setup is ready.
create table ar_private.login_policy(singleton boolean primary key default true check(singleton),google_only boolean not null default false,valid_after timestamptz not null default '-infinity');
insert into ar_private.login_policy(singleton) values(true);
alter table ar_private.login_policy enable row level security;
revoke all on ar_private.login_policy from public,anon,authenticated,service_role;
create function public.ar_access_session_valid(p_actor uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s,ar_private.login_policy p where s.id=p_session and s.user_id=p_actor and s.created_at>p.valid_after and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.ar_access_session_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ar_access_session_valid(uuid,uuid) to service_role;
create or replace function ar_private.is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and lower(u.email)='ar@katathani.com' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))
 and (not (select google_only from ar_private.login_policy) or
 (auth.jwt()->'app_metadata'->'providers' @> '["google"]'::jsonb and auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb and public.ar_access_session_valid(auth.uid(),(auth.jwt()->>'session_id')::uuid)));
$$;
-- Trusted Worker-only header: never copied from browser headers. Financial ownership remains unchanged.
create function ar_private.request_staff() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid;begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then return null;end if;
 actor:=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-ar-actor')::uuid;
 if (ar_private.access_member(actor)).email is null then return null;end if;return actor;
end$$;
create function ar_private.capture_history_actor() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=ar_private.request_staff();stamp jsonb;
begin if actor is not null then stamp:=jsonb_build_object('staffActor',actor,'staffName',ar_private.staff_label(actor));
 if tg_table_name='invoice_workflow_history' then new.details:=new.details||stamp;else new.settings:=new.settings||stamp;end if;
 end if;return new;end$$;
create trigger staff_workflow_actor before insert on ar_private.invoice_workflow_history for each row execute function ar_private.capture_history_actor();
create trigger staff_settings_actor before insert on ar_private.account_settings_history for each row execute function ar_private.capture_history_actor();
create function ar_private.capture_business_staff() returns trigger language plpgsql security definer set search_path='' as $$
begin new.staff_actor:=ar_private.request_staff();if new.staff_actor is not null then new.staff_name:=ar_private.staff_label(new.staff_actor);end if;return new;end$$;
alter table ar_private.external_billing_records add column staff_actor uuid,add column staff_name text;
alter table ar_private.external_billing_events add column staff_actor uuid,add column staff_name text;
alter table ar_private.mail_deliveries add column staff_actor uuid,add column staff_name text;
create trigger staff_billing_record before insert on ar_private.external_billing_records for each row execute function ar_private.capture_business_staff();
create trigger staff_billing_event before insert on ar_private.external_billing_events for each row execute function ar_private.capture_business_staff();
create trigger staff_delivery before insert on ar_private.mail_deliveries for each row execute function ar_private.capture_business_staff();
revoke all on function ar_private.staff_identity_capture(),ar_private.staff_label(uuid),ar_private.request_staff(),ar_private.capture_history_actor(),ar_private.capture_business_staff() from public,anon,authenticated,service_role;

create or replace function ar_private.access_public_member(m ar_private.access_members) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('displayName',m.display_name,'memberId',m.member_id,'email',case when m.account_kind='email' then m.email else null end,'username',m.username,'accountKind',m.account_kind,'administrator',m.administrator,'active',m.active,'regions',m.regions,'revision',m.revision,'setupState',m.setup_state,'pendingCommand',case when m.setup_state<>'ready' then m.lifecycle_command else null end,'hasLoginAccount',exists(select 1 from auth.users u where u.id=m.auth_user_id),'registered',exists(select 1 from auth.users u where u.id=m.auth_user_id and lower(u.email)=m.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)));
$$;

create or replace function public.ar_access_list(p_actor uuid,p_offset integer default 0,p_limit integer default 25,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;n bigint;
begin
 if p_actor is null or p_actor is distinct from ar_private.access_owner() then raise exception 'access_forbidden';end if;
 if p_offset is null or p_limit is null or p_search is null or p_offset<0 or p_offset>1000000 or p_limit<1 or p_limit>100 or length(p_search)>254 then raise exception 'access_invalid';end if;
 select count(*) into n from ar_private.access_members where (strpos(coalesce(username,email),lower(p_search))>0 or strpos(lower(coalesce(display_name,'')),lower(p_search))>0);
 select coalesce(jsonb_agg(v order by administrator desc,login),'[]'::jsonb) into result from(select m.administrator,coalesce(m.username,m.email) login,ar_private.access_public_member(m) v from ar_private.access_members m where (strpos(coalesce(username,email),lower(p_search))>0 or strpos(lower(coalesce(display_name,'')),lower(p_search))>0) order by administrator desc,login limit p_limit offset p_offset)s;
 return jsonb_build_object('rows',result,'total',n);
end$$;

create or replace function public.ar_invoice_register_history(p_actor uuid,p_hotel text,p_account text,p_invoice text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h text[];r jsonb;
begin h:=ar_private.invoice_register_hotels(p_actor,p_hotel);if not p_hotel=any(h) then raise exception 'register_forbidden';end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','register_invalid');end if;
 select jsonb_build_object('total',(select count(*) from ar_private.invoice_register_history where hotel=p_hotel and account_id=p_account and invoice_id=p_invoice),'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into r from(select h.id,h.recorded_at,h.before_value,h.after_value,ar_private.staff_label(h.actor) as actor from ar_private.invoice_register_history h where h.hotel=p_hotel and h.account_id=p_account and h.invoice_id=p_invoice order by h.id desc offset p_offset limit 20)x;return r;
exception when others then if sqlerrm='register_forbidden' then return jsonb_build_object('error',sqlerrm);else raise;end if;
end $$;

create or replace function public.ar_external_billing_history(p_actor uuid,p_id uuid,p_offset integer default 0,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','billing_forbidden');end if;
 if not exists(select 1 from ar_private.external_billing_records where id=p_id and owner=p_actor) then return jsonb_build_object('error','billing_missing');end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('error','billing_invalid');end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x) order by revision desc) from(select revision,preview,recorded_at,staff_name from ar_private.external_billing_events where record_id=p_id and owner=p_actor order by revision desc offset p_offset limit p_limit)x),'[]'::jsonb),'total',(select count(*) from ar_private.external_billing_events where record_id=p_id and owner=p_actor));
end$$;

create or replace view ar_private.report_sent_invoices as
 select e.owner,e.delivery_id,e.hotel,e.account_id,ids.invoice_id,e.sent_at,(e.sent_at at time zone 'Asia/Bangkok')::date as sent_date,
 coalesce(e.account_name_recorded,m.snapshot->'draft'->>'account_name',e.account_id) as account_name,
 coalesce(e.account_type_recorded,'Not recorded') as account_type,
 e.purpose,e.stage,case when e.purpose='billing' then case when w.fact is null then 'Billing classification unavailable' when w.fact->>'first_billing_date' is null then 'First billing' else 'Rebilling' end else e.stage end as kind,
 manifest.item->>'invoice_no' as invoice_no,manifest.item->>'folio_no' as folio_no,
 case when jsonb_typeof(manifest.item->'open')='number' then (manifest.item->>'open')::numeric else null end as amount,
 w.fact->>'first_billing_date' as first_billing_date_before_send,
 e.stage_snapshot,
 case when e.purpose='collection' then coalesce(e.stage_snapshot->>'label',regexp_replace(e.stage,'^Follow ([123])$','Follow-up \1')) else null end as stage_label,
 case when e.purpose='collection' then coalesce((e.stage_snapshot->>'terminal')::boolean,e.stage='Final') else false end as terminal_stage,
 case when w.fact->>'revision' ~ '^[0-9]{1,10}$' then (w.fact->>'revision')::bigint end as workflow_revision_before_send,m.staff_actor,m.staff_name
 from public.ar_sent_events e join ar_private.mail_deliveries m on m.id=e.delivery_id and m.owner=e.owner and m.state='sent' and m.mode in ('send','draft')
 cross join lateral unnest(e.invoice_ids) ids(invoice_id)
 left join lateral (select value as item from jsonb_array_elements(m.snapshot->'manifest') where value->>'id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) manifest on true
 left join lateral (select value as fact from jsonb_array_elements(m.snapshot->'workflow') where value->>'invoice_id'=ids.invoice_id and value->>'hotel'=e.hotel and value->>'account_id'=e.account_id limit 1) w on true;
