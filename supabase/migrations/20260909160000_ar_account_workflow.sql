-- Owner-approved initialization: existing invoices start not billed/no reminders.
alter table public.ar_account_settings add column revision integer not null default 0;
alter table public.ar_account_settings add column updated_at timestamptz not null default now();
create table ar_private.account_settings_history(hotel text not null,account_id text not null,revision integer not null,actor uuid not null,settings jsonb not null,recorded_at timestamptz not null default now(),primary key(hotel,account_id,revision));
revoke all on ar_private.account_settings_history from public,anon,authenticated;
create table public.ar_invoice_workflow(
 hotel text not null,account_id text not null,invoice_id text not null,base_date date not null,
 billing_required boolean,credit_term integer check(credit_term>=0),settings_revision integer,
 first_billing_date date,last_reminder_stage text check(last_reminder_stage in ('Friendly','Follow 1','Follow 2','Follow 3','Final')),last_reminder_date date,
 revision integer not null default 0,updated_at timestamptz not null default now(),
 due_date date generated always as ((case when billing_required then first_billing_date when billing_required=false then base_date end)+credit_term) stored,
 primary key(hotel,account_id,invoice_id),check((last_reminder_stage is null)=(last_reminder_date is null))
);
alter table public.ar_invoice_workflow enable row level security;
revoke all on public.ar_invoice_workflow from public,anon,authenticated;
grant select on public.ar_invoice_workflow to authenticated;
create policy workflow_member_read on public.ar_invoice_workflow for select to authenticated using ((select ar_private.is_member()));
create table ar_private.invoice_workflow_history(hotel text,account_id text,invoice_id text,revision integer,actor uuid,details jsonb,recorded_at timestamptz not null default now(),primary key(hotel,account_id,invoice_id,revision));
revoke all on ar_private.invoice_workflow_history from public,anon,authenticated;
create function ar_private.sync_invoice_workflow() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ar_invoice_workflow(hotel,account_id,invoice_id,base_date) values(new.hotel,new.account_id,new.id,new.transaction_date) on conflict do nothing;
 if new.collection_selectable then
  update public.ar_invoice_workflow w set billing_required=s.billing_required,credit_term=s.credit_term,settings_revision=s.revision
  from public.ar_account_settings s where s.hotel=new.hotel and s.account_id=new.account_id and s.billing_required is not null and s.credit_term is not null
  and w.hotel=new.hotel and w.account_id=new.account_id and w.invoice_id=new.id and w.settings_revision is null;
 end if;return new;
