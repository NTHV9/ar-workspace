begin;
do $$
declare actor uuid; scope text:='SYNTHETIC-WORKSPACE-'||gen_random_uuid(); j jsonb; r jsonb; delivery uuid:=gen_random_uuid();
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 values('KAT',scope,'Synthetic account evidence','SYNTHETIC',100,0,1,'verified'),('TSK',scope,'Synthetic other hotel','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'A','Synthetic guest','INV-A','FOL-A',current_date,100,100,'verified','standalone',false,now());
 j:=public.ar_document_create_v2(actor,gen_random_uuid(),'KAT',scope,array['A'],'statement','combined','billing','workspace');
 insert into public.ar_email_drafts(owner,document_job_id,document_revision,hotel,account_id,account_name,invoice_ids,purpose,recipients,exports,subject)
 values(actor,(j->>'id')::uuid,0,'KAT',scope,'Synthetic account evidence',array['A'],'billing','{"to":[],"cc":[],"bcc":[]}','[]','Older draft'),
 (actor,(j->>'id')::uuid,1,'KAT',scope,'Synthetic account evidence',array['A'],'billing','{"to":[],"cc":[],"bcc":[]}','[]','Newer draft');
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'documents');
 if r->>'total'<>'1' or r->'rows'->0->>'subject'<>'Newer draft' then raise exception 'document revision duplicated or stale'; end if;
 insert into ar_private.invoice_workflow_history(hotel,account_id,invoice_id,revision,actor,details)
 values('KAT',scope,'A',999,actor,'{"first_billing_date":"2026-08-01","last_reminder_stage":"Follow 1","last_reminder_date":"2026-09-01"}');
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,sent_at)
 values(delivery,actor,'send','<'||delivery||'@example.test>','{"draft":{"subject":"Immutable synthetic message","body":"Evidence only","recipients":{"to":["recipient@example.test"],"cc":[],"bcc":[]}}}','sent',now());
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,sent_at,gmail_id,open_at_send)
 values(delivery,actor,'KAT',scope,array['A'],'billing',now(),'synthetic-'||delivery,100);
 r:=public.ar_account_workspace_read(actor,'KAT',scope,'history');
 if r->>'total'<>'2' or not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'source'='Verified Gmail send' and x->'message'->>'subject'='Immutable synthetic message') or not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'source'='Manual history correction' and x->>'actual_date' is null and x->>'first_billing_date'='2026-08-01') then raise exception 'history provenance invalid'; end if;
 if jsonb_array_length(public.ar_account_workspace_read(actor,'KAT',scope,'history',1,1)->'rows')<>1 then raise exception 'history pagination invalid'; end if;
 if public.ar_account_workspace_read(actor,'TSK',scope,'history')->>'total'<>'0' or public.ar_account_workspace_read(actor,'TSK',scope,'documents')->>'total'<>'0' then raise exception 'cross hotel evidence'; end if;
 if public.ar_account_workspace_read(gen_random_uuid(),'KAT',scope,'history')->>'error'<>'account_workspace_forbidden' then raise exception 'actor bypass'; end if;
 if has_function_privilege('anon','public.ar_account_workspace_read(uuid,text,text,text,integer,integer)','execute') or has_function_privilege('authenticated','public.ar_account_workspace_read(uuid,text,text,text,integer,integer)','execute') then raise exception 'direct evidence access'; end if;
end $$;
rollback;
select 'Account evidence scope/provenance/pagination/permissions passed; rolled back' as result;
