-- Executed inside one private psql transaction. Payload bytes/SHA are supplied
-- by the actual Worker contract test, not a separately invented expected MIME.
create function pg_temp.combined_seed(p_sha jsonb,p_bytes integer) returns jsonb language plpgsql as $$
declare actor uuid; scope text:='SYNTHETIC-HTTP-'||gen_random_uuid();h text;j jsonb;d jsonb;fid uuid;k text;members jsonb:='[]';r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 foreach h in array array['KAT','TSK'] loop
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values(h,scope,h||' Synthetic Agent','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values(h,scope,'SAME-INVOICE','101','201',current_date,100,100,'verified','standalone',false,now());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30 where hotel=h and account_id=scope;
 insert into public.ar_account_settings(hotel,account_id,billing_recipients) values(h,scope,jsonb_build_object('to',jsonb_build_array(lower(h)||'.ordinary@example.invalid'),'cc','[]'::jsonb,'bcc','[]'::jsonb));
 j:=public.ar_document_create_v4(actor,gen_random_uuid(),h,scope,array['SAME-INVOICE'],'invoices',case when h='KAT' then 'combined' else 'separate' end,'billing','native');
 if j?'error' then raise exception 'Synthetic create failed %',j;end if;
 select id into fid from public.ar_document_files where job_id=(j->>'id')::uuid;
 perform public.ar_document_claim_file((j->>'id')::uuid,fid);
 perform public.ar_document_finish_file((j->>'id')::uuid,fid,'jobs/'||(j->>'id')||'/originals/'||fid||'.pdf',p_bytes,p_sha->>h);
 k:='jobs/'||(j->>'id')||'/exports/'||gen_random_uuid()||'.pdf';
 perform public.ar_document_begin_upload(actor,(j->>'id')::uuid,k,p_bytes,p_sha->>h);
 perform public.ar_document_register_upload((j->>'id')::uuid,k,p_bytes,p_sha->>h,'application/pdf');
 r:=public.ar_document_review(actor,(j->>'id')::uuid,0,jsonb_build_array(jsonb_build_object('name',h||'-reviewed.pdf','storage_key',k,'byte_count',p_bytes,'sha256',p_sha->>h)),true);
 if r?'error' then raise exception 'Synthetic review failed %',r;end if;
 d:=public.ar_email_open(actor,(j->>'id')::uuid,1);if d?'error' then raise exception 'Synthetic open failed %',d;end if;
 members:=members||jsonb_build_array(jsonb_build_object('memberId',gen_random_uuid(),'documentJobId',j->>'id','documentRevision',1,'draftId',d->>'id','draftRevision',d->'revision','stage',null,'policyVersion',null));
 end loop;
 return jsonb_build_object('actor',actor,'scope',scope,'members',members);
end$$;
create function pg_temp.combined_failure() returns trigger language plpgsql as $$begin
 if new.hotel='TSK' and current_setting('ar.synthetic_http_failure',true)='on' then raise exception 'synthetic_confirmation_failure';end if;return new;
end$$;
create trigger synthetic_http_confirmation_failure before insert on ar_private.combined_sent_scopes for each row execute function pg_temp.combined_failure();
