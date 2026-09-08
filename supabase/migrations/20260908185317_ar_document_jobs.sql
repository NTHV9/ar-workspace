-- Private native-document work; no OPERA balances or source rows are mutated.
create function ar_private.document_path(p_job uuid,p_key text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(length(p_key) between 1 and 600
   and p_key ~ ('^jobs/'||p_job::text||'/[A-Za-z0-9][A-Za-z0-9._/-]*$')
   and p_key !~ '(^|/)\.\.?(/|$)' and p_key !~ '//|/$',false);
$$;

create table public.ar_document_jobs (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id),
 command_key uuid not null,
 hotel text not null check(hotel in ('KAT','TSK')),
 account_id text not null check(length(account_id) between 1 and 200),
 account_name text not null,
 -- OPERA ARS selection contract allows up to 4,000 invoices; never truncate.
 invoice_ids text[] not null check(cardinality(invoice_ids) between 1 and 4000),
 content text not null check(content in ('statement','invoices','both')),
 layout text not null check(layout in ('combined','statement_bundle','separate')),
 purpose text not null check(purpose in ('billing','collection')),
 fingerprint text not null,
 manifest jsonb not null check(jsonb_typeof(manifest)='array' and jsonb_array_length(manifest) between 1 and 4000),
 balance_snapshot numeric(18,2) not null check(balance_snapshot>0),
 currency text not null default 'THB' check(currency='THB'),
 state text not null default 'queued' check(state in ('queued','running','ready','partial','failed','uncertain')),
 revision integer not null default 0 check(revision>=0),
 project_key text check(project_key is null or ar_private.document_path(id,project_key)),
 exports jsonb not null default '[]' check(jsonb_typeof(exports)='array'),
 acknowledged boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner,command_key)
);
create unique index ar_document_active_scope on public.ar_document_jobs(owner,fingerprint)
 where state in ('queued','running','uncertain');
create index ar_document_owner_created on public.ar_document_jobs(owner,created_at desc);

create table public.ar_document_files (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.ar_document_jobs(id),
 ordinal integer not null check(ordinal between 0 and 4000),
 kind text not null check(kind in ('statement','invoice')),
 invoice_id text,
 state text not null default 'pending' check(state in ('pending','generating','ready','unavailable','uncertain')),
 storage_key text,
 byte_count bigint check(byte_count>0 and byte_count<=104857600),
 sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),
 error_code text check(error_code ~ '^[a-zA-Z0-9_]{1,100}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(job_id,ordinal),
 check((kind='statement' and ordinal=0 and invoice_id is null) or (kind='invoice' and ordinal>0 and invoice_id is not null)),
 check(storage_key is null or storage_key='jobs/'||job_id::text||'/originals/'||id::text||'.pdf'),
 check((state='ready' and storage_key is not null and byte_count is not null and sha256 is not null and error_code is null)
   or (state<>'ready' and storage_key is null and byte_count is null and sha256 is null)),
 check((state in ('unavailable','uncertain') and error_code is not null) or (state not in ('unavailable','uncertain') and error_code is null))
);
create unique index ar_document_invoice_placeholder on public.ar_document_files(job_id,invoice_id) where kind='invoice';

-- Every command, including one joined to existing work, keeps its immutable payload.
create table ar_private.document_commands (
 owner uuid not null references auth.users(id), command_key uuid not null,
 payload jsonb not null, job_id uuid not null references public.ar_document_jobs(id),
 created_at timestamptz not null default now(), primary key(owner,command_key)
);
create table ar_private.document_revisions (
 job_id uuid not null references public.ar_document_jobs(id), revision integer not null check(revision>0),
 project_key text not null, exports jsonb not null, acknowledged boolean not null,
 created_at timestamptz not null default now(), primary key(job_id,revision),
 check(ar_private.document_path(job_id,project_key))
);
-- Registered only after the backend verifies bytes and uploads without upsert.
-- Browser-provided paths/hashes never establish an upload receipt.
create table ar_private.document_uploads (
 storage_key text primary key,
 job_id uuid not null references public.ar_document_jobs(id),
 byte_count bigint not null check(byte_count between 1 and 104857600),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 mime text not null check(mime in ('application/json','application/pdf')),
 created_at timestamptz not null default now(),
 check((mime='application/json' and storage_key ~ ('^jobs/'||job_id::text||'/projects/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.json$'))
   or (mime='application/pdf' and storage_key ~ ('^jobs/'||job_id::text||'/exports/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$')))
);
create index ar_document_upload_job on ar_private.document_uploads(job_id);

