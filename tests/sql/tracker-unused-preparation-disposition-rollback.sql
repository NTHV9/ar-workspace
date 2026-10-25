-- Synthetic exact-byte retirement. Every mutation, including provider stubs,
-- rolls back. An unused working copy never changes the underlying invoice.
begin;
create function pg_temp.retire_unused(p_actor uuid,p_job uuid,p_preview jsonb,p_objects jsonb default null,p_archive text default repeat('b',64)) returns jsonb language sql as $$
 select public.ar_unused_preparation_retire(p_actor,p_job,(p_preview->>'revision')::integer,p_preview->>'fingerprint',p_preview->>'snapshotSha256','2026-10-24T17:00:00Z',repeat('a',64),p_archive,repeat('c',64),coalesce(p_objects,p_preview->'objects'));
$$;
do $$
declare actor uuid;jid uuid:=gen_random_uuid();other uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();
 scope text:='SYNTHETIC-UNUSED-'||gen_random_uuid();original text;current_export text;old_export text;project text;exp jsonb;r jsonb;p jsonb;job_before jsonb;key text;obj uuid;item uuid;claim uuid:=gen_random_uuid();scenario text;expected text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic unused','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A',current_date,100,100,'verified','standalone',false,now());
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,created_at,updated_at)
 select id,actor,gen_random_uuid(),'KAT',scope,'Synthetic unused',array['A'],'invoices','combined','billing',md5(id::text),'[{"id":"A","open":100}]',100,'failed','2026-10-01','2026-10-01' from unnest(array[jid,other])id;
 original:='jobs/'||jid||'/originals/'||fid||'.pdf';current_export:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';old_export:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';project:='jobs/'||jid||'/projects/'||gen_random_uuid()||'.json';
 insert into public.ar_document_files(id,job_id,ordinal,kind,invoice_id,state,storage_key,byte_count,sha256,created_at,updated_at) values(fid,jid,1,'invoice','A','ready',original,100,repeat('d',64),'2026-10-01','2026-10-01');
 insert into ar_private.document_uploads(storage_key,job_id,byte_count,sha256,mime,created_at) values(current_export,jid,100,repeat('d',64),'application/pdf','2026-10-01'),(old_export,jid,100,repeat('d',64),'application/pdf','2026-10-01'),(project,jid,100,repeat('d',64),'application/json','2026-10-01');
 exp:=jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',current_export,'byte_count',100,'sha256',repeat('d',64)));
 insert into ar_private.document_revisions(job_id,revision,project_key,exports,acknowledged,created_at) values(jid,1,project,jsonb_build_array(jsonb_build_object('name','Old synthetic.pdf','storage_key',old_export,'byte_count',100,'sha256',repeat('d',64))),true,'2026-10-01');
 update public.ar_document_jobs set project_key=project,exports=exp,revision=1 where id=jid;
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports,created_at,updated_at)
 values(did,actor,jid,1,'KAT',scope,'Synthetic unused',array['A'],'billing','{"to":[],"cc":[],"bcc":[]}','Unused subject','Unused body',exp,'2026-10-01','2026-10-01');
 insert into storage.objects(bucket_id,name,metadata) select 'ar-working-files',k,'{"size":100}'::jsonb from unnest(array[original,current_export,old_export,project])k;
 select to_jsonb(j) into job_before from public.ar_document_jobs j where id=jid;
 p:=public.ar_unused_preparation_preview(actor,jid,'2026-10-24T17:00:00Z');
 if p->>'jobId' is distinct from jid::text or jsonb_array_length(p->'objects')<>4 then raise exception 'Exact legacy preview omitted original/current/superseded/project';end if;
 if ar_private.retention_transient_eligibility(actor,'supabase',project) is not null then raise exception 'Ordinary legacy bypassed month policy';end if;
 -- Every refused action rolls its synthetic change back before the next case.
 foreach scenario in array array['actor','recent_job','recent_draft','revision','fingerprint','backup','objects','snapshot','object_bytes','object_version','generation','upload','budget','hold','review','dispute','gmail_attempt','uncertain_mail','sent_mail','shared','missing_receipt','external_billing','drive'] loop
  expected:=case scenario when 'actor' then 'document_forbidden' when 'recent_job' then 'document_preparation_active' when 'recent_draft' then 'document_preparation_active'
   when 'revision' then 'document_retirement_conflict' when 'fingerprint' then 'document_retirement_conflict' when 'backup' then 'document_backup_required' when 'objects' then 'document_retirement_conflict' when 'snapshot' then 'document_retirement_conflict'
   when 'object_bytes' then 'retention_identity_mismatch' when 'object_version' then 'document_retirement_conflict' when 'generation' then 'document_generation_pending' when 'upload' then 'document_upload_pending' when 'budget' then 'retention_busy'
   when 'hold' then 'retention_held' when 'review' then 'retention_held' when 'dispute' then 'retention_held' when 'gmail_attempt' then 'document_mail_pending' when 'uncertain_mail' then 'document_mail_pending' when 'sent_mail' then 'document_mail_pending'
   when 'shared' then 'retention_shared_reference' when 'missing_receipt' then 'retention_unknown_source' when 'external_billing' then 'document_business_history' when 'drive' then 'retention_shared_reference' end;
  begin
   case scenario
    when 'actor' then perform public.ar_unused_preparation_preview(gen_random_uuid(),jid,'2026-10-24T17:00:00Z');
    when 'recent_job' then update public.ar_document_jobs set updated_at=now() where id=jid;
    when 'recent_draft' then update public.ar_email_drafts set updated_at=now() where id=did;
    when 'revision' then update public.ar_document_jobs set revision=2 where id=jid;
    when 'fingerprint' then update public.ar_document_jobs set fingerprint=md5('different') where id=jid;
    when 'backup' then perform pg_temp.retire_unused(actor,jid,p,null,'not-a-backup');
    when 'objects' then perform pg_temp.retire_unused(actor,jid,p,'[]');
    when 'snapshot' then update public.ar_email_drafts set body='Concurrent saved text' where id=did;
    when 'object_bytes' then update storage.objects set metadata='{"size":101}' where name=original;
    when 'object_version' then update storage.objects set updated_at=updated_at+interval '1 second' where name=original;
    when 'generation' then update public.ar_document_jobs set state='uncertain' where id=jid;
    when 'upload' then insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256) values('jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf',jid,100,repeat('e',64));
    when 'budget' then insert into ar_private.operations_budget_reservations(id,owner,resource,reserved,state) values(gen_random_uuid(),actor,'synthetic_unused','{"storedBytes":100,"egressBytes":100,"databaseBytes":100}','reserved');
    when 'hold' then insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,held,hold_reason) values('KAT',scope,'A',true,'Synthetic hold');
    when 'review' then insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,needs_review,review_reason) values('KAT',scope,'A',true,'Synthetic review');
    when 'dispute' then insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,dispute) values('KAT',scope,'A','Synthetic dispute');
    when 'gmail_attempt' then insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id,state) values(did,0,'<synthetic-unused@example.test>','created');
    when 'uncertain_mail' then insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(mid,actor,did,0,'draft','<synthetic-unused@example.test>',jsonb_build_object('draft',to_jsonb((select d from public.ar_email_drafts d where id=did)),'expected','{"mailbox":"phuket","sender":"ar@katathani.com"}'::jsonb),'awaiting_evidence');
    when 'sent_mail' then insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state,gmail_id,sent_at) values(mid,actor,did,0,'send','<synthetic-unused@example.test>',jsonb_build_object('draft',to_jsonb((select d from public.ar_email_drafts d where id=did)),'expected','{"mailbox":"phuket","sender":"ar@katathani.com"}'::jsonb),'sent','synthetic-sent',now());
    when 'shared' then update public.ar_document_jobs set exports=exp where id=other;
    when 'missing_receipt' then delete from public.ar_document_files where id=fid;
    when 'external_billing' then insert into ar_private.external_billing_records(id,owner,hotel,account_id,revision,details) values(gen_random_uuid(),actor,'KAT',scope,1,'{"lines":[{"invoiceId":"A"}]}');
    when 'drive' then insert into ar_private.drive_archives(id,owner,kind,document_job_id,document_revision,target_revision,folder_id) values(gen_random_uuid(),actor,'job',jid,1,0,'synthetic_folder_unused_1234');
   end case;
   perform pg_temp.retire_unused(actor,jid,p);
   raise exception 'Unsafe retirement accepted: %',scenario;
  exception when others then if sqlerrm<>expected then raise exception 'Negative % expected %, got %',scenario,expected,sqlerrm;end if;
  end;
 end loop;
 r:=pg_temp.retire_unused(actor,jid,p);
 if r->>'outcome'<>'retired' or r->>'objectCount'<>'4' then raise exception 'Legacy retirement failed';end if;
 if (select to_jsonb(j) from public.ar_document_jobs j where id=jid) is distinct from job_before then raise exception 'Retirement rewrote legacy business/package row';end if;
 if public.ar_document_get(jid)->>'lifecycle'<>'legacy' or public.ar_document_get(jid)->>'closed_reason'<>'discarded' then raise exception 'Retired projection not closed';end if;
 if public.ar_email_open(actor,jid,1)->>'error'<>'document_closed' then raise exception 'Retired preparation resumed email';end if;
 if public.ar_document_abandon(actor,jid)->>'outcome'<>'discarded' or public.ar_document_discard(actor,jid)->>'closed_reason'<>'discarded' then raise exception 'Existing Worker command cannot finish backed legacy cleanup';end if;
 if exists(select 1 from jsonb_array_elements(public.ar_operations_queue(actor,'document',0)->'rows') x where x->>'job_id'=jid::text) then raise exception 'Retired job remained pending Operations';end if;
 if pg_temp.retire_unused(actor,jid,p)->>'retiredAt' is distinct from r->>'retiredAt' then raise exception 'Retirement replay duplicated receipt';end if;
 begin perform pg_temp.retire_unused(actor,jid,p,null,repeat('f',64));raise exception 'Divergent backup replay accepted';exception when others then if sqlerrm<>'document_retirement_conflict' then raise;end if;end;
 begin update ar_private.unused_preparation_dispositions set revision=2 where job_id=jid;raise exception 'Receipt changed';exception when others then if sqlerrm<>'document_retirement_immutable' then raise;end if;end;
 begin update public.ar_document_jobs set lifecycle='transient' where id=jid;raise exception 'Legacy lifecycle changed';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 begin update public.ar_document_jobs set state='ready',acknowledged=true where id=jid;raise exception 'Retired state changed';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 begin update public.ar_document_jobs set exports=exp where id=other;raise exception 'Shared disposed object acquired';exception when others then if sqlerrm<>'retention_shared_reference' then raise;end if;end;
 begin insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values(did,0,'<synthetic-retired@example.test>');raise exception 'Retired provider attempt admitted';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 -- Exact retirement never bypasses the source-zero policy for ordinary objects.
 if ar_private.retention_eligibility(actor,jsonb_build_array(jsonb_build_object('hotel','KAT','accountId',scope,'invoiceId','A')),7200)->>'error'<>'retention_source_open' then raise exception 'General source-zero rule relaxed';end if;
 r:=public.ar_document_cleanup_job_candidates(actor,jid,10);
 if jsonb_array_length(r)<>4 then raise exception 'Existing cleanup omitted legacy/project objects';end if;
 if not exists(select 1 from public.ar_email_drafts where id=did and subject='' and body='' and recipients='{"to":[],"cc":[],"bcc":[]}') then raise exception 'Deferred unused message cleanup missing';end if;
 if not exists(select 1 from ar_private.document_revisions where job_id=jid) or not exists(select 1 from public.ar_document_files where id=fid) or not exists(select 1 from ar_private.document_uploads where storage_key=project) then raise exception 'Ownership/revision receipts deleted';end if;
 select id into obj from storage.objects where name=project;
 r:=public.ar_retention_enroll(actor,'supabase',obj::text,7200);item:=(r->>'id')::uuid;
 if r->>'state'<>'waiting' or (r->>'dueAt')::timestamptz>clock_timestamp() then raise exception 'Explicit unused project not promptly eligible: %',r;end if;
 begin update storage.objects set updated_at=updated_at+interval '1 second' where id=obj;
  if ar_private.retention_transient_eligibility(actor,'supabase',project)->>'error'<>'retention_identity_mismatch' then raise exception 'Changed storage identity accepted';end if;
  raise exception 'identity_negative_rollback';exception when others then if sqlerrm<>'identity_negative_rollback' then raise;end if;end;
 r:=public.ar_retention_claim(actor,item,claim,7200,2,60);if r->>'mode'<>'delete' then raise exception 'Managed retirement claim failed: %',r;end if;
 r:=public.ar_retention_arm(actor,item,claim,7200);if r->>'proceed'<>'true' then raise exception 'Managed retirement arm failed: %',r;end if;
 -- Real deletion belongs to Worker Storage API. Local absence stub only.
 if current_setting('ar.tests.hosted',true) is distinct from 'true' then
  delete from storage.objects where id=obj;
  r:=public.ar_retention_observe(actor,item,claim,'absent',7200);if r->>'state'<>'deleted' then raise exception 'Managed retirement readback missing';end if;
 end if;
 if (select open from public.ar_invoices where hotel='KAT' and account_id=scope and id='A')<>100 then raise exception 'Working-copy cleanup changed ledger';end if;
 if has_function_privilege('authenticated','public.ar_unused_preparation_retire(uuid,uuid,integer,text,text,timestamptz,text,text,text,jsonb)','execute')
  or has_function_privilege('anon','public.ar_unused_preparation_preview(uuid,uuid,timestamptz)','execute')
  or has_table_privilege('service_role','ar_private.unused_preparation_dispositions','update') then raise exception 'Retirement privileges widened';end if;
