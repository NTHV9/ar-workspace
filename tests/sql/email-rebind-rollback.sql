-- Synthetic fixtures only. No provider call; every row is rolled back.
begin;
do $$
declare actor uuid;jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();r jsonb;old_d jsonb;attachment_key text;choice jsonb;events bigint;mid uuid:=gen_random_uuid();
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved owner required';end if;
 perform set_config('ar.document_lifecycle','transient',true);
 select count(*) into events from public.ar_sent_events;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(jid,actor,gen_random_uuid(),'KAT','SYNTHETIC-REBIND-'||jid,'Synthetic rebind',array['SYNTHETIC-I'],'invoices','combined','billing',jid::text,'[{"id":"SYNTHETIC-I"}]',100,'ready',2,'[{"name":"New.pdf","storage_key":"synthetic/new","byte_count":100,"sha256":"synthetic"}]',true);
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports,rich_body,template_ref)
 select did,owner,id,1,hotel,account_id,account_name,invoice_ids,'billing','{"to":["saved@example.invalid"],"cc":[],"bcc":[]}','Saved subject','Saved body','[{"name":"Old.pdf","storage_key":"synthetic/old","byte_count":100}]','{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Saved body","bold":true}]}]}','{"id":"synthetic-template","version":1}' from public.ar_document_jobs where id=jid;
 attachment_key:='jobs/'||jid||'/email/'||did||'/'||aid;
 perform public.ar_document_begin_upload(actor,jid,attachment_key,100,repeat('b',64));
 insert into public.ar_email_attachments(id,draft_id,name,storage_key,mime,byte_count,sha256) values(aid,did,'Supplement.pdf',attachment_key,'application/pdf',100,repeat('b',64));
 choice:='{"threadId":"syntheticThread","parentMessageId":"syntheticParent","rfcMessageId":"<parent@example.invalid>","references":["<parent@example.invalid>"],"subject":"Synthetic conversation","matchedRecipients":["saved@example.invalid"],"parentDate":"2026-10-20T00:00:00.000Z"}';
 insert into ar_private.email_thread_choices(draft_id,owner,selected_revision,choice) values(did,actor,1,choice);
 select to_jsonb(d) into old_d from public.ar_email_drafts d where id=did;
 if public.ar_email_rebind(gen_random_uuid(),did,0,jid,2,10485760)->>'error' is distinct from 'email_forbidden' then raise exception 'actor guard';end if;
 if public.ar_email_rebind(actor,did,8,jid,2,10485760)->>'error' is distinct from 'email_revision_conflict' then raise exception 'revision guard';end if;
 if public.ar_email_rebind(actor,did,0,jid,1,10485760)->>'error' is distinct from 'email_package_not_reviewed' then raise exception 'document revision guard';end if;
 if public.ar_email_rebind(actor,did,0,jid,2,199)->>'error' is distinct from 'email_too_large' then raise exception 'aggregate byte guard';end if;
 perform set_config('request.headers','{"x-ar-actor":"malformed"}',true);
 if public.ar_email_rebind(actor,did,0,jid,2,10485760)->>'error' is distinct from 'email_forbidden' then raise exception 'header guard';end if;
 perform set_config('request.headers','{}',true);
 r:=public.ar_email_rebind(actor,did,0,jid,2,10485760);
 if r?'error' or r->>'id'<>did::text or r->>'revision'<>'1' or r->>'document_revision'<>'2' or (r->>'package_changed')::boolean then raise exception 'rebind failed: %',r->>'error';end if;
 if r->'recipients' is distinct from old_d->'recipients' or r->'subject' is distinct from old_d->'subject' or r->'body' is distinct from old_d->'body' or r->'rich_body' is distinct from old_d->'rich_body' or r->'template_ref' is distinct from old_d->'template_ref' or r->'thread' is distinct from choice or r->'attachments'->0->>'id'<>aid::text then raise exception 'saved email lost';end if;
 if r->'exports'->0->>'name'<>'New.pdf' then raise exception 'old PDF retained';end if;
 if public.ar_email_rebind(actor,did,0,jid,2,10485760)->>'revision'<>'1' then raise exception 'retry not idempotent';end if;
 update public.ar_email_drafts set revision=3 where id=did;
 if public.ar_email_rebind(actor,did,0,jid,2,10485760)->>'revision'<>'3' then raise exception 'same-binding reopen rejected saved edits';end if;
 update public.ar_email_drafts set revision=1 where id=did;
 update public.ar_document_jobs set revision=3 where id=jid;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(mid,actor,did,1,'draft','<'||mid||'@example.invalid>',jsonb_build_object('expected',jsonb_build_object('sender',ar_private.gmail_sender('phuket'),'mailbox','phuket')),'created');
 if public.ar_email_rebind(actor,did,1,jid,3,10485760)->>'error' is distinct from 'email_handoff_pending' then raise exception 'handoff guard';end if;
 if (select count(*) from public.ar_sent_events)<>events then raise exception 'business history changed';end if;
 if has_function_privilege('anon','public.ar_email_rebind(uuid,uuid,integer,uuid,integer,bigint)','execute') or has_function_privilege('authenticated','public.ar_email_rebind(uuid,uuid,integer,uuid,integer,bigint)','execute') then raise exception 'client execution allowed';end if;
end$$;
rollback;
