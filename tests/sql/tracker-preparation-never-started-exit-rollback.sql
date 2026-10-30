begin;
create function pg_temp.unstarted_seed(p_hotel text default 'TLFO',p_count integer default 2,p_content text default 'invoices') returns jsonb language plpgsql as $$
declare actor uuid:=ar_private.access_owner();sid uuid:=gen_random_uuid();scope text:='SYNTHETIC-UNSTARTED-'||gen_random_uuid();cmd uuid:=gen_random_uuid();job jsonb;ids text[]:=case when p_count=1 then array['A'] else array['A','B'] end;
begin
 insert into auth.sessions(id,user_id,created_at) values(sid,actor,clock_timestamp());
 insert into ar_private.statement_templates(hotel,version,active,assets) select p_hotel,'synthetic-unstarted',true,'{"synthetic":true}' where not exists(select 1 from ar_private.statement_templates where hotel=p_hotel and active);
 insert into ar_private.invoice_templates(hotel,version,active,assets) select p_hotel,'synthetic-unstarted',true,'{"synthetic":true}' where not exists(select 1 from ar_private.invoice_templates where hotel=p_hotel and active);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(p_hotel,scope,'Synthetic unstarted','SYNTHETIC',100*cardinality(ids),0,cardinality(ids),'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select p_hotel,scope,x,x,'201',current_date,100,100,'verified','standalone',false,now() from unnest(ids)x;
 job:=public.ar_document_create_v5(actor,cmd,p_hotel,scope,ids,p_content,'separate','billing',case when p_content='invoices' then 'native' else 'workspace' end);
 if job->>'id' is null then raise exception 'synthetic unstarted job not created: %',job;end if;
 return jsonb_build_object('actor',actor,'session',sid,'scope',scope,'job',job->>'id','command',cmd,'hotel',p_hotel,'count',cardinality(ids),'fileCount',jsonb_array_length(job->'files'));
end$$;

create function pg_temp.unstarted_exit_first(p_hotel text,p_count integer,p_content text default 'invoices') returns void language plpgsql as $$
declare s jsonb:=pg_temp.unstarted_seed(p_hotel,p_count,p_content);actor uuid:=(s->>'actor')::uuid;jid uuid:=(s->>'job')::uuid;marker uuid:=gen_random_uuid();response jsonb;replayed jsonb;current_job jsonb;f record;business_before text;sent_before bigint;original_capture jsonb;proof record;
begin
 select count(*) into sent_before from public.ar_sent_events;
 select md5(coalesce(jsonb_agg(to_jsonb(w) order by invoice_id),'[]')::text) into business_before from public.ar_invoice_workflow w where hotel=p_hotel and account_id=s->>'scope';
 response:=public.ar_document_exit(actor,actor,jid,marker,(s->>'session')::uuid);
 current_job:=public.ar_document_get(jid);
 if current_job->>'closed_reason' is distinct from 'discarded' or current_job->>'closed_at' is null or current_job->>'state'='queued' or current_job->>'bytes_released' is distinct from 'true' then raise exception 'unstarted preparation was not discarded after accepted Exit';end if;
 select * into proof from ar_private.preparation_unstarted_cancellations where job_id=jid;
 if proof.owner is distinct from actor or cardinality(proof.file_ids) is distinct from (s->>'fileCount')::integer then raise exception 'cancellation audit scope missing';end if;
 select captured into original_capture from ar_private.preparation_retirements where id=proof.retirement_id;
 if exists(select 1 from jsonb_array_elements(original_capture->'files')x where x->>'state'<>'pending') or proof.captured_files_digest is distinct from md5((original_capture->'files')::text) then raise exception 'original pending evidence changed';end if;
 for f in select * from public.ar_document_files where job_id=jid loop
  replayed:=public.ar_document_claim_file(jid,f.id);
  if replayed->>'claimed' is distinct from 'false' or replayed->>'cancelled_before_claim' is distinct from 'true' or replayed->'file'->>'state'<>'unavailable' then raise exception 'late worker claimed an exited unstarted file';end if;
  if ar_private.preparation_write_allowed(jid,'jobs/'||jid||'/originals/'||f.id||'.pdf') then raise exception 'cancelled key still writable';end if;
  begin perform public.ar_document_finish_file(jid,f.id,'jobs/'||jid||'/originals/'||f.id||'.pdf',100,repeat('a',64));raise exception 'late finish revived cancelled bytes';exception when others then if sqlerrm not in('document_bytes_released','document_preparation_retired','document_file_not_claimed') then raise;end if;end;
 end loop;
 if exists(select 1 from public.ar_document_files where job_id=jid and (state<>'unavailable' or error_code<>'cancelled_before_pdf_claim' or storage_key is not null)) then raise exception 'cancelled file status wrong';end if;
 if exists(select 1 from jsonb_array_elements(public.ar_operations_queue(actor,'document',0)->'rows')x where x->>'job_id'=jid::text) then raise exception 'discarded job still active in queue';end if;
 if exists(select 1 from ar_private.retention_items where storage_key in(select jsonb_array_elements_text(original_capture->'keys'))) then raise exception 'never-created key forged deletion receipt';end if;
 replayed:=public.ar_document_exit(actor,actor,jid,marker,(s->>'session')::uuid);if replayed is distinct from response then raise exception 'original Exit receipt overwritten';end if;
 perform public.ar_preparation_retirement_maintain(actor,25);
 if (select count(*) from ar_private.preparation_unstarted_cancellations where job_id=jid)<>1 then raise exception 'replayed cancellation audit duplicated';end if;
 begin update ar_private.preparation_unstarted_cancellations set reason=reason where job_id=jid;raise exception 'audit changed';exception when others then if sqlerrm<>'pdf_release_immutable' then raise;end if;end;
 begin delete from ar_private.preparation_unstarted_cancellations where job_id=jid;raise exception 'audit deleted';exception when others then if sqlerrm<>'pdf_release_immutable' then raise;end if;end;
 if (select md5(coalesce(jsonb_agg(to_jsonb(w) order by invoice_id),'[]')::text) from public.ar_invoice_workflow w where hotel=p_hotel and account_id=s->>'scope') is distinct from business_before or (select count(*) from public.ar_sent_events)<>sent_before then raise exception 'cancellation changed business or Sent history';end if;
end$$;

do $$declare hotel_id text;file_count integer;s jsonb;actor uuid;jid uuid;fid uuid;other_file uuid;r jsonb;before_rows jsonb;case_name text;old_capture jsonb;rid uuid;marker uuid;key text;draft_id uuid;begin
 foreach hotel_id in array array['KAT','TLFO','TSAN'] loop
  foreach file_count in array array[1,2] loop
   begin perform pg_temp.unstarted_exit_first(hotel_id,file_count);raise sqlstate 'ZN001' using message='rollback positive scenario';exception when sqlstate 'ZN001' then null;end;
  end loop;
 end loop;
 foreach case_name in array array['statement','both'] loop
  begin perform pg_temp.unstarted_exit_first('TSAN',2,case_name);raise sqlstate 'ZN001' using message='rollback document-kind scenario';exception when sqlstate 'ZN001' then null;end;
 end loop;
 -- Age alone never abandons an employee's slow waiting work.
 s:=pg_temp.unstarted_seed();actor:=(s->>'actor')::uuid;jid:=(s->>'job')::uuid;
 update public.ar_document_jobs set created_at=now()-interval '3 days' where id=jid;
 perform public.ar_preparation_retirement_maintain(actor,25);
 if public.ar_document_get(jid)->>'closed_at' is not null then raise exception 'age-only cancellation';end if;
 select id into fid from public.ar_document_files where job_id=jid order by ordinal limit 1;
 if public.ar_document_claim_file(jid,fid)->>'claimed'<>'true' then raise exception 'unexited slow job lost admission';end if;
 -- A claim/known file/unknown operation defeats never-started classification.
 foreach case_name in array array['generating','uncertain','partial-ready','upload','stored-object','touched','draft'] loop
  begin
   s:=pg_temp.unstarted_seed();actor:=(s->>'actor')::uuid;jid:=(s->>'job')::uuid;
   select id into fid from public.ar_document_files where job_id=jid order by ordinal limit 1;
   if case_name in('generating','uncertain','partial-ready') then perform public.ar_document_claim_file(jid,fid);end if;
   if case_name='uncertain' then perform public.ar_document_fail_file(jid,fid,'synthetic_unknown',true);end if;
   key:='jobs/'||jid||'/originals/'||fid||'.pdf';
   if case_name='partial-ready' then perform public.ar_document_finish_file(jid,fid,key,100,repeat('a',64));insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',key,'{"size":100}');end if;
   if case_name='upload' then insert into ar_private.document_transient_uploads(storage_key,job_id,byte_count,sha256,registered) values('jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf',jid,100,repeat('b',64),false);end if;
   if case_name='stored-object' then insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',key,'{"size":100}');end if;
   if case_name='touched' then update public.ar_document_files set updated_at=created_at+interval '1 second' where id=fid;end if;
   if case_name='draft' then
    insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
    values(gen_random_uuid(),actor,jid,0,s->>'hotel',s->>'scope','Synthetic',array['A','B'],'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic','Synthetic','[]');
   end if;

   select jsonb_agg(to_jsonb(f) order by id) into before_rows from public.ar_document_files f where job_id=jid;
   r:=public.ar_document_exit(actor,actor,jid,gen_random_uuid(),(s->>'session')::uuid);perform public.ar_preparation_retirement_maintain(actor,25);
   if exists(select 1 from ar_private.preparation_unstarted_cancellations where job_id=jid) or public.ar_document_get(jid)->>'closed_at' is not null then raise exception 'started/unknown work cancelled: %',case_name;end if;
   if (select jsonb_agg(to_jsonb(f) order by id) from public.ar_document_files f where job_id=jid) is distinct from before_rows then raise exception 'started/unknown file changed: %',case_name;end if;
   if case_name='generating' then
    select id into other_file from public.ar_document_files where job_id=jid and id<>fid limit 1;
    if public.ar_document_claim_file(jid,other_file)->>'claimed'<>'true' then raise exception 'already admitted peer no longer drains';end if;
   end if;
   raise sqlstate 'ZN002' using message='rollback guarded scenario';
  exception when sqlstate 'ZN002' then null;end;
 end loop;
 -- Historical accepted Exit whose file was claimed before maintenance is preserved.
 foreach case_name in array array['historical-unstarted','historical-claimed','claimed-then-missing','missing-outcome','wrong-owner'] loop
  begin
   s:=pg_temp.unstarted_seed();actor:=(s->>'actor')::uuid;jid:=(s->>'job')::uuid;marker:=gen_random_uuid();
   r:=public.ar_document_abandon(actor,jid);if case_name='missing-outcome' then r:=r-'outcome';end if;
   perform ar_private.preparation_bind_exit(actor,actor,(s->>'session')::uuid,marker,jsonb_build_object('kind','job','jobId',jid));
   rid:=ar_private.preparation_accept(actor,actor,jid,(s->>'session')::uuid,marker,null,r);
   select captured into old_capture from ar_private.preparation_retirements where id=rid;
   if case_name in('historical-claimed','claimed-then-missing') then
    for fid in select id from public.ar_document_files where job_id=jid order by ordinal loop
     if public.ar_document_claim_file(jid,fid)->>'claimed'<>'true' then raise exception 'historical setup claim failed';end if;
     if case_name='claimed-then-missing' then perform public.ar_document_fail_file(jid,fid,'synthetic_no_result',false);end if;
    end loop;
   end if;
   if case_name='wrong-owner' then
    if ar_private.cancel_unstarted_preparation((select id from auth.users where id<>actor order by id limit 1),rid) then raise exception 'wrong owner cancelled preparation';end if;
    if exists(select 1 from ar_private.preparation_unstarted_cancellations where job_id=jid) or public.ar_document_get(jid)->>'closed_at' is not null then raise exception 'wrong owner changed work';end if;
    raise sqlstate 'ZN003' using message='rollback wrong-owner scenario';
   end if;
   update auth.sessions set not_after=now()-interval '1 second' where id=(s->>'session')::uuid;
   perform public.ar_preparation_retirement_maintain(actor,25);
   if case_name='historical-unstarted' then
    if public.ar_document_get(jid)->>'closed_reason' is distinct from 'discarded' then raise exception 'historical accepted Exit not finalized';end if;
   elsif exists(select 1 from ar_private.preparation_unstarted_cancellations where job_id=jid) then raise exception 'historical claimed file relabeled never-started';end if;
   if case_name='claimed-then-missing' and (select blocker from ar_private.preparation_retirement_progress where retirement_id=rid) is distinct from 'pdf_release_object_missing' then raise exception 'missing generated-object safeguard weakened';end if;
   if (select captured from ar_private.preparation_retirements where id=rid) is distinct from old_capture then raise exception 'historical captured evidence overwritten';end if;
   raise sqlstate 'ZN003' using message='rollback historical scenario';
  exception when sqlstate 'ZN003' then null;end;
 end loop;
 if has_table_privilege('authenticated','ar_private.preparation_unstarted_cancellations','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role','ar_private.preparation_unstarted_cancellations','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege('service_role','ar_private.cancel_unstarted_preparation(uuid,uuid)','EXECUTE') then raise exception 'private cancellation authority exposed';end if;
end$$;
rollback;
