begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-EMAIL-RECORDS-'||gen_random_uuid();j jsonb;jid uuid;fid uuid;d jsonb;r jsonb;k text;delivery uuid:=gen_random_uuid();discard_id uuid;discard_draft uuid;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic email records','SYNTHETIC',100,0,1,'verified'),('TSK',scope,'Synthetic other hotel','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'A','101','201',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');jid:=(j->>'id')::uuid;
 select id into fid from public.ar_document_files where job_id=jid;
 perform public.ar_document_claim_file(jid,fid);perform public.ar_document_finish_file(jid,fid,'jobs/'||jid||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||jid||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,jid,k,100,repeat('b',64));perform public.ar_document_register_upload(jid,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,jid,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 d:=public.ar_email_open(actor,jid,1);if d?'error' then raise exception 'reviewed fixture failed';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'email_records');
 if r->>'total' is distinct from '0' then raise exception 'Unsent preparation became an email backlog: %',r->>'error';end if;
 if public.ar_account_workspace_read(actor,'KAT',scope,'documents')->>'total' is distinct from '1' then raise exception 'Legacy evidence was deleted';end if;
 -- A separate explicit discard drops only unattempted working text, not the
 -- still-active job or any message that has provider/history evidence.
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),'KAT',scope,array['A'],'invoices','combined','billing','native');discard_id:=(j->>'id')::uuid;
 select id into fid from public.ar_document_files where job_id=discard_id;
 perform public.ar_document_claim_file(discard_id,fid);perform public.ar_document_finish_file(discard_id,fid,'jobs/'||discard_id||'/originals/'||fid||'.pdf',100,repeat('a',64));
 k:='jobs/'||discard_id||'/exports/'||gen_random_uuid()||'.pdf';perform public.ar_document_begin_upload(actor,discard_id,k,100,repeat('b',64));perform public.ar_document_register_upload(discard_id,k,100,repeat('b',64),'application/pdf');
 perform public.ar_document_review(actor,discard_id,0,jsonb_build_array(jsonb_build_object('name','Synthetic.pdf','storage_key',k,'byte_count',100,'sha256',repeat('b',64))),true);
 r:=public.ar_email_open(actor,discard_id,1);discard_draft:=(r->>'id')::uuid;
 update public.ar_email_drafts set subject='Discard this unsent subject',body='Discard this unsent text' where id=discard_draft;
 r:=public.ar_document_abandon(actor,discard_id);
 if r->>'outcome' is distinct from 'discarded' then raise exception 'Explicit discard did not close';end if;
 perform public.ar_document_cleanup_job_candidates(actor,discard_id,10);
 if not exists(select 1 from public.ar_email_drafts where id=discard_draft and body='' and subject='' and rich_body is null and recipients='{"to":[],"cc":[],"bcc":[]}') then raise exception 'Unsent working message retained after discard';end if;
 if exists(select 1 from public.ar_document_jobs where id=discard_id and discard_text_pending) then raise exception 'Cleanup acknowledgment not recorded';end if;
 begin update public.ar_document_jobs set closed_at=null where id=discard_id;raise exception 'Closed preparation reopened';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 begin update public.ar_document_jobs set discard_text_pending=true where id=discard_id;raise exception 'Closed cleanup flag reset';exception when others then if sqlerrm<>'document_closed' then raise;end if;end;
 begin update public.ar_email_drafts set body='Resurrected text' where id=discard_draft;raise exception 'Discarded text restored';exception when others then if sqlerrm not in('document_discard_pending','document_closed') then raise;end if;end;
 if exists(select 1 from public.ar_document_jobs where id=jid and closed_at is not null) then raise exception 'Another active preparation was discarded';end if;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state)
 values(delivery,actor,(d->>'id')::uuid,0,'draft','<'||delivery||'@ar-workspace.ar-c82.workers.dev>',jsonb_build_object('draft',d,'expected','{"mailbox":"phuket","sender":"ar@katathani.com"}'::jsonb,'manifest',jsonb_build_array(jsonb_build_object('open',100)),'workflow','[]'::jsonb),'created');
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'email_records');
 if r->>'total' is distinct from '1' or r->'rows'->0->>'delivery_mode' is distinct from 'draft' then raise exception 'Admin Draft recovery omitted';end if;
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'email_records',1,1);
 if r->>'total' is distinct from '1' or jsonb_array_length(r->'rows')<>0 then raise exception 'Filtered pagination is inconsistent';end if;
 if public.ar_account_workspace_read(actor,'TSK',scope,'email_records')->>'total' is distinct from '0' then raise exception 'Cross-hotel evidence leaked';end if;
 if public.ar_account_workspace_read(gen_random_uuid(),'KAT',scope,'email_records')->>'error' is distinct from 'account_workspace_forbidden' then raise exception 'Actor guard lost';end if;
 r:=public.ar_document_abandon(actor,jid);if r->>'outcome' is distinct from 'protected' then raise exception 'Provider Draft bytes discarded';end if;
 update ar_private.mail_deliveries set state='awaiting_evidence' where id=delivery;
 r:=public.ar_document_abandon(actor,jid);if r->>'outcome' is distinct from 'protected' then raise exception 'Unknown send bytes discarded';end if;
 if has_function_privilege('anon','public.ar_account_workspace_read(uuid,text,text,text,integer,integer)','execute') or has_function_privilege('authenticated','public.ar_account_workspace_read(uuid,text,text,text,integer,integer)','execute') then raise exception 'Read RPC privilege widened';end if;
end$$;
rollback;
