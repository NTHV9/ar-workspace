begin;
do $$
declare actor uuid;scenario uuid:=gen_random_uuid();before_count bigint;r jsonb;f text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select count(*) into before_count from public.ar_accounts;
 if has_schema_privilege('authenticated','ar_acceptance_20260911','usage') or has_schema_privilege('service_role','ar_acceptance_private_20260911','usage') then raise exception 'acceptance namespace exposed';end if;
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_class ref on ref.oid=c.confrelid join pg_namespace rn on rn.oid=ref.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and rn.nspname in('public','ar_private')) then raise exception 'acceptance FK escaped isolation';end if;
 if exists(select 1 from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and pg_get_expr(d.adbin,d.adrelid)~'(^|[^a-z_])(public|ar_private)[.]') then raise exception 'acceptance default escaped isolation';end if;
 insert into ar_private.acceptance_sessions(id,owner,state,source_sha) values(scenario,actor,'active','synthetic-schema-proof');
 insert into ar_acceptance_private_20260911.collection_policy_versions select * from ar_private.collection_policy_versions;
 insert into ar_acceptance_private_20260911.collection_policy_head select * from ar_private.collection_policy_head;
 insert into ar_acceptance_private_20260911.collection_stage_keys select * from ar_private.collection_stage_keys;
 insert into ar_acceptance_20260911.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT','SYNTHETIC-ISOLATED','Synthetic isolated Account','SYNTHETIC',6000,0,3,'verified');
 insert into ar_acceptance_20260911.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) select 'KAT','SYNTHETIC-ISOLATED',v,current_date-20,1000,1000,'verified','standalone',false,clock_timestamp() from unnest(array['A','B','C'])v;
 if (select count(*) from ar_acceptance_20260911.ar_invoice_workflow)<>3 or exists(select 1 from public.ar_invoice_workflow where account_id='SYNTHETIC-ISOLATED') or (select count(*) from public.ar_accounts)<>before_count then raise exception 'synthetic data escaped isolated triggers';end if;
 r:=public.ar_acceptance_rpc(actor,scenario,'ar_collection_policy_get',jsonb_build_object('p_actor',actor));if r is null or r?'error' then raise exception 'typed gateway read failed: %',r;end if;
 r:=public.ar_acceptance_rpc(actor,scenario,'ar_invoice_exception_get',jsonb_build_object('p_actor',gen_random_uuid()));if r->>'error'<>'acceptance_forbidden' then raise exception 'gateway owner argument';end if;
 if public.ar_acceptance_context(gen_random_uuid(),scenario)->>'error'<>'acceptance_forbidden' then raise exception 'scenario owner gate';end if;
 if has_function_privilege('authenticated','public.ar_acceptance_rpc(uuid,uuid,text,jsonb)','execute') then raise exception 'gateway direct client access';end if;
end$$;
rollback;
select 'Isolated definitions, FK/default fences, private gateway, three Invoice triggers and no real Account changes passed; rolled back' as result;
