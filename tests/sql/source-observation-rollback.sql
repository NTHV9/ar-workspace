begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-OBS-'||gen_random_uuid();day date:=(now() at time zone 'Asia/Bangkok')::date;result jsonb;first_run uuid:=gen_random_uuid();second_run uuid:=gen_random_uuid();expected integer;observed integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at) values('KAT',scope,'Synthetic observation account','SYNTHETIC_OBS',300,0,3,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,v.id,'Synthetic guest',v.id,'F-'||v.id,day-70,100,100,v.age,'verified','standalone',false,clock_timestamp() from(values('A',70),('B',61),('U',null::integer))v(id,age);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=case when invoice_id='B' then day-40 end,last_reminder_stage=case when invoice_id='B' then 'Follow 1' end,last_reminder_date=case when invoice_id='B' then day-4 end where account_id=scope;
 result:=public.ar_observation_reports(actor,'timing','KAT',scope,null,null,null,true);if result->>'total'<>'1' or result->'rows'->0->>'invoice_id'<>'A' or result->'summary'->>'over60Amount'<>'100.00' then raise exception 'over60 unbilled used wrong date or scope';end if;
 result:=public.ar_observation_reports(actor,'timing','KAT',scope);if result->'summary'->>'unknownAge'<>'1' then raise exception 'unknown source age became zero';end if;
 if not exists(select 1 from jsonb_array_elements(result->'rows')r where r->>'invoice_id'='B' and r->>'first_billing_delay'='30' and r->>'overdue_days'='10' and r->>'since_reminder_days'='4') then raise exception 'calendar durations incorrect';end if;
 update public.ar_invoices set open=0,verification_state='unknown',synced_at=clock_timestamp() where account_id=scope and id='A';
 if exists(select 1 from ar_private.invoice_balance_observations where account_id=scope) then raise exception 'unknown treated as verified zero';end if;
 update public.ar_invoices set open=0,verification_state='verified',synced_at=clock_timestamp() where account_id=scope and id='A';
 update public.ar_invoices set open=0,verification_state='verified',synced_at=clock_timestamp() where account_id=scope and id='A';
 update public.ar_invoices set open=50,verification_state='verified',synced_at=clock_timestamp() where account_id=scope and id='A';
 result:=public.ar_observation_reports(actor,'balance_observations','KAT',scope);if result->'summary'->>'cleared'<>'1' or result->'summary'->>'reopened'<>'1' or result->'summary'->>'basis'<>'observation_time_not_payment_time' then raise exception 'clearing duplicated or payment date inferred';end if;
 if exists(select 1 from ar_private.invoice_balance_observations where account_id=scope and previous_verified_at is null) then raise exception 'known observation bound lost';end if;
 select count(*) into expected from public.ar_accounts where hotel='KAT';
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at) values(first_run,'KAT','manual','succeeded',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '30 seconds'),(second_run,'KAT','manual','succeeded',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '20 seconds');
 update public.ar_refresh_state set run_id=first_run,status='succeeded',last_success_at=clock_timestamp() where hotel='KAT';
 perform public.ar_publish_refresh(first_run,expected);perform public.ar_publish_refresh(first_run,expected);
 result:=public.ar_observation_reports(actor,'daily_ar','KAT',scope,null,day,day);if result->>'total'<>'1' or result->'summary'->'daily'->0->>'net_open'<>'300.00' then raise exception 'daily replay lost/counted duplicate Account';end if;
 update public.ar_accounts set open=250,synced_at=clock_timestamp() where hotel='KAT' and id=scope;
 update public.ar_refresh_state set run_id=second_run,status='succeeded',last_success_at=clock_timestamp() where hotel='KAT';
 perform public.ar_publish_refresh(second_run,expected);perform public.ar_publish_refresh(first_run,expected);
 result:=public.ar_observation_reports(actor,'daily_ar','KAT',scope,null,day,day);if result->>'total'<>'1' or result->'summary'->'daily'->0->>'net_open'<>'250.00' then raise exception 'late older capture replaced newer daily balance';end if;
 result:=public.ar_observation_reports(actor,'daily_ar','KAT',scope,null,day+1,day+1);if result->>'total'<>'0' or result->'summary'->'daily'<>'[]'::jsonb then raise exception 'uncaptured day became zero';end if;
 if public.ar_observation_reports(gen_random_uuid(),'timing')->>'error'<>'observations_forbidden' or has_function_privilege('anon','public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer)','execute') then raise exception 'report permission missing';end if;
end$$;
rollback;
select 'Source observations/daily capture/missing day/timing/permissions passed and rolled back' as result;
