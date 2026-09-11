-- Versioned message defaults and immutable rich-message snapshots for the new application.
alter table public.ar_email_drafts add column rich_body jsonb, add column template_ref jsonb;

create table public.ar_email_templates(
 id uuid primary key,owner uuid not null,revision integer not null check(revision>0),content jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.ar_email_template_versions(
 template_id uuid not null references public.ar_email_templates(id),revision integer not null,owner uuid not null,
 content jsonb not null,created_at timestamptz not null default now(),primary key(template_id,revision)
);
alter table public.ar_email_templates enable row level security;
alter table public.ar_email_template_versions enable row level security;
revoke all on public.ar_email_templates,public.ar_email_template_versions from public,anon,authenticated;
grant select on public.ar_email_templates,public.ar_email_template_versions to authenticated;
create policy template_owner_read on public.ar_email_templates for select to authenticated using(owner=(select auth.uid()) and (select ar_private.is_member()));
create policy template_version_owner_read on public.ar_email_template_versions for select to authenticated using(owner=(select auth.uid()) and (select ar_private.is_member()));
create index ar_email_template_owner_updated on public.ar_email_templates(owner,updated_at desc,id);

create function public.ar_template_list(p_actor uuid,p_id uuid default null,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n integer;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','template_invalid');end if;
 if p_id is null then
  select coalesce(jsonb_agg(content||jsonb_build_object('id',id,'revision',revision,'updated_at',updated_at) order by updated_at desc,id),'[]') into rows from (select * from public.ar_email_templates where owner=p_actor order by updated_at desc,id limit 101 offset p_offset) s;
 else
  if not exists(select 1 from public.ar_email_templates where id=p_id and owner=p_actor) then return jsonb_build_object('error','template_missing');end if;
  select coalesce(jsonb_agg(content||jsonb_build_object('id',template_id,'revision',revision,'updated_at',created_at) order by revision desc),'[]') into rows from (select * from public.ar_email_template_versions where template_id=p_id and owner=p_actor order by revision desc limit 101 offset p_offset) s;
 end if;
 n:=jsonb_array_length(rows);if n>100 then rows:=rows-100;end if;
 return jsonb_build_object('items',rows,'nextOffset',case when n>100 then p_offset+100 else null end);
end $$;

create function public.ar_template_save(p_actor uuid,p_id uuid,p_revision integer,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ar_email_templates;next_revision integer;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_id is null or p_revision is null or p_revision<0 or p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>500000 or (p_content->>'purpose') not in ('billing','collection') or length(coalesce(p_content->>'name','')) not between 1 and 80 or length(coalesce(p_content->>'subject',''))>998 or (p_content->>'subject')~E'[\\r\\n]' or jsonb_typeof(p_content->'richBody') is distinct from 'object' or jsonb_typeof(p_content->'archived') is distinct from 'boolean' then return jsonb_build_object('error','template_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2053));
 select * into t from public.ar_email_templates where id=p_id for update;
 if found then
  if t.owner<>p_actor then return jsonb_build_object('error','template_missing');end if;
  if t.content=p_content and (t.revision=p_revision or t.revision=p_revision+1) then return t.content||jsonb_build_object('id',t.id,'revision',t.revision,'updated_at',t.updated_at);end if;
  if t.revision<>p_revision then return jsonb_build_object('error','template_revision_conflict');end if;
  next_revision:=t.revision+1;
  update public.ar_email_templates set content=p_content,revision=next_revision,updated_at=now() where id=p_id returning * into t;
 else
  if p_revision<>0 then return jsonb_build_object('error','template_revision_conflict');end if;
  next_revision:=1;
  insert into public.ar_email_templates(id,owner,revision,content) values(p_id,p_actor,next_revision,p_content) returning * into t;
 end if;
 insert into public.ar_email_template_versions(template_id,revision,owner,content) values(p_id,next_revision,p_actor,p_content);
 return t.content||jsonb_build_object('id',t.id,'revision',t.revision,'updated_at',t.updated_at);
end $$;

create function public.ar_email_save_v2(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text,p_rich_body jsonb,p_template_ref jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_purpose is null or p_purpose not in ('billing','collection') or not ar_private.valid_recipients(p_recipients) or p_subject is null or length(p_subject)>998 or p_subject~E'[\\r\\n]' or p_body is null or length(p_body)>100000 or (p_rich_body is not null and (jsonb_typeof(p_rich_body)<>'object' or octet_length(p_rich_body::text)>500000)) then return jsonb_build_object('error','email_invalid');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 if p_template_ref is not null and not exists(select 1 from public.ar_email_template_versions where owner=p_actor and template_id::text=p_template_ref->>'id' and revision::text=p_template_ref->>'revision' and content->>'name'=p_template_ref->>'name') then return jsonb_build_object('error','template_missing');end if;
 if d.purpose=p_purpose and d.recipients=p_recipients and d.subject=p_subject and d.body=p_body and d.rich_body is not distinct from p_rich_body and d.template_ref is not distinct from p_template_ref then return public.ar_email_get(p_actor,p_id);end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in ('creating','uncertain')) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and state<>'sent') then return jsonb_build_object('error','email_handoff_pending');end if;
 update public.ar_email_drafts set purpose=p_purpose,recipients=p_recipients,subject=p_subject,body=p_body,rich_body=p_rich_body,template_ref=p_template_ref,revision=revision+1,updated_at=now() where id=p_id;
 return public.ar_email_get(p_actor,p_id);
end $$;
-- Retire the old writer so it cannot keep rich content stale when plain text changes.
revoke all on function public.ar_email_save(uuid,uuid,integer,text,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ar_template_list(uuid,uuid,integer),public.ar_template_save(uuid,uuid,integer,jsonb),public.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ar_template_list(uuid,uuid,integer),public.ar_template_save(uuid,uuid,integer,jsonb),public.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb) to service_role;

-- Preserve all existing test, owner, revision and unresolved-delivery guards.
create or replace function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;m ar_private.mail_deliveries;w public.ar_invoice_workflow;hist jsonb:='[]';n integer:=0;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor;
 if found then
  if p_mode='test' and (m.mode<>'test' or m.snapshot->'expected'->>'recipientHash' is distinct from p_expected->>'recipientHash' or m.snapshot->'expected'->'supplementalSource' is distinct from p_expected->'supplementalSource' or nullif(m.snapshot->'expected'->'richBody','null'::jsonb) is distinct from nullif(p_expected->'richBody','null'::jsonb)) then return jsonb_build_object('error','email_test_command_conflict');end if;
  return to_jsonb(m)||jsonb_build_object('claimed',false);
 end if;
 if p_mode is null or p_mode not in ('draft','send','test') or p_expected is null or jsonb_typeof(p_expected)<>'object' or p_message_id is null or p_message_id !~ '^<[0-9a-f-]{36}@ar-workspace[.]ar-c82[.]workers[.]dev>$' then return jsonb_build_object('error','email_invalid');end if;
 if p_mode='test' then
  if p_draft is not null or p_expected?'recipients' or not p_expected?'recipientHash' then return jsonb_build_object('error','email_invalid');end if;
  if p_expected?'supplementalSource' then
   select * into d from public.ar_email_drafts where id=(p_expected->'supplementalSource'->>'draftId')::uuid and owner=p_actor for update;
   if not found then return jsonb_build_object('error','email_missing');end if;
   if d.revision<>(p_expected->'supplementalSource'->>'revision')::integer then return jsonb_build_object('error','email_revision_conflict');end if;
   select count(*) into n from public.ar_email_attachments where draft_id=d.id and not removed and id in(select value::uuid from jsonb_array_elements_text(p_expected->'supplementalSource'->'ids'));
   if n<>jsonb_array_length(p_expected->'supplementalSource'->'ids') then return jsonb_build_object('error','email_attachment_missing');end if;
  end if;
  insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot) values(p_id,p_actor,p_mode,p_message_id,jsonb_build_object('expected',p_expected));
 else
  select * into d from public.ar_email_drafts where id=p_draft and owner=p_actor for update;
  if not found then return jsonb_build_object('error','email_missing');end if;
  select * into m from ar_private.mail_deliveries where draft_id=p_draft and revision=p_revision;
  if found then return to_jsonb(m)||jsonb_build_object('claimed',false);end if;
  if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
  if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_draft and state<>'sent') then return jsonb_build_object('error','email_handoff_pending');end if;
  select * into j from public.ar_document_jobs where id=d.document_job_id for share;
  if j.revision<>d.document_revision or not j.acknowledged or j.state<>'ready' or jsonb_array_length(d.exports)=0 then return jsonb_build_object('error','email_package_changed');end if;
  if p_expected->'recipients' is distinct from d.recipients or p_expected->>'subject' is distinct from d.subject or p_expected->>'body' is distinct from d.body or nullif(p_expected->'richBody','null'::jsonb) is distinct from d.rich_body then return jsonb_build_object('error','email_revision_conflict');end if;
  if d.purpose='collection' and (p_stage is null or p_stage not in ('Friendly','Follow 1','Follow 2','Follow 3','Final')) then return jsonb_build_object('error','email_stage_required');end if;
  if d.purpose='billing' and p_stage is not null then return jsonb_build_object('error','email_invalid');end if;
  for w in select * from public.ar_invoice_workflow where hotel=d.hotel and account_id=d.account_id and invoice_id=any(d.invoice_ids) order by invoice_id for update loop
   if p_mode='send' and (w.billing_required is null or w.credit_term is null or (d.purpose='billing' and not w.billing_required)) then return jsonb_build_object('error','email_rules_missing');end if;
   hist:=hist||jsonb_build_array(to_jsonb(w));n:=n+1;
  end loop;
  if n<>cardinality(d.invoice_ids) then return jsonb_build_object('error','email_rules_missing');end if;
  insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,stage,message_id,snapshot)
  values(p_id,p_actor,p_draft,p_revision,p_mode,p_stage,p_message_id,jsonb_build_object('expected',p_expected,'draft',public.ar_email_get(p_actor,p_draft),'manifest',j.manifest,'workflow',hist));
 end if;
 select * into m from ar_private.mail_deliveries where id=p_id;return to_jsonb(m)||jsonb_build_object('claimed',true);
end $$;
