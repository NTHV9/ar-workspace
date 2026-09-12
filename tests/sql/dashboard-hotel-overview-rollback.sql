-- Synthetic-only contract tests. Every row and temporary function change rolls back.
begin;
do $$
declare
 actor uuid;d date:=(now() at time zone 'Asia/Bangkok')::date;scope text:='SYNTHETIC-HOTEL-'||gen_random_uuid();
 kind text:='SYNTHETIC_HOTEL_OVERVIEW';h text;run uuid;delivery uuid;purpose text;r jsonb;direct jsonb;t jsonb;k jsonb;s jsonb;
 metric jsonb;stage jsonb;key text;view_name text;past date:=date '1905-01-01';stamp timestamptz:=clock_timestamp();
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 if to_regprocedure('public.ar_dashboard_hotel_overview(uuid,date,date,text)') is null then raise exception 'hotel overview reader missing';end if;
 if public.ar_dashboard_hotel_overview(gen_random_uuid(),d,d)->>'error'<>'dashboard_forbidden'
  or public.ar_dashboard_hotel_overview(null,d,d)->>'error'<>'dashboard_forbidden' then raise exception 'bundle actor unchecked';end if;
 if public.ar_dashboard_hotel_overview(actor,null,d)->>'error'<>'dashboard_invalid'
  or public.ar_dashboard_hotel_overview(actor,d,d+1)->>'error'<>'dashboard_invalid'
  or public.ar_dashboard_hotel_overview(actor,d,d-1)->>'error'<>'dashboard_invalid'
  or public.ar_dashboard_hotel_overview(actor,d-3661,d)->>'error'<>'dashboard_invalid'
  or public.ar_dashboard_hotel_overview(actor,d,d,' ')->>'error'<>'dashboard_invalid'
  or public.ar_dashboard_hotel_overview(actor,d,d,chr(127))->>'error'<>'dashboard_invalid' then raise exception 'bundle validation unchecked';end if;
 if has_function_privilege('anon','public.ar_dashboard_hotel_overview(uuid,date,date,text)','execute')
  or has_function_privilege('authenticated','public.ar_dashboard_hotel_overview(uuid,date,date,text)','execute')
  or not has_function_privilege('service_role','public.ar_dashboard_hotel_overview(uuid,date,date,text)','execute') then raise exception 'bundle ACL leaked';end if;
 if not exists(select 1 from pg_proc where oid='public.ar_dashboard_hotel_overview(uuid,date,date,text)'::regprocedure and provolatile='s' and prosecdef and proconfig=array['search_path=""']) then raise exception 'bundle snapshot/search path contract missing';end if;

 foreach h in array array['KAT','TSK'] loop
  run:=gen_random_uuid();
  insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at)
  values(h,scope,'Synthetic hotel overview',kind,case h when 'KAT' then 200.40 else 33.10 end,0,case h when 'KAT' then 2 else 1 end,'verified',stamp);
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
  values(h,scope,'I1','I1',d-70,150.10,case h when 'KAT' then 120.15 else 33.10 end,70,'verified','standalone',false,stamp);
  if h='KAT' then insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
   values(h,scope,'I2','I2',d-10,90.20,80.25,10,'verified','standalone',false,stamp);end if;
  update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=case when invoice_id='I1' then d-40 end where hotel=h and account_id=scope;
  update public.ar_refresh_state set status='succeeded',last_success_at=stamp where hotel=h;
  foreach purpose in array array['billing','collection'] loop
   delivery:=gen_random_uuid();
   insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,sent_at)
   select delivery,actor,'send',case purpose when 'collection' then 'Final' else 'Billing' end,'synthetic-'||delivery,
    jsonb_build_object('draft',jsonb_build_object('hotel',h,'account_id',scope,'account_name','Synthetic hotel overview','invoice_ids',jsonb_agg(i.id order by i.id)),
     'manifest',jsonb_agg(jsonb_build_object('hotel',h,'account_id',scope,'id',i.id,'open',i.open)),
     'workflow',jsonb_agg(jsonb_build_object('hotel',h,'account_id',scope,'invoice_id',i.id,'first_billing_date',null))),
    'sent',stamp-case purpose when 'billing' then interval '2 minutes' else interval '1 minute' end
   from public.ar_invoices i where i.hotel=h and i.account_id=scope;
   insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
   select delivery,actor,h,scope,array_agg(i.id order by i.id),purpose,case purpose when 'collection' then 'Final' else 'Billing' end,
    stamp-case purpose when 'billing' then interval '2 minutes' else interval '1 minute' end,'synthetic-'||delivery,sum(i.open)
   from public.ar_invoices i where i.hotel=h and i.account_id=scope;
  end loop;
  insert into ar_private.external_billing_records(id,revision,owner,hotel,account_id,details)
  values(gen_random_uuid(),1,actor,h,scope,jsonb_build_object('accountName','Synthetic hotel overview','accountType',kind,'actualDate',d,'channel','portal','reference','Synthetic','note','Synthetic','amount',case h when 'KAT' then '54.20' else '7.30' end,'lines',case h when 'KAT' then '[{"invoiceId":"I1","firstBilling":true},{"invoiceId":"I2","firstBilling":false}]'::jsonb else '[{"invoiceId":"I1","firstBilling":true}]'::jsonb end));
  insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at)
  values(run,actor,h,d,d,'manual','synthetic-hotel-overview','succeeded',true,stamp);
  insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id) values(h,scope,'Synthetic hotel overview',kind,stamp,run);
  insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
  values(run,h,d,d,stamp,1,case h when 'KAT' then 2 else 1 end,case h when 'KAT' then 2 else 1 end,case h when 'KAT' then 3 else 1 end,true,true,'synthetic-hotel-overview');
  insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id,mapping_verified)
  select h,scope,i.id,d,case when h='TSK' then 40.30 when i.id='I1' then 150.10 else 90.20 end,i.original,i.open,'{"invoiceNo":"I1","entryClassification":"invoice","collectionRole":"standalone"}',
   'observed',stamp,stamp,stamp,run,true from public.ar_invoices i where i.hotel=h and i.account_id=scope;
  insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
  select h,scope,id,d,amount,amount,0,'{"transfer":"none_reported","classification":"unknown","reversal":"unknown"}','observed',stamp,stamp,stamp,run
  from(values('P1',case h when 'KAT' then -10.15 else -7.35 end),('P2',-20.25))v(id,amount) where h='KAT' or id='P1';
  insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
  select h,scope,invoice,payment,amount,d,'{}','observed',stamp,stamp,stamp,run
  from(values('I1','P1',case h when 'KAT' then 10.15 else 7.35 end),('I1','P2',10.10),('I2','P2',10.15))v(invoice,payment,amount) where h='KAT' or payment='P1';
 end loop;
 r:=public.ar_dashboard_hotel_overview(actor,d,d,kind);t:=r->'total';k:=r->'hotels'->0;s:=r->'hotels'->1;
 if r->>'from'<>d::text or r->>'to'<>d::text or k->>'hotel'<>'KAT' or s->>'hotel'<>'TSK' then raise exception 'bundle identity mismatch';end if;
 if k->'balances'->'metrics'->0->>'amount'<>'200.40' or s->'balances'->'metrics'->0->>'amount'<>'33.10'
  or t->'balances'->'metrics'->0->>'amount'<>'233.50' or t->'balances'->'metrics'->0->>'count'<>'3' then raise exception 'hotel identity or balance amount combined incorrectly';end if;
 for metric in select value from jsonb_array_elements(t->'balances'->'metrics') loop
  key:=metric->>'key';
  if (metric->>'count')::numeric<>(select (v->>'count')::numeric from jsonb_array_elements(k->'balances'->'metrics')v where v->>'key'=key)+(select (v->>'count')::numeric from jsonb_array_elements(s->'balances'->'metrics')v where v->>'key'=key)
   or (metric->>'amount')::numeric<>(select (v->>'amount')::numeric from jsonb_array_elements(k->'balances'->'metrics')v where v->>'key'=key)+(select (v->>'amount')::numeric from jsonb_array_elements(s->'balances'->'metrics')v where v->>'key'=key) then raise exception 'closing metric total differs from parts';end if;
 end loop;
 if (select v->>'count' from jsonb_array_elements(t->'balances'->'stages')v where v->>'key'='Final')<>'3'
  or t->'activity'->'summary'->>'invoices'<>'6' or k->'activity'->'summary'->>'invoices'<>'4' or s->'activity'->'summary'->>'invoices'<>'2'
  or (t->'activity'->'summary'->>'amount')::numeric<>467.00 then raise exception 'latest stage or actual send scope incorrect';end if;
 if t->'external'->'summary'->>'amount'<>'61.50' or t->'external'->'summary'->>'invoices'<>'3'
  or t->'entries'->'summary'->>'amount'<>'280.60' or t->'entries'->'summary'->>'invoiceCount'<>'3'
  or t->'payments'->'summary'->'paymentTotals'->>'creditPostings'<>'37.75' or t->'payments'->'summary'->>'paymentCount'<>'3'
  or t->'paid'->'summary'->>'count'<>'3' or k->'paid'->'summary'->>'count'<>'2' or s->'paid'->'summary'->>'count'<>'1'
  or t->'paid'->'summary'->>'amount'<>'37.75' then raise exception 'external, invoice or distinct payment aggregate wrong';end if;
 foreach h in array array[null,'KAT','TSK'] loop
  direct:=case h when 'KAT' then k when 'TSK' then s else t end;
  if direct->'balances' is distinct from jsonb_set(public.ar_dashboard_balances(actor,d,h,null,kind,null,null,0,1),'{rows}','[]')
   or direct->'paid' is distinct from jsonb_set(public.ar_dashboard_payment_invoices(actor,d,d,h,null,kind,0,1),'{rows}','[]') then raise exception 'bundle changed authoritative balance/payment metadata';end if;
  foreach view_name in array array['invoice_entries','payments'] loop
   metric:=public.ar_financial_report(actor,view_name,h,null,kind,d,d,0,1);key:=case view_name when 'invoice_entries' then 'entries' else 'payments' end;
   if direct->key is distinct from jsonb_build_object('summary',metric->'summary','coverage',metric->'coverage') then raise exception 'bundle changed financial basis or coverage';end if;
  end loop;
  foreach key in array array['balances','activity','external','paid'] loop if direct->key->'rows'<>'[]'::jsonb then raise exception 'detail rows leaked';end if;end loop;
 end loop;
 -- A type without rows has authoritative zero only while both source scopes are covered.
 r:=public.ar_dashboard_hotel_overview(actor,d,d,kind||'-NONE');
 if r->'total'->'balances'->'metrics'->0->>'count'<>'0' or r->'total'->'entries'->'summary'->>'invoiceCount'<>'0' then raise exception 'account type was ignored';end if;
 -- Missing source data for TSK never erases known KAT or fabricates a combined zero.
 update public.ar_refresh_state set last_success_at=null,status='failed' where hotel='TSK';
 alter table ar_private.financial_publications disable trigger financial_publications_immutable;
 update ar_private.financial_publications set period_complete=false where hotel='TSK' and proof='synthetic-hotel-overview';
 alter table ar_private.financial_publications enable trigger financial_publications_immutable;
 r:=public.ar_dashboard_hotel_overview(actor,d,d,kind);
 if r->'total'->'balances'->'metrics'->0->'count'<>'null'::jsonb or r->'hotels'->0->'balances'->'metrics'->0->>'amount'<>'200.40'
  or r->'hotels'->1->'balances'->'metrics'->0->'amount'<>'null'::jsonb or r->'total'->'entries'->'summary'->'amount'<>'null'::jsonb
  or r->'hotels'->0->'entries'->'summary'->>'amount'<>'240.30' or r->'hotels'->1->'entries'->'summary'->'amount'<>'null'::jsonb
  or r->'total'->'paid'->'summary'->'count'<>'null'::jsonb then raise exception 'missing hotel source became zero or erased another hotel';end if;
 -- Historical data is a captured snapshot, with no current-source substitution for TSK.
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.refresh_runs(id,hotel,reason,status,finished_at) values(run,'KAT','manual','succeeded',stamp);
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts)
 values('KAT',past,run,past::timestamp at time zone 'Asia/Bangkok',past::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type',kind,'verified',true)));
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,verified)
 values('KAT',past,scope,'HISTORIC','Synthetic hotel overview',kind,past-1,15.55,true);
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 r:=public.ar_dashboard_hotel_overview(actor,past,past,kind);
 if r->'hotels'->0->'balances'->>'mode'<>'snapshot' or r->'hotels'->0->'balances'->'metrics'->0->>'amount'<>'15.55'
  or r->'hotels'->1->'balances'->>'mode'<>'unavailable' or r->'total'->'balances'->'metrics'->0->'amount'<>'null'::jsonb then raise exception 'uncaptured historical hotel filled from current source';end if;
