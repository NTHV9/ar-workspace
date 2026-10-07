-- Synthetic rows only, fully rolled back. Never invokes a provider.
begin;
do $$
declare actor uuid;jid uuid:=gen_random_uuid();did uuid:=gen_random_uuid();r jsonb;before_d jsonb;before_j jsonb;names jsonb;bad jsonb;state_name text;events bigint;claim uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();staff_email text;header_value text;invalid_name text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'synthetic allowed owner required';end if;
 perform set_config('ar.document_lifecycle','transient',true);
 select count(*) into events from public.ar_sent_events;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,revision,exports,acknowledged,lifecycle)
 values(jid,actor,gen_random_uuid(),'KAT','SYNTHETIC-NAMES-'||jid,'Synthetic filename account',array['SYNTHETIC-NAMES-INVOICE'],'invoices','separate','billing',jid::text,'[{"id":"SYNTHETIC-NAMES-INVOICE"}]',100,'ready',1,'[{"name":"Original.pdf","storage_key":"synthetic/first","byte_count":100,"sha256":"synthetic-sha","extra":"keep"},{"name":"Invoice123..45.pdf","storage_key":"synthetic/second","byte_count":200,"sha256":"synthetic-sha2"}]',true,'transient');
 insert into public.ar_email_drafts(id,owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,subject,body,exports)
 select did,owner,id,revision,hotel,account_id,account_name,invoice_ids,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Synthetic body',exports from public.ar_document_jobs where id=jid;
 select to_jsonb(d) into before_d from public.ar_email_drafts d where id=did;
 select to_jsonb(j) into before_j from public.ar_document_jobs j where id=jid;
 staff_email:='synthetic.filename.'||staff_id||'@example.invalid';
 perform public.ar_access_save(actor,gen_random_uuid(),staff_email,array['khao-lak'],true,0);
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(staff_id,staff_email,now(),false);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 foreach header_value in array array[gen_random_uuid()::text,'malformed',staff_id::text] loop
  perform set_config('request.headers',jsonb_build_object('x-ar-actor',header_value)::text,true);
  r:=public.ar_email_save_v3(actor,did,0,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,null);
  if r->>'error'<>'email_forbidden' then raise exception 'supplied invalid or cross-region staff header allowed';end if;
 end loop;
 update ar_private.access_members set active=false where email=staff_email;
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',staff_id)::text,true);
 r:=public.ar_email_save_v3(actor,did,0,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,null);
 if r->>'error'<>'email_forbidden' then raise exception 'inactive header allowed';end if;
 update ar_private.access_members set active=true,setup_state='creating' where email=staff_email;
 r:=public.ar_email_save_v3(actor,did,0,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,null);
 if r->>'error'<>'email_forbidden' then raise exception 'unready header allowed';end if;
 perform set_config('request.headers','{}',true);
 r:=public.ar_email_save_v3(actor,did,0,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Synthetic body',null,null,null);
 if r?'error' or r->>'revision'<>'0' then raise exception 'headerless service save denied';end if;
 update ar_private.access_members set active=true,setup_state='ready',regions=array['phuket'] where email=staff_email;
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',staff_id)::text,true);
 foreach invalid_name in array array['../bad.pdf','a.pdf.pdf','CON.pdf','trailing .pdf','a'||chr(10)||'.pdf',repeat('a',197)||'.pdf',repeat(U&'\+01f600',99)||'.pdf',U&'\feff'||'name.pdf'] loop
  if ar_private.email_pdf_filename(invalid_name) is not null then raise exception 'invalid direct SQL filename allowed';end if;
 end loop;
 if ar_private.email_pdf_filename('ใหม่')<>'ใหม่.pdf' then raise exception 'SQL extension normalization failed';end if;
 names:='[{"storageKey":"synthetic/second","name":"Invoice123..45.pdf"},{"storageKey":"synthetic/first","name":"ใบแจ้งหนี้.pdf"}]';
 r:=public.ar_email_save_v3(actor,did,0,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Synthetic body',null,null,names);
 if r?'error' or r->>'revision'<>'1' or r->'exports'->0->>'name'<>'ใบแจ้งหนี้.pdf' then raise exception 'rename failed %',r;end if;
 perform set_config('request.headers','{}',true);
 if (select to_jsonb(j) from public.ar_document_jobs j where id=jid) is distinct from before_j then raise exception 'job package changed';end if;
 if (select to_jsonb(d)-array['exports','revision','updated_at'] from public.ar_email_drafts d where id=did) is distinct from before_d-array['exports','revision','updated_at'] then raise exception 'rename mutated message';end if;
 if (select jsonb_agg(value-'name' order by ord) from jsonb_array_elements(r->'exports') with ordinality x(value,ord)) is distinct from (select jsonb_agg(value-'name' order by ord) from jsonb_array_elements(before_d->'exports') with ordinality x(value,ord)) then raise exception 'bytes metadata or order changed';end if;
 r:=public.ar_email_save_v3(actor,did,1,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Synthetic body',null,null,names);
 if r->>'revision'<>'1' then raise exception 'no-op increment';end if;
 names:=jsonb_set(names,'{1,name}','"Second.pdf"');
 r:=public.ar_email_save_v3(actor,did,1,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Changed body',null,null,names);
 if r->>'revision'<>'2' or r->>'body'<>'Changed body' then raise exception 'body plus rename increment';end if;
 if public.ar_email_get(actor,did)->'exports' is distinct from r->'exports' then raise exception 'reopen name lost';end if;
 r:=public.ar_email_save_v3(actor,did,1,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
 if r->>'error'<>'email_revision_conflict' then raise exception 'stale accepted';end if;
 r:=public.ar_email_save_v3(gen_random_uuid(),did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
 if r->>'error'<>'email_forbidden' then raise exception 'actor accepted';end if;
 foreach bad in array array['[]'::jsonb,'[{"storageKey":"foreign","name":"a.pdf"},{"storageKey":"synthetic/second","name":"b.pdf"}]'::jsonb,'[{"storageKey":"synthetic/first","name":"a.pdf"},{"storageKey":"synthetic/first","name":"b.pdf"}]'::jsonb,'[{"storageKey":"synthetic/first","name":"a.pdf","sha256":"tamper"},{"storageKey":"synthetic/second","name":"b.pdf"}]'::jsonb,'[{"storageKey":"synthetic/first","name":"../bad.pdf"},{"storageKey":"synthetic/second","name":"b.pdf"}]'::jsonb,'[{"storageKey":"synthetic/first","name":"SAME.pdf"},{"storageKey":"synthetic/second","name":"same.PDF"}]'::jsonb] loop
  r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,bad);
  if r->>'error'<>'email_generated_names_invalid' then raise exception 'invalid names accepted % %',bad,r;end if;
 end loop;
 if public.ar_email_get(actor,did)->>'body'<>'Changed body' then raise exception 'invalid rename partially saved body';end if;
 names:=jsonb_set(names,'{1,name}','"Third.pdf"');
 foreach state_name in array array['creating','created','uncertain'] loop
  insert into ar_private.gmail_draft_attempts(id,draft_id,revision,message_id,state) values(claim,did,2,'<synthetic@example.test>',state_name);
  r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
  if r->>'error'<>'email_handoff_pending' then raise exception 'legacy handoff allowed %',state_name;end if;
  delete from ar_private.gmail_draft_attempts where id=claim;
 end loop;
 foreach state_name in array array['pending','created','awaiting_evidence','sent'] loop
  insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(claim,actor,did,2,'draft','<synthetic@example.test>','{}',state_name);
  r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
  if r->>'error'<>'email_handoff_pending' then raise exception 'current handoff allowed %',state_name;end if;
  delete from ar_private.mail_deliveries where id=claim;
 end loop;
 insert into ar_private.mail_deliveries(id,owner,draft_id,revision,mode,message_id,snapshot,state) values(claim,actor,did,1,'draft','<synthetic@example.test>','{}','awaiting_evidence');
 r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
 if r->>'error'<>'email_handoff_pending' then raise exception 'older unresolved handoff allowed';end if;
 delete from ar_private.mail_deliveries where id=claim;
 update public.ar_document_jobs set acknowledged=false where id=jid;
 r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
 if r->>'error'<>'email_package_changed' then raise exception 'unreviewed allowed';end if;
 update public.ar_document_jobs set acknowledged=true,closed_reason='discarded',closed_at=now() where id=jid;
 r:=public.ar_email_save_v3(actor,did,2,'billing','{"to":[],"cc":[],"bcc":[]}','Synthetic subject','Tamper',null,null,names);
 if r->>'error'<>'document_closed' then raise exception 'closed allowed';end if;
 if public.ar_email_get(actor,did)->>'body'<>'Changed body' then raise exception 'blocked save partially saved body';end if;
 if events<>(select count(*) from public.ar_sent_events) then raise exception 'business events changed';end if;
 if has_function_privilege('anon','public.ar_email_save_v3(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.ar_email_save_v3(uuid,uuid,integer,text,jsonb,text,text,jsonb,jsonb,jsonb)','execute') then raise exception 'public writer exposed';end if;
end$$;
rollback;
