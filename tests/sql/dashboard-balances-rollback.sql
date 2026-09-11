begin;
do $$
declare actor uuid;d date:=(clock_timestamp() at time zone 'Asia/Bangkok')::date;r jsonb;scope text:='SYNTHETIC-DASH-'||gen_random_uuid();run uuid:=gen_random_uuid();past date:=date '1902-01-01';counted integer;delivery uuid;stage text;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 r:=public.ar_dashboard_balances(actor,d-1,'KAT','SYNTHETIC-DASH-NONE');
 if r->>'mode'<>'unavailable' or r->'metrics'->0->'count'<>'null'::jsonb then raise exception 'uncaptured history was invented';end if;
 if public.ar_dashboard_balances(gen_random_uuid(),d)->>'error'<>'dashboard_forbidden' then raise exception 'actor was not checked';end if;
 if has_function_privilege('anon','public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)','execute') or has_function_privilege('authenticated','public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)','execute') or has_table_privilege('service_role','ar_private.dashboard_daily_invoices','select') then raise exception 'private access leaked';end if;
 if public.ar_dashboard_balances(actor,null)->>'error'<>'dashboard_invalid' or public.ar_dashboard_balances(actor,d,null,scope)->>'error'<>'dashboard_invalid' then raise exception 'SQL argument validation missing';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at) values('KAT',scope,'Synthetic dashboard','SYNTHETIC_DASH',500,0,5,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,v.id,v.id,'F-'||v.id,d-70,100,v.open,v.age,'verified','standalone',false,clock_timestamp() from(values('A',60,100),('B',61,50),('C',70,100),('D',1,100),('E',10,100),('ZERO',1,0))v(id,age,open);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 values('KAT',scope,'CHILD',d,100,100,'verified','child',false,'A','A',100,clock_timestamp());
 update public.ar_invoice_workflow set billing_required=case when invoice_id='D' then false when invoice_id='E' then null else true end,credit_term=case when invoice_id='E' then null else 30 end,first_billing_date=case when invoice_id='B' then d-31 when invoice_id='C' then d-30 end,last_reminder_stage=case when invoice_id='B' then 'Final' end,last_reminder_date=case when invoice_id='B' then d end where account_id=scope;
 update public.ar_refresh_state set status='succeeded',last_success_at=clock_timestamp() where hotel='KAT';
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,null,null,0,1);
 if r->>'complete'<>'true' or r->>'total'<>'5' or jsonb_array_length(r->'rows')<>1 or r->'metrics'->0->>'amount'<>'450.00' then raise exception 'full summary or parent/child/partial-payment accounting incorrect';end if;
 if r->'metrics'->1->>'count'<>'2' or r->'metrics'->2->>'count'<>'1' or r->'metrics'->3->>'count'<>'1' or r->'metrics'->4->>'count'<>'1' or r->'metrics'->6->>'count'<>'2' or r->'metrics'->7->>'count'<>'0' then raise exception 'billing/strict age boundary incorrect';end if;
 if (select x->>'count' from jsonb_array_elements(r->'stages')x where x->>'key'='Final')<>'0' then raise exception 'manual stage treated as actual SENT';end if;
 foreach stage in array array['Friendly','Final'] loop
  delivery:=gen_random_uuid();
  insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,sent_at) values(delivery,actor,'send',stage,'synthetic-'||delivery,jsonb_build_object('draft',jsonb_build_object('hotel','KAT','account_id',scope,'account_name','Synthetic dashboard','invoice_ids',jsonb_build_array('A','B','CHILD'))),'sent',clock_timestamp()-case when stage='Friendly' then interval '2 minutes' else interval '1 minute' end);
  insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'KAT',scope,array['A','B','CHILD'],'collection',stage,clock_timestamp()-case when stage='Friendly' then interval '2 minutes' else interval '1 minute' end,'synthetic-'||delivery,150);
 end loop;
 delivery:=gen_random_uuid();insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state) values(delivery,actor,'draft','Follow 1','synthetic-'||delivery,'{}','awaiting_evidence');
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,null,'Final',0,1);
 if r->>'total'<>'2' or (select x->>'count' from jsonb_array_elements(r->'stages')x where x->>'key'='Final')<>'2' or (select x->>'count' from jsonb_array_elements(r->'stages')x where x->>'key'='Friendly')<>'0' then raise exception 'latest actual stage double-counted prior stage, draft or child';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'past_due');if r->>'total'<>'2' then raise exception 'due date boundary included due today or excluded not-required';end if;
 update public.ar_invoices set verification_state='missing' where account_id=scope and id='B';
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);if r->>'complete'<>'false' or r->'metrics'->0->'amount'<>'null'::jsonb or r->>'unverified'<>'1' then raise exception 'unverified row produced exact sum';end if;
 update public.ar_invoices set verification_state='verified' where account_id=scope and id='B';
 update public.ar_refresh_state set status='failed' where hotel='KAT';r:=public.ar_dashboard_balances(actor,d,'KAT',scope);if r->>'complete'<>'true' or r->'freshness'->'failedHotels'<>'["KAT"]'::jsonb then raise exception 'failed attempt invalidated verified publication';end if;
 update public.ar_refresh_state set status='succeeded' where hotel='KAT';
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at) values(run,'KAT','manual','succeeded',clock_timestamp()-interval '1 minute',clock_timestamp());
 update public.ar_refresh_state set run_id=run,last_success_at=clock_timestamp() where hotel='KAT';select count(*) into counted from public.ar_accounts where hotel='KAT';
 perform ar_private.dashboard_capture(run,counted);
 if not exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='B' and open=50) then raise exception 'actual capture missing';end if;
 update public.ar_invoice_workflow set first_billing_date=d-5 where hotel='KAT' and account_id=scope and invoice_id='A';
 if not exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='A' and first_billing_date=d-5) then raise exception 'same-day workflow stale';end if;
 delivery:=gen_random_uuid();
 insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state)
 select delivery,actor,'send','Follow 1','synthetic-'||delivery,jsonb_build_object('draft',jsonb_build_object('purpose','collection','hotel','KAT','account_id',scope,'account_name','Synthetic dashboard','invoice_ids',jsonb_build_array('A')),'workflow',jsonb_build_array(to_jsonb(w)),'manifest',jsonb_build_array(jsonb_build_object('open',100))),'pending'
 from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope and invoice_id='A';
 r:=public.ar_mail_confirm_sent(actor,delivery,'synthetic-'||delivery,clock_timestamp());
 if r->>'state'<>'sent' or not exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='A' and latest_stage='Follow 1') then raise exception 'post-publication actual SENT did not update snapshot stage';end if;
 -- Synthetic historical fixture only. Production insertion is denied below; every change rolls back.
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts) values('KAT',past,run,past::timestamp at time zone 'Asia/Bangkok',past::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type','SYNTHETIC_DASH','verified',true)));
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts) values('KAT',past+1,run,(past+1)::timestamp at time zone 'Asia/Bangkok',(past+1)::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type','SYNTHETIC_DASH','verified',true)));
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,original,age,billing_required,credit_term,first_billing_date,due_date,verified,latest_stage,latest_stage_label,latest_sent_at)
 select hotel,past+1,account_id,invoice_id,account_name,account_type,past-70,open,original,age,billing_required,credit_term,past-5,past+25,verified,latest_stage,latest_stage_label,(past+1)::timestamp at time zone 'Asia/Bangkok' from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='A';
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,original,age,billing_required,credit_term,first_billing_date,due_date,verified,latest_stage,latest_stage_label,latest_sent_at)
 values('KAT',past,scope,'H','Synthetic historic','SYNTHETIC_DASH',past-90,12.34,50,90,true,30,past-40,past-10,true,'round_old','Historic label',past::timestamp at time zone 'Asia/Bangkok');
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 r:=public.ar_dashboard_balances(actor,past,'KAT',scope);if r->>'mode'<>'snapshot' or r->'metrics'->0->>'amount'<>'12.34' or r->'rows'->0->>'latestStageLabel'<>'Historic label' then raise exception 'historic snapshot joined current money/workflow/policy';end if;
 r:=public.ar_dashboard_balances(actor,past+1,'KAT',scope);if r->'rows'->0->>'latestStage'<>'Follow 1' then raise exception 'post-refresh SENT stage was lost in historical read';end if;
 r:=public.ar_dashboard_balances(actor,past,null,null,'SYNTHETIC_DASH');if r->>'complete'<>'false' or r->'metrics'->0->'amount'<>'null'::jsonb or r->'missingHotels'<>'["TSK"]'::jsonb then raise exception 'missing hotel became zero';end if;
 begin update ar_private.dashboard_daily_invoices set open=999 where hotel='KAT' and day=past and account_id=scope;raise exception 'history write accepted';exception when others then if sqlerrm<>'dashboard_history_immutable' then raise;end if;end;
 if ar_private.dashboard_budget_allows(200001,1,0,0,null) or ar_private.dashboard_budget_allows(1,3661,0,0,null) or ar_private.dashboard_budget_allows(1,1,67108865,0,null) or ar_private.dashboard_budget_allows(1,1,0,11,10) or not ar_private.dashboard_budget_allows(200000,3660,67108864,10,10) then raise exception 'capture budgets incorrect';end if;
 update ar_private.operations_budget set activated_at=clock_timestamp(),limits=jsonb_build_object('databaseBytes',1,'safetyPercent',10) where singleton;
 perform ar_private.dashboard_capture(run,counted);
 if not exists(select 1 from ar_private.dashboard_capture_state where hotel='KAT' and reason='history_budget_exceeded') then raise exception 'budget failure not exposed';end if;
 if not exists(select 1 from ar_private.refresh_runs where id=run and status='succeeded') then raise exception 'history cap blocked current publication';end if;
