begin;
do $$
declare test_actor uuid:=ar_private.access_owner();command uuid:=gen_random_uuid();scope text:='SYNTHETIC-COMMAND-PROTECTED-'||gen_random_uuid();j jsonb;jid uuid;fid uuid;r jsonb;draft jsonb;mid uuid:=gen_random_uuid();key text;digest text;
begin
 perform set_config('ar.document_lifecycle','transient',true);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic protected command','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v5(test_actor,command,'KAT',scope,array['A'],'statement','combined','billing','workspace');jid:=(j->>'id')::uuid;select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_claim_file(jid,fid);perform public.ar_document_finish_file(jid,fid,'jobs/'||jid||'/originals/'||fid||'.pdf',100,repeat('a',64));
 key:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(test_actor,jid,key,100,repeat('b',64));perform public.ar_document_register_upload(jid,key,100,repeat('b',64),'application/pdf');perform public.ar_document_review(test_actor,jid,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',key,'byte_count',100,'sha256',repeat('b',64))),true);
 draft:=public.ar_email_open(test_actor,jid,1);if draft?'error' then raise exception 'synthetic draft failed';end if;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(mid,test_actor,(draft->>'id')::uuid,0,'draft','<'||mid||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('draft',draft,'expected','{"mailbox":"phuket","sender":"ar@katathani.com"}'::jsonb,'manifest',jsonb_build_array(jsonb_build_object('open',100)),'workflow','[]'::jsonb),'created');
 digest:=ar_private.document_request_digest('KAT',scope,array['A'],'statement','combined','billing','workspace');
 r:=public.ar_document_command_abandon(test_actor,test_actor,command,'KAT',digest);if r->>'job_id'<>jid::text then raise exception 'command resolved wrong job';end if;
 r:=public.ar_document_abandon(test_actor,jid);if r->>'outcome'<>'protected' then raise exception 'protected command was discarded';end if;
 if not exists(select 1 from ar_private.document_command_exits where owner=test_actor and command_key=command and settled_at is not null) then raise exception 'protected receipt not durably settled';end if;
 -- Later provider resolution cannot resurrect this terminal close into auto-discard.
 update ar_private.mail_deliveries set state='sent' where id=mid;
 perform public.ar_document_finalize_abandoned(test_actor,25);
 if exists(select 1 from public.ar_document_jobs where id=jid and (closed_reason is distinct from 'sent' or discard_requested_at is not null)) then raise exception 'protected receipt became future automatic discard';end if;
end$$;
rollback;
