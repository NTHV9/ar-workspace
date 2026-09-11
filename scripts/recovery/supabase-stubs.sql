-- Local synthetic drill only. Minimal dependencies, not a replacement Supabase service.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create schema supabase_migrations;
create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner uuid,metadata jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select on storage.objects to authenticated;
create table supabase_migrations.schema_migrations(version text primary key,name text not null,statements text[] not null default '{}');
-- Synthetic identity exists before the application allowlist trigger is installed.
insert into auth.users values('00000000-0000-4000-8000-000000000001','ar@katathani.com',now(),false),('00000000-0000-4000-8000-000000000002','unapproved@example.test',now(),false);
