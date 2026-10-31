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
 perform public.ar_document_review(actor,jid,0,jsonb_build_array(jsonb_build_object('invoice_ids',job->'invoice_ids','name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64))),true);
 perform set_config('ar.test.verified_sent_job',jid::text,true);
end$$;

do $$
declare j public.ar_document_jobs;d jsonb;m jsonb;r jsonb;expected jsonb;proof jsonb;before_events bigint;send_time timestamptz:=clock_timestamp();blocked boolean;
begin
 select * into j from public.ar_document_jobs where id=current_setting('ar.test.verified_sent_job')::uuid;
 if j.id is null then raise exception 'Reviewed synthetic job missing';end if;
 if has_function_privilege('authenticated','public.ar_mail_record_verified_sent(uuid,uuid,text,timestamptz,jsonb)','execute') or has_function_privilege('anon','public.ar_mail_record_verified_sent(uuid,uuid,text,timestamptz,jsonb)','execute') or not has_function_privilege('service_role','public.ar_mail_record_verified_sent(uuid,uuid,text,timestamptz,jsonb)','execute') then raise exception 'Sent proof RPC ACL leak';end if;
 select count(*) into before_events from public.ar_sent_events;
 d:=public.ar_email_open(j.owner,j.id,j.revision);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=j.hotel and account_id=j.account_id and invoice_id=any(j.invoice_ids);
 d:=public.ar_email_save(j.owner,(d->>'id')::uuid,(d->>'revision')::int,'billing','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}', 'Synthetic external Sent','Reviewed body');
 expected:=jsonb_build_object('mailbox','phuket','sender','ar@katathani.com','recipients',d->'recipients','subject',d->>'subject','body',d->>'body');
 m:=public.ar_mail_claim(j.owner,gen_random_uuid(),(d->>'id')::uuid,(d->>'revision')::int,'draft',null,'<'||gen_random_uuid()||'@ar-workspace.ar-c82.workers.dev>',expected);
 if m?'error' or not (m->>'claimed')::boolean then raise exception 'Synthetic claim failed: %',m;end if;
 perform public.ar_mail_record(j.owner,(m->>'id')::uuid,'created','original-create-receipt','original-draft',null);
 if public.ar_mail_record_verified_sent(gen_random_uuid(),(m->>'id')::uuid,'external-sent',send_time,expected) then raise exception 'Cross-owner evidence accepted';end if;
 if public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected||'{"body":"changed"}') then raise exception 'Changed immutable expected accepted';end if;
 if public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected||'{"mailbox":"khao-lak"}') then raise exception 'Changed mailbox accepted';end if;
 if public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'unsafe/path',send_time,expected) or public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent',now()+interval '1 day',expected) or public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent','infinity',expected) then raise exception 'Invalid identity/date accepted';end if;
 if not public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected) then raise exception 'Verified Sent proof rejected';end if;
 r:=public.ar_mail_get(j.owner,(m->>'id')::uuid);proof:=r->'verified_sent_evidence';
 if r->>'state'<>'awaiting_evidence' or r->>'provider_receipt_id'<>'original-create-receipt' or r->'snapshot'->'expected' is distinct from expected or proof->>'gmailId'<>'external-sent' or (proof->>'sentAt')::timestamptz<>send_time then raise exception 'Proof did not preserve exact evidence/receipt';end if;
 if not public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected) or public.ar_mail_record_verified_sent(j.owner,(m->>'id')::uuid,'another-sent',send_time,expected) then raise exception 'Proof replay/collision fencing failed';end if;
 blocked:=false;begin update ar_private.mail_deliveries set verified_sent_evidence=null where id=(m->>'id')::uuid;exception when others then blocked:=sqlerrm='sent_evidence_immutable';end;if not blocked then raise exception 'Verified proof erased';end if;
 blocked:=false;begin update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,body}','"changed"') where id=(m->>'id')::uuid;exception when others then blocked:=sqlerrm='sent_evidence_immutable';end;if not blocked then raise exception 'Verified recipient/content snapshot replaced';end if;
 if has_function_privilege('authenticated','public.ar_mail_record_verified_review(uuid,uuid,text,timestamptz,jsonb,text,text)','execute') or has_function_privilege('anon','public.ar_mail_record_verified_review(uuid,uuid,text,timestamptz,jsonb,text,text)','execute') or not has_function_privilege('service_role','public.ar_mail_record_verified_review(uuid,uuid,text,timestamptz,jsonb,text,text)','execute') then raise exception 'Manual proof RPC ACL leak';end if;
 if public.ar_mail_record_verified_review(gen_random_uuid(),(m->>'id')::uuid,'external-sent',send_time,expected,repeat('a',64),'Original manual reason') or public.ar_mail_record_verified_review(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected,'invalid-proof','Original manual reason') then raise exception 'Invalid manual review accepted';end if;
 if not public.ar_mail_record_verified_review(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected,repeat('a',64),'Original manual reason') then raise exception 'Durable manual review rejected';end if;
 if not public.ar_mail_record_verified_review(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected,repeat('a',64),'Original manual reason') or public.ar_mail_record_verified_review(j.owner,(m->>'id')::uuid,'external-sent',send_time,expected,repeat('a',64),'Changed manual reason') then raise exception 'Manual audit replay/collision failed';end if;
 -- Simulate a history transaction failing before commit: proof was written in a
 -- preceding operation and must survive the history rollback independently.
 begin
  r:=public.ar_mail_reviewed_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time,repeat('a',64),'Original manual reason');
  if r->>'state'<>'sent' then raise exception 'Synthetic confirmation fixture failed';end if;
  raise exception using errcode='P9999',message='Synthetic history failure before commit';
 exception when sqlstate 'P9999' then null;
 end;
 r:=public.ar_mail_get(j.owner,(m->>'id')::uuid);
 if r->>'state'<>'awaiting_evidence' or r->'verified_sent_evidence' is distinct from proof or (select count(*) from public.ar_sent_events)<>before_events then raise exception 'History failure lost proof or committed event';end if;
 if not exists(select 1 from ar_private.reviewed_sent_matches where delivery_id=(m->>'id')::uuid and owner=j.owner and gmail_id='external-sent' and proof_hash=repeat('a',64) and reason='Original manual reason') then raise exception 'History failure lost manual audit';end if;
 r:=public.ar_mail_confirm_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time);
 if r->>'state'<>'sent' or not (r->>'recorded')::boolean then raise exception 'History recovery failed: %',r;end if;
 r:=public.ar_mail_confirm_sent(j.owner,(m->>'id')::uuid,'external-sent',send_time);
 if (select count(*) from public.ar_sent_events)<>before_events+1 then raise exception 'Duplicate Sent event on recovery';end if;
 if not exists(select 1 from public.ar_sent_events where delivery_id=(m->>'id')::uuid and sent_at=send_time and gmail_id='external-sent') then raise exception 'Original sent date/identity lost';end if;
 if (public.ar_mail_get(j.owner,(m->>'id')::uuid))->'verified_sent_evidence' is distinct from proof then raise exception 'History confirmation changed verified proof';end if;
end $$;
rollback;
