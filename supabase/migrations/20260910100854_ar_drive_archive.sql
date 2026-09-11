-- Drive grants, targets and upload sessions are private and service-only. No folder ID is shipped in this migration.
create table ar_private.drive_targets (
 owner uuid primary key references auth.users(id), folder_id text not null check(folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
 revision integer not null default 1 check(revision>0), name text, drive_id text, verified_at timestamptz,
 visibility text not null default 'unknown' check(visibility in ('public','restricted','unknown'))
);
create table ar_private.drive_connections (
 owner uuid primary key references auth.users(id), email text not null check(lower(email)='ar@katathani.com'),
 payload jsonb not null, scope text not null check(scope='https://www.googleapis.com/auth/drive.file'),connected_at timestamptz not null default now(),revision integer not null default 1 check(revision>0)
);
create table ar_private.drive_oauth_states (
 state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),owner uuid not null references auth.users(id),
 verifier jsonb not null,expires_at timestamptz not null,used_at timestamptz
);
create table ar_private.drive_archives (
 id uuid primary key,owner uuid not null references auth.users(id),kind text not null check(kind in ('job','test')),
 document_job_id uuid references public.ar_document_jobs(id),document_revision integer,
 target_revision integer not null,folder_id text not null,created_at timestamptz not null default now(),
 check((kind='test' and document_job_id is null and document_revision is null) or (kind='job' and document_job_id is not null and document_revision>0))
);
create unique index drive_archive_review_once on ar_private.drive_archives(owner,document_job_id,document_revision,target_revision) where kind='job';
create table ar_private.drive_commands (
 owner uuid not null references auth.users(id),command_id uuid not null,archive_id uuid not null references ar_private.drive_archives(id),
 kind text not null,document_job_id uuid,document_revision integer,target_revision integer not null,primary key(owner,command_id)
);
create table ar_private.drive_archive_files (
 archive_id uuid not null references ar_private.drive_archives(id),ordinal integer not null check(ordinal between 0 and 4000),name text not null check(length(name) between 1 and 200),
 storage_key text,byte_count bigint not null check(byte_count between 1 and 104857600),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 drive_file_id text unique check(drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),state text not null default 'pending' check(state in ('pending','uploading','verified','error','trashed')),
 session jsonb,claim_token uuid,lease_until timestamptz,url text,error_code text check(error_code ~ '^drive_[a-z_]{1,60}$'),
 read_verified boolean not null default false,updated_at timestamptz not null default now(),primary key(archive_id,ordinal),
 check(state not in ('verified','trashed') or drive_file_id is not null)
);
alter table ar_private.drive_targets enable row level security;
alter table ar_private.drive_connections enable row level security;
alter table ar_private.drive_oauth_states enable row level security;
alter table ar_private.drive_archives enable row level security;
alter table ar_private.drive_commands enable row level security;
alter table ar_private.drive_archive_files enable row level security;
revoke all on ar_private.drive_targets,ar_private.drive_connections,ar_private.drive_oauth_states,ar_private.drive_archives,ar_private.drive_commands,ar_private.drive_archive_files from public,anon,authenticated,service_role;

