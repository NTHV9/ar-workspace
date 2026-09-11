-- Billing requirement and the delivery channel are separate facts.
alter table public.ar_account_settings
 add column billing_method text check(billing_method in ('email','system')),
 add column billing_portal text,
 add column billing_instructions text not null default '',
 add column collection_instructions text not null default '';

create function public.ar_settings_save_v2(p_actor uuid,p_hotel text,p_account_id text,p_revision integer,p_billing_required boolean,p_credit_term integer,p_billing_recipients jsonb,p_collection_recipients jsonb,p_delivery jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ar_account_settings;r jsonb;method text;portal text;billing_note text;collection_note text;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','settings_forbidden');end if;
 if p_delivery is null or jsonb_typeof(p_delivery)<>'object' or p_delivery-array['billingMethod','billingPortal','billingInstructions','collectionInstructions']<>'{}'::jsonb then return jsonb_build_object('error','settings_invalid');end if;
 -- Serialize settings with this allowlisted user's delivery claims before reading pending work.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 perform pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
 select * into s from public.ar_account_settings where hotel=p_hotel and account_id=p_account_id for update;
 if p_revision is null or coalesce(s.revision,0)<>p_revision then return jsonb_build_object('error','settings_revision_conflict');end if;
 method:=case when p_billing_required is distinct from true then null when p_delivery?'billingMethod' then p_delivery->>'billingMethod' else coalesce(s.billing_method,'email') end;
 portal:=case when p_delivery?'billingPortal' then nullif(btrim(p_delivery->>'billingPortal'),'') else s.billing_portal end;
 billing_note:=case when p_delivery?'billingInstructions' then p_delivery->>'billingInstructions' else coalesce(s.billing_instructions,'') end;
 collection_note:=case when p_delivery?'collectionInstructions' then p_delivery->>'collectionInstructions' else coalesce(s.collection_instructions,'') end;
 if (p_billing_required=true and (method is null or method not in ('email','system'))) or billing_note is null or collection_note is null or length(billing_note)>4000 or length(collection_note)>4000 or portal is not null and (length(portal)>2048 or portal !~ '^https://[^/@[:space:]]+([/?#].*)?$' or portal~'\\') then return jsonb_build_object('error','settings_invalid');end if;
 if coalesce(s.billing_method,'email') is distinct from method and (exists(select 1 from ar_private.mail_deliveries m join public.ar_email_drafts d on d.id=m.draft_id where m.state<>'sent' and d.hotel=p_hotel and d.account_id=p_account_id and d.purpose='billing') or exists(select 1 from ar_private.gmail_draft_attempts g join public.ar_email_drafts d on d.id=g.draft_id where g.state in ('creating','created','uncertain') and d.hotel=p_hotel and d.account_id=p_account_id and d.purpose='billing')) then return jsonb_build_object('error','settings_billing_handoff_pending');end if;
 if s.hotel is not null and s.billing_required is not distinct from p_billing_required and s.credit_term is not distinct from p_credit_term and s.billing_recipients=p_billing_recipients and s.collection_recipients=p_collection_recipients and s.billing_method is not distinct from method and s.billing_portal is not distinct from portal and s.billing_instructions=billing_note and s.collection_instructions=collection_note then return public.ar_settings_get(p_hotel,p_account_id);end if;
 r:=public.ar_settings_save(p_actor,p_hotel,p_account_id,p_revision,p_billing_required,p_credit_term,p_billing_recipients,p_collection_recipients);
 if r?'error' then return r;end if;
 update public.ar_account_settings set billing_method=method,billing_portal=portal,billing_instructions=billing_note,collection_instructions=collection_note where hotel=p_hotel and account_id=p_account_id;
 r:=public.ar_settings_get(p_hotel,p_account_id);
 update ar_private.account_settings_history set settings=r where hotel=p_hotel and account_id=p_account_id and revision=p_revision+1;
 return r;
end $$;
revoke all on function public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb) to service_role;
-- Keep older callers from bypassing the new channel/pending-work rules.
revoke all on function public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.ar_email_get(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('billing_method',s.billing_method,'billing_portal',s.billing_portal,'billing_instructions',coalesce(s.billing_instructions,''),'collection_instructions',coalesce(s.collection_instructions,''),'package_changed',j.revision<>d.document_revision or not j.acknowledged,'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.ar_email_attachments a where a.draft_id=d.id and not a.removed),'[]'::jsonb))
 from public.ar_email_drafts d join public.ar_document_jobs j on j.id=d.document_job_id left join public.ar_account_settings s on s.hotel=d.hotel and s.account_id=d.account_id where d.id=p_id and d.owner=p_actor;
$$;

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
  if d.purpose='billing' and exists(select 1 from public.ar_account_settings s where s.hotel=d.hotel and s.account_id=d.account_id and s.billing_method='system') then return jsonb_build_object('error','email_system_billing_required');end if;
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

-- Retained older helper uses the same channel fence and claim lock.
create or replace function public.ar_gmail_attempt_claim(p_owner uuid,p_draft uuid,p_revision integer,p_message_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;a ar_private.gmail_draft_attempts;
begin
 if not exists(select 1 from auth.users where id=p_owner and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,735));
 select * into d from public.ar_email_drafts where id=p_draft and owner=p_owner for update;if not found then return jsonb_build_object('error','email_missing');end if;
 if d.purpose='billing' and exists(select 1 from public.ar_account_settings s where s.hotel=d.hotel and s.account_id=d.account_id and s.billing_method='system') then return jsonb_build_object('error','email_system_billing_required');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id for share;
 if not j.acknowledged or j.revision<>d.document_revision or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 select * into a from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision;
 if found then return to_jsonb(a)||jsonb_build_object('claimed',false);end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and state in ('creating','uncertain')) then return jsonb_build_object('error','email_handoff_pending');end if;
 insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values(p_draft,p_revision,p_message_id) returning * into a;return to_jsonb(a)||jsonb_build_object('claimed',true);
end $$;
