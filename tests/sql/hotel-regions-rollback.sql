-- Synthetic six-hotel contracts; no provider reads/sends. Entire fixture rolls back.
begin;
do $$
declare actor uuid;d date:=(now() at time zone 'Asia/Bangkok')::date;stamp timestamptz:=clock_timestamp();
 a text:='SYNTHETIC-REGION-'||gen_random_uuid();kind text:='SYNTHETIC_REGIONS';h text;s text;r jsonb;q jsonb;
 run uuid;delivery uuid;notice uuid;n integer:=0;expected numeric;members jsonb:='[]';scope_hotels text[];
 empty_recipients jsonb:='{"to":[],"cc":[],"bcc":[]}';saved jsonb;history jsonb;rejected boolean;
begin
 if to_regprocedure('ar_private.report_scope_hotels(text)') is null then raise exception 'regional scope helpers missing';end if;
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'synthetic owner missing';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 foreach s in array array[null,'All','Phuket'] loop
  if ar_private.report_scope_hotels(s) is distinct from array['KAT','TSK'] then raise exception 'legacy Phuket helper changed';end if;
 end loop;
 if ar_private.report_scope_hotels('KhaoLak') is distinct from array['TLKL','WAKL','TLFO','TSAN']
  or cardinality(ar_private.report_scope_hotels('UNKNOWN'))<>0 or ar_private.is_supported_hotel('KhaoLak') or ar_private.is_supported_hotel(null)
  then raise exception 'reserved scope accepted as property or region order changed';end if;
 if public.ar_dashboard_region_overview(null,d,d,null,'khao-lak')->>'error' is distinct from 'dashboard_forbidden'
  or public.ar_dashboard_region_overview(actor,d,d,null,'KhaoLak')->>'error' is distinct from 'dashboard_invalid'
  or public.ar_portfolio_region_accounts(actor,'UNKNOWN')->>'error' is distinct from 'portfolio_invalid'
  or public.ar_remittance_region_options(null,'khao-lak')->>'error' is distinct from 'remittance_forbidden'
 then raise exception 'regional owner/input gate failed';end if;
 if has_function_privilege('anon','public.ar_dashboard_region_overview(uuid,date,date,text,text)','execute')
  or has_function_privilege('authenticated','public.ar_portfolio_region_accounts(uuid,text)','execute')
  or has_function_privilege('anon','public.ar_remittance_region_options(uuid,text)','execute')
  or not has_function_privilege('service_role','public.ar_dashboard_region_overview(uuid,date,date,text,text)','execute')
 then raise exception 'regional reader ACL leaked';end if;
 foreach h in array array['KAT','TSK','TLKL','WAKL','TLFO','TSAN'] loop
  n:=n+1;run:=gen_random_uuid();delivery:=gen_random_uuid();notice:=gen_random_uuid();
  if not ar_private.is_supported_hotel(h) or ar_private.report_scope_hotels(h) is distinct from array[h] then raise exception 'exact property helper failed';end if;
  insert into public.ar_accounts(hotel,id,account_no,name,type,open,over90,items,verification_state,synced_at,"agingBuckets")
  values(h,a,'SYNTHETIC-SHARED-NUMBER','Synthetic independent hotel',kind,n*100-10,0,2,'verified',stamp,
   jsonb_build_array(jsonb_build_object('label','0 - 30','start',0,'end',30,'sequence',1,'amount',n*100-10,'debit',n*100,'credit',10)));
  insert into public.ar_invoices(hotel,account_id,id,invoice_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
  values(h,a,'ROOT','ROOT',d,n*100,n*100,0,'verified','parent',true,stamp),
   (h,a,'CREDIT','CREDIT',d,-10,-10,0,'verified','standalone',false,stamp),
   (h,a,'ZERO','ZERO',d,15,0,0,'cleared','standalone',false,stamp);
  insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at)
  values(h,a,'CHILD',d,80,80,0,'verified','child',false,'ROOT','ROOT',n*100,stamp);
  if exists(select 1 from public.ar_invoice_workflow where hotel=h and account_id=a and
    (billing_required is not null or credit_term is not null or first_billing_date is not null or last_reminder_stage is not null))
   then raise exception 'new property inherited workflow';end if;
  update public.ar_refresh_state set status='succeeded',last_success_at=stamp where hotel=h;
  if not public.ar_validate_collection_selection(h,a,array['ROOT']) or public.ar_validate_collection_selection(h,a,array['ROOT','ROOT'])
    or public.ar_validate_collection_selection(h,a,array['CHILD']) then raise exception 'single-property root/duplicate/child selection failed';end if;
  insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at)
  values(run,actor,h,d,d,'manual','synthetic-region','succeeded',true,stamp);
  insert into ar_private.financial_accounts(hotel,account_id,name,type,account_no,observed_at,run_id)
  values(h,a,'Synthetic independent hotel',kind,'SYNTHETIC-SHARED-NUMBER',stamp,run);
  insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof)
  values(run,h,d,d,stamp,1,2,1,1,true,true,'synthetic-region');
  insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id,mapping_verified)
  values(h,a,'ROOT',d,n*100,n*100,n*100,'{"entryClassification":"invoice","collectionRole":"parent"}','observed',stamp,stamp,stamp,run,true);
  insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
  values(h,a,'PAYMENT',d,-n,-n,0,'{"transfer":"none_reported","classification":"unknown","reversal":"unknown"}','observed',stamp,stamp,stamp,run);
  insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
  values(h,a,'ROOT','PAYMENT',n,d,'{}','observed',stamp,stamp,stamp,run);
  insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,sent_at)
  values(delivery,actor,'send','Final','synthetic-'||delivery,'{}','sent',stamp);
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
  values(delivery,actor,h,a,array['ROOT'],'collection','Final',stamp,'synthetic-'||delivery,n*100);
  insert into ar_private.external_billing_records(id,revision,owner,hotel,account_id,details)
  values(gen_random_uuid(),1,actor,h,a,jsonb_build_object('accountName','Synthetic independent hotel','accountType',kind,'actualDate',d,'channel','portal','reference','Synthetic','note','Synthetic','amount',(n*10)::text,'lines',jsonb_build_array(jsonb_build_object('invoiceId','ROOT','firstBilling',true))));
  insert into public.ar_remittances(id,owner,hotel,account_id,account_name,account_type,account_no,received_date,reference,reported_amount)
  values(notice,actor,h,a,'Synthetic independent hotel',kind,'SYNTHETIC-SHARED-NUMBER',d,'Synthetic',n);
  insert into public.ar_remittance_lines(record_id,invoice_id,position,snapshot) values(notice,'ROOT',1,'{}');
  if n>2 then members:=members||jsonb_build_array(jsonb_build_array(h,a));end if;
 end loop;
 -- Same account/item IDs do not allow an item from another property.
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('TSAN',a,'ONLY-TSAN',d,0,5,'verified','standalone',false,stamp);
 if not public.ar_validate_collection_selection('TSAN',a,array['ROOT','ONLY-TSAN'])
  or public.ar_validate_collection_selection('TLKL',a,array['ROOT','ONLY-TSAN']) or public.ar_validate_collection_selection('KhaoLak',a,array['ROOT'])
  or public.ar_validate_collection_selection('TLKL',a||'-OTHER',array['ROOT'])
 then raise exception 'mixed property selection accepted';end if;
 update public.ar_invoices set open=0,verification_state='cleared' where hotel='TSAN' and account_id=a and id='ONLY-TSAN';
 foreach s in array array[null,'All','Phuket','KhaoLak','TLKL'] loop
  scope_hotels:=ar_private.report_scope_hotels(s);expected:=case when s='KhaoLak' then 1760 when s='TLKL' then 290 else 280 end;
  r:=public.ar_dashboard_balances(actor,d,s,null,kind,null,null,0,100);
  if r?'error' or r->>'complete' is distinct from 'true' or (r->'metrics'->0->>'amount')::numeric<>expected
    or (r->'metrics'->0->>'count')::integer<>cardinality(scope_hotels)*2
    or exists(select 1 from jsonb_array_elements(r->'rows')x where not ar_private.hotel_in_report_scope(x->>'hotel',s) or x->>'invoiceId' in('CHILD','ZERO','ONLY-TSAN'))
   then raise exception 'regional signed balances/counts/children failed';end if;
  r:=public.ar_dashboard_invoice_entries(actor,d,d,s,null,kind,0,100);
  if r?'error' or (r->'summary'->>'amount')::numeric<>expected+cardinality(scope_hotels)*15 then raise exception 'regional Bill Date signed original cohort failed';end if;
  r:=public.ar_aging_invoice_status(actor,p_hotel=>s,p_type=>kind,p_details=>true);
  if r?'error' or r->>'complete' is distinct from 'true' or (r->'summary'->>'amount')::numeric<>expected
   or (r->'summary'->>'count')::integer<>cardinality(scope_hotels)*2 then raise exception 'regional Aging signed totals failed';end if;
  r:=public.ar_reports_read(actor,'activity',s,null,kind,d,d,0,100,null,null);
  if r?'error' or (r->'summary'->>'invoices')::integer<>cardinality(scope_hotels)
    or (r->'summary'->>'amount')::numeric<>expected+cardinality(scope_hotels)*10 then raise exception 'regional actual sent scope failed';end if;
  r:=public.ar_external_billing_read(actor,s,null,d,d,0,100,kind);
  if r?'error' or (r->'summary'->>'amount')::numeric<>(expected+cardinality(scope_hotels)*10)/10 then raise exception 'regional external scope failed';end if;
  r:=public.ar_financial_report(actor,'payments',s,null,kind,d,d,0,100);
  if r?'error' or r->'coverage'->>'complete' is distinct from 'true'
    or (r->'summary'->>'paymentCount')::integer<>cardinality(scope_hotels)
    or (r->'summary'->'paymentTotals'->>'creditPostings')::numeric<>(expected+cardinality(scope_hotels)*10)/100 then raise exception 'regional financial scope failed';end if;
  r:=public.ar_dashboard_payment_invoices(actor,d,d,s,null,kind,0,100);
  if r?'error' or (r->'summary'->>'count')::integer<>cardinality(scope_hotels)
   or (r->'summary'->>'amount')::numeric<>(expected+cardinality(scope_hotels)*10)/100 then raise exception 'regional payment invoice scope failed';end if;
  r:=public.ar_remittance_list(actor,jsonb_build_object('view','all','hotel',s,'type',kind));
  if r?'error' or (r->>'total')::integer<>cardinality(scope_hotels) then raise exception 'regional remittance scope failed';end if;
  r:=public.ar_observation_reports(actor,'options',s,null,kind,null,null,false,0,100);
  if r?'error' then raise exception 'regional observation options rejected';end if;
 end loop;
 r:=public.ar_dashboard_region_overview(actor,d,d,kind,'khao-lak');
 if r?'error' or r->>'region'<>'khao-lak' or (select array_agg(x->>'hotel' order by ord) from jsonb_array_elements(r->'hotels') with ordinality t(x,ord)) is distinct from array['TLKL','WAKL','TLFO','TSAN']
  or (r->'total'->'balances'->'metrics'->0->>'amount')::numeric<>1760 then raise exception 'four-property overview mismatch';end if;
 -- Missing/error source is unknown, never an invented regional zero.
 update public.ar_refresh_state set last_success_at=null,status='failed',error_code='synthetic' where hotel='TSAN';
 q:=public.ar_dashboard_balances(actor,d,'KhaoLak',null,kind);
 if q->>'complete' is distinct from 'false' or q->'metrics'->0->'amount' is distinct from 'null'::jsonb
  or not(q->'missingHotels' ? 'TSAN') then raise exception 'missing regional source became zero';end if;
 update public.ar_refresh_state set last_success_at=stamp,status='succeeded',error_code=null where hotel='TSAN';
 r:=public.ar_dashboard_hotel_overview(actor,d,d,kind);
 if jsonb_array_length(r->'hotels')<>2 or (r->'total'->'balances'->'metrics'->0->>'amount')::numeric<>280 then raise exception 'legacy overview mixed regions';end if;
 r:=public.ar_aging_invoice_status(actor,p_hotel=>'KhaoLak',p_accounts=>members,p_details=>true);
 if r?'error' or jsonb_array_length(r->'accounts')<>4 then raise exception 'regional Account No member drill failed';end if;
 if public.ar_aging_invoice_status(actor,p_hotel=>'KhaoLak',p_accounts=>jsonb_build_array(jsonb_build_array('KAT',a)))->>'error' is distinct from 'aging_invalid'
  or public.ar_dashboard_balances(actor,d,'KhaoLak',a)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_remittance_list(actor,jsonb_build_object('hotel','KhaoLak','accountId',a))->>'error' is distinct from 'remittance_invalid'
 then raise exception 'region cannot select an unscoped account';end if;
 foreach s in array array['phuket','khao-lak'] loop
  scope_hotels:=case s when 'phuket' then array['KAT','TSK'] else array['TLKL','WAKL','TLFO','TSAN'] end;
  r:=public.ar_portfolio_region_accounts(actor,s);
  if r?'error' or r->>'region'<>s or exists(select 1 from jsonb_array_elements(r->'accounts')x where not(x->>'hotel'=any(scope_hotels)))
    or jsonb_array_length(r->'refresh'->'hotels')<>cardinality(scope_hotels)
    or (select count(*) from jsonb_array_elements(r->'accounts')x where x->>'id'=a)<>cardinality(scope_hotels)
   then raise exception 'portfolio options/refresh crossed region';end if;
  r:=public.ar_remittance_region_options(actor,s);
  if r?'error' or r->>'region'<>s or exists(select 1 from jsonb_array_elements(r->'accounts')x where not(x->>'hotel'=any(scope_hotels)))
   then raise exception 'remittance options crossed region';end if;
 end loop;
 r:=public.ar_portfolio_accounts(actor);
 if r?'region' or jsonb_array_length(r->'refresh'->'hotels')<>2 or exists(select 1 from jsonb_array_elements(r->'accounts')x where x->>'hotel' not in('KAT','TSK')) then raise exception 'legacy portfolio default changed';end if;
 r:=public.ar_remittance_options(actor);
 if r?'region' or exists(select 1 from jsonb_array_elements(r->'accounts')x where x->>'hotel' not in('KAT','TSK')) then raise exception 'legacy remittance options mixed regions';end if;
 -- Independent Billing Required / Credit Term / recipients and settings history.
 r:=public.ar_settings_save_v2(actor,'KAT',a,0,true,30,'{"to":["synthetic-kat@example.test"],"cc":[],"bcc":[]}',empty_recipients,'{"billingMethod":"email"}');
 if r?'error' then raise exception 'Phuket synthetic settings failed';end if;saved:=r;
 select jsonb_agg(to_jsonb(x) order by revision) into history from ar_private.account_settings_history x where hotel='KAT' and account_id=a;
 foreach h in array array['TLKL','WAKL','TLFO','TSAN'] loop
  if exists(select 1 from public.ar_account_settings where hotel=h and account_id=a) then raise exception 'Khao Lak inherited settings';end if;
 end loop;
 r:=public.ar_settings_save_v2(actor,'TLKL',a,0,false,7,empty_recipients,'{"to":["synthetic-tlkl@example.test"],"cc":[],"bcc":[]}','{}');
 if r?'error' or public.ar_settings_get('KAT',a) is distinct from saved
   or (select jsonb_agg(to_jsonb(x) order by revision) from ar_private.account_settings_history x where hotel='KAT' and account_id=a) is distinct from history
 then raise exception 'Khao Lak save changed Phuket settings/history';end if;
 if public.ar_settings_save(actor,'KhaoLak',a,0,false,7,empty_recipients,empty_recipients)->>'error' is distinct from 'settings_invalid'
  or public.ar_settings_save(actor,'TLKL',a,0,false,8,empty_recipients,empty_recipients)->>'error' is distinct from 'settings_revision_conflict'
 then raise exception 'settings region/revision guard failed';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel in('WAKL','TLFO','TSAN') and account_id=a and (billing_required is not null or credit_term is not null or first_billing_date is not null))
 then raise exception 'workflow state copied between hotels';end if;
 if exists(select 1 from ar_private.statement_templates where hotel in('TLKL','WAKL','TLFO','TSAN')) then raise exception 'Statement assets fabricated';end if;
 foreach h in array array['TLKL','WAKL','TLFO','TSAN'] loop
  r:=public.ar_request_refresh(h,a,'manual',30);q:=public.ar_request_refresh(h,a,'manual',30);
  if r->>'id' is null or q->>'id' is distinct from r->>'id' or q->>'created' is distinct from 'false' then raise exception 'property refresh receipt duplicated';end if;
 end loop;
 rejected:=false;begin perform public.ar_request_refresh('KhaoLak',null,'manual',30);exception when others then rejected:=sqlerrm='invalid_refresh_request';end;
 if not rejected then raise exception 'operational refresh accepted region';end if;
 rejected:=false;begin insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('OTHER',a,'Synthetic',kind,0,0,0);exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'unsupported account property persisted';end if;
