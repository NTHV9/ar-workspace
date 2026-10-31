begin;
create function pg_temp.combined_late_failure() returns trigger language plpgsql as $$begin if new.hotel='TSK' and current_setting('ar.synthetic_combined_fail',true)='on' then raise exception using errcode='ZC004',message='synthetic late history failure';end if;return new;end$$;
create trigger synthetic_combined_late_failure before insert on ar_private.combined_sent_scopes for each row execute function pg_temp.combined_late_failure();
do $$
declare actor uuid; scope text:='SYNTHETIC-COMBINED-'||gen_random_uuid();h text;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Combined synthetic","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';r jsonb;prep uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();expected jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach h in array array['KAT','TSK'] loop
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(h,scope,h||' arbitrary Agent','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=h and account_id=scope;
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),h,scope,array['A'],'invoices',case when h='KAT' then 'combined' else 'separate' end,case when h='KAT' then 'billing' else 'collection' end,'native');
 select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
 perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);if d?'error' then raise exception 'fixture open %',d;end if;
 if h='KAT' then
 d:=public.ar_email_save_v3(actor,(d->>'id')::uuid,(d->>'revision')::integer,d->>'purpose',d->'recipients',d->>'subject',d->>'body',null,null,jsonb_build_array(jsonb_build_object('storageKey',d#>>'{exports,0,storage_key}','name','Inv. 201.pdf')));
 if d?'error' or d#>>'{exports,0,name}' is distinct from 'Inv. 201.pdf' then raise exception 'Supported draft rename fixture failed %',d;end if;
 end if;
 members:=members||jsonb_build_array(jsonb_build_object('memberId',case when h='KAT' then '00000000-0000-4000-8000-000000000001' else '00000000-0000-4000-8000-000000000002' end,'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',case when h='TSK' then 'Friendly' end,'policyVersion',case when h='TSK' then (select version from ar_private.collection_policy_head where singleton) end));
 end loop;
 r:=public.ar_combined_email_save(actor,prep,0,cmd,members,content);
 if r->>'revision' is distinct from '1' or jsonb_array_length(r->'members')<>2 then raise exception 'initial combined save failed %',r;end if;
 if r::text like '%storage_key%' then raise exception 'private paths leaked';end if;
 if r->'members'->0->'files'->0->>'name' is distinct from 'Inv. 201.pdf' then raise exception 'Unique staff Invoice filename changed: %',r#>>'{members,0,files,0,name}';end if;
 if r->'members'->0->'files'->0->>'fileId' is distinct from '00000000-0000-4000-8000-000000000001:0' then raise exception 'stable file identity lost';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content) is distinct from r then raise exception 'command replay changed';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content||'{"subject":"changed"}')->>'error' is distinct from 'email_command_conflict' then raise exception 'command conflict accepted';end if;
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members||jsonb_build_array(members->0),content)->>'error' is distinct from 'email_duplicate_scope' then raise exception 'duplicate scope accepted';end if;
 if not(public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),jsonb_set(members,'{1,documentRevision}','999'),content)?'error') then raise exception 'stale member accepted';end if;
 -- A second owned draft may use the same visible Folio filename. The next
 -- root revision disambiguates the complete package without touching its bytes.
 d:=public.ar_email_get(actor,(members->1->>'draftId')::uuid);
 d:=public.ar_email_save_v3(actor,(d->>'id')::uuid,(d->>'revision')::integer,d->>'purpose',d->'recipients',d->>'subject',d->>'body',null,null,jsonb_build_array(jsonb_build_object('storageKey',d#>>'{exports,0,storage_key}','name','INV. 201.PDF')));
 if d?'error' then raise exception 'Cross-Hotel filename fixture failed %',d;end if;
 members:=jsonb_set(members,'{1,draftRevision}',d->'revision');
 -- Invalid members fail the whole preparation without a durable probe delivery.
 update public.ar_document_jobs set acknowledged=false where id=(members->0->>'documentJobId')::uuid;
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members,content)->>'error' is distinct from 'email_package_changed' then raise exception 'unreviewed member accepted';end if;
 update public.ar_document_jobs set acknowledged=true where id=(members->0->>'documentJobId')::uuid;
 insert into public.ar_invoice_exceptions(hotel,account_id,invoice_id,held,hold_reason) values('TSK',scope,'A',true,'Synthetic hold');
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members,content)->>'error' is distinct from 'email_invoice_on_hold' then raise exception 'held member accepted';end if;
 delete from public.ar_invoice_exceptions where hotel='TSK' and account_id=scope;
 begin
 insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values((members->0->>'draftId')::uuid,(members->0->>'draftRevision')::integer,'synthetic-prior');
 r:=public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members,content);
 raise exception using errcode='ZC002',message='rollback synthetic attempt';
 exception when sqlstate 'ZC002' then null;end;
 if r->>'error' is distinct from 'email_handoff_pending' then raise exception 'provider-attempt member accepted %',r;end if;
 begin
 insert into ar_private.unused_preparation_dispositions(job_id,owner,revision,fingerprint,snapshot_sha256,cutoff,backup_manifest_sha256,backup_archive_sha256,backup_metadata_sha256,objects)
 select id,owner,revision,fingerprint,repeat('a',64),now(),repeat('a',64),repeat('a',64),repeat('a',64),'[]' from public.ar_document_jobs where id=(members->0->>'documentJobId')::uuid;
 r:=public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members,content);
 raise exception using errcode='ZC003',message='rollback synthetic retired preparation';
 exception when sqlstate 'ZC003' then null;end;
 if r->>'error' is distinct from 'email_package_changed' then raise exception 'retired member with null underlying closed_at accepted %',r;end if;
 if public.ar_combined_email_save(actor,prep,0,gen_random_uuid(),members,content)->>'error' is distinct from 'email_revision_conflict' then raise exception 'stale preparation revision accepted';end if;
 r:=public.ar_combined_email_save(actor,prep,1,gen_random_uuid(),members,content);
 if r->>'revision' is distinct from '2' then raise exception 'save did not increment revision %',r;end if;
 if lower(r#>>'{members,0,files,0,name}')=lower(r#>>'{members,1,files,0,name}') or r#>>'{members,0,files,0,name}' not like 'KAT % - Inv. 201.pdf' or r#>>'{members,1,files,0,name}' not like 'TSK % - INV. 201.PDF' then raise exception 'Whole-package collision names not frozen %',r;end if;
 if public.ar_combined_email_get(actor,prep)->'delivery' is distinct from 'null'::jsonb then raise exception 'Unclaimed GET exposed an attempt';end if;
 expected:=content||jsonb_build_object('mailbox','phuket','sender','ar@katathani.com');
 r:=public.ar_combined_mail_claim(actor,delivery,prep,2,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',expected);
 if r->>'claimed' is distinct from 'true' or r->>'mode'<>'send' or r->>'draft_id' is not null then raise exception 'combined claim failed %',r;end if;
 if (select count(*) from ar_private.mail_deliveries where combined_preparation_id=prep)<>1 then raise exception 'fake child sends';end if;
 if public.ar_combined_mail_claim(actor,delivery,prep,2,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',expected)->>'claimed' is distinct from 'false' then raise exception 'replay resent';end if;
 begin
 update public.ar_email_drafts set body='Changed frozen text' where id=(members->0->>'draftId')::uuid;
 raise exception 'Frozen draft edit accepted';exception when others then if sqlerrm<>'email_handoff_pending' then raise;end if;end;
 begin
 update public.ar_document_jobs set acknowledged=false where id=(members->0->>'documentJobId')::uuid;
 raise exception 'Frozen document edit accepted';exception when others then if sqlerrm<>'email_handoff_pending' then raise;end if;end;
 begin
 insert into ar_private.gmail_draft_attempts(draft_id,revision,message_id) values((members->0->>'draftId')::uuid,(members->0->>'draftRevision')::integer,'synthetic-race');
 raise exception 'Ordinary provider admission raced combined';exception when others then if sqlerrm<>'email_handoff_pending' then raise;end if;end;
 if not public.ar_mail_record(actor,delivery,'awaiting_evidence','combined_synthetic',null,null) then raise exception 'provider receipt not retained';end if;
 if exists(select 1 from ar_private.combined_delivery_members b where b.delivery_id=delivery and (b.member_snapshot->>'accountType' is distinct from 'SYNTHETIC' or jsonb_array_length(b.member_snapshot->'trackerAuthority')<>4)) then raise exception 'Frozen Account type/Sheet authority metadata missing';end if;
 perform set_config('ar.synthetic_combined_fail','on',true);
 begin
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now());raise exception 'Late failure fixture did not throw';
 exception when sqlstate 'ZC004' then null;end;
 perform set_config('ar.synthetic_combined_fail','off',true);
 if exists(select 1 from ar_private.combined_sent_scopes where delivery_id=delivery) or exists(select 1 from ar_private.combined_sent_reconciliations where delivery_id=delivery) then raise exception 'Late history error committed partial facts/audit';end if;
 if (select provider_receipt_id from ar_private.mail_deliveries where id=delivery) is distinct from 'combined_synthetic' then raise exception 'Late history error lost accepted receipt';end if;
 begin
 delete from public.ar_invoice_workflow where hotel='KAT' and account_id=scope;
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now());
 if r->>'recorded' is distinct from 'true' or not exists(select 1 from ar_private.combined_sent_reconciliations where delivery_id=delivery and hotel='KAT' and reason='workflow_missing' and not projection_applied) then raise exception 'Missing current workflow blocked actual Sent';end if;
 raise exception using errcode='ZC005',message='rollback synthetic missing workflow';
 exception when sqlstate 'ZC005' then null;end;
 -- A provider-accepted fact survives a later current-workflow edit unchanged.
 update public.ar_invoice_workflow set credit_term=45,first_billing_date=current_date-2 where hotel='KAT' and account_id=scope;
 update public.ar_invoice_workflow set revision=revision+1,last_reminder_stage='Follow 2',last_reminder_date=current_date-1 where hotel='TSK' and account_id=scope;
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now());
 if r->>'recorded' is distinct from 'true' then raise exception 'Accepted Sent fact blocked by later workflow revision %',r;end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and last_reminder_stage='Follow 2' and last_reminder_date=current_date-1) then raise exception 'Later workflow authority overwritten';end if;
 if not exists(select 1 from ar_private.combined_sent_reconciliations where delivery_id=delivery and hotel='KAT' and reason='workflow_changed' and not projection_applied) then raise exception 'Changed fields without revision were overwritten';end if;
 if not exists(select 1 from ar_private.combined_sent_reconciliations where delivery_id=delivery and hotel='TSK' and account_id=scope and invoice_id='A' and reason='workflow_changed') then raise exception 'Reconciliation audit missing';end if;
 if (select count(*) from ar_private.sent_scope_facts where delivery_id=delivery)<>2 or exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'scope facts lost or fake events';end if;
 if (select count(*) from public.ar_invoice_workflow where account_id=scope and first_billing_date is not null)<>1 or not exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and last_reminder_stage='Follow 2') then raise exception 'billing workflow incomplete';end if;
 if public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now())->>'recorded' is distinct from 'true' then raise exception 'confirmation replay failed';end if;
 if has_function_privilege('authenticated','public.ar_combined_email_get(uuid,uuid)','execute') then raise exception 'public RPC ACL widened';end if;
