create table ar_private.reviewed_sent_matches(
 delivery_id uuid primary key references ar_private.mail_deliveries(id),owner uuid not null references auth.users(id),gmail_id text not null unique,
 proof_hash text not null check(proof_hash~'^[0-9a-f]{64}$'),reason text not null,reviewed_at timestamptz not null default clock_timestamp()
);
alter table ar_private.reviewed_sent_matches enable row level security;
revoke all on ar_private.reviewed_sent_matches from public,anon,authenticated,service_role;
create function ar_private.reviewed_sent_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'email_review_audit_immutable';end$$;
create trigger reviewed_sent_immutable before update or delete on ar_private.reviewed_sent_matches for each row execute function ar_private.reviewed_sent_immutable();
revoke all on function ar_private.reviewed_sent_immutable() from public,anon,authenticated,service_role;
create function public.ar_mail_reviewed_sent(p_actor uuid,p_id uuid,p_gmail_id text,p_sent_at timestamptz,p_proof text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d ar_private.mail_deliveries;r ar_private.reviewed_sent_matches;result jsonb;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','email_forbidden');end if;
 if p_gmail_id is null or p_gmail_id!~'^[A-Za-z0-9_-]{1,200}$' or p_proof is null or p_proof!~'^[0-9a-f]{64}$' or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then return jsonb_build_object('error','email_invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,735));
 select * into d from ar_private.mail_deliveries where id=p_id and owner=p_actor for update;if not found or d.mode='test' then return jsonb_build_object('error','email_missing');end if;
 if exists(select 1 from ar_private.mail_deliveries where id<>p_id and owner=p_actor and state='sent' and gmail_id=p_gmail_id) or exists(select 1 from ar_private.reviewed_sent_matches where delivery_id<>p_id and gmail_id=p_gmail_id) then return jsonb_build_object('error','email_sent_match_conflict');end if;
 select * into r from ar_private.reviewed_sent_matches where delivery_id=p_id;
 if found and row(r.gmail_id,r.proof_hash,r.reason) is distinct from row(p_gmail_id,p_proof,p_reason) then return jsonb_build_object('error','email_sent_match_conflict');end if;
 if not found then insert into ar_private.reviewed_sent_matches(delivery_id,owner,gmail_id,proof_hash,reason) values(p_id,p_actor,p_gmail_id,p_proof,p_reason);end if;
 result:=public.ar_mail_confirm_sent(p_actor,p_id,p_gmail_id,p_sent_at);return result;
end$$;
revoke all on function public.ar_mail_reviewed_sent(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_mail_reviewed_sent(uuid,uuid,text,timestamptz,text,text) to service_role;
-- The active disposable scenario uses the same reviewed-outcome rule. No rows
-- or credentials are copied from the real application.
do $$declare definition text;begin
 if to_regnamespace('ar_acceptance_private_20260911') is not null then
  create table ar_acceptance_private_20260911.reviewed_sent_matches(like ar_private.reviewed_sent_matches including all);
  alter table ar_acceptance_private_20260911.reviewed_sent_matches enable row level security;
  revoke all on ar_acceptance_private_20260911.reviewed_sent_matches from public,anon,authenticated,service_role;
  create trigger reviewed_sent_immutable before update or delete on ar_acceptance_private_20260911.reviewed_sent_matches for each row execute function ar_private.reviewed_sent_immutable();
  definition:=replace(replace(pg_get_functiondef('public.ar_mail_reviewed_sent(uuid,uuid,text,timestamptz,text,text)'::regprocedure),'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');execute definition;
  revoke all on function ar_acceptance_20260911.ar_mail_reviewed_sent(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated,service_role;
 end if;
end$$;
