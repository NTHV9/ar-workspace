-- Additive delivery evidence; no ledger or legacy objects are modified.
create table ar_private.mail_deliveries(
 id uuid primary key,owner uuid not null,draft_id uuid references public.ar_email_drafts(id),revision integer,
 mode text not null check(mode in ('draft','send','test')),stage text,
 message_id text not null unique,snapshot jsonb not null,
 state text not null default 'pending' check(state in ('pending','created','awaiting_evidence','sent','review_required')),
 gmail_id text,gmail_draft_id text,sent_at timestamptz,reason text,created_at timestamptz not null default now(),
 unique(draft_id,revision)
);
revoke all on ar_private.mail_deliveries from public,anon,authenticated;
create table public.ar_sent_events(
 delivery_id uuid primary key references ar_private.mail_deliveries(id),owner uuid not null,
 hotel text not null,account_id text not null,invoice_ids text[] not null,purpose text not null,stage text,
 sent_at timestamptz not null,gmail_id text not null unique,open_at_send numeric not null
);
alter table public.ar_sent_events enable row level security;
revoke all on public.ar_sent_events from public,anon,authenticated;
grant select on public.ar_sent_events to authenticated;
create policy sent_event_owner_read on public.ar_sent_events for select to authenticated using(owner=(select auth.uid()) and (select ar_private.is_member()));

create function public.ar_mail_get(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m) from ar_private.mail_deliveries m where id=p_id and owner=p_actor;
$$;
create function public.ar_mail_for_draft(p_actor uuid,p_draft uuid,p_revision integer) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m) from ar_private.mail_deliveries m where owner=p_actor and draft_id=p_draft and revision=p_revision;
$$;
create function public.ar_mail_claim(p_actor uuid,p_id uuid,p_draft uuid,p_revision integer,p_mode text,p_stage text,p_message_id text,p_expected jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if exists(select 1 from ar_private.gmail_draft_attempts where draft_id=p_draft and revision=p_revision) or exists(select 1 from ar_private.mail_deliveries where draft_id=p_draft and state in ('pending','awaiting_evidence','review_required')) then return jsonb_build_object('error','email_handoff_pending');end if;
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

create function public.ar_mail_record(p_actor uuid,p_id uuid,p_state text,p_gmail_id text,p_gmail_draft_id text,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('created','awaiting_evidence','review_required') then return false;end if;
 update ar_private.mail_deliveries set state=p_state,gmail_id=coalesce(p_gmail_id,gmail_id),gmail_draft_id=coalesce(p_gmail_draft_id,gmail_draft_id),reason=p_reason where id=p_id and owner=p_actor and state<>'sent';return found;
end $$;

create function public.ar_mail_confirm_sent(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare m ar_private.mail_deliveries;d jsonb;prev jsonb;w public.ar_invoice_workflow;day date;total numeric;
begin
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if m.state='sent' then return jsonb_build_object('state','sent','recorded',m.mode<>'test');end if;
 if p_gmail_id is null or p_sent_at is null or p_sent_at<m.created_at-interval '5 minutes' or p_sent_at>now()+interval '5 minutes' then return jsonb_build_object('error','email_evidence_invalid');end if;
 if m.mode='test' then update ar_private.mail_deliveries set state='sent',gmail_id=p_gmail_id,sent_at=p_sent_at,reason=null where id=p_id;return jsonb_build_object('state','sent','recorded',false);end if;
 d:=m.snapshot->'draft';day:=(p_sent_at at time zone 'Asia/Bangkok')::date;
 for prev in select value from jsonb_array_elements(m.snapshot->'workflow') order by value->>'invoice_id' loop
  select * into w from public.ar_invoice_workflow where hotel=prev->>'hotel' and account_id=prev->>'account_id' and invoice_id=prev->>'invoice_id' for update;
  if not found or w.revision<>(prev->>'revision')::integer or w.billing_required is null or w.credit_term is null or (d->>'purpose'='billing' and not w.billing_required) then
   update ar_private.mail_deliveries set state='review_required',reason='workflow_changed',gmail_id=p_gmail_id,sent_at=p_sent_at where id=p_id;return jsonb_build_object('state','review_required','recorded',false);
  end if;
 end loop;
 select coalesce(sum((value->>'open')::numeric),0) into total from jsonb_array_elements(m.snapshot->'manifest');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
 values(m.id,m.owner,d->>'hotel',d->>'account_id',array(select jsonb_array_elements_text(d->'invoice_ids')),d->>'purpose',m.stage,p_sent_at,p_gmail_id,total);
 for prev in select value from jsonb_array_elements(m.snapshot->'workflow') order by value->>'invoice_id' loop
  update public.ar_invoice_workflow set first_billing_date=case when d->>'purpose'='billing' then coalesce(first_billing_date,day) else first_billing_date end,
   last_reminder_stage=case when d->>'purpose'='collection' then m.stage else last_reminder_stage end,
   last_reminder_date=case when d->>'purpose'='collection' then day else last_reminder_date end,revision=revision+1,updated_at=now()
  where hotel=prev->>'hotel' and account_id=prev->>'account_id' and invoice_id=prev->>'invoice_id' returning * into w;
  insert into ar_private.invoice_workflow_history values(w.hotel,w.account_id,w.invoice_id,w.revision,p_actor,to_jsonb(w)||jsonb_build_object('delivery_id',p_id,'source','gmail_sent'),now());
 end loop;
 update ar_private.mail_deliveries set state='sent',gmail_id=p_gmail_id,sent_at=p_sent_at,reason=null where id=p_id;
 return jsonb_build_object('state','sent','recorded',true);
end $$;
revoke all on function public.ar_mail_get(uuid,uuid),public.ar_mail_for_draft(uuid,uuid,integer),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_mail_record(uuid,uuid,text,text,text,text),public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ar_mail_get(uuid,uuid),public.ar_mail_for_draft(uuid,uuid,integer),public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb),public.ar_mail_record(uuid,uuid,text,text,text,text),public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz) to service_role;