end $$;

-- Financial refresh completion is independent of the other region's queue,
-- including when its more recent history exceeds the ten-row response window.
do $$
declare actor uuid;s text;other_region text;h text;other_hotel text;target uuid;other_pending uuid;created_ids uuid[];
 r jsonb;q jsonb;v uuid;i integer;denied boolean;stamp timestamptz:=clock_timestamp();
begin
 if to_regprocedure('public.ar_financial_region_status(uuid,text)') is null then raise exception 'regional financial status missing';end if;
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 denied:=false;begin perform public.ar_financial_region_status(gen_random_uuid(),'khao-lak');exception when others then denied:=sqlerrm='financial_forbidden';end;
 if not denied then raise exception 'financial status owner gate lost';end if;
 if has_function_privilege('anon','public.ar_financial_region_status(uuid,text)','execute')
  or has_function_privilege('authenticated','public.ar_financial_region_status(uuid,text)','execute')
  or not has_function_privilege('service_role','public.ar_financial_region_status(uuid,text)','execute')
 then raise exception 'financial regional status ACL leaked';end if;
 denied:=false;begin perform public.ar_financial_region_status(actor,'KhaoLak');exception when others then denied:=sqlerrm='financial_invalid';end;
 if not denied then raise exception 'financial status invalid region accepted';end if;
 foreach s in array array['phuket','khao-lak'] loop
  h:=case s when 'phuket' then 'KAT' else 'TLKL' end;
  other_hotel:=case s when 'phuket' then 'TLKL' else 'KAT' end;
  other_region:=case s when 'phuket' then 'khao-lak' else 'phuket' end;
  target:=gen_random_uuid();other_pending:=gen_random_uuid();created_ids:=array[target,other_pending];
  insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,created_at,finished_at)
  values(target,actor,h,current_date,current_date,'manual','synthetic-region-status','succeeded',false,stamp-interval '1 hour',stamp-interval '30 minutes'),
   (other_pending,actor,other_hotel,current_date,current_date,'manual','synthetic-region-status','queued',false,stamp+interval '1 hour',null);
  for i in 1..15 loop
   v:=gen_random_uuid();created_ids:=array_append(created_ids,v);
   insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,created_at,finished_at)
   values(v,actor,other_hotel,current_date,current_date,'manual','synthetic-region-status','succeeded',false,stamp+make_interval(secs=>i),stamp+make_interval(secs=>i+1));
  end loop;
  r:=public.ar_financial_region_status(actor,s);q:=public.ar_financial_region_status(actor,other_region);
  if r->>'running' is distinct from 'false' or q->>'running' is distinct from 'true'
   or not exists(select 1 from jsonb_array_elements(r->'runs')x where x->>'id'=target::text)
   or jsonb_array_length(q->'runs')<>10
   or exists(select 1 from jsonb_array_elements(r->'runs')x where not ar_private.hotel_in_report_scope(x->>'hotel',case s when 'phuket' then 'Phuket' else 'KhaoLak' end))
   then raise exception 'other region history/queued run starved scoped completion';end if;
  if public.ar_financial_status(actor) is distinct from public.ar_financial_region_status(actor,'phuket') then raise exception 'legacy financial status default changed';end if;
  -- A running job in the selected region cannot be hidden by the other region.
  update ar_private.financial_runs set status='running',finished_at=null where id=target;
  update ar_private.financial_runs set status='succeeded',finished_at=stamp where id=other_pending;
  r:=public.ar_financial_region_status(actor,s);q:=public.ar_financial_region_status(actor,other_region);
  if r->>'running' is distinct from 'true' or q->>'running' is distinct from 'false'
   then raise exception 'running financial job leaked between regions';end if;
  update ar_private.financial_runs set status='queued' where id=target;
  if public.ar_financial_region_status(actor,s)->>'running' is distinct from 'true' then raise exception 'own queued financial job hidden';end if;
  delete from ar_private.financial_runs where id=any(created_ids);
 end loop;
end $$;

rollback;
select 'six-hotel regional scope, isolation, signed cohorts and command fences passed; rolled back' as result;