create function ar_private.drive_actor(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false));
$$;
create function ar_private.drive_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(a)||jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f) order by ordinal) from ar_private.drive_archive_files f where archive_id=a.id),'[]')) from ar_private.drive_archives a where id=p_id;
$$;
create function public.ar_drive_target_get(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 return (select to_jsonb(t) from ar_private.drive_targets t where owner=p_owner);end $$;
create function public.ar_drive_target_verify(p_owner uuid,p_folder text,p_revision integer,p_name text,p_drive_id text,p_visibility text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t ar_private.drive_targets;
begin if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 update ar_private.drive_targets set name=left(p_name,200),drive_id=p_drive_id,visibility=p_visibility,verified_at=now() where owner=p_owner and folder_id=p_folder and revision=p_revision returning * into t;
 if not found then return jsonb_build_object('error','drive_target_changed');end if;return to_jsonb(t);end $$;
create function public.ar_drive_state_create(p_owner uuid,p_hash text,p_verifier jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) then return false;end if;
 insert into ar_private.drive_oauth_states(state_hash,owner,verifier,expires_at) values(p_hash,p_owner,p_verifier,now()+interval '10 minutes');return true;end $$;
create function public.ar_drive_state_consume(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.drive_oauth_states;
begin update ar_private.drive_oauth_states set used_at=now() where state_hash=p_hash and used_at is null and expires_at>now() returning * into s;
 if not found or not ar_private.drive_actor(s.owner) then return null;end if;return to_jsonb(s);end $$;
create function public.ar_drive_connection_put(p_owner uuid,p_email text,p_payload jsonb,p_scope text) returns boolean language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) or lower(p_email)<>'ar@katathani.com' or p_scope is distinct from 'https://www.googleapis.com/auth/drive.file' then return false;end if;
 insert into ar_private.drive_connections as c(owner,email,payload,scope) values(p_owner,p_email,p_payload,p_scope) on conflict(owner) do update set email=excluded.email,payload=excluded.payload,scope=excluded.scope,connected_at=now(),revision=c.revision+1;return true;end $$;
-- A refresh is conditional on the exact loaded grant; it never inserts or overwrites a newer reconnect.
create function public.ar_drive_connection_refresh(p_owner uuid,p_expected_revision integer,p_payload jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) or p_expected_revision is null or p_payload is null then return false;end if;
 update ar_private.drive_connections set payload=p_payload,revision=revision+1 where owner=p_owner and revision=p_expected_revision;return found;end $$;
create function public.ar_drive_connection_get(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;return(select to_jsonb(c) from ar_private.drive_connections c where owner=p_owner);end $$;
create function public.ar_drive_archive_get(p_owner uuid,p_job uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a ar_private.drive_archives;
begin if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 if not exists(select 1 from public.ar_document_jobs where id=p_job and owner=p_owner) then return jsonb_build_object('error','drive_missing');end if;
 select * into a from ar_private.drive_archives where owner=p_owner and document_job_id=p_job and document_revision=p_revision order by created_at desc limit 1;return ar_private.drive_snapshot(a.id);end $$;
create function public.ar_drive_archive_read(p_owner uuid,p_archive uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 if not exists(select 1 from ar_private.drive_archives where id=p_archive and owner=p_owner) then return jsonb_build_object('error','drive_missing');end if;return ar_private.drive_snapshot(p_archive);end $$;

-- A command binds to one exact reviewed export set; a different command for that same revision joins it.
create function public.ar_drive_archive_open(p_owner uuid,p_command uuid,p_kind text,p_job uuid,p_revision integer,p_expected_target_revision integer,p_test_bytes bigint default null,p_test_sha text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t ar_private.drive_targets;j public.ar_document_jobs;r ar_private.document_revisions;c ar_private.drive_commands;a ar_private.drive_archives;e jsonb;i integer:=0;
begin
 if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 -- Serialize commands and revisions for this destination without a network call inside the transaction.
 select * into t from ar_private.drive_targets where owner=p_owner for update;
 if not found then return jsonb_build_object('error','drive_target_missing');end if;
 if p_expected_target_revision is distinct from t.revision then return jsonb_build_object('error','drive_target_changed');end if;
 if t.verified_at is null then return jsonb_build_object('error','drive_target_not_ready');end if;
 if p_kind not in ('job','test') or p_command is null then return jsonb_build_object('error','drive_invalid');end if;
 select * into c from ar_private.drive_commands where owner=p_owner and command_id=p_command;
 if found then
  if c.kind is distinct from p_kind or c.document_job_id is distinct from p_job or c.document_revision is distinct from p_revision or c.target_revision<>t.revision then return jsonb_build_object('error','drive_command_conflict');end if;
  return ar_private.drive_snapshot(c.archive_id);
 end if;
 if p_kind='job' then
  if t.visibility<>'restricted' then return jsonb_build_object('error','drive_target_not_private');end if;
  select * into j from public.ar_document_jobs where id=p_job and owner=p_owner for share;
  if not found then return jsonb_build_object('error','drive_missing');end if;
  if p_revision is null or j.revision<>p_revision then return jsonb_build_object('error','drive_revision_conflict');end if;
  if not j.acknowledged then return jsonb_build_object('error','drive_unreviewed');end if;
  if j.state<>'ready' or jsonb_array_length(j.exports) not between 1 and 4001 then return jsonb_build_object('error','drive_incomplete');end if;
  select * into r from ar_private.document_revisions where job_id=p_job and revision=p_revision;
  if not found or not r.acknowledged or r.exports<>j.exports then return jsonb_build_object('error','drive_revision_conflict');end if;
  if exists(select 1 from jsonb_array_elements(j.exports) x where not exists(select 1 from ar_private.document_uploads u where u.job_id=j.id and u.storage_key=x->>'storage_key' and u.byte_count=(x->>'byte_count')::bigint and u.sha256=x->>'sha256' and u.mime='application/pdf')) then return jsonb_build_object('error','drive_source_changed');end if;
  select * into a from ar_private.drive_archives where owner=p_owner and document_job_id=p_job and document_revision=p_revision and target_revision=t.revision;
  if found then
   insert into ar_private.drive_commands values(p_owner,p_command,a.id,p_kind,p_job,p_revision,t.revision);return ar_private.drive_snapshot(a.id);
  end if;
 else
  if p_job is not null or p_revision is not null or p_test_bytes not between 1 and 65536 or p_test_sha !~ '^[0-9a-f]{64}$' or p_test_bytes is null or p_test_sha is null then return jsonb_build_object('error','drive_invalid');end if;
 end if;
 insert into ar_private.drive_archives(id,owner,kind,document_job_id,document_revision,target_revision,folder_id) values(p_command,p_owner,p_kind,p_job,p_revision,t.revision,t.folder_id) returning * into a;
 insert into ar_private.drive_commands values(p_owner,p_command,a.id,p_kind,p_job,p_revision,t.revision);
 if p_kind='test' then insert into ar_private.drive_archive_files(archive_id,ordinal,name,byte_count,sha256) values(a.id,0,'AR synthetic connection test.pdf',p_test_bytes,p_test_sha);
 else for e in select value from jsonb_array_elements(j.exports) loop
  insert into ar_private.drive_archive_files(archive_id,ordinal,name,storage_key,byte_count,sha256) values(a.id,i,e->>'name',e->>'storage_key',(e->>'byte_count')::bigint,e->>'sha256');i:=i+1;
 end loop;end if;
 return ar_private.drive_snapshot(a.id);
end $$;

create function public.ar_drive_file_claim(p_owner uuid,p_archive uuid,p_ordinal integer,p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a ar_private.drive_archives;t ar_private.drive_targets;j public.ar_document_jobs;f ar_private.drive_archive_files;
begin
 if not ar_private.drive_actor(p_owner) then return jsonb_build_object('error','drive_forbidden');end if;
 select * into t from ar_private.drive_targets where owner=p_owner for share;
 select * into a from ar_private.drive_archives where id=p_archive and owner=p_owner;
 if a.id is null then return jsonb_build_object('error','drive_missing');end if;
 if t.owner is null or a.target_revision<>t.revision or a.folder_id<>t.folder_id or t.verified_at is null then return jsonb_build_object('error','drive_target_changed');end if;
 if a.kind='job' then
  if t.visibility<>'restricted' then return jsonb_build_object('error','drive_target_not_private');end if;
  select * into j from public.ar_document_jobs where id=a.document_job_id and owner=p_owner for share;
  if j.id is null or j.revision<>a.document_revision or not j.acknowledged or j.state<>'ready' then return jsonb_build_object('error','drive_revision_conflict');end if;
 end if;
 select * into f from ar_private.drive_archive_files where archive_id=a.id and ordinal=p_ordinal for update;
 if not found then return jsonb_build_object('error','drive_missing');end if;
 if f.state='trashed' or (a.kind='job' and f.state='verified') or (f.lease_until>now() and f.claim_token is not null) then return jsonb_build_object('claimed',false,'file',to_jsonb(f));end if;
 update ar_private.drive_archive_files set state=case when state='verified' then state else 'uploading' end,claim_token=p_claim,lease_until=now()+interval '3 minutes',error_code=null,updated_at=now() where archive_id=a.id and ordinal=p_ordinal returning * into f;
 return jsonb_build_object('claimed',true,'file',to_jsonb(f));
end $$;

-- Receipt mutation always includes the active claim; generated IDs can be assigned once only.
create function public.ar_drive_file_update(p_owner uuid,p_archive uuid,p_ordinal integer,p_claim uuid,p_action text,p_value jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare a ar_private.drive_archives;f ar_private.drive_archive_files;
begin
 if not ar_private.drive_actor(p_owner) then return false;end if;
 select * into a from ar_private.drive_archives where id=p_archive and owner=p_owner;
 if not found then return false;end if;
 select * into f from ar_private.drive_archive_files where archive_id=a.id and ordinal=p_ordinal and claim_token=p_claim for update;
 if not found then return false;end if;
 if p_action='id' then
  if f.drive_file_id is not null or (p_value->>'id') !~ '^[A-Za-z0-9_-]{10,200}$' or p_value->>'id' is null then return false;end if;
  update ar_private.drive_archive_files set drive_file_id=p_value->>'id' where archive_id=a.id and ordinal=p_ordinal;
 elsif p_action='session' then
  if f.drive_file_id is null or (p_value<>'null'::jsonb and not (p_value ?& array['iv','data'])) then return false;end if;
  update ar_private.drive_archive_files set session=nullif(p_value,'null'::jsonb),lease_until=now()+interval '3 minutes' where archive_id=a.id and ordinal=p_ordinal;
 elsif p_action='verified' then
  if f.drive_file_id is null or (a.kind='test' and (p_value->>'readVerified')::boolean is distinct from true) then return false;end if;
  update ar_private.drive_archive_files set state='verified',url=p_value->>'url',read_verified=(a.kind='test'),error_code=null,session=null,claim_token=case when a.kind='job' then null else p_claim end,lease_until=case when a.kind='job' then null else now()+interval '3 minutes' end where archive_id=a.id and ordinal=p_ordinal;
 elsif p_action='trashed' then
  if a.kind<>'test' or not f.read_verified or f.drive_file_id is null then return false;end if;
  update ar_private.drive_archive_files set state='trashed',error_code=null,url=null,session=null,claim_token=null,lease_until=null where archive_id=a.id and ordinal=p_ordinal;
 elsif p_action='error' then
  if p_value->>'error' is null or (p_value->>'error') !~ '^drive_[a-z_]{1,60}$' then return false;end if;
  update ar_private.drive_archive_files set state='error',error_code=p_value->>'error',claim_token=null,lease_until=null where archive_id=a.id and ordinal=p_ordinal;
 else return false;end if;return true;
end $$;

-- Guard immutable source snapshots even against accidental future worker SQL changes.
create function ar_private.drive_receipt_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.archive_id,new.ordinal,new.name,new.storage_key,new.byte_count,new.sha256) is distinct from row(old.archive_id,old.ordinal,old.name,old.storage_key,old.byte_count,old.sha256) or (old.drive_file_id is not null and new.drive_file_id is distinct from old.drive_file_id) then raise exception 'drive_receipt_immutable';end if;
 new.updated_at=now();return new;end $$;
create trigger drive_receipt_immutable before update on ar_private.drive_archive_files for each row execute function ar_private.drive_receipt_immutable();
create function ar_private.drive_target_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner<>old.owner or new.revision<old.revision or new.revision>old.revision+1 or (new.folder_id<>old.folder_id and new.revision<>old.revision+1) then raise exception 'drive_target_revision_conflict';end if;
 if new.revision<>old.revision then new.name=null;new.drive_id=null;new.verified_at=null;new.visibility='unknown';end if;return new;
end $$;
create trigger drive_target_revision before update on ar_private.drive_targets for each row execute function ar_private.drive_target_revision();
revoke all on function ar_private.drive_target_revision() from public,anon,authenticated,service_role;
revoke all on function ar_private.drive_actor(uuid),ar_private.drive_snapshot(uuid),ar_private.drive_receipt_immutable() from public,anon,authenticated,service_role;
revoke all on function public.ar_drive_target_get(uuid),public.ar_drive_target_verify(uuid,text,integer,text,text,text),public.ar_drive_state_create(uuid,text,jsonb),public.ar_drive_state_consume(text),public.ar_drive_connection_put(uuid,text,jsonb,text),public.ar_drive_connection_refresh(uuid,integer,jsonb),public.ar_drive_connection_get(uuid),public.ar_drive_archive_get(uuid,uuid,integer),public.ar_drive_archive_read(uuid,uuid),public.ar_drive_archive_open(uuid,uuid,text,uuid,integer,integer,bigint,text),public.ar_drive_file_claim(uuid,uuid,integer,uuid),public.ar_drive_file_update(uuid,uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ar_drive_target_get(uuid),public.ar_drive_target_verify(uuid,text,integer,text,text,text),public.ar_drive_state_create(uuid,text,jsonb),public.ar_drive_state_consume(text),public.ar_drive_connection_put(uuid,text,jsonb,text),public.ar_drive_connection_refresh(uuid,integer,jsonb),public.ar_drive_connection_get(uuid),public.ar_drive_archive_get(uuid,uuid,integer),public.ar_drive_archive_read(uuid,uuid),public.ar_drive_archive_open(uuid,uuid,text,uuid,integer,integer,bigint,text),public.ar_drive_file_claim(uuid,uuid,integer,uuid),public.ar_drive_file_update(uuid,uuid,integer,uuid,text,jsonb) to service_role;