end$$;
-- The wrapper is changed only in this rolled-back synthetic database. Verify
-- ordinary source errors are isolated and explicit authorization is never hidden.
do $$
declare original text;wrapper text;mode text;actor uuid;d date:=(now() at time zone 'Asia/Bangkok')::date;r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 original:=pg_get_functiondef('public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text)'::regprocedure);
 execute replace(original,'FUNCTION public.ar_external_billing_read(','FUNCTION ar_private.synthetic_hotel_external_reader(');
 foreach mode in array array['raise_source','returned_source','raise_forbidden','returned_forbidden','raise_privilege','raise_invalid','returned_invalid'] loop
  wrapper:=case mode
   when 'raise_source' then 'raise exception ''synthetic_source_unavailable'';'
   when 'returned_source' then 'return jsonb_build_object(''error'',''billing_source_unavailable'');'
   when 'raise_forbidden' then 'raise exception ''billing_forbidden'';'
   when 'returned_forbidden' then 'return jsonb_build_object(''error'',''billing_forbidden'');'
   when 'raise_privilege' then 'raise insufficient_privilege;'
   when 'raise_invalid' then 'raise exception ''billing_invalid'';'
   when 'returned_invalid' then 'return jsonb_build_object(''error'',''billing_invalid'');' end;
  execute 'create or replace function public.ar_external_billing_read(p_actor uuid,p_hotel text default null,p_account text default null,p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 50,p_type text default null) returns jsonb language plpgsql stable security definer set search_path='''' as $reader$ begin if p_hotel=''KAT'' then '||wrapper||'end if; return ar_private.synthetic_hotel_external_reader(p_actor,p_hotel,p_account,p_from,p_to,p_offset,p_limit,p_type);end $reader$';
  r:=public.ar_dashboard_hotel_overview(actor,d,d,'SYNTHETIC_HOTEL_OVERVIEW');
  if mode in('raise_source','returned_source') then
   if r?'error' or r->'hotels'->0->'external' is distinct from 'null'::jsonb or r->'hotels'->0->'activity'='null'::jsonb
    or r->'hotels'->0->'balances'='null'::jsonb or r->'hotels'->0->'entries'='null'::jsonb
    or r->'hotels'->1->'external'='null'::jsonb or r->'total'->'external'='null'::jsonb then raise exception 'source failure erased unrelated segment or hotel';end if;
  elsif mode in('raise_invalid','returned_invalid') then
   if r is distinct from '{"error":"dashboard_invalid"}'::jsonb then raise exception 'validation failure hidden as partial source';end if;
  else if r is distinct from '{"error":"dashboard_forbidden"}'::jsonb then raise exception 'authorization failure hidden as partial source';end if;
  end if;
 end loop;
 execute original;
end$$;
rollback;
select 'Dashboard hotel overview asymmetric source, identity, totals, history and ACL checks passed' as result;
