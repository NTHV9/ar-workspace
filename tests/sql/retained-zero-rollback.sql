begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-ZERO-'||gen_random_uuid();job uuid:=gen_random_uuid();file uuid:=gen_random_uuid();object_id uuid:=gen_random_uuid();run uuid:=gen_random_uuid();r jsonb;key text;payload jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic retained zero','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'Z','100','200',current_date-40,100,0,'cleared','standalone',false,now()),('KAT',scope,'U','101','201',current_date-40,100,0,'cleared','standalone',false,now()),('KAT',scope,'O','102','202',current_date-10,100,100,'verified','standalone',false,now());
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,acknowledged) values(job,actor,gen_random_uuid(),'KAT',scope,'Synthetic retained zero',array['Z'],'invoices','combined','billing',job::text,'[{"id":"Z"}]',100,'ready',true);
 key:='jobs/'||job||'/originals/'||file||'.pdf';
 insert into public.ar_document_files(id,job_id,ordinal,kind,invoice_id,state,storage_key,byte_count,sha256) values(file,job,1,'invoice','Z','ready',key,100,repeat('a',64));
 insert into storage.objects(id,bucket_id,name,metadata) values(object_id,'ar-working-files',key,'{"size":100}');
 r:=public.ar_refresh_previous_invoices('KAT',scope);
 if jsonb_array_length(r)<>2 or not exists(select 1 from jsonb_array_elements(r)x where x->>'id'='Z') or exists(select 1 from jsonb_array_elements(r)x where x->>'id'='U') then raise exception 'tracked zero scope incorrect: %',r;end if;
 insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(run,'KAT',scope,'manual','running',clock_timestamp(),clock_timestamp()+interval '5 minutes');
 payload:=jsonb_build_object('account',jsonb_build_object('hotel','KAT','id',scope,'name','Synthetic retained zero','type','SYNTHETIC','account_no','SYN','open',100,'over90',0,'items',1,'currency','THB','creditLimit',null,'oldest',10,'agingBuckets','[]'::jsonb,'business_date',current_date), 'invoices',jsonb_build_array(jsonb_build_object('hotel','KAT','account_id',scope,'id','O','guest','Synthetic','invoice_no','102','folio_no','202','transaction_date',current_date-10,'original',100,'open',100,'aging','Up to 30','age',10,'current_amount',100,'applied_amount',0,'collection_role','standalone','compressed',false)), 'unconfirmedInvoiceIds',jsonb_build_array('Z'));
 perform public.ar_stage_account(run,payload);perform public.ar_publish_refresh(run,1);
 if not exists(select 1 from public.ar_invoices where hotel='KAT' and account_id=scope and id='Z' and open=0 and verification_state='missing') then raise exception 'unconfirmed old zero left current';end if;
 update public.ar_invoices set verification_state='cleared',synced_at=clock_timestamp() where hotel='KAT' and account_id=scope and id='Z';
 perform public.ar_publish_refresh(run,1);
 if not exists(select 1 from public.ar_invoices where hotel='KAT' and account_id=scope and id='Z' and verification_state='cleared') then raise exception 'old replay invalidated later verification';end if;
 if has_function_privilege('authenticated','public.ar_refresh_previous_invoices(text,text,integer)','execute') then raise exception 'private tracking exposed';end if;
end$$;
rollback;
select 'Tracked zero scope, explicit unknown publication and late replay protection passed; rolled back' as result;
