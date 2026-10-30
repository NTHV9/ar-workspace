begin;
create function pg_temp.recreate_during_cleanup(p_hotel text,p_state text) returns void language plpgsql as $$
declare actor uuid:=ar_private.access_owner();scope text:='SYNTHETIC-RECREATE-'||gen_random_uuid();session_id uuid:=gen_random_uuid();old_job jsonb;fresh jsonb;r jsonb;jid uuid;fid uuid;oid uuid;item uuid;claim uuid:=gen_random_uuid();command uuid:=gen_random_uuid();key text;f record;pin ar_private.preparation_retirement_objects;fresh_key text;reviewed jsonb;draft jsonb;rid uuid;other_actor uuid;scenario text;sent_before bigint;legacy_job uuid;
begin
 select count(*) into sent_before from public.ar_sent_events;
 insert into auth.sessions(id,user_id,created_at) values(session_id,actor,clock_timestamp());
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(p_hotel,scope,'Synthetic recreate','SYNTHETIC',200,0,2,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select p_hotel,scope,x,x,'201',current_date,100,100,'verified','standalone',false,now() from unnest(array['A','B'])x;
 insert into ar_private.statement_templates(hotel,version,active,assets) select p_hotel,'synthetic-recreate-only',true,'{"synthetic":true}' where not exists(select 1 from ar_private.statement_templates where hotel=p_hotel and active);
 insert into ar_private.invoice_templates(hotel,version,active,assets) select p_hotel,'synthetic-recreate-only',true,'{"synthetic":true}' where not exists(select 1 from ar_private.invoice_templates where hotel=p_hotel and active);
 old_job:=public.ar_document_create_v5(actor,gen_random_uuid(),p_hotel,scope,array['A','B'],'both','separate','billing','workspace');
 jid:=(old_job->>'id')::uuid;if jid is null then raise exception 'old preparation not created: %',old_job;end if;
 for f in select * from public.ar_document_files where job_id=jid order by ordinal loop
  key:='jobs/'||jid||'/originals/'||f.id||'.pdf';perform public.ar_document_claim_file(jid,f.id);perform public.ar_document_finish_file(jid,f.id,key,100,repeat('a',64));
  insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',key,'{"size":100}') returning id into oid;
 end loop;
 r:=public.ar_document_exit(actor,actor,jid,gen_random_uuid(),session_id);
 if not ar_private.preparation_retired(jid) then raise exception 'old preparation was not exited';end if;
 r:=public.ar_retention_enroll(actor,'supabase',oid::text,7200);item:=(r->>'id')::uuid;
 r:=public.ar_retention_claim(actor,item,claim,7200,1,60);if r->>'mode'<>'delete' then raise exception 'cleanup not claimed: %',r;end if;
 r:=public.ar_retention_arm(actor,item,claim,7200);if r->>'proceed' is distinct from 'true' then raise exception 'cleanup not armed: %',r;end if;
 if p_state='uncertain' then perform public.ar_retention_observe(actor,item,claim,'unknown',7200);end if;
 -- The same invoices with fresh job/command/keys must work while the exited file is being deleted.
 begin
  fresh:=public.ar_document_create_v5(actor,command,p_hotel,scope,array['A','B'],'both','separate','billing','workspace');
 exception when others then raise exception 'fresh preparation blocked by exited-file cleanup: %',sqlerrm;end;
 if fresh->>'id' is null or fresh->>'id'=jid::text then raise exception 'old preparation reused';end if;
 if public.ar_document_create_v5(actor,command,p_hotel,scope,array['A','B'],'both','separate','billing','workspace')->>'id'<>fresh->>'id' then raise exception 'same new command duplicated';end if;
 if ar_private.retention_write_allowed(actor,p_hotel,scope,array['A','B'],array[key]) then raise exception 'exact old storage key lost cleanup fence';end if;
 -- Generation, reviewed exports and a new email preparation use their own bytes.
 for f in select * from public.ar_document_files where job_id=(fresh->>'id')::uuid order by ordinal loop
  fresh_key:='jobs/'||(fresh->>'id')||'/originals/'||f.id||'.pdf';
  perform public.ar_document_claim_file((fresh->>'id')::uuid,f.id);
  perform public.ar_document_finish_file((fresh->>'id')::uuid,f.id,fresh_key,100,repeat('b',64));
 end loop;
 fresh_key:='jobs/'||(fresh->>'id')||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_begin_upload(actor,(fresh->>'id')::uuid,fresh_key,100,repeat('c',64));
 insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',fresh_key,'{"size":100}');
 perform public.ar_document_register_upload((fresh->>'id')::uuid,fresh_key,100,repeat('c',64),'application/pdf');
 reviewed:=public.ar_document_review(actor,(fresh->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',fresh_key,'byte_count',100,'sha256',repeat('c',64))),true);
 if reviewed->>'revision'<>'1' then raise exception 'fresh review not persisted: %',reviewed;end if;
 draft:=public.ar_email_open(actor,(fresh->>'id')::uuid,1);if draft?'error' then raise exception 'fresh email preparation blocked: %',draft;end if;
 -- The other job's current/old/nested export references cannot be rebound to the retired bytes.
 foreach scenario in array array['job','draft','nested-revision'] loop
  begin
   if scenario='job' then update public.ar_document_jobs set exports=jsonb_build_array(jsonb_build_object('name','Old.pdf','storage_key',key,'byte_count',100,'sha256',repeat('a',64))) where id=(fresh->>'id')::uuid;
   elsif scenario='draft' then update public.ar_email_drafts set exports=jsonb_build_array(jsonb_build_object('name','Old.pdf','storage_key',key,'byte_count',100,'sha256',repeat('a',64))) where id=(draft->>'id')::uuid;
   else update ar_private.document_revisions set exports=jsonb_build_array(jsonb_build_object('nested',jsonb_build_object('storageKey',key))) where job_id=(fresh->>'id')::uuid;end if;
   raise exception 'retired key rebound through %',scenario;
  exception when others then if sqlerrm not in('document_bytes_released','document_preparation_retired','pdf_release_evidence_immutable') then raise;end if;end;
 end loop;
 -- Tables outside the PDF admission triggers must also honor the exact-key guard,
 -- including a remittance file inserted before any invoice lines exist.
 rid:=gen_random_uuid();
 insert into public.ar_remittances(id,owner,hotel,account_id,account_name,account_type,received_date,reference) values(rid,actor,p_hotel,scope,'Synthetic recreate','SYNTHETIC',current_date,'Synthetic only');
 begin
  insert into ar_private.remittance_files(id,record_id,name,mime,byte_count,sha256,storage_key) values(gen_random_uuid(),rid,'Old.pdf','application/pdf',100,repeat('a',64),key);
  raise exception 'retired key rebound through remittance without lines';
 exception when others then if sqlerrm<>'retention_busy' then raise;end if;end;
 -- Current transient work cannot be archived at all; preserve that independent guard.
 begin
  insert into ar_private.drive_archives(id,owner,kind,document_job_id,document_revision,target_revision,folder_id) values(gen_random_uuid(),actor,'job',(fresh->>'id')::uuid,1,1,'synthetic-only-folder');
  raise exception 'transient Drive archive unexpectedly admitted';
 exception when others then if sqlerrm<>'document_archive_retired' then raise;end if;end;
 legacy_job:=gen_random_uuid();
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,lifecycle,acknowledged,revision)
 values(legacy_job,actor,gen_random_uuid(),p_hotel,scope,'Synthetic legacy archive',array['A','B'],'invoices','combined','billing',md5(legacy_job::text),'[{"id":"A","open":100},{"id":"B","open":100}]',200,'ready','legacy',true,1);
 rid:=gen_random_uuid();
 insert into ar_private.drive_archives(id,owner,kind,document_job_id,document_revision,target_revision,folder_id) values(rid,actor,'job',legacy_job,1,1,'synthetic-only-folder');
 insert into ar_private.drive_archive_files(archive_id,ordinal,name,storage_key,byte_count,sha256) values(rid,0,'New.pdf','jobs/'||legacy_job||'/exports/new.pdf',100,repeat('c',64));
 begin
  insert into ar_private.drive_archive_files(archive_id,ordinal,name,storage_key,byte_count,sha256) values(rid,1,'Old.pdf',key,100,repeat('a',64));
  raise exception 'retired key rebound through Drive';
 exception when others then if sqlerrm<>'retention_busy' then raise;end if;end;
 -- A qualified old item never exempts another ordinary/malformed/foreign lock.
 select o.* into pin from ar_private.preparation_retirement_objects o join ar_private.preparation_retirements t on t.id=o.retirement_id where t.job_id=jid and o.object_id<>oid limit 1;
 if pin.object_id is null then raise exception 'second pinned test object missing';end if;
 select id into other_actor from auth.users where id<>actor order by id limit 1;if other_actor is null then raise exception 'synthetic other owner missing';end if;
 foreach scenario in array array['ordinary','drive','owner','object','key','target','fingerprint','pending','blocked'] loop
  begin
   if scenario in('pending','blocked') then update ar_private.preparation_retirement_progress set state=scenario,released_at=null where retirement_id=pin.retirement_id;
   else
    insert into ar_private.retention_items(owner,store,object_id,target,storage_key,reference_fingerprint,links,minimum_eligible_at,state,eligible_since,due_at,claim_id,claim_phase,lease_until)
    select case when scenario='owner' then other_actor else actor end,case when scenario='drive' then 'drive' else 'supabase' end,
     case when scenario in('ordinary','object') then gen_random_uuid()::text else pin.object_id::text end,
     case when scenario='target' then jsonb_set(pin.target,'{byteCount}','101') else pin.target end,
     case when scenario='key' then 'jobs/'||gen_random_uuid()||'/exports/other.pdf' else pin.storage_key end,
     case when scenario='fingerprint' then repeat('0',32) else pin.reference_fingerprint end,
     jsonb_build_array(jsonb_build_object('hotel',p_hotel,'accountId',scope,'invoiceId','A')),clock_timestamp(),'claimed',clock_timestamp(),clock_timestamp(),gen_random_uuid(),'armed',clock_timestamp()+interval '1 minute';
   end if;
   if ar_private.retention_write_allowed(case when scenario='owner' then other_actor else actor end,p_hotel,scope,array['A','B']) then raise exception 'cleanup proof guard escaped: %',scenario;end if;
   if scenario='ordinary' then
    begin perform public.ar_document_create_v5(actor,gen_random_uuid(),p_hotel,scope,array['A','B'],'both','separate','billing','workspace');raise exception 'ordinary overlapping lock did not block a new job';
    exception when others then if sqlerrm<>'retention_busy' then raise;end if;end;
   end if;
   raise sqlstate 'ZR001' using message='rollback synthetic negative case';
  exception when sqlstate 'ZR001' then null;end;
 end loop;
 if not ar_private.preparation_retired(jid) or (select state from ar_private.retention_items where id=item)<>p_state then raise exception 'new work altered old cleanup authority';end if;
 if (select count(*) from public.ar_sent_events)<>sent_before then raise exception 'recreate wrote Sent history';end if;
end$$;
do $$declare hotel_id text;cleanup_state text;begin
 foreach hotel_id in array array['KAT','WAKL'] loop
  foreach cleanup_state in array array['claimed','uncertain'] loop
   begin
    perform pg_temp.recreate_during_cleanup(hotel_id,cleanup_state);
    raise sqlstate 'ZR002' using message='rollback isolated synthetic scenario';
   exception when sqlstate 'ZR002' then null;end;
  end loop;
 end loop;
end$$;
rollback;
