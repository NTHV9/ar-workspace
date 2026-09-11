alter table ar_private.mail_deliveries add column provider_receipt_id text;
-- Only these states with no failure reason were written immediately from a
-- successful provider response; candidate/review IDs are never promoted.
update ar_private.mail_deliveries set provider_receipt_id=gmail_id where state in ('created','awaiting_evidence') and reason is null and gmail_id is not null;
create or replace function public.ar_mail_record(p_actor uuid,p_id uuid,p_state text,p_gmail_id text,p_gmail_draft_id text,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('created','awaiting_evidence','review_required') then return false;end if;
 update ar_private.mail_deliveries set state=p_state,gmail_id=coalesce(p_gmail_id,gmail_id),
 provider_receipt_id=case when p_state in ('created','awaiting_evidence') and p_reason is null then coalesce(provider_receipt_id,p_gmail_id) else provider_receipt_id end,
 gmail_draft_id=coalesce(p_gmail_draft_id,gmail_draft_id),reason=p_reason where id=p_id and owner=p_actor and state<>'sent';return found;
end $$;
