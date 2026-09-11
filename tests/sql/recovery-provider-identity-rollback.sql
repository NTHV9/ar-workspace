begin;
do $$
declare actor uuid;pending_id uuid:=gen_random_uuid();sent_id uuid:=gen_random_uuid();r jsonb;before_count bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(pending_id,actor,'test','<'||pending_id||'@ar-workspace.ar-c82.workers.dev>','{}','pending','syntheticPendingProvider',null),(sent_id,actor,'test','<'||sent_id||'@ar-workspace.ar-c82.workers.dev>','{}','sent','syntheticRecordedProvider',now());
 select count(*) into before_count from ar_private.mail_deliveries;
 r:=public.ar_recovery_sent_match(actor,'[{"deliveryId":null,"gmailId":"syntheticRecordedProvider","sentAt":"2026-09-10T10:00:00Z"},{"deliveryId":null,"gmailId":"syntheticPendingProvider","sentAt":"2026-09-10T10:00:00Z"},{"deliveryId":null,"gmailId":"syntheticUnrelatedMessage","sentAt":"2026-09-10T10:00:00Z"}]');
 if jsonb_array_length(r)<>2 or r->0->>'state'<>'recorded' or r->0->>'matchedBy'<>'saved_provider_id' or r->1->>'state'<>'needs_reconciliation' then raise exception 'provider receipt fallback failed: %',r;end if;
 if (select count(*) from ar_private.mail_deliveries)<>before_count then raise exception 'audit mutated deliveries';end if;
end$$;
rollback;
select 'Provider identity fallback, pending distinction and unrelated unmarked exclusion passed; rolled back' as result;
