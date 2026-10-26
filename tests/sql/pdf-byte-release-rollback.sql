begin;
do $$declare actor uuid;cohort uuid:=gen_random_uuid();members jsonb:='[]';jid uuid;did uuid;mid uuid;obj uuid;key text;exp jsonb;expected jsonb;r jsonb;p jsonb;command uuid:=gen_random_uuid();first_job uuid;first_mail uuid;first_object uuid;first_key text;digest text;scenario text;blocked boolean;item uuid;claim uuid:=gen_random_uuid();combined_id uuid:=gen_random_uuid();combined_mail uuid:=gen_random_uuid();combined_members jsonb;proof_time timestamptz;visible integer;begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 perform set_config('ar.document_lifecycle','transient',true);
 for n in 1..20 loop
  jid:=gen_random_uuid();did:=gen_random_uuid();mid:=gen_random_uuid();obj:=gen_random_uuid();
  key:='jobs/'||jid||'/email/'||did||'/'||gen_random_uuid();
  exp:=jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('a',64)));
  insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT','SYNTHETIC-RELEASE-'||n,'Synthetic release','SYNTHETIC',100,0,1,'verified');
  insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT','SYNTHETIC-RELEASE-'||n,'A',current_date,100,100,'verified','standalone',false,now());
  update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id='SYNTHETIC-RELEASE-'||n and invoice_id='A';
  insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,lifecycle,acknowledged,exports)
  values(jid,actor,gen_random_uuid(),'KAT','SYNTHETIC-RELEASE-'||n,'Synthetic release',array['A'],'invoices','combined','billing',md5(jid::text),'[{"id":"A","open":100}]',100,'ready','transient',true,exp);
  insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
  values(did,actor,jid,0,'KAT','SYNTHETIC-RELEASE-'||n,'Synthetic release',array['A'],'billing','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}','Synthetic','Body',exp);
  insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256,registered) values(key,jid,100,repeat('a',64),true);
  insert into public.ar_email_attachments(id,draft_id,storage_key,name,byte_count,sha256,mime) values(gen_random_uuid(),did,key,'Synthetic.pdf',100,repeat('a',64),'application/pdf');
  if n<=4 then update public.ar_document_jobs set closed_at=clock_timestamp(),closed_reason='discarded' where id=jid;
  elsif n<=18 then
   expected:=jsonb_build_object('mailbox','phuket','sender','ar@katathani.com','messageId','<'||mid||'@ar-workspace.ar-c82.workers.dev>','recipients','{"to":["synthetic@example.test"],"cc":[],"bcc":[]}'::jsonb,'subject','Synthetic','body','Body','files',jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','byte_count',100,'sha256',repeat('a',64))));
   insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state,gmail_draft_id)
   select mid,actor,did,0,case when n<=11 then 'draft' else 'send' end,expected->>'messageId',jsonb_build_object('expected',expected,'draft',to_jsonb(d),'manifest','[{"id":"A","open":100}]'::jsonb,'workflow',(select jsonb_agg(to_jsonb(w)) from public.ar_invoice_workflow w where w.hotel=d.hotel and w.account_id=d.account_id and w.invoice_id='A')),case when n<=7 then 'created' else 'review_required' end,'synthetic-draft' from public.ar_email_drafts d where d.id=did;
   if n=5 then first_job:=jid;first_mail:=mid;first_object:=obj;first_key:=key;end if;
  end if;
  insert into storage.objects(id,bucket_id,name,metadata) values(obj,'ar-working-files',key,'{"size":100}');
  if n<=2 then
   r:=public.ar_retention_enroll(actor,'supabase',obj::text,7200);item:=(r->>'id')::uuid;
   r:=public.ar_retention_claim(actor,item,claim,7200,1,60);if r->>'mode'<>'delete' then raise exception 'synthetic already-deleted normal enrollment failed: %',r;end if;
   perform public.ar_retention_arm(actor,item,claim,7200);perform public.ar_retention_delete_ack(actor,item,claim);
   -- Synthetic acknowledged provider deletion, no live Storage connection.
   delete from storage.objects where id=obj;perform public.ar_retention_observe(actor,item,claim,'absent',7200);
  end if;
  if n in(3,4) and ar_private.retention_transient_eligibility(actor,'supabase',key)->>'complete' is distinct from 'true' then raise exception 'closed no-attempt email_attachment draft-id receipt not eligible at positive AR';end if;
  members:=members||jsonb_build_array(jsonb_build_object('jobId',jid,'class',case when n<=4 then 'closed' else 'exception' end));
 end loop;
 -- Two of the nine send/review-required packages share an admitted root.
 select jsonb_agg(jsonb_build_object('documentJobId',d.document_job_id,'draftId',d.id) order by d.id) into combined_members from public.ar_email_drafts d where d.document_job_id in((members->18->>'jobId')::uuid,(members->19->>'jobId')::uuid);
 insert into ar_private.combined_email_preparations(id,owner,revision,members,content,mailbox) values(combined_id,actor,1,combined_members,'{"recipients":{"to":["synthetic@example.test"],"cc":[],"bcc":[]},"subject":"Synthetic","body":"Body","signatureHotel":"KAT"}','phuket');
 expected:=jsonb_set(expected,'{messageId}',to_jsonb('<'||combined_mail||'@ar-workspace.ar-c82.workers.dev>'))||jsonb_build_object('files',jsonb_build_array(jsonb_build_object('name','Synthetic-19.pdf','byte_count',100,'sha256',repeat('a',64)),jsonb_build_object('name','Synthetic-20.pdf','byte_count',100,'sha256',repeat('a',64))));
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,combined_preparation_id,combined_preparation_revision) values(combined_mail,actor,'send',expected->>'messageId',jsonb_build_object('expected',expected),'review_required',combined_id,1);
 insert into ar_private.combined_delivery_members(delivery_id,member_id,owner,document_job_id,draft_id,document_revision,draft_revision,hotel,account_id,invoice_ids,purpose,manifest,workflow,member_snapshot)
 select combined_mail,d.id::text,actor,j.id,d.id,j.revision,d.revision,d.hotel,d.account_id,d.invoice_ids,'billing',j.manifest,(select jsonb_agg(to_jsonb(w)) from public.ar_invoice_workflow w where w.hotel=d.hotel and w.account_id=d.account_id),jsonb_build_object('draft',to_jsonb(d)) from public.ar_email_drafts d join public.ar_document_jobs j on j.id=d.document_job_id where j.id in((members->18->>'jobId')::uuid,(members->19->>'jobId')::uuid);
 if has_function_privilege('authenticated','public.ar_pdf_byte_release_register(uuid,uuid,jsonb)','execute') or has_function_privilege('anon','public.ar_pdf_byte_release_commit(uuid,uuid,uuid,text)','execute') or has_table_privilege('service_role','ar_private.pdf_release_objects','insert') then raise exception 'operator ACL leak';end if;
 begin perform public.ar_pdf_byte_release_register(gen_random_uuid(),cohort,members);raise exception 'actor spoof accepted';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 begin perform public.ar_pdf_byte_release_register(actor,cohort,members-19);raise exception 'wrong cohort accepted';exception when others then if sqlerrm<>'pdf_release_cohort_invalid' then raise;end if;end;
 begin
  perform set_config('request.headers',jsonb_build_object('x-ar-actor',gen_random_uuid())::text,true);
  perform public.ar_pdf_byte_release_register(actor,cohort,members);raise exception 'mapped actor accepted';
 exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 begin
  update ar_private.mail_deliveries set snapshot=snapshot#-'{expected,files,0,sha256}' where id=first_mail;
  perform public.ar_pdf_byte_release_register(actor,cohort,members);raise exception 'incomplete admitted evidence accepted';
 exception when others then if sqlerrm<>'pdf_release_evidence_incomplete' then raise;end if;end;
 r:=public.ar_pdf_byte_release_register(actor,cohort,members);
 p:=public.ar_pdf_byte_release_preview(actor,cohort);digest:=p->>'inventoryDigest';
 if p->'blockers'<>'[]'::jsonb or jsonb_array_length(p->'objects')<>18 or p->>'alreadyDeletedObjects'<>'2' then raise exception 'exact cohort preview failed: %',p;end if;
 if ar_private.retention_transient_eligibility(actor,'supabase',first_key)->>'error' is distinct from 'retention_pending_documents' then raise exception 'future pending mail bypass';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);execute 'set local role authenticated';
 select count(*) into visible from storage.objects where id=first_object;execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if visible<>1 then raise exception 'synthetic member Storage baseline unavailable';end if;
 foreach scenario in array array['evidence','version','upload','claim','shared'] loop
  blocked:=false;
  begin
   if scenario='evidence' then update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,body}','"changed"') where id=first_mail;
   elsif scenario='version' then update storage.objects set updated_at=updated_at+interval '1 second' where id=first_object;
   elsif scenario='upload' then insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256) values('jobs/'||first_job||'/exports/'||gen_random_uuid()||'.pdf',first_job,100,repeat('b',64));
   elsif scenario='shared' then
    insert into public.ar_document_jobs(owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,acknowledged,exports)
    select actor,gen_random_uuid(),hotel,account_id,account_name,invoice_ids,content,layout,purpose,md5(gen_random_uuid()::text),manifest,balance_snapshot,'ready',true,exports from public.ar_document_jobs where id=first_job;
   else update ar_private.mail_deliveries set state='awaiting_evidence',draft_send_claimed_at=clock_timestamp() where id=first_mail;end if;
   perform public.ar_pdf_byte_release_commit(actor,cohort,command,digest);
  exception when others then blocked:=sqlerrm='pdf_release_inventory_changed';end;
  if not blocked then raise exception 'drift accepted: %',scenario;end if;
 end loop;
 r:=public.ar_pdf_byte_release_commit(actor,cohort,command,digest);
 if r->>'accepted' is distinct from 'true' or r<>public.ar_pdf_byte_release_commit(actor,cohort,command,digest) then raise exception 'commit replay failed';end if;
 begin perform public.ar_pdf_byte_release_commit(actor,cohort,gen_random_uuid(),digest);raise exception 'changed replay accepted';exception when others then if sqlerrm<>'pdf_release_command_conflict' then raise;end if;end;
 if public.ar_document_get(first_job)->>'bytes_released' is distinct from 'true' then raise exception 'retired projection missing';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);execute 'set local role authenticated';
 select count(*) into visible from storage.objects where id=first_object;execute 'reset role';perform set_config('request.jwt.claim.sub','',true);
 if visible<>0 then raise exception 'released direct member Storage read admitted';end if;
 begin perform public.ar_document_backup_target(actor,first_job,first_object);raise exception 'released local backup admitted';exception when others then if sqlerrm<>'document_bytes_released' then raise;end if;end;
 if public.ar_email_get(actor,(select draft_id from ar_private.mail_deliveries where id=first_mail))->>'bytes_released' is distinct from 'true' then raise exception 'retired email projection missing';end if;
 r:=public.ar_storage_write_begin(actor,gen_random_uuid(),'jobs/'||first_job||'/exports/'||gen_random_uuid()||'.pdf',100,repeat('a',64),'application/pdf','{}');
 if r->>'error'<>'storage_file_expired' then raise exception 'late managed upload admitted';end if;
 if not exists(select 1 from jsonb_array_elements(public.ar_pdf_byte_release_candidates(actor)) x where x->>'objectId'=first_object::text)
  or not exists(select 1 from jsonb_array_elements(public.ar_document_cleanup_job_candidates(actor,first_job,25)) x where x->>'objectId'=first_object::text) then raise exception 'exact accepted candidates missing';end if;
 foreach scenario in array array['snapshot','draft','job','upload','rebind','send'] loop
  blocked:=false;
  begin
   if scenario='snapshot' then update ar_private.mail_deliveries set snapshot=jsonb_set(snapshot,'{expected,body}','"changed"') where id=first_mail;
   elsif scenario='draft' then update public.ar_email_drafts set body='changed' where document_job_id=first_job;
   elsif scenario='job' then update public.ar_document_jobs set revision=revision+1 where id=first_job;
   elsif scenario='upload' then perform public.ar_document_begin_upload(actor,first_job,'jobs/'||first_job||'/exports/'||gen_random_uuid()||'.pdf',100,repeat('a',64));
   elsif scenario='rebind' then update public.ar_email_drafts set document_job_id=(members->19->>'jobId')::uuid where document_job_id=first_job;
   else update ar_private.mail_deliveries set draft_send_claimed_at=clock_timestamp() where id=first_mail;end if;
  exception when others then blocked:=sqlerrm in('document_bytes_released','pdf_release_evidence_immutable');end;
  if not blocked then raise exception 'late work accepted: %',scenario;end if;
 end loop;
 if ar_private.retention_transient_eligibility(actor,'supabase',first_key)->>'complete' is distinct from 'true' then raise exception 'pinned exceptional eligibility failed';end if;
 r:=public.ar_retention_enroll(actor,'supabase',first_object::text,7200);item:=(r->>'id')::uuid;
 r:=public.ar_retention_claim(actor,item,claim,7200,1,60);if r->>'mode'<>'delete' then raise exception 'exact claim failed: %',r;end if;
 r:=public.ar_retention_arm(actor,item,claim,7200);if r->>'proceed'<>'true' then raise exception 'exact arm failed';end if;
 if not public.ar_mail_record(actor,first_mail,'created',null,null,null) then raise exception 'armed metadata update blocked';end if;
 r:=public.ar_retention_observe(actor,item,claim,'absent',7200);if r->>'state'<>'uncertain' then raise exception 'missing ACK inferred deletion';end if;
 select snapshot->'expected' into expected from ar_private.mail_deliveries where id=first_mail;
 if not public.ar_mail_record_verified_sent(actor,first_mail,'synthetic-remote',clock_timestamp(),expected) then raise exception 'released proof recording blocked';end if;
 if public.ar_mail_record_verified_sent(actor,first_mail,'synthetic-other',clock_timestamp(),expected||'{"body":"changed"}') then raise exception 'altered evidence accepted';end if;
 -- Confirmation and the actual close_sent trigger must still work after release.
 r:=public.ar_mail_confirm_sent(actor,first_mail,'synthetic-remote',clock_timestamp());
 if r->>'state'<>'sent' or r->>'recorded'<>'true' or not exists(select 1 from public.ar_sent_events where delivery_id=first_mail) or public.ar_document_get(first_job)->>'closed_reason'<>'sent' then raise exception 'released ordinary confirmation/history failed: %',r;end if;
 -- Proof/state/history changes must not strand the original exact item/claim.
 r:=public.ar_retention_observe(actor,item,claim,'present',7200);if r->>'state'<>'waiting' then raise exception 'mail proof stranded exact retention: %',r;end if;
 r:=public.ar_retention_claim(actor,item,claim,7200,1,60);if r->>'mode'<>'delete' then raise exception 'post-proof exact claim failed: %',r;end if;
 r:=public.ar_retention_arm(actor,item,claim,7200);if r->>'proceed'<>'true' then raise exception 'post-proof exact arm failed';end if;
 r:=public.ar_retention_delete_ack(actor,item,claim);if r->>'acknowledged'<>'true' then raise exception 'post-proof provider ACK failed';end if;
 -- Synthetic local provider stub only, after the exact production ACK path.
 delete from storage.objects where id=first_object;
 r:=public.ar_retention_observe(actor,item,claim,'absent',7200);if r->>'state'<>'deleted' then raise exception 'post-proof acknowledged deletion not reconciled';end if;
 r:=public.ar_retention_claim(actor,item,gen_random_uuid(),7200,1,60);if r->>'mode'<>'complete' then raise exception 'deleted replay not complete';end if;
 select snapshot->'expected' into expected from ar_private.mail_deliveries where id=combined_mail;proof_time:=clock_timestamp();
 if not public.ar_mail_record_verified_sent(actor,combined_mail,'synthetic-combined',proof_time,expected) then raise exception 'released combined proof blocked';end if;
 r:=public.ar_mail_confirm_sent(actor,combined_mail,'synthetic-combined',proof_time);
 if r->>'state'<>'sent' or r->>'recorded'<>'true' or (select count(*) from ar_private.combined_sent_scopes where delivery_id=combined_mail)<>2
  or exists(select 1 from public.ar_document_jobs where id in((members->18->>'jobId')::uuid,(members->19->>'jobId')::uuid) and closed_reason is distinct from 'sent') then raise exception 'released combined confirmation/history failed: %',r;end if;
 r:=public.ar_pdf_byte_release_status(actor,cohort);if r->>'accepted'<>'true' then raise exception 'private status missing';end if;
end$$;
rollback;
