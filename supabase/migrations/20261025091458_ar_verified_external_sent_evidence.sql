-- Private independent Sent proof survives an unavailable business-history commit.
-- No backfill: a Draft-create receipt alone does not establish sending.
alter table ar_private.mail_deliveries add column verified_sent_evidence jsonb;

create function public.ar_mail_record_verified_sent(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz,p_expected jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m ar_private.mail_deliveries;proof jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return false;end if;
 select * into m from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found or m.mode='test' or p_expected is null or m.snapshot->'expected' is distinct from p_expected
  or p_expected->>'mailbox' is distinct from m.mailbox or p_expected->>'sender' is distinct from ar_private.gmail_sender(m.mailbox)
  or p_gmail_id is null or p_gmail_id!~'^[A-Za-z0-9_-]{1,200}$'
  or p_sent_at is null or not isfinite(p_sent_at) or p_sent_at<m.created_at-interval '5 minutes' or p_sent_at>clock_timestamp()+interval '5 minutes' then return false;end if;
 proof:=jsonb_build_object('gmailId',p_gmail_id,'sentAt',p_sent_at,'mailbox',m.mailbox);
 if m.verified_sent_evidence is not null then return m.verified_sent_evidence=proof;end if;
 if m.state='sent' then return m.gmail_id=p_gmail_id and m.sent_at=p_sent_at;end if;
 update ar_private.mail_deliveries set verified_sent_evidence=proof,state='awaiting_evidence',reason='history_recording_unavailable' where id=m.id;
 return true;
end $$;
revoke all on function public.ar_mail_record_verified_sent(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.ar_mail_record_verified_sent(uuid,uuid,text,timestamptz,jsonb) to service_role;

create function ar_private.preserve_verified_sent_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if old.verified_sent_evidence is not null and (new.verified_sent_evidence is distinct from old.verified_sent_evidence or new.snapshot is distinct from old.snapshot or new.owner is distinct from old.owner or new.mode is distinct from old.mode or new.mailbox is distinct from old.mailbox or new.stage is distinct from old.stage or new.stage_snapshot is distinct from old.stage_snapshot or new.draft_id is distinct from old.draft_id or new.revision is distinct from old.revision or new.message_id is distinct from old.message_id or new.provider_receipt_id is distinct from old.provider_receipt_id or new.gmail_draft_id is distinct from old.gmail_draft_id or new.created_at is distinct from old.created_at) then raise exception 'sent_evidence_immutable';end if;
 return new;
end $$;
revoke all on function ar_private.preserve_verified_sent_evidence() from public,anon,authenticated;
create trigger ar_preserve_verified_sent_evidence before update of verified_sent_evidence,snapshot,owner,mode,mailbox,stage,stage_snapshot,draft_id,revision,message_id,provider_receipt_id,gmail_draft_id,created_at on ar_private.mail_deliveries for each row execute function ar_private.preserve_verified_sent_evidence();

-- Manual matching also retains the human's immutable reason/proof before the
-- independent history transaction. Retrying history does not require choosing
-- another candidate or replacing a rewritten provider identity.
create function public.ar_mail_record_verified_review(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz,p_expected jsonb,p_proof text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare d ar_private.mail_deliveries;r ar_private.reviewed_sent_matches;
begin
 if not ar_private.invoice_exception_actor(p_actor) or p_proof is null or p_proof!~'^[0-9a-f]{64}$' or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into d from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;
 if not found or d.mode='test' then return false;end if;
 if exists(select 1 from ar_private.mail_deliveries where id<>p_id and owner=p_actor and mailbox=d.mailbox and state='sent' and gmail_id=p_gmail_id)
  or exists(select 1 from ar_private.reviewed_sent_matches where delivery_id<>p_id and owner=p_actor and mailbox=d.mailbox and gmail_id=p_gmail_id) then return false;end if;
 select * into r from ar_private.reviewed_sent_matches where delivery_id=p_id;
 if found and row(r.gmail_id,r.proof_hash,r.reason) is distinct from row(p_gmail_id,p_proof,btrim(p_reason)) then return false;end if;
 if not public.ar_mail_record_verified_sent(p_actor,p_id,p_gmail_id,p_sent_at,p_expected) then return false;end if;
 if r.delivery_id is null then insert into ar_private.reviewed_sent_matches(delivery_id,owner,gmail_id,proof_hash,reason) values(p_id,p_actor,p_gmail_id,p_proof,btrim(p_reason));end if;
 return true;
end $$;
revoke all on function public.ar_mail_record_verified_review(uuid,uuid,text,timestamptz,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ar_mail_record_verified_review(uuid,uuid,text,timestamptz,jsonb,text,text) to service_role;