end$$;
do $$
declare actor uuid;scope text:='SYNTHETIC-DASH-PAY-'||gen_random_uuid();run uuid:=gen_random_uuid();later uuid:=gen_random_uuid();restored uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 -- Restore the local budget after the preceding cap fixture; this entire transaction rolls back.
 update ar_private.operations_budget set activated_at=null where singleton;
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at) values(run,actor,'KAT','1903-01-01','1903-01-31','backfill','synthetic-dashboard-proof','succeeded',true,stamp);
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,finished_at) select id,actor,'KAT','1903-01-01','1903-01-31','backfill','synthetic-dashboard-proof','succeeded',false,stamp from(values(later),(restored))v(id);
 insert into ar_private.financial_accounts(hotel,account_id,name,type,observed_at,run_id) values('KAT',scope,'Synthetic payment invoice account','SYNTHETIC_PAY',stamp,run);
 insert into ar_private.financial_publications(run_id,hotel,source_from,source_to,published_at,accounts,invoices,payments,applications,initial_import,period_complete,proof) values(run,'KAT','1903-01-01','1903-01-31',stamp,1,3,5,4,true,true,'synthetic-dashboard-proof');
 insert into ar_private.financial_invoice_entries(hotel,account_id,transaction_id,source_date,original_amount,current_amount,open_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select 'KAT',scope,id,'1902-12-15',100,100,50,jsonb_build_object('invoiceNo',id,'folioNo','F-'||id,'entryClassification',case when id='CREDIT' then 'credit' else 'invoice' end,'collectionRole','standalone'),'observed',stamp,stamp,stamp,run from(values('I1'),('I2'),('I3'),('CREDIT'))v(id);
 insert into ar_private.financial_payments(hotel,account_id,transaction_id,source_date,amount,applied_amount,unallocated_amount,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select 'KAT',scope,id,'1903-01-05',amount,applied,amount-applied,'{"transfer":"none_reported","classification":"unknown","reversal":"unknown"}','observed',stamp,stamp,stamp,run from(values('P1',-10,-10),('P2',-20,-20),('P3',-5,-5),('CORRECTION',3,0),('UNALLOCATED',-9,0),('PNET',-8,-8),('REVNET',8,8))v(id,amount,applied);
 insert into ar_private.financial_applications(hotel,account_id,invoice_id,payment_id,applied_amount,invoice_date,source_data,source_status,first_observed_at,last_observed_at,last_checked_at,run_id)
 select 'KAT',scope,invoice,payment,amount,'1902-12-15','{}','observed',stamp,stamp,stamp,run from(values('I1','P1',10),('I1','P2',10),('I2','P2',10),('CREDIT','P3',5),('I3','PNET',8),('I3','REVNET',-8))v(invoice,payment,amount);
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-05','1903-01-05','KAT',scope,null,0,1);
 if r->>'complete'<>'true' or r->>'total'<>'2' or r->'summary'->>'count'<>'2' or r->'summary'->>'amount'<>'30.00' or r->'summary'->>'signedCorrections'<>'-11.00' or jsonb_array_length(r->'rows')<>1 or r->'rows'->0->>'paymentCount'<>'2' then raise exception 'payment cohort counts/partial payments/credits/paging/corrections failed';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-06','1903-01-06','KAT',scope);if r->'summary'->>'count'<>'0' then raise exception 'payment cohort used invoice date or another day';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-06','1903-01-06','KAT',scope||'-MISSING');if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb or r->>'reason'<>'account_scope_unavailable' then raise exception 'unknown financial account became verified zero';end if;
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-05','1903-01-05',null,null,'SYNTHETIC_PAY');if r->>'complete'<>'false' or r->'summary'->'count'<>'null'::jsonb then raise exception 'missing payment hotel coverage became zero';end if;
 update ar_private.financial_applications set source_status='not_observed',run_id=later where hotel='KAT' and account_id=scope and payment_id='P1';
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-05','1903-01-05','KAT',scope);if r->>'complete'<>'false' or r->'summary'->'amount'<>'null'::jsonb or r->>'unknownMappings'<>'1' then raise exception 'failed mapping became exact paid total';end if;
 update ar_private.financial_applications set source_status='observed',run_id=restored where hotel='KAT' and account_id=scope and payment_id='P1';
 update ar_private.financial_payments set applied_amount=-11,run_id=later where hotel='KAT' and account_id=scope and transaction_id='P1';
 r:=public.ar_dashboard_payment_invoices(actor,'1903-01-05','1903-01-05','KAT',scope);if r->>'complete'<>'false' then raise exception 'incomplete allocation reconciliation accepted';end if;
 if public.ar_dashboard_payment_invoices(gen_random_uuid(),'1903-01-01','1903-01-31')->>'error'<>'dashboard_forbidden' or has_function_privilege('authenticated','public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)','execute') then raise exception 'payment actor/role check missing';end if;
end$$;
rollback;
select 'Dashboard balance rollback checks passed' as result;
