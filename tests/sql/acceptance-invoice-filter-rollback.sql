-- Synthetic gateway compatibility proof. Never connects to OPERA/providers.
begin;
do $$declare actor uuid;scenario uuid:=gen_random_uuid();budget uuid:=gen_random_uuid();scope text;r jsonb;q jsonb;bad_value jsonb;before_accounts bigint;begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select count(*) into before_accounts from public.ar_accounts;scope:='SYN-'||scenario;
 insert into ar_private.acceptance_sessions(id,owner,state,source_sha,recipient_hash,budget_id) values(scenario,actor,'prepared',repeat('a',40),repeat('b',64),budget);
 insert into ar_private.operations_budget_reservations(id,owner,resource,reserved,state,started_at)
 values(budget,actor,'acceptance_scenario','{"storedBytes":41943040,"egressBytes":83886080,"databaseBytes":25165824}','started',clock_timestamp());
 perform ar_private.acceptance_admin_provision(actor,scenario);
 update ar_private.acceptance_sessions set state='active' where id=scenario;
 insert into ar_acceptance_private_20260911.collection_policy_versions select * from ar_private.collection_policy_versions;
 insert into ar_acceptance_private_20260911.collection_policy_head select * from ar_private.collection_policy_head;
 insert into ar_acceptance_private_20260911.collection_stage_keys select * from ar_private.collection_stage_keys;
 insert into ar_acceptance_20260911.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic invoice reader','SYNTHETIC',375,0,5,'verified');
 insert into ar_acceptance_20260911.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 select 'KAT',scope,v.id,current_date,1000,v.balance,'verified',v.role,v.role='parent',case when v.role='child' then 'B' end,case when v.role='child' then 'B' end,case when v.role='child' then 200 end,clock_timestamp()
 from(values('A',100,'standalone'),('B',200,'parent'),('C',100,'child'),('D',-25,'standalone'),('E',0,'standalone'))v(id,balance,role);
 q:=jsonb_build_object('select','*','hotel','eq.KAT','account_id','eq.'||scope,'open','neq.0','collection_role','neq.child','order','id');
 r:=public.ar_acceptance_read(actor,scenario,'ar_invoices',q,2,0);
 if jsonb_typeof(r) is distinct from 'array' or jsonb_array_length(r)<>2 or r->0->>'id'<>'A' or r->1->>'id'<>'B' then raise exception 'acceptance_current_invoice_filter_failed:%',r;end if;
 r:=public.ar_acceptance_read(actor,scenario,'ar_invoices',q,2,2);
 if jsonb_array_length(r)<>1 or r->0->>'id'<>'D' or (r->0->>'open')::numeric<>-25 then raise exception 'acceptance_signed_or_paged_invoice_lost';end if;
 r:=public.ar_acceptance_read(actor,scenario,'ar_invoices',q-'collection_role',10,0);
 if jsonb_array_length(r)<>4 then raise exception 'acceptance_fixture_did_not_include_child';end if;
 for bad_value in select value from jsonb_array_elements('["eq.parent","neq.parent","neq.standalone","eq.child","neq.child.extra",null]') loop
  r:=public.ar_acceptance_read(actor,scenario,'ar_invoices',jsonb_set(q,'{collection_role}',bad_value),10,0);
  if r->>'error' is distinct from 'acceptance_filter_invalid' then raise exception 'acceptance_role_filter_widened:%',bad_value;end if;
 end loop;
 r:=public.ar_acceptance_read(actor,scenario,'ar_accounts',q,10,0);
 if r->>'error' is distinct from 'acceptance_filter_invalid' then raise exception 'acceptance_filter_allowed_on_wrong_table';end if;
 r:=public.ar_acceptance_read(gen_random_uuid(),scenario,'ar_invoices',q,10,0);
 if r->>'error' is distinct from 'acceptance_forbidden' then raise exception 'acceptance_filter_owner_gate_changed';end if;
 if (select count(*) from public.ar_accounts)<>before_accounts then raise exception 'acceptance_filter_touched_original_accounts';end if;
end$$;
rollback;
select 'Exact invoice neq.child filter, child/zero exclusion, signed outstanding, pagination, rejected variants/table/null, actor and original scope passed; rolled back' as result;
