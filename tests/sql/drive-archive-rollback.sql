-- Only synthetic jobs/receipts. Temporary target changes are transaction-local and rolled back.
-- Requires the existing verified allowed owner. No provider API or storage write is made.
begin;
do $$
declare actor uuid;jid uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();claim uuid:=gen_random_uuid();other_claim uuid:=gen_random_uuid();testcmd uuid:=gen_random_uuid();
 target_revision integer;connection_revision integer;key text;project text;exports jsonb;a jsonb;r jsonb;f jsonb;sent_before bigint;archive_id uuid;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'verified allowed owner required';end if;
 select count(*) into sent_before from public.ar_sent_events;
 if public.ar_drive_connection_put(actor,'ar@katathani.com','{"iv":"synthetic","data":"old-grant"}','https://www.googleapis.com/auth/drive.file') is distinct from true then raise exception 'synthetic grant write failed';end if;
 r:=public.ar_drive_connection_get(actor);connection_revision:=(r->>'revision')::integer;if connection_revision is null then raise exception 'grant revision missing';end if;
 if public.ar_drive_connection_put(actor,'ar@katathani.com','{"iv":"synthetic","data":"new-grant"}','https://www.googleapis.com/auth/drive.file') is distinct from true then raise exception 'synthetic reconnect failed';end if;
 if public.ar_drive_connection_refresh(actor,connection_revision,'{"iv":"synthetic","data":"stale-refresh"}') is distinct from false then raise exception 'stale refresh replaced reconnect';end if;
 r:=public.ar_drive_connection_get(actor);if r->'payload'->>'data' is distinct from 'new-grant' or (r->>'revision')::integer is distinct from connection_revision+1 then raise exception 'reconnect grant changed';end if;
 if public.ar_drive_connection_refresh(actor,connection_revision+1,'{"iv":"synthetic","data":"current-refresh"}') is distinct from true then raise exception 'current grant refresh failed';end if;
 if public.ar_drive_connection_refresh(actor,connection_revision+1,'{"iv":"synthetic","data":"competing-refresh"}') is distinct from false then raise exception 'concurrent stale refresh won';end if;
 if exists(select 1 from ar_private.drive_targets where owner=actor) then
  update ar_private.drive_targets set folder_id='SyntheticFolder00001',revision=revision+1 where owner=actor returning revision into target_revision;
 else insert into ar_private.drive_targets(owner,folder_id) values(actor,'SyntheticFolder00001') returning revision into target_revision;end if;
 r:=public.ar_drive_target_verify(actor,'SyntheticWrongFolder',target_revision,'Synthetic',null,'restricted');if r->>'error' is distinct from 'drive_target_changed' then raise exception 'wrong folder accepted';end if;
 r:=public.ar_drive_target_get(gen_random_uuid());if r->>'error' is distinct from 'drive_forbidden' then raise exception 'wrong actor accepted';end if;
 r:=public.ar_drive_target_verify(actor,'SyntheticFolder00001',target_revision,'Synthetic folder',null,'restricted');if r->>'visibility' is distinct from 'restricted' or (r->>'revision')::integer is distinct from target_revision then raise exception 'synthetic target verification failed';end if;
 key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';project:='jobs/'||jid||'/projects/'||gen_random_uuid()||'.json';
 exports:=jsonb_build_array(jsonb_build_object('name','Synthetic reviewed export.pdf','storage_key',key,'byte_count',600,'sha256',repeat('a',64)));
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,project_key,exports,acknowledged)
 values(jid,actor,gen_random_uuid(),'KAT','SYNTHETIC-DRIVE-ONLY','Synthetic Drive account',array['SYNTHETIC-INVOICE'],'invoices','separate','billing',jid::text,'[{"id":"SYNTHETIC-INVOICE"}]',1,'ready',1,project,exports,true);
 insert into ar_private.document_uploads(storage_key,job_id,byte_count,sha256,mime) values(key,jid,600,repeat('a',64),'application/pdf');
 insert into ar_private.document_revisions(job_id,revision,project_key,exports,acknowledged) values(jid,1,project,exports,true);
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,target_revision+1);if r->>'error' is distinct from 'drive_target_changed' then raise exception 'wrong reviewed destination accepted';end if;
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,null);if r->>'error' is distinct from 'drive_target_changed' then raise exception 'missing reviewed destination accepted';end if;
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,2,target_revision);if r->>'error' is distinct from 'drive_revision_conflict' then raise exception 'wrong revision accepted';end if;
 update public.ar_document_jobs set acknowledged=false where id=jid;
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,target_revision);if r->>'error' is distinct from 'drive_unreviewed' then raise exception 'unreviewed accepted';end if;
 update public.ar_document_jobs set acknowledged=true where id=jid;
 r:=public.ar_drive_archive_open(actor,cmd,'job',gen_random_uuid(),1,target_revision);if r->>'error' is distinct from 'drive_missing' then raise exception 'wrong job accepted';end if;
 r:=public.ar_drive_target_verify(actor,'SyntheticFolder00001',target_revision,'Synthetic public folder',null,'public');if r->>'visibility' is distinct from 'public' then raise exception 'synthetic public target failed';end if;
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,target_revision);if r->>'error' is distinct from 'drive_target_not_private' then raise exception 'public target accepted for business';end if;
 r:=public.ar_drive_archive_open(actor,testcmd,'test',null,null,target_revision+1,600,repeat('b',64));if r->>'error' is distinct from 'drive_target_changed' then raise exception 'synthetic test ignored reviewed destination';end if;
 r:=public.ar_drive_archive_open(actor,testcmd,'test',null,null,target_revision,600,repeat('b',64));if (r?'error') is distinct from false or r->>'id' is distinct from testcmd::text or jsonb_array_length(r->'files') is distinct from 1 then raise exception 'synthetic public test denied';end if;
 r:=public.ar_drive_target_verify(actor,'SyntheticFolder00001',target_revision,'Synthetic folder',null,'restricted');if r->>'visibility' is distinct from 'restricted' then raise exception 'restricted target failed';end if;
 a:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,target_revision);if (a?'error') is distinct from false or a->>'id' is distinct from cmd::text or jsonb_array_length(a->'files') is distinct from 1 then raise exception 'complete export snapshot failed';end if;archive_id:=(a->>'id')::uuid;
 r:=public.ar_drive_archive_open(actor,cmd,'job',jid,1,target_revision);if r->>'id' is distinct from cmd::text then raise exception 'same command duplicated';end if;
 r:=public.ar_drive_archive_open(actor,gen_random_uuid(),'job',jid,1,target_revision);if r->>'id' is distinct from cmd::text then raise exception 'same revision duplicated';end if;
 r:=public.ar_drive_archive_open(actor,cmd,'test',null,null,target_revision,600,repeat('b',64));if r->>'error' is distinct from 'drive_command_conflict' then raise exception 'command changed';end if;
 r:=public.ar_drive_file_claim(actor,archive_id,0,claim);if r->>'claimed' is distinct from 'true' then raise exception 'claim failed';end if;
 r:=public.ar_drive_file_claim(actor,archive_id,0,other_claim);if r->>'claimed' is distinct from 'false' then raise exception 'concurrent claim won';end if;
 if public.ar_drive_file_update(actor,archive_id,0,other_claim,'id','{"id":"SyntheticDriveFile0001"}') is distinct from false then raise exception 'wrong claim wrote receipt';end if;
 if public.ar_drive_file_update(actor,archive_id,0,claim,'id','{"id":"SyntheticDriveFile0001"}') is distinct from true then raise exception 'ID persistence failed';end if;
 if public.ar_drive_file_update(actor,archive_id,0,claim,'id','{"id":"SyntheticDriveFile0002"}') is distinct from false then raise exception 'pre-generated ID overwritten';end if;
 begin update ar_private.drive_archive_files f1 set sha256=repeat('c',64) where f1.archive_id=cmd and f1.ordinal=0;raise exception 'immutable source changed';exception when others then if sqlerrm<>'drive_receipt_immutable' then raise;end if;end;
 if public.ar_drive_file_update(actor,archive_id,0,claim,'error','{"error":"drive_upload_pending"}') is distinct from true then raise exception 'uncertain receipt lost';end if;
 r:=public.ar_drive_file_claim(actor,archive_id,0,other_claim);f:=r->'file';if r->>'claimed' is distinct from 'true' or f->>'drive_file_id' is distinct from 'SyntheticDriveFile0001' or f->>'claim_token' is distinct from other_claim::text then raise exception 'retry changed ID';end if;
 if public.ar_drive_file_update(actor,archive_id,0,other_claim,'trashed','{}') is distinct from false then raise exception 'business cleanup allowed';end if;
 if public.ar_drive_file_update(actor,archive_id,0,other_claim,'verified','{"url":"https://drive.google.com/file/d/SyntheticDriveFile0001/view"}') is distinct from true then raise exception 'verified receipt failed';end if;
 r:=public.ar_drive_file_claim(actor,archive_id,0,claim);if r->>'claimed' is distinct from 'false' then raise exception 'verified file reclaimed';end if;
 update ar_private.drive_targets set revision=revision+1 where owner=actor;
 r:=public.ar_drive_file_claim(actor,archive_id,0,claim);if r->>'error' is distinct from 'drive_target_changed' then raise exception 'changed target accepted';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ar_drive_%' and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))) then raise exception 'public RPC privilege leak';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ar_private' and c.relname like 'drive_%' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'select') or has_table_privilege('service_role',c.oid,'select'))) then raise exception 'private table privilege leak';end if;
 if sent_before is distinct from (select count(*) from public.ar_sent_events) then raise exception 'unexpected customer history event';end if;
end $$;
rollback;
