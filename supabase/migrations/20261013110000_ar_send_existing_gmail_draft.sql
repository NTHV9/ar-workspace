alter table ar_private.mail_deliveries add column draft_send_claimed_at timestamptz;

create function public.ar_mail_claim_draft_send(p_actor uuid,p_id uuid,p_revision integer,p_expected jsonb,p_policy_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m ar_private.mail_deliveries;d public.ar_email_drafts;j public.ar_document_jobs;w public.ar_invoice_workflow;prev jsonb;blocked text;current_policy integer;n integer:=0;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if m.revision is distinct from p_revision then return jsonb_build_object('error','email_revision_conflict');end if;
 if m.mode<>'draft' or m.state<>'created' or m.draft_send_claimed_at is not null then return to_jsonb(m)||jsonb_build_object('claimed',false);end if;
 if m.gmail_draft_id is null or m.gmail_draft_id!~'^[A-Za-z0-9_-]+$' or m.snapshot->'expected' is distinct from p_expected then return jsonb_build_object('error','email_handoff_pending');end if;
 select * into d from public.ar_email_drafts where id=m.draft_id and owner=p_actor for update;
 if not found then return jsonb_build_object('error','email_missing');end if;
 if d.revision<>p_revision or d.recipients is distinct from p_expected->'recipients' or d.subject is distinct from p_expected->>'subject' or d.body is distinct from p_expected->>'body' or nullif(p_expected->'richBody','null'::jsonb) is distinct from d.rich_body or d.exports is distinct from m.snapshot->'draft'->'exports' then return jsonb_build_object('error','email_revision_conflict');end if;
 if ar_private.balance_only_account(d.hotel,d.account_id) then return jsonb_build_object('error','account_balance_only');end if;
 blocked:=ar_private.invoice_exception_handoff(d.hotel,d.account_id,d.invoice_ids);if blocked is not null then return jsonb_build_object('error',blocked);end if;
 select * into j from public.ar_document_jobs where id=d.document_job_id and owner=p_actor for update;
 if not found or j.closed_at is not null or j.discard_requested_at is not null or j.revision<>d.document_revision or not j.acknowledged or j.state<>'ready' then return jsonb_build_object('error','email_package_changed');end if;
 if d.purpose='collection' then
  select version into current_policy from ar_private.collection_policy_head where singleton for share;
  if p_policy_version is distinct from current_policy or m.collection_policy_version is distinct from current_policy then return jsonb_build_object('error','email_policy_revision_conflict');end if;
  if ar_private.collection_policy_stage(current_policy,m.stage,true) is null then return jsonb_build_object('error','email_stage_required');end if;
 end if;
 for prev in select value from jsonb_array_elements(m.snapshot->'workflow') order by value->>'invoice_id' loop
  select * into w from public.ar_invoice_workflow where hotel=d.hotel and account_id=d.account_id and invoice_id=prev->>'invoice_id' and invoice_id=any(d.invoice_ids) for update;
  if not found or w.revision<>(prev->>'revision')::integer or w.billing_required is null or w.credit_term is null or (d.purpose='billing' and not w.billing_required) then return jsonb_build_object('error','email_source_changed');end if;
  n:=n+1;
 end loop;
 if n<>cardinality(d.invoice_ids) then return jsonb_build_object('error','email_rules_missing');end if;
 update ar_private.mail_deliveries set draft_send_claimed_at=clock_timestamp(),state='awaiting_evidence',reason='draft_send_pending',provider_receipt_id=null where id=m.id returning * into m;
 return to_jsonb(m)||jsonb_build_object('claimed',true);
end$$;
revoke all on function public.ar_mail_claim_draft_send(uuid,uuid,integer,jsonb,integer) from public,anon,authenticated;
grant execute on function public.ar_mail_claim_draft_send(uuid,uuid,integer,jsonb,integer) to service_role;