end$$;
do $$
declare a jsonb:=jsonb_build_object('memberId','00000000-0000-4000-8000-000000000001','hotel','KAT','accountId','synthetic','accountName','Readable Agent','files',jsonb_build_array(jsonb_build_object('fileId','00000000-0000-4000-8000-000000000001:0','name','Inv. 201.pdf','byteCount',100,'sha256',repeat('a',64))));b jsonb;c jsonb;r jsonb;long_name text;ext text;
begin
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a));
 if r#>>'{0,files,0,name}' is distinct from 'Inv. 201.pdf' then raise exception 'Unique Invoice filename changed';end if;
 b:=jsonb_set(a,'{hotel}','"TSK"');b:=jsonb_set(b,'{memberId}','"00000000-0000-4000-8000-000000000002"');b:=jsonb_set(b,'{files,0,fileId}','"00000000-0000-4000-8000-000000000002:0"');b:=jsonb_set(b,'{files,0,name}','"INV. 201.PDF"');
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a,b));
 if r#>>'{0,files,0,name}' is distinct from 'KAT Readable Agent - Inv. 201.pdf' or r#>>'{1,files,0,name}' is distinct from 'TSK Readable Agent - INV. 201.PDF' then raise exception 'Equal names lack readable Hotel/Account labels %',r;end if;
 b:=jsonb_set(b,'{hotel}','"KAT"');b:=jsonb_set(b,'{files,0,name}','"Inv. 201.pdf"');
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a,b));
 if r#>>'{1,files,0,name}' is distinct from 'KAT Readable Agent - Inv. 201 (2).pdf' then raise exception 'Same-Account work groups did not get stable numeric suffix';end if;
 if ar_private.combined_resolve_file_names(jsonb_build_array(a,b)) is distinct from r then raise exception 'Filename resolution changed on replay';end if;
 c:=jsonb_set(a,'{memberId}','"00000000-0000-4000-8000-000000000003"');c:=jsonb_set(c,'{files,0,fileId}','"00000000-0000-4000-8000-000000000003:0"');c:=jsonb_set(c,'{files,0,name}','"KAT Readable Agent - Inv. 201.pdf"');
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a,b,c));
 if r#>>'{2,files,0,name}' is distinct from 'KAT Readable Agent - Inv. 201.pdf' or (select count(distinct lower(m#>>'{files,0,name}')) from jsonb_array_elements(r) m)<>3 then raise exception 'Contextual duplicate stole an already-unique staff filename';end if;
 foreach ext in array array['.pdf','.png','.jpg'] loop
 long_name:=repeat('A',200-length(ext))||ext;
 a:=jsonb_set(a,'{files,0,name}',to_jsonb(long_name));b:=jsonb_set(b,'{files,0,name}',to_jsonb(long_name));
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a));
 if r#>>'{0,files,0,name}' is distinct from long_name then raise exception 'Valid 200-character unique filename changed';end if;
 r:=ar_private.combined_resolve_file_names(jsonb_build_array(a,b));
 if exists(select 1 from jsonb_array_elements(r) m cross join lateral jsonb_array_elements(m->'files') f where length(f->>'name')>200 or right(f->>'name',length(ext))<>ext or f->>'name'~'[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}') then raise exception 'Long collision name lost extension/limit or exposed internal ID';end if;
 if lower(r#>>'{0,files,0,name}')=lower(r#>>'{1,files,0,name}') then raise exception 'Long collision names still equal';end if;
 if r#>>'{0,files,0,fileId}' is distinct from '00000000-0000-4000-8000-000000000001:0' then raise exception 'Internal file identity changed';end if;
 end loop;
end$$;
rollback;