alter table public.ar_document_jobs enable row level security;
alter table public.ar_document_files enable row level security;
alter table ar_private.document_commands enable row level security;
alter table ar_private.document_revisions enable row level security;
alter table ar_private.document_uploads enable row level security;
revoke all on public.ar_document_jobs,public.ar_document_files,ar_private.document_commands,ar_private.document_revisions,ar_private.document_uploads from public,anon,authenticated,service_role;
grant select on public.ar_document_jobs,public.ar_document_files to authenticated;
create policy ar_document_owner_read on public.ar_document_jobs for select to authenticated
 using(owner=(select auth.uid()) and (select ar_private.is_member()));
create policy ar_document_owner_read on public.ar_document_files for select to authenticated
 using((select ar_private.is_member()) and exists(select 1 from public.ar_document_jobs j where j.id=job_id and j.owner=(select auth.uid())));
-- Preserve the existing diagnostic namespace while narrowing all job objects to
-- their owner. Compare UUID text: malformed object names must never raise casts.
alter policy ar_private_file_read on storage.objects to authenticated using (
 bucket_id='ar-working-files' and (select ar_private.is_member()) and (
   name like 'validation/%' or (
     split_part(name,'/',1)='jobs' and exists (
       select 1 from public.ar_document_jobs j
       where j.id::text=split_part(name,'/',2) and j.owner=(select auth.uid())
     )
   )
 )
);

create function public.ar_document_get(p_job_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(j)||jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f) order by f.ordinal)
 from public.ar_document_files f where f.job_id=j.id),'[]'::jsonb)) from public.ar_document_jobs j where j.id=p_job_id;
$$;

create function public.ar_document_create(p_owner uuid,p_command_key uuid,p_hotel text,p_account_id text,p_ids text[],p_content text,p_layout text,p_purpose text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; prior ar_private.document_commands; j public.ar_document_jobs; snap jsonb; total numeric; nm text; fp text;
begin
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then
   raise exception 'document_owner_denied'; end if;
 if p_command_key is null or p_hotel is null or p_hotel not in ('KAT','TSK') or p_account_id is null or length(p_account_id) not between 1 and 200
   or p_content is null or p_content not in ('statement','invoices','both') or p_layout is null or p_layout not in ('combined','statement_bundle','separate')
   or p_purpose is null or p_purpose not in ('billing','collection') or p_ids is null or array_ndims(p_ids)<>1
   or cardinality(p_ids) not between 1 and 4000 or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v)
   or exists(select 1 from unnest(p_ids) v where v is null or length(v) not between 1 and 200) then raise exception 'document_request_invalid'; end if;
 payload:=jsonb_build_object('hotel',p_hotel,'account_id',p_account_id,'ids',p_ids,'content',p_content,'layout',p_layout,'purpose',p_purpose);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_command_key::text,61705));
 select * into prior from ar_private.document_commands where owner=p_owner and command_key=p_command_key;
 if found then
   if prior.payload<>payload then raise exception 'document_command_conflict'; end if;
   return public.ar_document_get(prior.job_id);
 end if;
 -- Selection order is binding; differently ordered manifests are different work.
 fp:=md5(payload::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||fp,61706));
 -- Coordinate with atomic refresh publication; capture exactly one current selection snapshot.
 perform pg_catalog.pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
 select jsonb_agg(to_jsonb(i) order by ids.ordinal),sum(i.open) into snap,total
 from unnest(p_ids) with ordinality ids(id,ordinal)
 join public.ar_invoices i on i.hotel=p_hotel and i.account_id=p_account_id and i.id=ids.id and i.collection_selectable;
 if snap is null or jsonb_array_length(snap)<>cardinality(p_ids) then raise exception 'document_selection_invalid'; end if;
 select name into nm from public.ar_accounts where hotel=p_hotel and id=p_account_id;
 if not found then raise exception 'document_account_missing'; end if;
 select * into j from public.ar_document_jobs where owner=p_owner and fingerprint=fp and state in ('queued','running','uncertain') for update;
 if found then
   insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
   return public.ar_document_get(j.id);
 end if;
 insert into public.ar_document_jobs(owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot)
 values(p_owner,p_command_key,p_hotel,p_account_id,nm,p_ids,p_content,p_layout,p_purpose,fp,snap,total) returning * into j;
 if p_content in ('statement','both') then insert into public.ar_document_files(job_id,ordinal,kind) values(j.id,0,'statement'); end if;
 if p_content in ('invoices','both') then
   insert into public.ar_document_files(job_id,ordinal,kind,invoice_id) select j.id,ordinal::integer,'invoice',id from unnest(p_ids) with ordinality ids(id,ordinal);
 end if;
 insert into ar_private.document_commands(owner,command_key,payload,job_id) values(p_owner,p_command_key,payload,j.id);
 return public.ar_document_get(j.id);
