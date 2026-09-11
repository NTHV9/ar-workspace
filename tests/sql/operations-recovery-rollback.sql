begin;
do $$
declare actor uuid;pending_id uuid:=gen_random_uuid();missing_id uuid:=gen_random_uuid();job_id uuid:=gen_random_uuid();r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(pending_id,actor,'test','<'||pending_id||'@ar-workspace.ar-c82.workers.dev>','{}','pending');
 r:=public.ar_recovery_sent_match(actor,jsonb_build_array(jsonb_build_object('deliveryId',pending_id,'gmailId','syntheticSavedMessage','sentAt','2026-09-10T10:00:00Z'),jsonb_build_object('deliveryId',missing_id,'gmailId','syntheticMissingMessage','sentAt','2026-09-10T11:00:00Z')));
 if r->0->>'state'<>'needs_reconciliation' or r->1->>'state'<>'missing_receipt' then raise exception 'SENT recovery match invented a sent receipt: %',r;end if;
 if (select count(*) from ar_private.mail_deliveries where id=missing_id)<>0 then raise exception 'read-only audit inserted a missing receipt';end if;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state) values(job_id,actor,gen_random_uuid(),'KAT','SYNTHETIC-OPS','Synthetic unfinished documents',array['A'],'statement','combined','billing',job_id::text,'[{"id":"A"}]',1,'failed');
 r:=public.ar_operations_queue(actor,'document',0);if not exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'id'=job_id::text and x->>'state'='failed') then raise exception 'unfinished document inaccessible';end if;
 if public.ar_operations_queue(gen_random_uuid(),'all',0)->>'error'<>'operations_forbidden' then raise exception 'actor gate';end if;
 if has_function_privilege('authenticated','public.ar_operations_queue(uuid,text,integer)','execute') or has_function_privilege('anon','public.ar_recovery_sent_match(uuid,jsonb)','execute') then raise exception 'operations private grant';end if;
end$$;
rollback;
select 'Operations queue, missing receipt, no audit writes and access checks passed; rolled back' as result;
