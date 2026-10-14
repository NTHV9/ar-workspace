begin;
do $$declare actor uuid;scope text:='SYNTHETIC-DRAFT-SEND-'||gen_random_uuid();job jsonb;jid uuid;fid uuid;key text;r jsonb;begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic draft send','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 r:=public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{"billingMethod":"email"}');if r?'error' then raise exception 'synthetic settings failed';end if;
 job:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');jid:=(job->>'id')::uuid;
 select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_claim_file(jid,fid);perform public.ar_document_finish_file(jid,fid,'jobs/'||jid||'/originals/'||fid||'.pdf',100,repeat('a',64));
 key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_begin_upload(actor,jid,key,100,repeat('b',64));perform public.ar_document_register_upload(jid,key,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,jid,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64))),true);
 perform set_config('ar.test.draft_send_job',jid::text,true);
end$$;
do $$
declare j public.ar_document_jobs;d jsonb;m jsonb;r jsonb;expected jsonb;events_before bigint;v_count bigint;test_id uuid:=gen_random_uuid();
begin
 select * into j from public.ar_document_jobs where id=current_setting('ar.test.draft_send_job')::uuid;
 if j.id is null then raise exception 'A separate reviewed job is required for rollback verification';end if;
 select count(*) into events_before from public.ar_sent_events;
 d:=public.ar_email_open(j.owner,j.id,j.revision);if d?'error' then raise exception 'draft open failed';end if;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=j.hotel and account_id=j.account_id and invoice_id=any(j.invoice_ids);
 d:=public.ar_email_save(j.owner,(d->>'id')::uuid,(d->>'revision')::int,'billing','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}', 'Synthetic rollback test','Synthetic rollback body');
 expected:=jsonb_build_object('mailbox','phuket','sender','ar@katathani.com','recipients',d->'recipients','subject',d->>'subject','body',d->>'body');
 m:=public.ar_mail_claim(j.owner,gen_random_uuid(),(d->>'id')::uuid,(d->>'revision')::int,'draft',null,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>',expected);
 if not coalesce((m->>'claimed')::boolean,false) then raise exception 'send claim failed: %',m->>'error';end if;
 r:=public.ar_mail_claim(j.owner,gen_random_uuid(),(d->>'id')::uuid,(d->>'revision')::int,'send',null,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>',expected);
 if (r->>'claimed')::boolean then raise exception 'duplicate claimed';end if;
 if public.ar_mail_get(gen_random_uuid(),(m->>'id')::uuid) is not null then raise exception 'cross owner leak';end if;
 perform public.ar_mail_record(j.owner,(m->>'id')::uuid,'created','synthetic-draft-message','synthetic-draft',null);
 r:=public.ar_mail_claim_draft_send(j.owner,(m->>'id')::uuid,(d->>'revision')::int,m->'snapshot'->'expected');
 if r?'error' or not (r->>'claimed')::boolean or r->>'state'<>'awaiting_evidence' or r->>'provider_receipt_id' is not null then raise exception 'draft send claim failed: %',r;end if;
 r:=public.ar_mail_claim_draft_send(j.owner,(m->>'id')::uuid,(d->>'revision')::int,m->'snapshot'->'expected');
 if (r->>'claimed')::boolean then raise exception 'draft send claimed twice';end if;
 perform public.ar_mail_record(j.owner,(m->>'id')::uuid,'awaiting_evidence','synthetic-sent-message',null,null);
 if (public.ar_mail_get(j.owner,(m->>'id')::uuid))->>'provider_receipt_id'<>'synthetic-sent-message' then raise exception 'old draft receipt retained';end if;
 r:=public.ar_mail_confirm_sent(j.owner,(m->>'id')::uuid,'synthetic-'||gen_random_uuid(),now());
 if r->>'state'<>'sent' or not (r->>'recorded')::boolean then raise exception 'billing event missing';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel=j.hotel and account_id=j.account_id and invoice_id=any(j.invoice_ids) and (first_billing_date is null or due_date<>first_billing_date+30)) then raise exception 'billing due incorrect';end if;
 r:=public.ar_mail_confirm_sent(j.owner,(m->>'id')::uuid,'same-event',now());
 select count(*) into v_count from public.ar_sent_events;if v_count<>events_before+1 then raise exception 'duplicate event';end if;

end$$;
rollback;

