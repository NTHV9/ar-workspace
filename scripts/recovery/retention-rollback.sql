-- Local synthetic history simulation only. No provider deletion or server-clock change.
-- Historical fixture timestamps are inserted as test data; public RPCs cannot backdate.
begin;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001';scope text:='SYNTHETIC-RETENTION-'||gen_random_uuid();rid uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();oid uuid:=gen_random_uuid();old_fid uuid:=gen_random_uuid();old_oid uuid:=gen_random_uuid();iid uuid;old_iid uuid;claim uuid:=gen_random_uuid();other_claim uuid:=gen_random_uuid();ctx jsonb;r jsonb;before_clock timestamptz;key text;old_key text;old_time timestamptz:=clock_timestamp()-interval '3 months';j uuid:=gen_random_uuid();
begin
 if ar_private.retention_month('2026-01-31T16:30:00Z') is distinct from '2026-02-28T16:30:00Z'::timestamptz or ar_private.retention_month('2028-01-31T16:30:00Z') is distinct from '2028-02-29T16:30:00Z'::timestamptz then raise exception 'calendar month arithmetic';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic retention account','SYNTHETIC',10,0,2,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A',current_date-100,10,0,'cleared','standalone',false,now()),('KAT',scope,'B',current_date-100,10,10,'verified','standalone',false,now());
 update ar_private.invoice_verified_balances set zero_since=old_time where hotel='KAT' and account_id=scope and invoice_id='A';
 insert into public.ar_remittances(id,owner,hotel,account_id,account_name,account_type,received_date,reference) values(rid,actor,'KAT',scope,'Synthetic retention account','SYNTHETIC',current_date-100,'Synthetic retention notice');
 insert into public.ar_remittance_lines(record_id,invoice_id,position,snapshot) values(rid,'A',1,'{"invoiceNo":"SYNTHETIC-A"}');
 key:='remittances/'||rid||'/'||fid;old_key:='remittances/'||rid||'/'||old_fid;
 insert into ar_private.remittance_files(id,record_id,name,mime,byte_count,sha256,storage_key,state,inspection,created_at,ready_at) values(fid,rid,'Synthetic.pdf','application/pdf',100,repeat('a',64),key,'ready','{"version":1,"pages":1}',old_time,old_time),(old_fid,rid,'Synthetic-old.pdf','application/pdf',100,repeat('a',64),old_key,'ready','{"version":1,"pages":1}',old_time,old_time);
 insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at) values(oid,'ar-working-files',key,'{"size":100,"eTag":"synthetic"}',old_time,old_time),(old_oid,'ar-working-files',old_key,'{"size":100,"eTag":"synthetic"}',old_time,old_time);
 r:=public.ar_retention_enroll(actor,'supabase',oid::text,1800);if r?'error' then raise exception 'enrollment failed: %',r;end if;iid:=(r->>'id')::uuid;before_clock:=(r->>'eligibleSince')::timestamptz;
 if before_clock<now() or (r->>'dueAt')::timestamptz<=clock_timestamp() then raise exception 'enrollment backdated completion';end if;
 r:=public.ar_retention_claim(actor,iid,claim,1800,2,300);if r->>'mode' is distinct from 'wait' then raise exception 'new enrollment purged early';end if;
 update public.ar_invoices set synced_at=now()-interval '1 hour' where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_retention_get(actor,iid,1800);if r->>'reason' is distinct from 'retention_source_stale' or (r->>'eligibleSince')::timestamptz is distinct from before_clock then raise exception 'stale-only reset month';end if;
 update public.ar_invoices set synced_at=now() where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_retention_get(actor,iid,1800);if (r->>'eligibleSince')::timestamptz is distinct from before_clock then raise exception 'fresh zero did not resume clock';end if;
 update public.ar_invoices set verification_state='unknown' where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_retention_get(actor,iid,1800);if r->'eligibleSince' is distinct from 'null'::jsonb then raise exception 'unknown source retained clock';end if;
 update public.ar_invoices set verification_state='cleared',synced_at=now() where hotel='KAT' and account_id=scope and id='A';
 r:=public.ar_retention_get(actor,iid,1800);if r->>'state' is distinct from 'waiting' then raise exception 'fresh re-enrollment failed';end if;
 -- A shared reference to another invoice must not be ignored, even across job types.
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged)
 values(j,actor,gen_random_uuid(),'KAT',scope,'Synthetic shared work',array['B'],'invoices','separate','billing',j::text,'[{"id":"B","open":10}]',10,'ready',1,jsonb_build_array(jsonb_build_object('storage_key',key)),true);
 r:=public.ar_retention_get(actor,iid,1800);if r->>'reason' is distinct from 'retention_source_open' or r->'eligibleSince' is distinct from 'null'::jsonb then raise exception 'shared open link ignored';end if;
 -- Seed a separate historically enrolled synthetic object to exercise due dispatch.
 ctx:=ar_private.retention_context(actor,'supabase',old_oid::text);old_iid:=gen_random_uuid();
 insert into ar_private.retention_items(id,owner,store,object_id,target,storage_key,reference_fingerprint,links,minimum_eligible_at,eligible_since,due_at,enrolled_at)
 values(old_iid,actor,'supabase',old_oid::text,ctx->'target',old_key,ctx->>'referenceFingerprint',ctx->'links',old_time,old_time+interval '1 day',ar_private.retention_month(old_time+interval '1 day'),old_time);
 r:=public.ar_retention_claim(actor,old_iid,claim,1800,2,300);if r->>'mode' is distinct from 'delete' then raise exception 'due claim failed: %',r;end if;
 if to_regprocedure('public.ar_retention_inspect(uuid,uuid)') is not null then
  r:=public.ar_retention_inspect(actor,old_iid);if r->>'state'<>'present' or r->>'identityVerified'<>'true' then raise exception 'exact provider metadata inspection';end if;
  begin
   update public.ar_remittances set reference='Attempted protected edit' where id=rid;
   raise exception 'reference fence missing';
  exception when others then if sqlerrm<>'retention_busy' then raise;end if;end;
 end if;
 if ar_private.retention_write_allowed(actor,'KAT',scope,array['A'],array[old_key]) then raise exception 'claimed shared reference writable';end if;
 r:=public.ar_retention_claim(actor,old_iid,other_claim,1800,2,300);if r->>'mode' is distinct from 'busy' then raise exception 'concurrent claim bypass';end if;
 r:=public.ar_retention_arm(actor,old_iid,claim,1800);if r->>'proceed' is distinct from 'true' then raise exception 'due final recheck failed: %',r;end if;
 r:=public.ar_retention_arm(actor,old_iid,claim,1800);if r->>'proceed' is distinct from 'false' then raise exception 'duplicate delete dispatch armed';end if;
 if to_regprocedure('public.ar_retention_delete_ack(uuid,uuid,uuid)') is not null then
  r:=public.ar_retention_delete_ack(actor,old_iid,claim);if r->>'acknowledged'<>'true' then raise exception 'delete ack rejected';end if;
  begin
   update public.ar_invoices set open=10,verification_state='verified' where hotel='KAT' and account_id=scope and id='A';
   raise exception 'armed source publication fence missing';
  exception when others then if sqlerrm<>'retention_busy' then raise;end if;end;
 end if;
 r:=public.ar_retention_observe(actor,old_iid,claim,'absent',1800);if r->>'state' is distinct from 'uncertain' then raise exception 'false absence over existing metadata accepted';end if;
 r:=public.ar_retention_claim(actor,old_iid,claim,1800,2,300);if r->>'mode' is distinct from 'reconcile' then raise exception 'uncertain outcome allowed blind delete';end if;
 -- Simulate confirmed absence of only this local synthetic metadata row, no object API.
 delete from storage.objects where id=old_oid;
 r:=public.ar_retention_observe(actor,old_iid,claim,'absent',1800);if r->>'state' is distinct from 'deleted' then raise exception 'verified absence missing tombstone';end if;
 r:=public.ar_retention_claim(actor,old_iid,other_claim,1800,2,300);if r->>'mode' is distinct from 'complete' then raise exception 'tombstone replay not complete';end if;
 if to_regprocedure('public.ar_retention_file_state(uuid,text)') is not null then
  r:=public.ar_retention_file_state(actor,old_key);if r->>'expired'<>'true' then raise exception 'file tombstone read missing';end if;
  update public.ar_remittances set reference='Safe retained history update' where id=rid;
 end if;
 if not exists(select 1 from ar_private.remittance_files where id=old_fid) or not exists(select 1 from public.ar_remittances where id=rid) then raise exception 'business evidence metadata deleted';end if;
 if has_function_privilege('authenticated','public.ar_retention_arm(uuid,uuid,uuid,integer)','execute') or has_table_privilege('service_role','ar_private.retention_items','update') then raise exception 'retention direct write privilege';end if;
 r:=public.ar_retention_candidates(actor,0,100,true);if (r->>'total')::integer<2 then raise exception 'candidate/tombstone listing missing';end if;
end $$;
rollback;
select 'Local retention calendar, enrollment, freshness, shared refs, dispatch, uncertain proof, tombstone and permissions passed; rolled back' as result;