end$$;
-- Open transient and previously discarded no-byte preparations use the same
-- explicit backed receipt. No retrospective marker or automatic text sweep.
do $$
declare actor uuid;jid uuid;did uuid;prior jsonb;p jsonb;r jsonb;closed boolean;pending boolean;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach pending in array array[false,true] loop
 foreach closed in array array[false,true] loop
  jid:=gen_random_uuid();did:=gen_random_uuid();
  perform set_config('ar.document_lifecycle','transient',true);
  insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,created_at,updated_at)
  values(jid,actor,gen_random_uuid(),'KAT','SYNTHETIC-UNUSED-EMPTY','Synthetic unused empty',array['A'],'invoices','combined','billing',md5(jid::text),'[{"id":"A"}]',100,'failed','2026-10-01','2026-10-01');
  perform set_config('ar.document_lifecycle','',true);
  insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports,created_at,updated_at)
  values(did,actor,jid,0,'KAT','SYNTHETIC-UNUSED-EMPTY','Synthetic unused empty',array['A'],'billing','{"to":[],"cc":[],"bcc":[]}','Unused empty subject','Unused empty text','[]','2026-10-01','2026-10-01');
  if closed then
   update public.ar_document_jobs set closed_at='2026-10-02',closed_reason='discarded' where id=jid;
   if not pending then
    update public.ar_document_jobs set discard_text_pending=false where id=jid;
    perform public.ar_document_cleanup_candidates(actor,10);
    if not exists(select 1 from public.ar_email_drafts where id=did and body='Unused empty text') then raise exception 'Old closed text backfilled without approval';end if;
   end if;
  end if;
  if pending and not closed then update public.ar_document_jobs set discard_requested_at='2026-10-02' where id=jid;end if;
  select to_jsonb(j) into prior from public.ar_document_jobs j where id=jid;
  p:=public.ar_unused_preparation_preview(actor,jid,'2026-10-24T17:00:00Z');
  if p->'objects'<>'[]'::jsonb then raise exception 'Empty preparation preview has invented objects';end if;
  r:=pg_temp.retire_unused(actor,jid,p);
  if pending and not closed and jsonb_array_length(public.ar_document_finalize_abandoned(actor,25))<>0 then raise exception 'Retired abandon request still consumes retry queue';end if;
  perform public.ar_document_cleanup_job_candidates(actor,jid,10);
  perform public.ar_document_cleanup_candidates(actor,10);
  if not exists(select 1 from public.ar_email_drafts where id=did and body='' and subject='') then raise exception 'Exact backed transient text clear omitted';end if;
  if (select to_jsonb(j) from public.ar_document_jobs j where id=jid) is distinct from prior then raise exception 'Retirement rewrote transient lifecycle/closure';end if;
 end loop;
 end loop;
end$$;
rollback;