end $$;
create trigger ar_initialize_invoice_workflow after insert or update on public.ar_invoices for each row execute function ar_private.sync_invoice_workflow();
insert into public.ar_invoice_workflow(hotel,account_id,invoice_id,base_date) select hotel,account_id,id,transaction_date from public.ar_invoices on conflict do nothing;
create function ar_private.valid_recipients(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;e jsonb;seen text[]:='{}';address text;
begin
 if v is null or jsonb_typeof(v)<>'object' or v-array['to','cc','bcc']<>'{}'::jsonb then return false;end if;
 foreach k in array array['to','cc','bcc'] loop
  if not(v?k) or jsonb_typeof(v->k)<>'array' then return false;end if;
  if jsonb_array_length(v->k)>200 then return false;end if;
  for e in select value from jsonb_array_elements(v->k) loop
   if jsonb_typeof(e)<>'string' then return false;end if;address:=e#>>'{}';
   if length(address)>254 or address<>btrim(address) or address!~'^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+\.[^[:space:]@<>,;]+$' or lower(address)=any(seen) then return false;end if;
   seen:=array_append(seen,lower(address));
  end loop;
 end loop;return true;
end $$;
create function public.ar_settings_get(p_hotel text,p_account_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account_id) then jsonb_build_object('error','settings_account_missing') else
 coalesce((select to_jsonb(s) from public.ar_account_settings s where s.hotel=p_hotel and s.account_id=p_account_id),jsonb_build_object('hotel',p_hotel,'account_id',p_account_id,'revision',0,'billing_required',null,'credit_term',null,'billing_recipients',jsonb_build_object('to','[]'::jsonb,'cc','[]'::jsonb,'bcc','[]'::jsonb),'collection_recipients',jsonb_build_object('to','[]'::jsonb,'cc','[]'::jsonb,'bcc','[]'::jsonb))) end;
$$;
create function public.ar_settings_save(p_actor uuid,p_hotel text,p_account_id text,p_revision integer,p_billing_required boolean,p_credit_term integer,p_billing_recipients jsonb,p_collection_recipients jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing_revision integer;result jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','settings_forbidden');end if;
 if p_hotel not in ('KAT','TSK') or p_revision is null or p_revision<0 or p_credit_term<0 or not ar_private.valid_recipients(p_billing_recipients) or not ar_private.valid_recipients(p_collection_recipients) then return jsonb_build_object('error','settings_invalid');end if;
 perform pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
 if not exists(select 1 from public.ar_accounts where hotel=p_hotel and id=p_account_id) then return jsonb_build_object('error','settings_account_missing');end if;
 select revision into existing_revision from public.ar_account_settings where hotel=p_hotel and account_id=p_account_id for update;
 if coalesce(existing_revision,0)<>p_revision then return jsonb_build_object('error','settings_revision_conflict');end if;
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,billing_recipients,collection_recipients,revision)
 values(p_hotel,p_account_id,p_billing_required,p_credit_term,p_billing_recipients,p_collection_recipients,p_revision+1)
 on conflict(hotel,account_id) do update set billing_required=excluded.billing_required,credit_term=excluded.credit_term,billing_recipients=excluded.billing_recipients,collection_recipients=excluded.collection_recipients,revision=excluded.revision,updated_at=now();
 result:=public.ar_settings_get(p_hotel,p_account_id);
 insert into ar_private.account_settings_history values(p_hotel,p_account_id,p_revision+1,p_actor,result,now());
 if p_billing_required is not null and p_credit_term is not null then
  update public.ar_invoice_workflow w set billing_required=p_billing_required,credit_term=p_credit_term,settings_revision=p_revision+1
  from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account_id and i.collection_selectable and w.hotel=i.hotel and w.account_id=i.account_id and w.invoice_id=i.id and w.settings_revision is null;
 end if;return result;
end $$;
create function public.ar_workflow_history_save(p_actor uuid,p_hotel text,p_account_id text,p_invoice_id text,p_revision integer,p_first_billing_date date,p_stage text,p_stage_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ar_invoice_workflow;today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','settings_forbidden');end if;
 if (p_stage is null)<>(p_stage_date is null) or (p_stage is not null and p_stage not in ('Friendly','Follow 1','Follow 2','Follow 3','Final')) or p_first_billing_date>today or p_stage_date>today then return jsonb_build_object('error','history_invalid');end if;
 select * into w from public.ar_invoice_workflow where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id for update;
 if not found then return jsonb_build_object('error','history_missing');end if;
 if p_revision is null or w.revision<>p_revision then return jsonb_build_object('error','settings_revision_conflict');end if;
 update public.ar_invoice_workflow set first_billing_date=p_first_billing_date,last_reminder_stage=p_stage,last_reminder_date=p_stage_date,revision=revision+1,updated_at=now() where hotel=p_hotel and account_id=p_account_id and invoice_id=p_invoice_id returning * into w;
 insert into ar_private.invoice_workflow_history values(p_hotel,p_account_id,p_invoice_id,w.revision,p_actor,to_jsonb(w),now());return to_jsonb(w);
end $$;
revoke all on function public.ar_settings_get(text,text),public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb),public.ar_workflow_history_save(uuid,text,text,text,integer,date,text,date) from public,anon,authenticated;
grant execute on function public.ar_settings_get(text,text),public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb),public.ar_workflow_history_save(uuid,text,text,text,integer,date,text,date) to service_role;
revoke all on function ar_private.valid_recipients(jsonb),ar_private.sync_invoice_workflow() from public,anon,authenticated;
