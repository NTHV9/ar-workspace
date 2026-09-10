-- Explicit provider-verified thread choices. Existing business guards remain authoritative.
create function ar_private.valid_reply_id(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(v) between 5 and 900 and v ~ '^<[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*>$',false);
$$;
create function ar_private.valid_thread_proof(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;seen text[]:='{}';stamp timestamptz;
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>65536 or v-array['threadId','parentMessageId','rfcMessageId','references','subject','parentDate']<>'{}'::jsonb then return false;end if;
 if jsonb_typeof(v->'threadId') is distinct from 'string' or v->>'threadId' !~ '^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(v->'parentMessageId') is distinct from 'string' or v->>'parentMessageId' !~ '^[A-Za-z0-9_-]{1,128}$' then return false;end if;
 if jsonb_typeof(v->'rfcMessageId') is distinct from 'string' or not ar_private.valid_reply_id(v->>'rfcMessageId') or jsonb_typeof(v->'references') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'references') not between 1 and 100 then return false;end if;
 for item in select value from jsonb_array_elements(v->'references') loop
  if jsonb_typeof(item)<>'string' or not ar_private.valid_reply_id(item#>>'{}') or (item#>>'{}')=any(seen) then return false;end if;
  seen:=array_append(seen,item#>>'{}');
 end loop;
 if seen[cardinality(seen)] is distinct from v->>'rfcMessageId' or length(array_to_string(seen,' '))>16000 then return false;end if;
 if jsonb_typeof(v->'subject') is distinct from 'string' or length(btrim(v->>'subject'))=0 or length(v->>'subject')>998 or v->>'subject'~'[[:cntrl:]]' or jsonb_typeof(v->'parentDate') is distinct from 'string' then return false;end if;
 if v->>'parentDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' then return false;end if;
 stamp:=(v->>'parentDate')::timestamptz;return stamp>='1970-01-01'::timestamptz;
exception when others then return false;
end $$;
create function ar_private.valid_thread_choice(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if v is null or jsonb_typeof(v)<>'object' or not ar_private.valid_thread_proof(v-'matchedRecipients') or jsonb_typeof(v->'matchedRecipients') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'matchedRecipients') not between 1 and 400 then return false;end if;
 if not ar_private.valid_recipients(jsonb_build_object('to',v->'matchedRecipients','cc','[]'::jsonb,'bcc','[]'::jsonb)) then return false;end if;
 return not exists(select 1 from jsonb_array_elements_text(v->'matchedRecipients') e where e<>lower(e) or e='ar@katathani.com');
end $$;
create function ar_private.thread_participant_overlap(v jsonb,recipients jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if not ar_private.valid_recipients(recipients) then return false;end if;
 return exists(select 1 from jsonb_array_elements_text(coalesce(v->'matchedRecipients','[]')) m join jsonb_array_elements_text((recipients->'to')||(recipients->'cc')) r on lower(r)=m where m<>'ar@katathani.com');
end $$;

create table ar_private.email_thread_choices(
 draft_id uuid primary key references public.ar_email_drafts(id),owner uuid not null references auth.users(id),
 selected_revision integer not null check(selected_revision>0),choice jsonb not null check(ar_private.valid_thread_choice(choice)),selected_at timestamptz not null default now()
);
alter table ar_private.email_thread_choices enable row level security;
revoke all on ar_private.email_thread_choices from public,anon,authenticated,service_role;

create or replace function public.ar_email_get(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('thread',t.choice,'billing_method',s.billing_method,'billing_portal',s.billing_portal,'billing_instructions',coalesce(s.billing_instructions,''),'collection_instructions',coalesce(s.collection_instructions,''),'package_changed',j.revision<>d.document_revision or not j.acknowledged,'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.ar_email_attachments a where a.draft_id=d.id and not a.removed),'[]'::jsonb))
 from public.ar_email_drafts d join public.ar_document_jobs j on j.id=d.document_job_id left join public.ar_account_settings s on s.hotel=d.hotel and s.account_id=d.account_id left join ar_private.email_thread_choices t on t.draft_id=d.id and t.owner=d.owner where d.id=p_id and d.owner=p_actor;
$$;
create function public.ar_email_thread_select(p_actor uuid,p_id uuid,p_revision integer,p_choice jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_choice is not null and not ar_private.valid_thread_choice(p_choice) then return jsonb_build_object('error','email_thread_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if not found or j.owner<>p_actor or j.revision<>d.document_revision or not j.acknowledged or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in('creating','created','uncertain')) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and state<>'sent') then return jsonb_build_object('error','email_handoff_pending');end if;
 if p_choice is not null and not ar_private.thread_participant_overlap(p_choice,d.recipients) then return jsonb_build_object('error','email_thread_unrelated');end if;
 update public.ar_email_drafts set subject=case when p_choice is null then subject else p_choice->>'subject' end,revision=revision+1,updated_at=now() where id=p_id returning * into d;
 if p_choice is null then delete from ar_private.email_thread_choices where draft_id=p_id and owner=p_actor;
 else insert into ar_private.email_thread_choices(draft_id,owner,selected_revision,choice) values(p_id,p_actor,d.revision,p_choice) on conflict(draft_id) do update set choice=excluded.choice,selected_revision=excluded.selected_revision,selected_at=now();end if;
 return public.ar_email_get(p_actor,p_id);
end $$;

-- Keep the existing save validation and business behavior; the wrapper only adds a locked thread fence.
alter function public.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb) set schema ar_private;
alter function ar_private.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb) rename to ar_email_save_before_threads;
revoke all on function ar_private.ar_email_save_before_threads(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.ar_email_save_v2(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text,p_rich_body jsonb,p_template_ref jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;t jsonb;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select choice into t from ar_private.email_thread_choices where draft_id=p_id and owner=p_actor;
 if t is not null then
  if p_subject is distinct from t->>'subject' then return jsonb_build_object('error','email_thread_subject_locked');end if;
  if not ar_private.thread_participant_overlap(t,p_recipients) then return jsonb_build_object('error','email_thread_unrelated');end if;
 end if;
 return ar_private.ar_email_save_before_threads(p_actor,p_id,p_revision,p_purpose,p_recipients,p_subject,p_body,p_rich_body,p_template_ref);
end $$;

alter function public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb) set schema ar_private;
alter function ar_private.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb) rename to mail_claim_before_threads;
revoke all on function ar_private.mail_claim_before_threads(uuid,uuid,uuid,integer,text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;t jsonb;existing ar_private.mail_deliveries;source ar_private.mail_deliveries;reply_id text;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_expected is null or jsonb_typeof(p_expected)<>'object' then return jsonb_build_object('error','email_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into existing from ar_private.mail_deliveries where id=p_id and owner=p_actor;
 if p_mode='test' then
  reply_id:=p_expected->>'replyToDeliveryId';
  if existing.id is not null and (existing.snapshot->'expected'->>'replyToDeliveryId' is distinct from reply_id or nullif(existing.snapshot->'expected'->'thread','null'::jsonb) is distinct from nullif(p_expected->'thread','null'::jsonb)) then return jsonb_build_object('error','email_test_command_conflict');end if;
  if reply_id is not null then
   if reply_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_draft is not null or p_expected?'supplementalSource' or not ar_private.valid_thread_proof(p_expected->'thread') or jsonb_typeof(p_expected->'recipientHash') is distinct from 'string' or p_expected->>'recipientHash' !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','email_test_command_conflict');end if;
   select * into source from ar_private.mail_deliveries where id=reply_id::uuid and owner=p_actor and mode='test' and state='sent' and draft_id is null;
   if not found or jsonb_typeof(source.snapshot->'expected'->'recipientHash') is distinct from 'string' or source.snapshot->'expected'->>'recipientHash' !~ '^[0-9a-f]{64}$' or source.snapshot->'expected'->>'recipientHash' is distinct from p_expected->>'recipientHash' or source.gmail_id is null or source.gmail_id is distinct from p_expected->'thread'->>'parentMessageId' or source.snapshot->'expected'->>'subject' is distinct from p_expected->'thread'->>'subject' or p_expected->>'subject' is distinct from p_expected->'thread'->>'subject' then return jsonb_build_object('error','email_test_command_conflict');end if;
  elsif nullif(p_expected->'thread','null'::jsonb) is not null then return jsonb_build_object('error','email_test_command_conflict');end if;
 elsif p_mode in('draft','send') and existing.id is null then
  select * into d from public.ar_email_drafts where id=p_draft and owner=p_actor for update;
  if not found then return jsonb_build_object('error','email_missing');end if;
  if p_revision is null or p_revision<>d.revision then return jsonb_build_object('error','email_revision_conflict');end if;
  select choice into t from ar_private.email_thread_choices where draft_id=p_draft and owner=p_actor;
  if t is distinct from nullif(p_expected->'thread','null'::jsonb) then return jsonb_build_object('error','email_thread_changed');end if;
  if t is not null and (d.subject is distinct from t->>'subject' or not ar_private.thread_participant_overlap(t,d.recipients)) then return jsonb_build_object('error','email_thread_changed');end if;
 end if;
 return ar_private.mail_claim_before_threads(p_actor,p_id,p_draft,p_revision,p_mode,p_stage,p_message_id,p_expected);
end $$;

-- The retired helper has no expected-thread argument; prevent using it for threaded mail.
alter function public.ar_gmail_attempt_claim(uuid,uuid,integer,text) set schema ar_private;
alter function ar_private.ar_gmail_attempt_claim(uuid,uuid,integer,text) rename to gmail_attempt_claim_before_threads;
revoke all on function ar_private.gmail_attempt_claim_before_threads(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
create function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;
begin
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,735));
 select * into d from public.ar_email_drafts where id=p_draft and owner=p_owner for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if exists(select 1 from ar_private.email_thread_choices where draft_id=p_draft and owner=p_owner) then return jsonb_build_object('error','email_thread_legacy_unsupported');end if;
 return ar_private.gmail_attempt_claim_before_threads(p_owner,p_draft,p_revision,p_message_id);
end $$;
create function public.ar_mail_test_conversations(p_actor uuid,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;total integer;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 if p_offset is null or p_offset<0 then return jsonb_build_object('error','email_invalid');end if;
 select count(*) into total from ar_private.mail_deliveries where owner=p_actor and mode='test' and state='sent' and draft_id is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sentAt',sent_at,'subject',snapshot->'expected'->>'subject') order by sent_at desc,id desc),'[]') into rows from (select id,sent_at,snapshot from ar_private.mail_deliveries where owner=p_actor and mode='test' and state='sent' and draft_id is null order by sent_at desc,id desc limit 20 offset p_offset) page;
 return jsonb_build_object('deliveries',rows,'nextOffset',case when p_offset+20<total then p_offset+20 else null end);
end $$;
create index ar_mail_test_conversations_page on ar_private.mail_deliveries(owner,sent_at desc,id desc) where mode='test' and state='sent' and draft_id is null;
revoke all on function ar_private.valid_reply_id(text),ar_private.valid_thread_proof(jsonb),ar_private.valid_thread_choice(jsonb),ar_private.thread_participant_overlap(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ar_email_thread_select(uuid,uuid,integer,jsonb),public.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text),public.ar_mail_test_conversations(uuid,integer) from public,anon,authenticated;
grant execute on function public.ar_email_thread_select(uuid,uuid,integer,jsonb),public.ar_email_save_v2(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_gmail_attempt_claim(uuid,uuid,integer,text),public.ar_mail_test_conversations(uuid,integer) to service_role;
