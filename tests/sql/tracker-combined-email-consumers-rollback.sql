begin;
do $$
declare actor uuid; scope text:='SYNTHETIC-COMBINED-'||gen_random_uuid();h text;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Combined synthetic","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';r jsonb;prep uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();expected jsonb;blocked boolean;staff uuid:=gen_random_uuid();lease uuid:=gen_random_uuid();hist bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach h in array array['KAT','TSK'] loop
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(h,scope,h||' arbitrary Agent','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=h and account_id=scope;
 update public.ar_accounts set currency='THB',business_date=current_date,synced_at=now(),"agingBuckets"='[{"label":"0-30","start":0,"end":30,"sequence":1,"amount":100,"debit":100,"credit":0},{"label":"31-60","start":31,"end":60,"sequence":2,"amount":0,"debit":0,"credit":0},{"label":"61-90","start":61,"end":90,"sequence":3,"amount":0,"debit":0,"credit":0},{"label":"91-120","start":91,"end":120,"sequence":4,"amount":0,"debit":0,"credit":0},{"label":"121-150","start":121,"end":150,"sequence":5,"amount":0,"debit":0,"credit":0},{"label":"151+","start":151,"end":null,"sequence":6,"amount":0,"debit":0,"credit":0}]' where hotel=h and id=scope;
 update public.ar_refresh_state set last_success_at=now() where hotel=h;
 update public.ar_invoices set age=0 where hotel=h and account_id=scope;
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),h,scope,array['A'],'invoices',case when h='KAT' then 'combined' else 'separate' end,'billing','native');
 select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
 perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);if d?'error' then raise exception 'fixture open %',d;end if;
 members:=members||jsonb_build_array(jsonb_build_object('memberId',case when h='KAT' then '00000000-0000-4000-8000-000000000001' else '00000000-0000-4000-8000-000000000002' end,'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',null,'policyVersion',null));
 end loop;
 r:=public.ar_combined_email_save(actor,prep,0,cmd,members,content);
 if r->>'revision' is distinct from '1' or jsonb_array_length(r->'members')<>2 then raise exception 'initial combined save failed %',r;end if;
 if r::text like '%storage_key%' then raise exception 'private paths leaked';end if;
 if r->'members'->0->'files'->0->>'fileId' is distinct from '00000000-0000-4000-8000-000000000001:0' then raise exception 'stable file identity lost';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content) is distinct from r then raise exception 'command replay changed';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content||'{"subject":"changed"}')->>'error' is distinct from 'email_command_conflict' then raise exception 'command conflict accepted';end if;
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members||jsonb_build_array(members->0),content)->>'error' is distinct from 'email_duplicate_scope' then raise exception 'duplicate scope accepted';end if;
 if not(public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),jsonb_set(members,'{1,documentRevision}','999'),content)?'error') then raise exception 'stale member accepted';end if;
 expected:=content||jsonb_build_object('mailbox','phuket','sender','ar@katathani.com');
 r:=public.ar_combined_mail_claim(actor,delivery,prep,1,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',expected);
 if not ar_private.document_pending_mail((members->0->>'documentJobId')::uuid) or not ar_private.document_pending_mail((members->1->>'documentJobId')::uuid) then raise exception 'shared attempt did not protect all jobs';end if;
 if ar_private.unused_preparation_problem(actor,(members->1->>'documentJobId')::uuid) is distinct from 'document_mail_pending' then raise exception 'shared attempt eligible for retirement';end if;
 if jsonb_array_length(public.ar_access_authorize(actor,'combined',null,null,prep,true)->'scopeHotels')<>2 then raise exception 'combined access omitted member';end if;
 if (select count(*) from ar_private.retention_storage_references where kind='combined_delivery' and reference_id=delivery)<>2 then raise exception 'shared frozen exports absent from retention';end if;
 perform public.ar_access_save(actor,gen_random_uuid(),'synthetic.combined.staff@example.invalid',array['phuket'],true,0);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(staff,'synthetic.combined.staff@example.invalid',now(),false);
 if jsonb_array_length(public.ar_access_authorize(staff,'delivery',null,null,delivery,true)->'scopeHotels')<>2 then raise exception 'shared delivery member access missing';end if;
 perform public.ar_access_save(actor,gen_random_uuid(),'synthetic.combined.staff@example.invalid',array['khao-lak'],true,1);
 blocked:=false;begin perform public.ar_access_authorize(staff,'combined',null,null,prep,true);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'removed regional access exposed shared preparation';end if;
 blocked:=false;begin perform public.ar_access_authorize(staff,'delivery',null,null,delivery,true);exception when others then blocked:=sqlerrm='access_forbidden';end;if not blocked then raise exception 'removed regional access exposed shared message';end if;
 if r->>'claimed' is distinct from 'true' or r->>'mode'<>'send' or r->>'draft_id' is not null then raise exception 'combined claim failed %',r;end if;
 if public.ar_document_abandon(actor,(members->0->>'documentJobId')::uuid)->>'outcome' is distinct from 'protected' or public.ar_document_abandon(actor,(members->1->>'documentJobId')::uuid)->>'outcome' is distinct from 'protected' then raise exception 'shared pending attempt discarded';end if;
 if (select cp.content from ar_private.combined_email_preparations cp where cp.id=prep) is distinct from content or not exists(select 1 from ar_private.combined_email_commands c where c.preparation_id=prep and c.result#>>'{content,subject}'='Combined synthetic') then raise exception 'pending combined content/cache scrubbed';end if;
 if (select count(*) from ar_private.mail_deliveries where combined_preparation_id=prep)<>1 then raise exception 'fake child sends';end if;
 if public.ar_combined_mail_claim(actor,delivery,prep,1,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',expected)->>'claimed' is distinct from 'false' then raise exception 'replay resent';end if;
 if not public.ar_mail_record(actor,delivery,'awaiting_evidence','combined_synthetic',null,null) then raise exception 'provider receipt not retained';end if;
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now());
 if r->>'recorded' is distinct from 'true' then raise exception 'combined confirmation failed %',r;end if;
 if (select count(*) from ar_private.sent_scope_facts where delivery_id=delivery)<>2 or exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'scope facts lost or fake events';end if;
 if (select count(*) from public.ar_invoice_workflow where account_id=scope and first_billing_date is not null)<>2 then raise exception 'billing workflow incomplete';end if;
 if ar_private.retention_transient_eligibility(actor,'supabase',k)->>'complete' is distinct from 'true' then raise exception 'resolved shared export not eligible for normal transient retention: %',ar_private.retention_transient_eligibility(actor,'supabase',k);end if;
 if (select count(*) from ar_private.tracker_outbox where delivery_id=delivery)<>2 then raise exception 'combined per-hotel outbox missing';end if;
 if (select count(*) from ar_private.report_sent_invoices where delivery_id=delivery)<>2 then raise exception 'combined report scopes missing';end if;
 if (public.ar_account_workspace_read(actor,'TSK',scope,'history')->'rows'->0->>'job_id') is distinct from members->1->>'documentJobId' then raise exception 'combined account history lost member job';end if;
 if (public.ar_account_workspace_read(actor,'TSK',scope,'email_records')->'rows'->0->>'delivery_id') is distinct from delivery::text then raise exception 'combined email records lost root';end if;
 if exists(select 1 from public.ar_document_jobs where id in((members->0->>'documentJobId')::uuid,(members->1->>'documentJobId')::uuid) and closed_reason is distinct from 'sent') then raise exception 'combined Sent did not close all transient jobs';end if;
 blocked:=false;begin insert into ar_private.tracker_outbox(delivery_id,owner,hotel,account_id,invoice_id,field) values(delivery,actor,'KAT',scope,'FORGED','R');exception when others then blocked:=sqlerrm='tracker_confirmed_scope_missing';end;if not blocked then raise exception 'outbox accepted nonmember invoice';end if;
 perform public.ar_tracker_connect(actor,'phuket','synthetic_combined_tracker_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='phuket';
 perform public.ar_tracker_append_policy_set(actor,'phuket',true);
 r:=public.ar_tracker_append_candidates(actor,'phuket',lease);
 if r->>'total' is distinct from '2' then raise exception 'combined missing row admission lost scope: %, aging: %',r,public.ar_aging_invoice_status(p_actor=>actor,p_hotel=>'KAT',p_accounts=>jsonb_build_array(jsonb_build_array('KAT',scope)));end if;
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('phuket',scope,'KAT',scope,'A','{}','{}','{}'),('phuket',scope||'-TSK','TSK',scope,'A','{}','{}','{}');
 if jsonb_array_length(public.ar_tracker_outbox(actor,'phuket',lease))<>2 then raise exception 'same invoice id multiplied/lost across hotels: %',public.ar_tracker_outbox(actor,'phuket',lease);end if;
 -- A reviewed bootstrap must accept the widened root+Hotel+Account key too.
 perform public.ar_tracker_finish(actor,'phuket',lease,'synthetic-combined-bootstrap-v1',null);
 delete from ar_private.tracker_outbox where delivery_id=delivery;
 r:=public.ar_tracker_preview(actor,'phuket','synthetic_combined_tracker_12345','synthetic-combined-bootstrap-v1',repeat('c',64),jsonb_build_array(
  jsonb_build_object('rowKey',scope,'hotel','KAT','accountNo',scope,'invoiceNo','101','folio','201','transactionDate',current_date,'locator','{}'::jsonb,'fields','{}'::jsonb),
  jsonb_build_object('rowKey',scope||'-TSK','hotel','TSK','accountNo',scope,'invoiceNo','101','folio','201','transactionDate',current_date,'locator','{}'::jsonb,'fields','{}'::jsonb)));
 r:=public.ar_tracker_confirm_preview(actor,'phuket',(r->>'previewId')::uuid,repeat('c',64),'synthetic-combined-bootstrap-v1');
 if r->>'confirmed' is distinct from 'true' or (select count(*) from ar_private.tracker_outbox where delivery_id=delivery)<>2 then raise exception 'combined bootstrap collapsed repeated invoice IDs by Hotel: %',r;end if;
 perform public.ar_tracker_claim(actor,'phuket',lease,true);

 perform ar_private.tracker_adopt_current(actor,'phuket',scope,'R','null');
 update public.ar_invoice_workflow set first_billing_date=null where hotel='KAT' and account_id=scope;
 if ar_private.tracker_billing_floor('KAT',scope,'A') is not null or (select first_billing_date from public.ar_invoice_workflow where hotel='KAT' and account_id=scope) is not null then raise exception 'cleared R resurrected combined billing';end if;
 select ar_private.tracker_append_source(actor,'phuket',q.id,true) into r from ar_private.tracker_outbox q where q.delivery_id=delivery and q.hotel='KAT';
 if r is null or r#>'{desiredDates,R}' is distinct from 'null'::jsonb then raise exception 'missing row source resurrected cleared R: %',r;end if;
 if exists(select 1 from ar_private.tracker_report_current_events where hotel='KAT' and account_id=scope and purpose='billing') then raise exception 'cleared R present in current events';end if;
 if public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic',now())->>'recorded' is distinct from 'true' then raise exception 'confirmation replay failed';end if;
 if (select p.content from ar_private.combined_email_preparations p where p.id=prep) is distinct from content or (select to_jsonb(p)->>'closed_at' from ar_private.combined_email_preparations p where p.id=prep) is not null then raise exception 'Sent combined history scrubbed';end if;
 if has_function_privilege('authenticated','public.ar_combined_email_get(uuid,uuid)','execute') then raise exception 'public RPC ACL widened';end if;
end$$;
do $$
declare actor uuid; scope text:='SYNTHETIC-COMBINED-STAGES-'||gen_random_uuid();h text;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Combined synthetic","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';r jsonb;prep uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();expected jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach h in array array['KAT','TSK'] loop
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(h,scope,h||' arbitrary Agent','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=h and account_id=scope;
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),h,scope,array['A'],'invoices',case when h='KAT' then 'combined' else 'separate' end,'collection','native');
 select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
 perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);if d?'error' then raise exception 'fixture open %',d;end if;
 members:=members||jsonb_build_array(jsonb_build_object('memberId',case when h='KAT' then '00000000-0000-4000-8000-000000000001' else '00000000-0000-4000-8000-000000000002' end,'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',case when h='KAT' then 'Follow 1' else 'Follow 2' end,'policyVersion',(select version from ar_private.collection_policy_head where singleton)));
 end loop;
 r:=public.ar_combined_email_save(actor,prep,0,cmd,members,content);
 if r->>'revision' is distinct from '1' or jsonb_array_length(r->'members')<>2 then raise exception 'initial combined save failed %',r;end if;
 if r::text like '%storage_key%' then raise exception 'private paths leaked';end if;
 if r->'members'->0->'files'->0->>'fileId' is distinct from '00000000-0000-4000-8000-000000000001:0' then raise exception 'stable file identity lost';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content) is distinct from r then raise exception 'command replay changed';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content||'{"subject":"changed"}')->>'error' is distinct from 'email_command_conflict' then raise exception 'command conflict accepted';end if;
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members||jsonb_build_array(members->0),content)->>'error' is distinct from 'email_duplicate_scope' then raise exception 'duplicate scope accepted';end if;
 if not(public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),jsonb_set(members,'{1,documentRevision}','999'),content)?'error') then raise exception 'stale member accepted';end if;
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
 if not public.ar_mail_record(actor,delivery,'awaiting_evidence','combined_synthetic_stages',null,null) then raise exception 'provider receipt not retained';end if;
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic_stages',now());
 if r->>'recorded' is distinct from 'true' then raise exception 'combined confirmation failed %',r;end if;
 if (select count(*) from ar_private.sent_scope_facts where delivery_id=delivery)<>2 or exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'scope facts lost or fake events';end if;
 if not exists(select 1 from ar_private.tracker_effective_collection_stage where hotel='KAT' and account_id=scope and stage='Follow 1') or not exists(select 1 from ar_private.tracker_effective_collection_stage where hotel='TSK' and account_id=scope and stage='Follow 2') then raise exception 'mixed member stages flattened';end if;
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and hotel='KAT' and field='U') or not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and hotel='TSK' and field='V') then raise exception 'mixed member stage outbox wrong';end if;
 if (select count(*) from ar_private.report_sent_invoices where delivery_id=delivery and (hotel='KAT' and stage='Follow 1' or hotel='TSK' and stage='Follow 2'))<>2 then raise exception 'mixed report stages wrong';end if;
 if public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic_stages',now())->>'recorded' is distinct from 'true' then raise exception 'confirmation replay failed';end if;
 if has_function_privilege('authenticated','public.ar_combined_email_get(uuid,uuid)','execute') then raise exception 'public RPC ACL widened';end if;
