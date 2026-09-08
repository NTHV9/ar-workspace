-- New project only; preflight verified no public tables or migration history.
create schema ar_private;
revoke all on schema ar_private from public, anon;
grant usage on schema ar_private to authenticated;

create function ar_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = (select auth.uid())
    and lower(email) = 'ar@katathani.com' and email_confirmed_at is not null
    and coalesce(is_anonymous, false) = false);
$$;
revoke all on function ar_private.is_member() from public, anon;
grant execute on function ar_private.is_member() to authenticated;

-- No public signup: even direct Auth API requests cannot create other users.
create function ar_private.restrict_user() returns trigger
language plpgsql set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) <> 'ar@katathani.com' or coalesce(new.is_anonymous, false) then
    raise exception 'This application is restricted to approved accounts';
  end if;
  return new;
end;
$$;
revoke all on function ar_private.restrict_user() from public, anon, authenticated;
create trigger ar_restrict_new_user before insert on auth.users for each row execute function ar_private.restrict_user();

create table public.ar_accounts (
  hotel text not null, id text not null, name text not null, type text not null,
  open numeric(18,2) not null, over90 numeric(18,2) not null, items integer not null check (items >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  "group" text, aging jsonb, "creditLimit" numeric(18,2), oldest integer,
  synced_at timestamptz not null default now(), primary key (hotel, id)
);
create table public.ar_invoices (
  hotel text not null, account_id text not null, id text not null,
  guest text, invoice_no text, folio_no text, transaction_date date not null,
  original numeric(18,2) not null, open numeric(18,2) not null, aging text,
  primary key (hotel, account_id, id),
  foreign key (hotel, account_id) references public.ar_accounts(hotel,id)
);
create table public.ar_account_settings (
  hotel text not null, account_id text not null,
  billing_required boolean, credit_term integer check (credit_term >= 0),
  billing_recipients jsonb not null default '{"to":[],"cc":[],"bcc":[]}',
  collection_recipients jsonb not null default '{"to":[],"cc":[],"bcc":[]}',
  primary key (hotel, account_id)
);
alter table public.ar_accounts enable row level security;
alter table public.ar_invoices enable row level security;
alter table public.ar_account_settings enable row level security;
revoke all on public.ar_accounts, public.ar_invoices, public.ar_account_settings from anon, authenticated;
grant select on public.ar_accounts, public.ar_invoices, public.ar_account_settings to authenticated;
create policy ar_member_read on public.ar_accounts for select to authenticated using ((select ar_private.is_member()));
create policy ar_member_read on public.ar_invoices for select to authenticated using ((select ar_private.is_member()));
create policy ar_member_read on public.ar_account_settings for select to authenticated using ((select ar_private.is_member()));

-- Connectivity probe exposes only an application schema version, never customer data.
create function public.ar_health() returns text language sql immutable set search_path = '' as $$ select 'ar-workspace-v1'::text $$;
revoke all on function public.ar_health() from public;
grant execute on function public.ar_health() to anon, authenticated;

insert into storage.buckets (id, name, public) values ('ar-working-files', 'ar-working-files', false);
create policy ar_private_file_read on storage.objects for select to authenticated
using (bucket_id = 'ar-working-files' and (select ar_private.is_member()));
-- Upload/delete policies are intentionally absent until the document workflow is implemented.
