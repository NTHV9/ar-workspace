begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-ABANDON-'||gen_random_uuid();j jsonb;jid uuid;fid uuid;r jsonb;key text;object_id uuid:=gen_random_uuid();idle_id uuid;uncertain_id uuid;uncertain_file uuid;draft jsonb;mid uuid:=gen_random_uuid();protected_id uuid;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic abandon','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');jid:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=jid;
 r:=public.ar_document_abandon(actor,jid);if r->>'outcome'<>'pending' or r->'job'->>'discard_requested_at' is null or r->'job'->>'closed_at' is not null then raise exception 'running request lost or closed early';end if;
 begin perform public.ar_document_review(actor,jid,0,'[]',true);raise exception 'new review after departure';exception when others then if sqlerrm<>'document_discard_pending' then raise;end if;end;
 begin perform public.ar_document_begin_upload(actor,jid,'jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf',100,repeat('a',64));raise exception 'new upload after departure';exception when others then if sqlerrm<>'document_discard_pending' then raise;end if;end;
 if public.ar_email_open(actor,jid,0)->>'error'<>'document_discard_pending' then raise exception 'new mail after departure';end if;
 if public.ar_document_abandon(actor,jid)->'job'->>'discard_requested_at' is distinct from r->'job'->>'discard_requested_at' then raise exception 'request not idempotent';end if;
 begin perform public.ar_document_abandon(gen_random_uuid(),jid);raise exception 'owner bypass';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 perform public.ar_document_claim_file(jid,fid);key:='jobs/'||jid||'/originals/'||fid||'.pdf';perform public.ar_document_finish_file(jid,fid,key,100,repeat('a',64));
 insert into storage.objects(id,bucket_id,name,metadata) values(object_id,'ar-working-files',key,'{"size":100}');
 r:=public.ar_document_finalize_abandoned(actor,10);if r->0->>'outcome'<>'discarded' then raise exception 'settled request not closed';end if;
 if public.ar_document_abandon(actor,jid)->>'outcome'<>'discarded' then raise exception 'closed abandon not replayable';end if;
 r:=public.ar_document_cleanup_job_candidates(actor,jid,10);if jsonb_array_length(r)<>1 or r->0->>'objectId'<>object_id::text then raise exception 'exact candidates missing';end if;
 if exists(select 1 from jsonb_array_elements(public.ar_operations_queue(actor,'document',0)->'rows') e where e->>'job_id'=jid::text) then raise exception 'closed job still pending';end if;
 -- Unmarked ready preparations survive scheduled retries regardless of age.
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');idle_id:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=idle_id;perform public.ar_document_claim_file(idle_id,fid);perform public.ar_document_finish_file(idle_id,fid,'jobs/'||idle_id||'/originals/'||fid||'.pdf',100,repeat('a',64));update public.ar_document_jobs set created_at=now()-interval '2 days' where id=idle_id;
 perform public.ar_document_finalize_abandoned(actor,10);if exists(select 1 from public.ar_document_jobs where id=idle_id and closed_at is not null) then raise exception 'idle age purge';end if;
 begin perform public.ar_document_cleanup_job_candidates(actor,idle_id,10);raise exception 'open cleanup allowed';exception when others then if sqlerrm<>'document_forbidden' then raise;end if;end;
 -- Upload intent preserves unknown provider outcome until a receipt is registered.
 key:='jobs/'||idle_id||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,idle_id,key,100,repeat('b',64));r:=public.ar_document_abandon(actor,idle_id);if r->>'reason'<>'document_upload_pending' then raise exception 'upload fence omitted';end if;
 perform public.ar_document_finalize_abandoned(actor,10);if exists(select 1 from public.ar_document_jobs where id=idle_id and closed_at is not null) then raise exception 'unknown upload closed';end if;
 perform public.ar_document_cancel_undispatched_upload(actor,idle_id,key,repeat('b',64));perform public.ar_document_finalize_abandoned(actor,10);
 -- Uncertain generation is retained until exact completion, not a timeout.
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');uncertain_id:=(j->>'id')::uuid;select id into uncertain_file from public.ar_document_files where job_id=uncertain_id;perform public.ar_document_claim_file(uncertain_id,uncertain_file);perform public.ar_document_fail_file(uncertain_id,uncertain_file,'synthetic_unknown',true);r:=public.ar_document_abandon(actor,uncertain_id);if r->>'outcome'<>'pending' then raise exception 'uncertain generation closed';end if;
 perform public.ar_document_finalize_abandoned(actor,10);if exists(select 1 from public.ar_document_jobs where id=uncertain_id and closed_at is not null) then raise exception 'uncertain generation finalized';end if;
 perform public.ar_document_finish_file(uncertain_id,uncertain_file,'jobs/'||uncertain_id||'/originals/'||uncertain_file||'.pdf',100,repeat('a',64));perform public.ar_document_finalize_abandoned(actor,10);
 -- A Gmail Draft / unknown send never creates an automatic abandon marker.
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');protected_id:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=protected_id;perform public.ar_document_claim_file(protected_id,fid);perform public.ar_document_finish_file(protected_id,fid,'jobs/'||protected_id||'/originals/'||fid||'.pdf',100,repeat('a',64));
 key:='jobs/'||protected_id||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,protected_id,key,100,repeat('b',64));perform public.ar_document_register_upload(protected_id,key,100,repeat('b',64),'application/pdf');perform public.ar_document_review(actor,protected_id,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64))),true);
 draft:=public.ar_email_open(actor,protected_id,1);if draft?'error' then raise exception 'synthetic draft failed %',draft;end if;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(mid,actor,(draft->>'id')::uuid,0,'draft','<'||mid||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('draft',draft,'expected','{}'::jsonb,'manifest',jsonb_build_array(jsonb_build_object('open',100)),'workflow','[]'::jsonb),'created');
 r:=public.ar_document_abandon(actor,protected_id);if r->>'outcome'<>'protected' or r->'job'->>'discard_requested_at' is not null then raise exception 'Draft not protected';end if;
 update ar_private.mail_deliveries set state='awaiting_evidence' where id=mid;r:=public.ar_document_abandon(actor,protected_id);if r->>'outcome'<>'protected' then raise exception 'unknown send not protected';end if;
end$$;
rollback;