end$$;

do $$
declare actor uuid; scope text:='SYNTHETIC-COMBINED-LATE-'||gen_random_uuid();h text;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Combined synthetic","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';r jsonb;prep uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();expected jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach h in array array['KAT','TSK'] loop
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(h,scope,h||' arbitrary Agent','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=h and account_id=scope;
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),h,scope,array['A'],'invoices',case when h='KAT' then 'combined' else 'separate' end,'collection','native');
 select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
 perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);if d?'error' then raise exception 'fixture open %',d;end if;
 members:=members||jsonb_build_array(jsonb_build_object('memberId',case when h='KAT' then '00000000-0000-4000-8000-000000000001' else '00000000-0000-4000-8000-000000000002' end,'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',case when h='KAT' then 'Follow 1' else 'Follow 2' end,'policyVersion',(select version from ar_private.collection_policy_head where singleton)));
 end loop;
 r:=public.ar_combined_email_save(actor,prep,0,cmd,members,content);
 if r->>'revision' is distinct from '1' or jsonb_array_length(r->'members')<>2 then raise exception 'initial combined save failed %',r;end if;
 if r::text like '%storage_key%' then raise exception 'private paths leaked';end if;
 if r->'members'->0->'files'->0->>'fileId' is distinct from '00000000-0000-4000-8000-000000000001:0' then raise exception 'stable file identity lost';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content) is distinct from r then raise exception 'command replay changed';end if;
 if public.ar_combined_email_save(actor,prep,0,cmd,members,content||'{"subject":"changed"}')->>'error' is distinct from 'email_command_conflict' then raise exception 'command conflict accepted';end if;
 if public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),members||jsonb_build_array(members->0),content)->>'error' is distinct from 'email_duplicate_scope' then raise exception 'duplicate scope accepted';end if;
 if not(public.ar_combined_email_save(actor,gen_random_uuid(),0,gen_random_uuid(),jsonb_set(members,'{1,documentRevision}','999'),content)?'error') then raise exception 'stale member accepted';end if;
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
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('phuket',scope,'KAT',scope,'A','{}','{}','{}'),('phuket',scope||'-TSK','TSK',scope,'A','{}','{}','{}');
 perform ar_private.tracker_adopt_current(actor,'phuket',scope,'U',to_jsonb(current_date-3));
 perform ar_private.tracker_adopt_current(actor,'phuket',scope||'-TSK','V',to_jsonb(current_date-3));
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
 -- Staff clears/edits dates after the provider claim; revisions only increase.
 perform ar_private.tracker_adopt_current(actor,'phuket',scope,'U','null');
 perform ar_private.tracker_adopt_current(actor,'phuket',scope||'-TSK','V',to_jsonb(current_date-1));
 update public.ar_invoice_workflow set last_reminder_stage=null,last_reminder_date=null,revision=revision+1 where hotel='KAT' and account_id=scope;
 update public.ar_invoice_workflow set last_reminder_stage='Follow 2',last_reminder_date=current_date-1,revision=revision+1 where hotel='TSK' and account_id=scope;
 if not public.ar_mail_record(actor,delivery,'awaiting_evidence','combined_synthetic_late',null,null) then raise exception 'provider receipt not retained';end if;
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic_late',now());
 if r->>'recorded' is distinct from 'true' then raise exception 'combined confirmation failed %',r;end if;
 if (select count(*) from ar_private.sent_scope_facts where delivery_id=delivery)<>2 or exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'scope facts lost or fake events';end if;
 if exists(select 1 from ar_private.tracker_effective_collection_stage where hotel='KAT' and account_id=scope) then raise exception 'late cleared U resurrected';end if;
 if (select actual_date from ar_private.tracker_current_dates where hotel='TSK' and account_id=scope and field='V') is distinct from current_date-1 then raise exception 'late staff date overwritten';end if;
 if (select count(*) from ar_private.tracker_outbox where delivery_id=delivery and state='suppressed' and authority_generation=1 and intent_captured)<>2 then raise exception 'stale combined intent not retained/suppressed at captured generation';end if;
 if (select count(*) from ar_private.combined_sent_reconciliations where delivery_id=delivery and not projection_applied and reason='workflow_changed')<>2 then raise exception 'late workflow audit missing';end if;
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and hotel='KAT' and field='U') or not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and hotel='TSK' and field='V') then raise exception 'mixed member stage outbox wrong';end if;
 if (select count(*) from ar_private.report_sent_invoices where delivery_id=delivery and (hotel='KAT' and stage='Follow 1' or hotel='TSK' and stage='Follow 2'))<>2 then raise exception 'mixed report stages wrong';end if;
 if public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic_late',now())->>'recorded' is distinct from 'true' then raise exception 'confirmation replay failed';end if;
 if has_function_privilege('authenticated','public.ar_combined_email_get(uuid,uuid)','execute') then raise exception 'public RPC ACL widened';end if;
