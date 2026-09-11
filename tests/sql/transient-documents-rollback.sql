begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-TRANSIENT-'||gen_random_uuid();j jsonb;jid uuid;fid uuid;r jsonb;e jsonb;key text;obj uuid:=gen_random_uuid();draft jsonb;mid uuid:=gen_random_uuid();legacy jsonb;rid uuid;claim uuid:=gen_random_uuid();cancel_key text;extra_key text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic transient','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');jid:=(j->>'id')::uuid;
 if j->>'lifecycle'<>'transient' then raise exception 'new lifecycle missing';end if;
 begin perform public.ar_document_discard(actor,jid);raise exception 'active generation discarded';exception when others then if sqlerrm<>'document_generation_pending' then raise;end if;end;
 select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_claim_file(jid,fid);
 perform public.ar_document_finish_file(jid,fid,'jobs/'||jid||'/originals/'||fid||'.pdf',100,repeat('a',64));
 cancel_key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_begin_upload(actor,jid,cancel_key,100,repeat('c',64));
 begin perform public.ar_document_begin_upload(actor,jid,cancel_key,100,repeat('c',64));raise exception 'duplicate pending upload dispatched';exception when others then if sqlerrm<>'document_upload_pending' then raise;end if;end;
 if not public.ar_document_cancel_undispatched_upload(actor,jid,cancel_key,repeat('c',64)) then raise exception 'known predispatch failure not released';end if;
 if not exists(select 1 from ar_private.document_transient_uploads where storage_key=cancel_key and cancelled and not registered) then raise exception 'cancellation audit missing';end if;
 key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';
 e:=jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64)));
 begin perform public.ar_document_review(actor,jid,0,e,true);raise exception 'forged receipt accepted';exception when others then if sqlerrm<>'document_export_upload_mismatch' then raise;end if;end;
 perform public.ar_document_begin_upload(actor,jid,key,100,repeat('b',64));
 begin perform public.ar_document_discard(actor,jid);raise exception 'pending upload discarded';exception when others then if sqlerrm<>'document_upload_pending' then raise;end if;end;
 perform public.ar_document_register_upload(jid,key,100,repeat('b',64),'application/pdf');
 update public.ar_document_jobs set state='partial' where id=jid;
 j:=public.ar_document_review(actor,jid,0,e,true);
 r:=public.ar_email_open(actor,jid,1);if not r?'error' then raise exception 'partial package mailed';end if;
 update public.ar_document_jobs set state='ready' where id=jid;
 if j->>'revision'<>'1' or j->>'project_key' is not null or not exists(select 1 from ar_private.document_revisions where job_id=jid and project_key is null and acknowledged) then raise exception 'review persisted wrong state';end if;
 r:=public.ar_document_review(actor,jid,0,e,true);if r->>'revision'<>'1' then raise exception 'replay duplicated revision';end if;
 begin perform public.ar_document_review(actor,jid,0,jsonb_set(e,'{0,name}','"Other.pdf"'),true);raise exception 'divergent replay accepted';exception when others then if sqlerrm<>'document_revision_conflict' then raise;end if;end;
 begin perform public.ar_document_review(gen_random_uuid(),jid,1,e,true);raise exception 'owner bypass';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 begin perform public.ar_document_register_upload(jid,'jobs/'||jid||'/projects/'||gen_random_uuid()||'.json',100,repeat('a',64),'application/json');raise exception 'project upload accepted';exception when others then if sqlerrm<>'document_project_retired' then raise;end if;end;
 draft:=public.ar_email_open(actor,jid,1);
 if draft?'error' then raise exception 'email open failed: %',draft->>'error';end if;
 extra_key:='jobs/'||jid||'/email/'||(draft->>'id')||'/'||gen_random_uuid();
 perform public.ar_document_begin_upload(actor,jid,extra_key,100,repeat('d',64));
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(mid,actor,(draft->>'id')::uuid,0,'draft','<'||mid||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('draft',draft,'expected','{}'::jsonb,'manifest',jsonb_build_array(jsonb_build_object('open',100)),'workflow','[]'::jsonb),'created');
 begin perform public.ar_document_discard(actor,jid);raise exception 'Draft discarded';exception when others then if sqlerrm<>'document_mail_pending' then raise;end if;end;
 begin perform public.ar_document_review(actor,jid,1,e,true);raise exception 'Draft review changed';exception when others then if sqlerrm<>'document_mail_pending' then raise;end if;end;
 update ar_private.mail_deliveries set state='awaiting_evidence' where id=mid;
 begin perform public.ar_document_discard(actor,jid);raise exception 'uncertain discarded';exception when others then if sqlerrm<>'document_mail_pending' then raise;end if;end;
 -- Exercise the actual confirmation RPC, with synthetic provider evidence only.
 r:=public.ar_mail_confirm_sent(actor,mid,'synthetic-transient',now());
 if r->>'state'<>'sent' or r->>'recorded'<>'true' or not exists(select 1 from public.ar_sent_events where delivery_id=mid) then raise exception 'Sent confirmation failed: %',r;end if;
 j:=public.ar_document_get(jid);if j->>'closed_reason'<>'sent' then raise exception 'Sent did not close';end if;
 insert into storage.objects(bucket_id,name,metadata) values('ar-working-files',extra_key,'{"size":100}');
 perform public.ar_document_observe_supplemental_upload(actor,extra_key,repeat('d',64));
 if not exists(select 1 from ar_private.retention_storage_receipts where storage_key=extra_key and sha256=repeat('d',64)) then raise exception 'orphan supplemental receipt missing';end if;
 if ar_private.retention_transient_eligibility(actor,'supabase',extra_key) is not null then raise exception 'supplemental fast retention applied';end if;
 insert into storage.objects(id,bucket_id,name,metadata) values(obj,'ar-working-files',key,'{"size":100}');
 r:=public.ar_retention_enroll(actor,'supabase',obj::text,7200);rid:=(r->>'id')::uuid;
 if r->>'state'<>'waiting' or (r->>'dueAt')::timestamptz>clock_timestamp() then raise exception 'transient not promptly eligible: %',r;end if;
 -- A second live job referencing the same bytes prevents deletion.
 legacy:=public.ar_document_create_v3(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');
 if legacy->>'lifecycle'<>'legacy' then raise exception 'old deployed v3 lifecycle changed';end if;
 r:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');if r->>'id' is distinct from legacy->>'id' or r->>'lifecycle'<>'legacy' then raise exception 'legacy active dedup changed';end if;
 if current_setting('ar.document_lifecycle',true)='transient' then raise exception 'lifecycle context leaked';end if;
 update public.ar_document_jobs set exports=e where id=(legacy->>'id')::uuid;
 r:=public.ar_retention_get(actor,rid,7200);if r->>'state'<>'blocked' then raise exception 'shared live reference not protected';end if;
 update public.ar_document_jobs set exports='[]' where id=(legacy->>'id')::uuid;
 r:=public.ar_retention_claim(actor,rid,claim,7200,1,60);
 if r->>'mode'<>'delete' then raise exception 'claim failed: %',r;end if;
 r:=public.ar_retention_arm(actor,rid,claim,7200);if r->>'proceed'<>'true' then raise exception 'arm failed';end if;
 begin perform public.ar_document_review(actor,jid,1,e,true);raise exception 'closed review accepted';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 -- Hosted Storage forbids direct SQL deletion. Never disable that protection.
 if current_setting('ar.tests.hosted',true)='true' then
  r:=public.ar_retention_observe(actor,rid,claim,'absent',7200);if r->>'state'<>'uncertain' then raise exception 'existing object treated as absent';end if;
  r:=public.ar_retention_observe(actor,rid,claim,'present',7200);if r->>'state'<>'waiting' then raise exception 'present object did not reconcile';end if;
 else
  -- Local provider stub only: simulate absence to test its immutable tombstone.
  delete from storage.objects where id=obj;
  r:=public.ar_retention_observe(actor,rid,claim,'absent',7200);if r->>'state'<>'deleted' then raise exception 'absence not recorded';end if;
 end if;
 if not exists(select 1 from ar_private.document_revisions where job_id=jid) or not exists(select 1 from ar_private.mail_deliveries where id=mid and state='sent') then raise exception 'history removed';end if;
 begin perform public.ar_document_discard(actor,(legacy->>'id')::uuid);raise exception 'legacy discarded';exception when others then if sqlerrm<>'document_lifecycle_invalid' then raise;end if;end;
 if ar_private.retention_transient_eligibility(actor,'supabase','jobs/'||(legacy->>'id')||'/originals/'||gen_random_uuid()||'.pdf') is not null then raise exception 'legacy policy changed';end if;
 -- A fresh closed-by-user preparation also gets immediate cleanup eligibility.
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','separate','billing','native');jid:=(j->>'id')::uuid;
 select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_fail_file(jid,fid,'synthetic_unavailable',true);
 j:=public.ar_document_discard(actor,jid);r:=public.ar_document_discard(actor,jid);
 if j->>'closed_reason'<>'discarded' or r->>'closed_at' is distinct from j->>'closed_at' then raise exception 'discard not idempotent';end if;
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','separate','billing','native');if j->>'id'=jid::text then raise exception 'closed uncertain job reused';end if;
 if has_function_privilege('authenticated','public.ar_document_review(uuid,uuid,integer,jsonb,boolean)','execute') then raise exception 'client RPC privilege';end if;
end$$;
rollback;
select 'Transient lifecycle, review receipts/replay, owner, Draft/uncertain fences, Sent/discard, shared refs and provider-observation guards passed; rolled back' as result;
