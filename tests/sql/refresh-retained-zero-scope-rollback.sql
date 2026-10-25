-- Synthetic only. Runs the actual RPC and its actual SELECT plan, then rolls back.
-- Catches retention-reference work accidentally repeated for every zero invoice.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-REFRESH-SCOPE-'||gen_random_uuid();job uuid:=gen_random_uuid();archive uuid:=gen_random_uuid();deleted_archive uuid:=gen_random_uuid();wrong_archive uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();r jsonb;r2 jsonb;body text;plan jsonb;max_scans integer;storage_key text:='synthetic/refresh/'||job;drive_key text:='synthetic/refresh/'||archive;deleted_key text:='synthetic/refresh/'||deleted_archive;wrong_key text:='synthetic/refresh/'||wrong_archive;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'Synthetic confirmed actor prerequisite missing';end if;
 select id into other_actor from auth.users where id<>actor limit 1;
 if other_actor is null then raise exception 'Second synthetic actor prerequisite missing';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 values('KAT',scope,'Synthetic refresh scope','SYNTHETIC',501,0,501,'verified'),('TSK',scope,'Synthetic other hotel','SYNTHETIC',0,0,0,'verified'),('KAT',scope||'-other','Synthetic other account','SYNTHETIC',0,0,0,'verified');
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,'A'||lpad(n::text,5,'0'),n::text,current_date,0,0,'cleared','standalone',false,now() from generate_series(1,2100)n;
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,'B'||lpad(n::text,5,'0'),(n+3000)::text,current_date,1,case when n=501 then -5 else 1 end,'verified','standalone',false,now() from generate_series(1,501)n;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,id,current_date,0,0,'cleared','standalone',false,now() from unnest(array['Z-STORAGE','Z-SHARED','Z-DRIVE','Z-DELETED','Z-OWNER','Z-ABSENT','Z-CROSSHOTEL','Z-CROSSACCOUNT'])id;
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,exports,acknowledged)
 values(job,actor,gen_random_uuid(),'KAT',scope,'Synthetic retained references',array['Z-STORAGE','Z-SHARED','Z-STORAGE'],'invoices','combined','billing',job::text,'[{"id":"synthetic"}]',100,'ready',jsonb_build_array(jsonb_build_object('storage_key',storage_key),jsonb_build_object('storage_key',storage_key)),true);
 insert into storage.objects(id,bucket_id,name,metadata) values(gen_random_uuid(),'ar-working-files',storage_key,'{"size":100}');
 -- Drive bytes retain their exact reference only when verified, same owner, not deleted.
 insert into ar_private.drive_archives(id,owner,kind,document_job_id,document_revision,target_revision,folder_id)
 values(archive,actor,'job',job,1,1,'synthetic-folder'),(deleted_archive,actor,'job',job,1,2,'synthetic-folder'),(wrong_archive,other_actor,'job',job,1,3,'synthetic-folder');
 insert into ar_private.drive_archive_files(archive_id,ordinal,name,storage_key,byte_count,sha256,drive_file_id,state)
 values(archive,0,'Synthetic.pdf',drive_key,100,repeat('a',64),'synthetic_refresh_verified','verified'),(deleted_archive,0,'Synthetic.pdf',deleted_key,100,repeat('a',64),'synthetic_refresh_deleted','verified'),(wrong_archive,0,'Synthetic.pdf',wrong_key,100,repeat('a',64),'synthetic_refresh_wrong_owner','verified');
 insert into ar_private.retention_items(owner,store,object_id,target,storage_key,reference_fingerprint,links,minimum_eligible_at,state,deleted_at)
 values(actor,'drive','synthetic_refresh_deleted','{}',deleted_key,'synthetic','[]',now(),'deleted',now());
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,exports,acknowledged)
 select gen_random_uuid(),actor,gen_random_uuid(),hotel,account_id,'Synthetic reference',array[invoice_id],'invoices','combined','billing',gen_random_uuid()::text,'[{"id":"synthetic"}]',100,'ready',jsonb_build_array(jsonb_build_object('storage_key',key)),true
 from(values('KAT',scope,'Z-DRIVE',drive_key),('KAT',scope,'Z-DELETED',deleted_key),('KAT',scope,'Z-OWNER',wrong_key),('KAT',scope,'Z-ABSENT','synthetic/absent'),('TSK',scope,'Z-CROSSHOTEL',storage_key),('KAT',scope||'-other','Z-CROSSACCOUNT',storage_key))v(hotel,account_id,invoice_id,key);
 -- Unrelated retained work must be visited once per account, not 2,100 times.
 insert into public.ar_document_jobs(id,owner,command_key,hotel,account_id,account_name,invoice_ids,content,layout,purpose,fingerprint,manifest,balance_snapshot,state,exports,acknowledged)
 select gen_random_uuid(),actor,gen_random_uuid(),'KAT',scope,'Synthetic unrelated work',array['not-an-invoice'],'invoices','combined','billing',gen_random_uuid()::text,'[{"id":"synthetic"}]',100,'ready',jsonb_build_array(jsonb_build_object('storage_key','synthetic/unrelated/'||n)),true from generate_series(1,600)n;
 r:=public.ar_refresh_previous_invoices('KAT',scope,0);r2:=public.ar_refresh_previous_invoices('KAT',scope,500);
 if jsonb_array_length(r)<>500 or r->0->>'id'<>'B00001' or r->499->>'id'<>'B00500' then raise exception 'First page lost ordering/coverage';end if;
 if r->0<>'{"id":"B00001","invoice_no":"3001","open":1}'::jsonb or r2->0<>'{"id":"B00501","invoice_no":"3501","open":-5}'::jsonb or r2->1<>'{"id":"Z-DRIVE","invoice_no":null,"open":0}'::jsonb then raise exception 'Exact RPC projection or financial values changed';end if;
 if (select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(r2)x) is distinct from array['B00501','Z-DRIVE','Z-SHARED','Z-STORAGE'] then raise exception 'Retention scope/Drive evidence/pagination changed: %',r2;end if;
 if (r2->0->>'open')::numeric<>-5 or public.ar_refresh_previous_invoices('KAT',scope,1000)<>'[]'::jsonb then raise exception 'Negative balance or final page changed';end if;
 if public.ar_refresh_previous_invoices('TSK',scope)<>'[]'::jsonb or public.ar_refresh_previous_invoices('KAT',scope||'-unknown')<>'[]'::jsonb then raise exception 'Account/hotel scope leaked';end if;
 begin perform public.ar_refresh_previous_invoices('KAT',scope,-1);raise exception 'Negative offset accepted';exception when others then if sqlerrm<>'refresh_scope_invalid' then raise;end if;end;
 if has_function_privilege('anon','public.ar_refresh_previous_invoices(text,text,integer)','execute') or has_function_privilege('authenticated','public.ar_refresh_previous_invoices(text,text,integer)','execute') or not has_function_privilege('service_role','public.ar_refresh_previous_invoices(text,text,integer)','execute') then raise exception 'Refresh privilege boundary changed';end if;
 -- Explain the SELECT taken from the installed RPC, not a duplicate test query.
 select prosrc into body from pg_proc where oid='public.ar_refresh_previous_invoices(text,text,integer)'::regprocedure;
 body:=split_part(regexp_replace(body,'^.*?end if;','','s'),';return result;',1);
 body:=replace(replace(replace(replace(body,'into result',''),'p_hotel',quote_literal('KAT')),'p_account_id',quote_literal(scope)),'p_offset','0');
 execute 'explain(analyze,buffers,format json) '||body into plan;
 with recursive nodes(node) as(select plan->0->'Plan' union all select child from nodes cross join lateral jsonb_array_elements(coalesce(node->'Plans','[]'::jsonb))child)
 select max((node->>'Actual Loops')::integer) into max_scans from nodes where node->>'Relation Name'='ar_document_jobs';
 if max_scans>1 then raise exception 'Retention document scans repeated per invoice: % loops',max_scans;end if;
 raise notice 'Retained-zero scope passed; maximum document scan loops %, query execution % ms',max_scans,plan->0->>'Execution Time';
end$$;
select 'Retained-zero scope, Drive evidence, pagination, privileges and bounded reference scans passed; rolling back' as result;
rollback;
