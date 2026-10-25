begin;

-- Synthetic historical metadata only: preserve the real report-view column
-- contract while isolating this rollback fixture from delivery registration.
create table ar_private.current_options_history_fixture as select * from ar_private.report_sent_invoices where false;
create or replace view ar_private.report_sent_invoices as select * from ar_private.current_options_history_fixture;

do $$
declare actor uuid;page_one jsonb;page_two jsonb;combined jsonb;result jsonb;expected jsonb;hotel_key text;scope text;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com';
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 select 'TLKL','CURRENT-OPTIONS-'||lpad(i::text,4,'0'),'LOCAL Current Khao '||lpad((236-i)::text,4,'0'),case when i%2=0 then 'Corporate' else 'Agent' end,0,0,0,'verified' from generate_series(1,235)i;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 select h,'CURRENT-OPTIONS-0001','LOCAL Current '||h,'Agent',0,0,0,'verified' from unnest(array['WAKL','TLFO','TSAN','TSK'])h;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 select 'KAT','CURRENT-OPTIONS-'||lpad(i::text,4,'0'),'LOCAL Current Phuket '||lpad((206-i)::text,4,'0'),'Agent',0,0,0,'verified' from generate_series(1,205)i;
 insert into ar_private.current_options_history_fixture(owner,hotel,account_id,account_name,account_type,delivery_id,invoice_id,sent_at,sent_date,purpose,kind,amount)
 values(actor,'TLKL','CURRENT-OPTIONS-0001','LOCAL Historical renamed account','Previous type',gen_random_uuid(),'historical-invoice',now()-interval '2 months',current_date-60,'billing','First billing',10);

 -- Regression: the old tuple UNION returns 239 options but only 238 ledgers.
 page_one:=public.ar_reports_read(actor,'options','KhaoLak',null,null,null,null,0,200,null,null);
 page_two:=public.ar_reports_read(actor,'options','KhaoLak',null,null,null,null,200,200,null,null);
 if (page_one->>'total')::integer<>238 or (page_two->>'total')::integer<>238 or jsonb_array_length(page_one->'rows')<>200 or jsonb_array_length(page_two->'rows')<>38 then raise exception 'current_options_historical_metadata_duplicate_or_page_drift';end if;
 combined:=(page_one->'rows')||(page_two->'rows');
 if (select count(distinct (r->>'hotel',r->>'account_id')) from jsonb_array_elements(combined)r)<>238 then raise exception 'current_options_duplicate_ledger';end if;
 select jsonb_agg(jsonb_build_object('hotel',hotel,'account_id',id,'account_name',name,'account_type',type) order by hotel,id) into expected from public.ar_accounts where hotel in('TLKL','WAKL','TLFO','TSAN');
 if combined is distinct from expected then raise exception 'current_options_names_types_or_identity_order_changed';end if;
 if (select count(*) from jsonb_array_elements(combined)r where r->>'account_id'='CURRENT-OPTIONS-0001')<>4 then raise exception 'current_options_merged_cross_hotel_id';end if;

 page_one:=public.ar_reports_read(actor,'options','Phuket',null,null,null,null,0,200,null,null);
 page_two:=public.ar_reports_read(actor,'options','Phuket',null,null,null,null,200,200,null,null);
 if (page_one->>'total')::integer<>206 or jsonb_array_length(page_one->'rows')<>200 or jsonb_array_length(page_two->'rows')<>6 then raise exception 'current_options_phuket_pagination';end if;
 if exists(select 1 from jsonb_array_elements((page_one->'rows')||(page_two->'rows'))r where r->>'hotel' not in('KAT','TSK')) then raise exception 'current_options_region_leak';end if;
 if (select count(*) from jsonb_array_elements((page_one->'rows')||(page_two->'rows'))r where r->>'account_id'='CURRENT-OPTIONS-0001')<>2 then raise exception 'current_options_phuket_merged_cross_hotel_id';end if;
 foreach hotel_key in array array['KAT','TSK','TLKL','WAKL','TLFO','TSAN'] loop
  result:=public.ar_reports_read(actor,'options',hotel_key,null,null,null,null,0,200,null,null);
  if exists(select 1 from jsonb_array_elements(result->'rows')r where r->>'hotel'<>hotel_key) then raise exception 'current_options_hotel_leak';end if;
 end loop;
 result:=public.ar_reports_read(actor,'options','TLKL','CURRENT-OPTIONS-0002','Corporate',null,null,0,200,null,null);
 if (result->>'total')::integer<>1 or result->'rows'->0->>'account_type'<>'Corporate' then raise exception 'current_options_current_account_type_filter';end if;
 result:=public.ar_reports_read(actor,'options','KhaoLak',null,'Corporate',null,null,0,200,null,null);
 if (result->>'total')::integer<>117 then raise exception 'current_options_type_filter';end if;
 result:=public.ar_reports_read(actor,'options','KhaoLak',null,null,null,null,238,200,null,null);
 if (result->>'total')::integer<>238 or result->'rows'<>'[]'::jsonb then raise exception 'current_options_end_page';end if;

 -- Historical-only/deleted ledger metadata cannot manufacture a current option.
 insert into ar_private.current_options_history_fixture(owner,hotel,account_id,account_name,account_type) values(actor,'TSAN','CURRENT-OPTIONS-HISTORY-ONLY','LOCAL Historical only','Agent');
 result:=public.ar_reports_read(actor,'options','KhaoLak',null,null,null,null,0,200,null,null);
 if (result->>'total')::integer<>238 then raise exception 'current_options_historical_only_ledger';end if;
 if public.ar_reports_read(gen_random_uuid(),'options','KhaoLak')->>'error' is distinct from 'reports_forbidden' then raise exception 'current_options_actor_acl';end if;
 if public.ar_reports_read(actor,'options','NOT-A-HOTEL')->>'error' is distinct from 'reports_invalid' then raise exception 'current_options_invalid_hotel';end if;
 if public.ar_reports_read(actor,'options','KhaoLak','CURRENT-OPTIONS-0001')->>'error' is distinct from 'reports_invalid' then raise exception 'current_options_account_requires_exact_hotel';end if;
 foreach scope in array array['anon','authenticated'] loop
  if has_function_privilege(scope,'public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)','EXECUTE') then raise exception 'current_options_public_execution';end if;
 end loop;
 if not has_function_privilege('service_role','public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)','EXECUTE') then raise exception 'current_options_service_execution';end if;
 -- The existing activity branch still reads its immutable historical metadata.
 result:=public.ar_reports_read(actor,'activity','TLKL','CURRENT-OPTIONS-0001');
 if (result->>'total')::integer<>1 or result->'rows'->0->>'account_name'<>'LOCAL Historical renamed account' then raise exception 'current_options_changed_activity_evidence';end if;
 result:=public.ar_reports_read(actor,'current','KhaoLak');
 if result?'error' or (result->>'total')::integer<>0 then raise exception 'current_options_changed_current_balance_mode';end if;
end $$;
rollback;