end;
$$;

-- Caller holds the job row lock before any file change, preventing lost aggregate updates.
create function ar_private.document_aggregate(p_job uuid) returns void
language sql security definer set search_path='' as $$
 update public.ar_document_jobs set state=(select case
   when bool_or(state='uncertain') then 'uncertain'
   when bool_or(state='generating') then 'running'
   when bool_or(state='pending') then 'queued'
   when bool_and(state='ready') then 'ready'
   when bool_or(state='ready') then 'partial' else 'failed' end
   from public.ar_document_files where job_id=p_job),updated_at=now() where id=p_job;
$$;

create function public.ar_document_claim_file(p_job_id uuid,p_file_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.ar_document_files; claimed boolean:=false;
begin
 perform 1 from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 select * into f from public.ar_document_files where id=p_file_id and job_id=p_job_id for update;
 if not found then raise exception 'document_file_missing'; end if;
 if f.state='pending' then
   update public.ar_document_files set state='generating',updated_at=now() where id=f.id returning * into f;
   claimed:=true;
 elsif f.state='generating' then
   update public.ar_document_files set state='uncertain',error_code='generation_already_claimed',updated_at=now() where id=f.id returning * into f;
 end if;
 perform ar_private.document_aggregate(p_job_id);
 return jsonb_build_object('claimed',claimed,'file',to_jsonb(f));
end;
$$;

create function public.ar_document_finish_file(p_job_id uuid,p_file_id uuid,p_storage_key text,p_bytes bigint,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.ar_document_files;
begin
 perform 1 from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 select * into f from public.ar_document_files where id=p_file_id and job_id=p_job_id for update;
 if not found then raise exception 'document_file_missing'; end if;
 if p_storage_key is null or p_storage_key<>'jobs/'||p_job_id::text||'/originals/'||p_file_id::text||'.pdf'
   or p_bytes is null or p_bytes not between 1 and 104857600 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'document_result_invalid'; end if;
 if f.state='ready' then
   if f.storage_key<>p_storage_key or f.byte_count<>p_bytes or f.sha256<>p_sha256 then raise exception 'document_result_conflict'; end if;
   return public.ar_document_get(p_job_id);
 end if;
 if f.state not in ('generating','uncertain') then raise exception 'document_file_not_claimed'; end if;
 update public.ar_document_files set state='ready',storage_key=p_storage_key,byte_count=p_bytes,sha256=p_sha256,error_code=null,updated_at=now() where id=f.id;
 perform ar_private.document_aggregate(p_job_id);
 return public.ar_document_get(p_job_id);
end;
$$;

create function public.ar_document_fail_file(p_job_id uuid,p_file_id uuid,p_code text,p_uncertain boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.ar_document_files; target text;
begin
 if p_code is null or p_code !~ '^[a-zA-Z0-9_]{1,100}$' or p_uncertain is null then raise exception 'document_error_invalid'; end if;
 target:=case when p_uncertain then 'uncertain' else 'unavailable' end;
 perform 1 from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 select * into f from public.ar_document_files where id=p_file_id and job_id=p_job_id for update;
 if not found then raise exception 'document_file_missing'; end if;
 if f.state='ready' then return public.ar_document_get(p_job_id); end if;
 if f.state='unavailable' then
   if target<>f.state or p_code<>f.error_code then raise exception 'document_result_conflict'; end if;
   return public.ar_document_get(p_job_id);
 end if;
 -- Pending can be classified unavailable before an unsupported report is requested.
 -- An uncertain native request can never become retryable through failure handling.
 if f.state='uncertain' then target:='uncertain'; end if;
 update public.ar_document_files set state=target,error_code=p_code,updated_at=now() where id=f.id;
 perform ar_private.document_aggregate(p_job_id);
 return public.ar_document_get(p_job_id);
end;
$$;

create function public.ar_document_register_upload(p_job_id uuid,p_storage_key text,p_bytes bigint,p_sha256 text,p_mime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt ar_private.document_uploads;
begin
 perform 1 from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 if p_storage_key is null or p_bytes is null or p_bytes not between 1 and 104857600 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
   or p_mime is null or p_mime not in ('application/json','application/pdf')
   or not ((p_mime='application/json' and p_storage_key ~ ('^jobs/'||p_job_id::text||'/projects/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.json$'))
      or (p_mime='application/pdf' and p_storage_key ~ ('^jobs/'||p_job_id::text||'/exports/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$'))) then raise exception 'document_upload_invalid'; end if;
 select * into receipt from ar_private.document_uploads where storage_key=p_storage_key;
 if found then
   if receipt.job_id<>p_job_id or receipt.byte_count<>p_bytes or receipt.sha256<>p_sha256 or receipt.mime<>p_mime then raise exception 'document_upload_conflict'; end if;
   return to_jsonb(receipt);
 end if;
 insert into ar_private.document_uploads(job_id,storage_key,byte_count,sha256,mime)
 values(p_job_id,p_storage_key,p_bytes,p_sha256,p_mime) returning * into receipt;
 return to_jsonb(receipt);
end;
$$;

create function public.ar_document_save_project(p_job_id uuid,p_revision integer,p_project_key text,p_exports jsonb,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs; e jsonb;
begin
 select * into j from public.ar_document_jobs where id=p_job_id for update;
 if not found then raise exception 'document_job_missing'; end if;
 if p_revision is null or p_revision<>j.revision then raise exception 'document_revision_conflict'; end if;
 if not ar_private.document_path(p_job_id,p_project_key) or p_exports is null or jsonb_typeof(p_exports)<>'array' or jsonb_array_length(p_exports)>4001
   or p_acknowledged is null or (p_acknowledged and jsonb_array_length(p_exports)=0) then raise exception 'document_project_invalid'; end if;
 if not exists(select 1 from ar_private.document_uploads where job_id=p_job_id and storage_key=p_project_key and mime='application/json') then
   raise exception 'document_project_upload_missing'; end if;
 for e in select value from jsonb_array_elements(p_exports) loop
   if jsonb_typeof(e)<>'object' or not(e ?& array['name','storage_key','byte_count','sha256'])
     or (e-array['name','storage_key','byte_count','sha256'])<>'{}'::jsonb
     or jsonb_typeof(e->'name')<>'string' or length(e->>'name') not between 1 and 200
     or jsonb_typeof(e->'storage_key')<>'string' or not ar_private.document_path(p_job_id,e->>'storage_key')
     or jsonb_typeof(e->'byte_count')<>'number' or (e->>'byte_count') !~ '^[0-9]{1,9}$'
     or jsonb_typeof(e->'sha256')<>'string' or (e->>'sha256') !~ '^[0-9a-f]{64}$' then raise exception 'document_export_invalid'; end if;
   if (e->>'byte_count')::bigint not between 1 and 104857600 then raise exception 'document_export_size_invalid'; end if;
   if not exists(select 1 from ar_private.document_uploads u where u.job_id=p_job_id and u.storage_key=e->>'storage_key'
     and u.mime='application/pdf' and u.byte_count=(e->>'byte_count')::bigint and u.sha256=e->>'sha256') then
     raise exception 'document_export_upload_mismatch'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_exports) export_row(value) group by export_row.value->>'storage_key' having count(*)>1) then raise exception 'document_export_duplicate'; end if;
 -- Append references for every revision; no storage objects or older revisions are removed.
 insert into ar_private.document_revisions(job_id,revision,project_key,exports,acknowledged)
 values(j.id,j.revision+1,p_project_key,p_exports,p_acknowledged);
 update public.ar_document_jobs set revision=revision+1,project_key=p_project_key,exports=p_exports,acknowledged=p_acknowledged,updated_at=now() where id=j.id;
 return public.ar_document_get(j.id);
end;
$$;

revoke all on function ar_private.document_path(uuid,text),ar_private.document_aggregate(uuid),
 public.ar_document_get(uuid),public.ar_document_create(uuid,uuid,text,text,text[],text,text,text),
 public.ar_document_claim_file(uuid,uuid),public.ar_document_finish_file(uuid,uuid,text,bigint,text),
 public.ar_document_register_upload(uuid,text,bigint,text,text),
 public.ar_document_fail_file(uuid,uuid,text,boolean),public.ar_document_save_project(uuid,integer,text,jsonb,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.ar_document_get(uuid),public.ar_document_create(uuid,uuid,text,text,text[],text,text,text),
 public.ar_document_claim_file(uuid,uuid),public.ar_document_finish_file(uuid,uuid,text,bigint,text),
 public.ar_document_register_upload(uuid,text,bigint,text,text),
 public.ar_document_fail_file(uuid,uuid,text,boolean),public.ar_document_save_project(uuid,integer,text,jsonb,boolean) to service_role;
-- Every SECURITY DEFINER entrypoint above is service-role-only. Backend validates
-- the current member and job owner before invoking it; clients only SELECT via RLS.
