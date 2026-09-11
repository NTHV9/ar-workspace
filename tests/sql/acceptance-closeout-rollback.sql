begin;
do $$
declare actor uuid;scenario uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if has_function_privilege('authenticated','public.ar_acceptance_close_begin(uuid,uuid)','execute') or has_function_privilege('anon','public.ar_acceptance_close_record(uuid,uuid,text)','execute') then raise exception 'closeout exposed';end if;
 r:=public.ar_acceptance_close_begin(gen_random_uuid(),scenario);if r->>'error'<>'acceptance_forbidden' then raise exception 'actor gate';end if;
 insert into ar_private.acceptance_sessions(id,owner,state,source_sha,summary) values(scenario,actor,'complete','synthetic-closeout',jsonb_build_object('phase','providers_removed','receipts',jsonb_build_array(jsonb_build_object('deliveryId',delivery,'gmailId','syntheticSealedReceipt','sentAt','2026-09-11T01:00:00Z'))));
 r:=public.ar_recovery_sent_match(actor,jsonb_build_array(jsonb_build_object('deliveryId',delivery,'gmailId','syntheticSealedReceipt','sentAt','2026-09-11T01:00:00Z')));
 if jsonb_array_length(r)<>1 or r->0->>'state'<>'isolated_test' then raise exception 'sealed marker not recognized: %',r;end if;
 r:=public.ar_recovery_sent_match(actor,'[{"deliveryId":null,"gmailId":"syntheticSealedReceipt","sentAt":"2026-09-11T01:00:00Z"}]');
 if jsonb_array_length(r)<>1 or r->0->>'state'<>'isolated_test' then raise exception 'sealed provider ID not recognized';end if;
 r:=public.ar_recovery_sent_match(actor,jsonb_build_array(jsonb_build_object('deliveryId',gen_random_uuid(),'gmailId','syntheticSealedReceipt','sentAt','2026-09-11T01:00:00Z')));
 if r->0->>'state'<>'missing_receipt' then raise exception 'mismatched marker hidden';end if;
 if public.ar_acceptance_context(actor,scenario)->>'error'<>'acceptance_inactive' then raise exception 'sealed scenario still active';end if;
end$$;
rollback;
select 'Closeout permissions, sealed test recovery receipts and inactive context passed; rolled back' as result;