end$$;



-- Two work groups in one Account still represent one provider email.
do $$
declare actor uuid;scope text:='SYNTHETIC-COMBINED-GROUP-'||gen_random_uuid();n integer;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';p uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();r jsonb;content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Grouped root","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic group','SYNTHETIC',200,0,2,'verified');
 for n in 1..2 loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,n::text,n::text,n::text,current_date,100,100,'verified','standalone',false,now());
  update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope;
  j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array[n::text],'invoices','separate','collection','native');
  select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
  perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
  k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
  perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
  d:=public.ar_email_open(actor,(j->>'id')::uuid,1);
  members:=members||jsonb_build_array(jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',case n when 1 then 'Follow 1' else 'Follow 2' end,'policyVersion',(select version from ar_private.collection_policy_head where singleton)));
 end loop;
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('phuket',scope,'KAT',scope,'1','{}','{}','{}');
 r:=public.ar_combined_email_save(actor,p,0,gen_random_uuid(),members,content);if r?'error' then raise exception 'Grouped save failed %',r;end if;
 r:=public.ar_combined_mail_claim(actor,delivery,p,1,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',content||jsonb_build_object('mailbox','phuket','sender','ar@katathani.com'));if r->>'claimed' is distinct from 'true' then raise exception 'Grouped claim failed %',r;end if;
 update ar_private.tracker_rows set present=false where region='phuket' and row_key=scope;
 perform public.ar_mail_record(actor,delivery,'awaiting_evidence','combined_synthetic_group',null,null);
 r:=public.ar_mail_confirm_sent(actor,delivery,'combined_synthetic_group',now());if r->>'recorded' is distinct from 'true' then raise exception 'Grouped Sent failed %',r;end if;
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and invoice_id='1' and field='U' and state='suppressed') then raise exception 'post-claim removed mapping eligible for append';end if;
 if not exists(select 1 from ar_private.tracker_outbox where delivery_id=delivery and invoice_id='2' and field='V' and state='pending') then raise exception 'never-mapped new member incorrectly suppressed';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'email_records',0,1);
 if r->>'total' is distinct from '1' or r#>>'{rows,0,id}' is distinct from delivery::text or r#>>'{rows,0,combined_preparation_id}' is distinct from p::text or r#>>'{rows,0,invoice_count}' is distinct from '2' or jsonb_array_length(r#>'{rows,0,member_ids}')<>2 or jsonb_array_length(r#>'{rows,0,members}')<>2 or jsonb_array_length(r#>'{rows,0,invoice_ids}')<>2 then raise exception 'One Account message counted/flattened incorrectly: %',r;end if;
 if not exists(select 1 from jsonb_array_elements(r#>'{rows,0,members}')m where m->>'stage'='Follow 1') or not exists(select 1 from jsonb_array_elements(r#>'{rows,0,members}')m where m->>'stage'='Follow 2') then raise exception 'Grouped member stages lost';end if;
 if (public.ar_account_workspace_read(actor,'KAT',scope,'email_records',1,1)->'rows')<>'[]'::jsonb then raise exception 'Grouping applied after pagination';end if;
 if (select count(*) from ar_private.report_sent_invoices where delivery_id=delivery and account_type='SYNTHETIC')<>2 then raise exception 'Frozen combined account type lost';end if;
end$$;

-- Two work groups in one Account still represent one provider email.
do $$
declare actor uuid;scope text:='SYNTHETIC-COMBINED-DISCARD-'||gen_random_uuid();n integer;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';p uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();r jsonb;cmd uuid:=gen_random_uuid();first_cmd uuid:=gen_random_uuid();content jsonb:='{"recipients":{"to":["synthetic@example.invalid"],"cc":[],"bcc":[]},"subject":"Grouped root","body":"Synthetic","richBody":null,"signatureHotel":"KAT"}';
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic group','SYNTHETIC',200,0,2,'verified');
 for n in 1..2 loop
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,n::text,n::text,n::text,current_date,100,100,'verified','standalone',false,now());
  update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel='KAT' and account_id=scope;
  j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array[n::text],'invoices','separate','collection','native');
  select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
  perform public.ar_document_claim_file((j->>'id')::uuid,fid);perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',100,repeat('a',64));
  k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,100,repeat('b',64));perform public.ar_document_register_upload((j->>'id')::uuid,k,100,repeat('b',64),'application/pdf');
  perform public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('invoice_ids',j->'invoice_ids','name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
  d:=public.ar_email_open(actor,(j->>'id')::uuid,1);
  members:=members||jsonb_build_array(jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',case n when 1 then 'Follow 1' else 'Follow 2' end,'policyVersion',(select version from ar_private.collection_policy_head where singleton)));
 end loop;
 insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('phuket',scope,'KAT',scope,'1','{}','{}','{}');
 r:=public.ar_combined_email_save(actor,p,0,first_cmd,members,content);if r?'error' then raise exception 'Grouped save failed %',r;end if;

 if public.ar_combined_email_get(actor,p)->'content' is distinct from content then raise exception 'F5 open content lost';end if;
 r:=public.ar_combined_email_save(actor,p,1,cmd,members,content);if r->>'revision' is distinct from '2' then raise exception 'Second cached command missing';end if;
 r:=public.ar_document_abandon(actor,(members->0->>'documentJobId')::uuid);if r->>'outcome' is distinct from 'discarded' then raise exception 'First unused member discard failed %',r;end if;
 if public.ar_combined_email_get(actor,p)->'content' is distinct from content then raise exception 'Partially closed batch lost open common content';end if;
 k:='jobs/'||(members->1->>'documentJobId')||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_begin_upload(actor,(members->1->>'documentJobId')::uuid,k,100,repeat('c',64));
 r:=public.ar_document_abandon(actor,(members->1->>'documentJobId')::uuid);if r->>'outcome' is distinct from 'pending' or r->>'reason' is distinct from 'document_upload_pending' then raise exception 'Incomplete upload was discarded %',r;end if;
 if public.ar_combined_email_get(actor,p)->'content' is distinct from content then raise exception 'Pending upload closure scrubbed common content';end if;
 perform public.ar_document_cancel_undispatched_upload(actor,(members->1->>'documentJobId')::uuid,k,repeat('c',64));
 perform public.ar_document_finalize_abandoned(actor,10);
 if (select closed_reason from public.ar_document_jobs where id=(members->1->>'documentJobId')::uuid) is distinct from 'discarded' then raise exception 'Settled upload did not retry child closure';end if;
 if public.ar_combined_email_get(actor,p)->>'error' is distinct from 'document_closed' then raise exception 'Discarded combined GET returned old common body';end if;
 if (select c.content from ar_private.combined_email_preparations c where c.id=p)<>'{}'::jsonb or (select to_jsonb(c)->>'closed_reason' from ar_private.combined_email_preparations c where c.id=p) is distinct from 'discarded' then raise exception 'Discarded common content retained';end if;
 if exists(select 1 from ar_private.combined_email_preparations c cross join lateral jsonb_array_elements(c.members)m where c.id=p and (m?'draft' or m?'manifest' or m?'workflow' or m?'files' or m?'accountName')) then raise exception 'Discarded member snapshots retained';end if;
 if exists(select 1 from ar_private.combined_email_commands c where c.preparation_id=p and c.result<>'{"error":"document_closed"}'::jsonb) or (select count(*) from ar_private.combined_email_commands c where c.preparation_id=p)<>2 then raise exception 'Discarded cached command bodies retained or identity deleted';end if;
 if public.ar_combined_email_save(actor,p,0,first_cmd,members,content)->>'error' is distinct from 'document_closed' or public.ar_combined_email_save(actor,p,1,cmd,members,content)->>'error' is distinct from 'document_closed' then raise exception 'Discarded command replay restored body';end if;
 if public.ar_combined_email_save(actor,p,2,gen_random_uuid(),members,content)->>'error' is distinct from 'document_closed' then raise exception 'Discarded root reopened';end if;
 if public.ar_combined_mail_claim(actor,delivery,p,2,'<'||delivery||'@ar-workspace.ar-c82.workers.dev>',content||jsonb_build_object('mailbox','phuket','sender','ar@katathani.com'))->>'error' is distinct from 'document_closed' then raise exception 'Discarded root admitted provider claim';end if;
end$$;

rollback;
