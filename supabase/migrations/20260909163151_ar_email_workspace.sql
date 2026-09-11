create table public.ar_email_drafts(
 id uuid primary key default gen_random_uuid(),owner uuid not null,document_job_id uuid not null references public.ar_document_jobs(id),document_revision integer not null,
 hotel text not null,account_id text not null,account_name text not null,invoice_ids text[] not null,purpose text not null check(purpose in ('billing','collection')),
 recipients jsonb not null,subject text not null default '',body text not null default '',exports jsonb not null,
 revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner,document_job_id,document_revision)
);
alter table public.ar_email_drafts enable row level security;
revoke all on public.ar_email_drafts from public,anon,authenticated;
grant select on public.ar_email_drafts to authenticated;
create policy email_draft_owner_read on public.ar_email_drafts for select to authenticated using(owner=(select auth.uid()) and (select ar_private.is_member()));
create table public.ar_email_attachments(id uuid primary key, draft_id uuid not null references public.ar_email_drafts(id),name text not null,storage_key text not null unique,mime text not null,byte_count bigint not null check(byte_count>0),sha256 text not null,removed boolean not null default false,created_at timestamptz not null default now());
alter table public.ar_email_attachments enable row level security;
revoke all on public.ar_email_attachments from public,anon,authenticated;
grant select on public.ar_email_attachments to authenticated;
create policy email_attachment_owner_read on public.ar_email_attachments for select to authenticated using(exists(select 1 from public.ar_email_drafts d where d.id=draft_id and d.owner=(select auth.uid())) and (select ar_private.is_member()));
create function public.ar_email_get(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('package_changed',j.revision<>d.document_revision or not j.acknowledged,'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.ar_email_attachments a where a.draft_id=d.id and not a.removed),'[]'::jsonb))
 from public.ar_email_drafts d join public.ar_document_jobs j on j.id=d.document_job_id where d.id=p_id and d.owner=p_actor;
$$;
create function public.ar_email_open(p_actor uuid,p_job_id uuid,p_document_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.ar_document_jobs; d public.ar_email_drafts; rec jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 select * into j from public.ar_document_jobs where id=p_job_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_document_revision is null or j.revision<>p_document_revision or not j.acknowledged or j.state<>'ready' or jsonb_array_length(j.exports)=0 then return jsonb_build_object('error','email_package_not_reviewed');end if;
 select * into d from public.ar_email_drafts where owner=p_actor and document_job_id=j.id and document_revision=j.revision;
 if found then return public.ar_email_get(p_actor,d.id);end if;
 select case when j.purpose='billing' then billing_recipients else collection_recipients end into rec from public.ar_account_settings where hotel=j.hotel and account_id=j.account_id;
 rec:=coalesce(rec,'{"to":[],"cc":[],"bcc":[]}'::jsonb);
 insert into public.ar_email_drafts(owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(p_actor,j.id,j.revision,j.hotel,j.account_id,j.account_name,j.invoice_ids,j.purpose,rec,initcap(j.purpose)||' documents - '||regexp_replace(j.account_name,E'[\\r\\n]+',' ','g')||' - '||j.hotel,'Dear customer,'||E'\n\n'||'Please find the reviewed documents attached.'||E'\n\n'||'Please contact our Accounts Receivable team if you need any further information.'||E'\n\n'||'Kind regards,'||E'\n'||'Accounts Receivable',j.exports) returning * into d;
 return public.ar_email_get(p_actor,d.id);
end $$;
create function public.ar_email_save(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;
begin
 if p_purpose is null or p_purpose not in ('billing','collection') or not ar_private.valid_recipients(p_recipients) or p_subject is null or length(p_subject)>998 or p_subject~E'[\\r\\n]' or p_body is null or length(p_body)>100000 then return jsonb_build_object('error','email_invalid');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id;
 if j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 update public.ar_email_drafts set purpose=p_purpose,recipients=p_recipients,subject=p_subject,body=p_body,revision=revision+1,updated_at=now() where id=p_id;
 return public.ar_email_get(p_actor,p_id);
end $$;
create function public.ar_email_attachment_add(p_actor uuid,p_id uuid,p_revision integer,p_file_id uuid,p_name text,p_key text,p_mime text,p_bytes bigint,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;
begin
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if p_name is null or length(p_name) not between 1 and 200 or p_name~E'[\\r\\n]' or p_mime not in ('application/pdf','image/png','image/jpeg') or p_bytes not between 1 and 20971520 or p_sha256!~'^[0-9a-f]{64}$' or p_key<>('jobs/'||d.document_job_id||'/email/'||d.id||'/'||p_file_id) then return jsonb_build_object('error','email_attachment_invalid');end if;
 insert into public.ar_email_attachments(id,draft_id,name,storage_key,mime,byte_count,sha256) values(p_file_id,p_id,p_name,p_key,p_mime,p_bytes,p_sha256);
 update public.ar_email_drafts set revision=revision+1,updated_at=now() where id=p_id;return public.ar_email_get(p_actor,p_id);
end $$;
create function public.ar_email_attachment_remove(p_actor uuid,p_id uuid,p_revision integer,p_file_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;
begin
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if not exists(select 1 from public.ar_email_attachments where id=p_file_id and draft_id=p_id and not removed) then return jsonb_build_object('error','email_attachment_missing');end if;
 update public.ar_email_attachments set removed=true where id=p_file_id;update public.ar_email_drafts set revision=revision+1,updated_at=now() where id=p_id;return public.ar_email_get(p_actor,p_id);
end $$;
revoke all on function public.ar_email_get(uuid,uuid),public.ar_email_open(uuid,uuid,integer),public.ar_email_save(uuid,uuid,integer,text,jsonb,text,text),public.ar_email_attachment_add(uuid,uuid,integer,uuid,text,text,text,bigint,text),public.ar_email_attachment_remove(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.ar_email_get(uuid,uuid),public.ar_email_open(uuid,uuid,integer),public.ar_email_save(uuid,uuid,integer,text,jsonb,text,text),public.ar_email_attachment_add(uuid,uuid,integer,uuid,text,text,text,bigint,text),public.ar_email_attachment_remove(uuid,uuid,integer,uuid) to service_role;
