create or replace function public.ar_email_save(p_actor uuid,p_id uuid,p_revision integer,p_purpose text,p_recipients jsonb,p_subject text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;
begin
 if p_purpose is null or p_purpose not in ('billing','collection') or not ar_private.valid_recipients(p_recipients) or p_subject is null or length(p_subject)>998 or p_subject~E'[\\r\\n]' or p_body is null or length(p_body)>100000 then return jsonb_build_object('error','email_invalid');end if;
 select * into d from public.ar_email_drafts where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if p_revision is null or d.revision<>p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id;
 if j.revision<>d.document_revision or not j.acknowledged then return jsonb_build_object('error','email_package_changed');end if;
 if d.purpose=p_purpose and d.recipients=p_recipients and d.subject=p_subject and d.body=p_body then return public.ar_email_get(p_actor,p_id);end if;
 if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_id and state in ('creating','uncertain')) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_id and state<>'sent') then return jsonb_build_object('error','email_handoff_pending');end if;
 update public.ar_email_drafts set purpose=p_purpose,recipients=p_recipients,subject=p_subject,body=p_body,revision=revision+1,updated_at=now() where id=p_id;
 return public.ar_email_get(p_actor,p_id);
end $$;

-- Lock all handed-off revisions until resolved, including Gmail-created drafts.
create or replace function public.ar_mail_unresolved(p_actor uuid,p_draft uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from ar_private.mail_deliveries where owner=p_actor and draft_id=p_draft and state<>'sent')$$;
revoke all on function public.ar_mail_unresolved(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ar_mail_unresolved(uuid,uuid) to service_role;

create or replace function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.ar_email_drafts;j public.ar_document_jobs;m ar_private.mail_deliveries;w public.ar_invoice_workflow;hist jsonb:='[]';n integer:=0;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor;
 if found then return to_jsonb(m)||jsonb_build_object('claimed',false);end if;
 if p_mode is null or p_mode not in ('draft','send','test') or p_expected is null or jsonb_typeof(p_expected)<>'object' or p_message_id is null or p_message_id !~ '^<[0-9a-f-]{36}@ar-workspace[.]ar-c82[.]workers[.]dev>$' then return jsonb_build_object('error','email_invalid');end if;
 if p_mode='test' then
  if p_draft is not null or p_expected?'recipients' or not p_expected?'recipientHash' then return jsonb_build_object('error','email_invalid');end if;
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
  if p_expected->'recipients' is distinct from d.recipients or p_expected->>'subject' is distinct from d.subject or p_expected->>'body' is distinct from d.body then return jsonb_build_object('error','email_revision_conflict');end if;
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

