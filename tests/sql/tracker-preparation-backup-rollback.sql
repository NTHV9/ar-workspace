-- Synthetic exact-object backup authorization, without customer bytes or deletes.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-BACKUP-'||gen_random_uuid();j jsonb;jid uuid;fid uuid;original text;project_one text;project_two text;export_one text;export_two text;unused text;oid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();uid uuid:=gen_random_uuid();r jsonb;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if has_function_privilege('anon','public.ar_document_backup_target(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.ar_document_backup_target(uuid,uuid,uuid)','EXECUTE') or not has_function_privilege('service_role','public.ar_document_backup_target(uuid,uuid,uuid)','EXECUTE') then raise exception 'backup function exposed';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic backup','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v3(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');jid:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=jid;
 original:='jobs/'||jid||'/originals/'||fid||'.pdf';perform public.ar_document_claim_file(jid,fid);perform public.ar_document_finish_file(jid,fid,original,100,repeat('a',64));
 insert into storage.objects(id,bucket_id,name,metadata) values(oid,'ar-working-files',original,'{"size":100,"mimetype":"application/pdf"}');
 r:=public.ar_document_backup_target(actor,jid,oid);if r->>'storage_key'<>original or r->>'sha256'<>repeat('a',64) then raise exception 'original receipt missing';end if;
 project_one:='jobs/'||jid||'/projects/'||gen_random_uuid()||'.json';export_one:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 project_two:='jobs/'||jid||'/projects/'||gen_random_uuid()||'.json';export_two:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_register_upload(jid,project_one,100,repeat('b',64),'application/json');perform public.ar_document_register_upload(jid,export_one,100,repeat('c',64),'application/pdf');
 perform public.ar_document_save_project(jid,0,project_one,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',export_one,'byte_count',100,'sha256',repeat('c',64))),true);
 perform public.ar_document_register_upload(jid,project_two,100,repeat('d',64),'application/json');perform public.ar_document_register_upload(jid,export_two,100,repeat('e',64),'application/pdf');
 perform public.ar_document_save_project(jid,1,project_two,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',export_two,'byte_count',100,'sha256',repeat('e',64))),true);
 insert into storage.objects(id,bucket_id,name,metadata) values(pid,'ar-working-files',project_one,'{"size":100,"mimetype":"application/json"}'),(eid,'ar-working-files',export_one,'{"size":100,"mimetype":"application/pdf"}');
 r:=public.ar_document_backup_target(actor,jid,pid);if r->>'storage_key'<>project_one or r->>'mime'<>'application/json' then raise exception 'superseded project missing';end if;
 r:=public.ar_document_backup_target(actor,jid,eid);if r->>'storage_key'<>export_one then raise exception 'superseded export missing';end if;
 unused:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 insert into storage.objects(id,bucket_id,name,metadata) values(uid,'ar-working-files',unused,'{"size":100,"mimetype":"application/pdf"}');
 begin perform public.ar_document_backup_target(actor,jid,uid);raise exception 'unreceipted object accepted';exception when others then if sqlerrm<>'document_backup_unavailable' then raise;end if;end;
 perform public.ar_document_register_upload(jid,unused,100,repeat('f',64),'application/pdf');
 r:=public.ar_document_backup_target(actor,jid,uid);if r->>'storage_key'<>unused then raise exception 'unused registered upload missing';end if;
 begin perform public.ar_document_backup_target(null,jid,oid);raise exception 'unresolved administrator accepted';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 begin perform public.ar_document_backup_target(gen_random_uuid(),jid,oid);raise exception 'nonadmin accepted';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 begin perform public.ar_document_backup_target(actor,gen_random_uuid(),oid);raise exception 'crossjob accepted';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 update storage.objects set metadata='{"size":101,"mimetype":"application/pdf"}' where id=oid;
 begin perform public.ar_document_backup_target(actor,jid,oid);raise exception 'changed object accepted';exception when others then if sqlerrm<>'document_backup_unavailable' then raise;end if;end;
 update storage.objects set metadata='{"size":100,"mimetype":"application/pdf"}' where id=oid;
 update public.ar_document_jobs set owner='00000000-0000-4000-8000-000000000002' where id=jid;
 begin perform public.ar_document_backup_target(actor,jid,oid);raise exception 'foreign owner accepted';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
end$$;
rollback;
