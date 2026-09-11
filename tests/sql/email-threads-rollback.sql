-- Synthetic rows only, fully rolled back. No provider requests or customer account edits.
begin;
do $$
declare actor uuid;jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();null_source uuid:=gen_random_uuid();test_id uuid:=gen_random_uuid();bad_id text;
 choice jsonb;r jsonb;expected jsonb;events_before bigint;account_key text:='SYNTHETIC-THREAD-'||gen_random_uuid()::text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved owner required';end if;
 select count(*) into events_before from public.ar_sent_events;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(jid,actor,gen_random_uuid(),'KAT',account_key,'Synthetic thread account',array['SYNTHETIC-INVOICE'],'invoices','separate','billing',jid::text,'[{"id":"SYNTHETIC-INVOICE"}]',100,'ready',1,'[{"name":"Synthetic.pdf","storage_key":"synthetic","byte_count":100,"sha256":"synthetic"}]',true);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 values(did,actor,jid,1,'KAT',account_key,'Synthetic thread account',array['SYNTHETIC-INVOICE'],'billing','{"to":["test@example.test"],"cc":[],"bcc":[]}','Original subject','Synthetic body','[{"name":"Synthetic.pdf"}]');
 insert into public.ar_invoice_workflow(hotel,account_id,invoice_id,base_date,billing_required,credit_term) values('KAT',account_key,'SYNTHETIC-INVOICE',current_date,true,30);
 choice:='{"threadId":"syntheticThread","parentMessageId":"syntheticParent","rfcMessageId":"<parent@example.test>","references":["<parent@example.test>"],"subject":"Synthetic conversation","matchedRecipients":["test@example.test"],"parentDate":"2026-09-10T00:00:00.000Z"}';
 foreach bad_id in array array['','<.parent@example.test>','<parent.@example.test>','<parent@.example.test>','<parent@example.test.>'] loop
  if ar_private.valid_reply_id(bad_id) then raise exception 'malformed RFC ID accepted';end if;
 end loop;
 r:=public.ar_email_thread_select(gen_random_uuid(),did,0,choice);if r->>'error' is distinct from 'email_forbidden' then raise exception 'owner guard';end if;
 r:=public.ar_email_thread_select(actor,did,99,choice);if r->>'error' is distinct from 'email_revision_conflict' then raise exception 'revision guard';end if;
 r:=public.ar_email_thread_select(actor,did,0,jsonb_set(choice,'{matchedRecipients}','["other@example.test"]'));if r->>'error' is distinct from 'email_thread_unrelated' then raise exception 'recipient guard';end if;
 r:=public.ar_email_thread_select(actor,did,0,jsonb_set(choice,'{references}','["<parent@example.test>","<parent@example.test>"]'));if r->>'error' is distinct from 'email_thread_invalid' then raise exception 'duplicate references';end if;
 update public.ar_document_jobs set acknowledged=false where id=jid;
 r:=public.ar_email_thread_select(actor,did,0,choice);if r->>'error' is distinct from 'email_package_changed' then raise exception 'package guard';end if;
 update public.ar_document_jobs set acknowledged=true where id=jid;
 r:=public.ar_email_thread_select(actor,did,0,choice);if r->'thread' is distinct from choice or r->>'revision' is distinct from '1' or r->>'subject' is distinct from choice->>'subject' or r->>'body' is distinct from 'Synthetic body' then raise exception 'choice adoption';end if;
 r:=public.ar_email_save_v2(actor,did,1,'billing',r->'recipients','Changed subject','Synthetic body',null,null);if r->>'error' is distinct from 'email_thread_subject_locked' then raise exception 'subject guard';end if;
 r:=public.ar_email_save_v2(actor,did,1,'billing','{"to":["other@example.test"],"cc":[],"bcc":[]}',choice->>'subject','Synthetic body',null,null);if r->>'error' is distinct from 'email_thread_unrelated' then raise exception 'save recipient guard';end if;
 r:=public.ar_email_save_v2(actor,did,1,'billing','{"to":["test@example.test"],"cc":[],"bcc":[]}',choice->>'subject','Revised body',null,null);if r->'thread' is distinct from choice or r->>'revision' is distinct from '2' then raise exception 'body edit lost selection';end if;
 expected:=jsonb_build_object('recipients',r->'recipients','subject',r->>'subject','body',r->>'body','thread',choice);
 r:=public.ar_mail_claim(actor,mid,did,2,'draft',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected-'thread');if r->>'error' is distinct from 'email_thread_changed' then raise exception 'claim missing thread bypass';end if;
 r:=public.ar_mail_claim(actor,mid,did,2,'draft',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',jsonb_set(expected,'{thread,threadId}','"otherThread"'));if r->>'error' is distinct from 'email_thread_changed' then raise exception 'claim different thread bypass';end if;
 r:=public.ar_gmail_attempt_claim(actor,did,2,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>');if r->>'error' is distinct from 'email_thread_legacy_unsupported' then raise exception 'legacy claim bypass';end if;
 r:=public.ar_mail_claim(actor,mid,did,2,'draft',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);if (r->>'claimed')::boolean is distinct from true then raise exception 'thread claim denied: %',r->>'error';end if;
 r:=public.ar_email_thread_select(actor,did,2,null);if r->>'error' is distinct from 'email_handoff_pending' then raise exception 'pending selection changed';end if;
 r:=public.ar_mail_claim(actor,mid,did,2,'draft',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected);if (r->>'claimed')::boolean is distinct from false then raise exception 'duplicate claim';end if;
 -- Removing this transaction's unsent synthetic claim only allows clear-selection coverage.
 delete from ar_private.mail_deliveries where id=mid and state='pending';
 r:=public.ar_email_thread_select(actor,did,2,null);if r->'thread' is distinct from 'null'::jsonb or r->>'revision' is distinct from '3' or r->>'subject' is distinct from choice->>'subject' then raise exception 'clear selection';end if;
 r:=public.ar_mail_claim(actor,mid,did,3,'draft',null,'<'||mid||'@ar-workspace.ar-c82.workers.dev>',expected-'thread');if (r->>'claimed')::boolean is distinct from true then raise exception 'new email claim failed after clear';end if;
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
 values(source_id,actor,'test','<'||source_id||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('expected',jsonb_build_object('recipientHash',repeat('a',64),'subject','Synthetic conversation')),'sent','syntheticParent',now());
 expected:=jsonb_build_object('recipientHash',repeat('a',64),'subject','Synthetic conversation','replyToDeliveryId',source_id,'thread',choice-'matchedRecipients');
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at)
 values(null_source,actor,'test','<'||null_source||'@ar-workspace.ar-c82.workers.dev>','{"expected":{"subject":"Synthetic conversation"}}','sent','syntheticParent',now());
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',jsonb_set(expected-'recipientHash','{replyToDeliveryId}',to_jsonb(null_source::text)));if r->>'error' is distinct from 'email_test_command_conflict' then raise exception 'both missing recipient hashes accepted';end if;
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',expected||jsonb_build_object('thread',choice));if r->>'error' is distinct from 'email_test_command_conflict' then raise exception 'diagnostic recipient leak';end if;
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',jsonb_set(expected,'{recipientHash}',to_jsonb(repeat('b',64))));if r->>'error' is distinct from 'email_test_command_conflict' then raise exception 'diagnostic recipient mismatch';end if;
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',expected||'{"supplementalSource":{}}');if r->>'error' is distinct from 'email_test_command_conflict' then raise exception 'diagnostic customer attachment';end if;
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',expected);if (r->>'claimed')::boolean is distinct from true then raise exception 'diagnostic claim';end if;
 r:=public.ar_mail_claim(actor,test_id,null,null,'test',null,'<'||test_id||'@ar-workspace.ar-c82.workers.dev>',expected-'replyToDeliveryId'-'thread');if r->>'error' is distinct from 'email_test_command_conflict' then raise exception 'diagnostic retry identity';end if;
 if has_function_privilege('authenticated','public.ar_email_thread_select(uuid,uuid,integer,jsonb)','execute') or has_function_privilege('anon','public.ar_mail_test_conversations(uuid,integer)','execute') or has_function_privilege('service_role','ar_private.mail_claim_before_threads(uuid,uuid,uuid,integer,text,text,text,jsonb)','execute') then raise exception 'private writer privileges';end if;
 if events_before is distinct from (select count(*) from public.ar_sent_events) then raise exception 'business history changed';end if;
 if exists(select 1 from public.ar_invoice_workflow where account_id=account_key and (first_billing_date is not null or due_date is not null or last_reminder_stage is not null)) then raise exception 'workflow dates changed';end if;
end $$;
rollback;
select 'synthetic thread selection/claim/privacy checks passed; rolled back' as result;
