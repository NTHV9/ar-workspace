-- Synthetic-only regression: publication validity and latest-attempt freshness are independent.
begin;
do $$
declare
 actor uuid;scope text:='SYNTHETIC-DASH-FRESH-'||gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;
 published timestamptz:=clock_timestamp()-interval '1 hour';publication uuid:=gen_random_uuid();attempt uuid;partial uuid;
 r jsonb;baseline jsonb;payload jsonb;captured timestamptz;state text;past date:=date '1904-01-01';
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at)
 values('KAT',scope,'Synthetic freshness account','SYNTHETIC_FRESH',100,0,1,'verified',published);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'ROOT',d-70,100,100,70,'verified','standalone',false,published);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=d-35 where hotel='KAT' and account_id=scope;
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at)
 values(publication,'KAT','manual','succeeded',published-interval '1 minute',published);
 update public.ar_refresh_state set status='succeeded',last_success_at=published,last_attempt_at=published-interval '1 minute',run_id=publication where hotel='KAT';
 baseline:=public.ar_dashboard_balances(actor,d,'KAT',scope);captured:=(baseline->>'capturedAt')::timestamptz;
 if baseline->>'complete'<>'true' or baseline->'metrics'->0->>'amount'<>'100.00' then raise exception 'fixture publication was not available';end if;

 -- A queued request changes only attempt state; it must not erase the published balance.
 r:=public.ar_request_refresh('KAT',null,'manual');attempt:=(r->>'id')::uuid;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->'metrics' is distinct from baseline->'metrics' or r->'rows' is distinct from baseline->'rows'
  then raise exception 'queued refresh invalidated verified publication';end if;
 if r->'freshness' is distinct from '{"refreshingHotels":["KAT"],"failedHotels":[]}'::jsonb or r->'missingHotels'<>'[]'::jsonb
  or (r->>'sourceAt')::timestamptz<>published or (r->>'capturedAt')::timestamptz<>captured then raise exception 'queued freshness or publication timestamps incorrect';end if;

 if not public.ar_claim_refresh(attempt) then raise exception 'fixture refresh claim failed';end if;
 payload:=jsonb_build_object('account',jsonb_build_object('hotel','KAT','id',scope,'name','Synthetic freshness account','type','SYNTHETIC_FRESH','account_no','SYN','open',999,'over90',0,'items',1,'currency','THB','creditLimit',null,'oldest',70,'agingBuckets','[]'::jsonb,'business_date',d),
  'invoices',jsonb_build_array(jsonb_build_object('hotel','KAT','account_id',scope,'id','ROOT','transaction_date',d-70,'original',100,'open',999,'age',70,'collection_role','standalone','compressed',false)));
 perform public.ar_stage_account(attempt,payload);
 -- A partly staged full-hotel run cannot publish any account or advance source time.
 begin perform public.ar_publish_refresh(attempt,2);raise exception 'partial full-hotel publication accepted';
 exception when others then if sqlerrm<>'refresh_incomplete' then raise;end if;end;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->'metrics' is distinct from baseline->'metrics' or r->'rows' is distinct from baseline->'rows'
  or r->'freshness'->'refreshingHotels'<>'["KAT"]'::jsonb or (r->>'sourceAt')::timestamptz<>published or (r->>'capturedAt')::timestamptz<>captured
  then raise exception 'running or partly staged refresh changed published balance';end if;
 if not public.ar_fail_refresh(attempt,'synthetic_provider_failed') then raise exception 'fixture refresh failure failed';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->'metrics' is distinct from baseline->'metrics' or r->'rows' is distinct from baseline->'rows'
  or r->'freshness' is distinct from '{"refreshingHotels":[],"failedHotels":["KAT"]}'::jsonb
  or (r->>'sourceAt')::timestamptz<>published or (r->>'capturedAt')::timestamptz<>captured
  then raise exception 'failed refresh lost verified publication or misreported freshness';end if;
 if exists(select 1 from ar_private.refresh_stage where job_id=attempt) then raise exception 'failed staging remained publishable';end if;

 -- Account-only publication updates its rows atomically without asserting a new full-hotel publication.
 r:=public.ar_request_refresh('KAT',scope,'manual');partial:=(r->>'id')::uuid;
 if not public.ar_claim_refresh(partial) then raise exception 'fixture account claim failed';end if;
 payload:=jsonb_set(jsonb_set(payload,'{account,open}','75'),'{invoices,0,open}','75');
 perform public.ar_stage_account(partial,payload);perform public.ar_publish_refresh(partial,1);
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->'metrics'->0->>'amount'<>'75.00' or (r->>'sourceAt')::timestamptz<>published
  or (r->>'capturedAt')::timestamptz<(select synced_at from public.ar_accounts where hotel='KAT' and id=scope)
  or r->'freshness'->'failedHotels'<>'["KAT"]'::jsonb then raise exception 'account publication or timestamp falsely became full-hotel freshness';end if;

 -- Full-hotel publication absence cannot be replaced by a successful account-only refresh.
 foreach state in array array['unknown','queued','running','failed','succeeded'] loop
  update public.ar_refresh_state set status=state,last_success_at=null where hotel='KAT';
  r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
  if r->>'complete'<>'false' or r->'missingHotels'<>'["KAT"]'::jsonb or r->'metrics'->0->'amount'<>'null'::jsonb or r->'sourceAt'<>'null'::jsonb
   then raise exception 'no full-hotel publication became available for %',state;end if;
 end loop;
 update public.ar_refresh_state set status='failed',last_success_at=published where hotel='KAT';
 -- Root membership/source uncertainty remains unavailable at every amount, including zero.
 foreach state in array array['unknown','missing'] loop
  update public.ar_invoices set verification_state=state,open=0 where hotel='KAT' and account_id=scope and id='ROOT';
  r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
  if r->>'complete'<>'false' or r->>'unverified'<>'1' or r->'metrics'->0->'count'<>'null'::jsonb then raise exception 'unconfirmed zero became available';end if;
 end loop;
 update public.ar_invoices set verification_state='verified',open=75,collection_role='unverified' where hotel='KAT' and account_id=scope;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'false' or r->>'unverified'<>'1' then raise exception 'unknown root membership became available';end if;
 update public.ar_invoices set collection_role='standalone' where hotel='KAT' and account_id=scope;
 update public.ar_accounts set verification_state='missing' where hotel='KAT' and id=scope;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'false' or r->'metrics'->0->'amount'<>'null'::jsonb then raise exception 'unknown account became available';end if;
 update public.ar_accounts set verification_state='verified' where hotel='KAT' and id=scope;
 update public.ar_refresh_state set status='running',last_success_at=null where hotel='TSK';
 r:=public.ar_dashboard_balances(actor,d,null,null,'SYNTHETIC_FRESH');
 if r->>'complete'<>'false' or r->'missingHotels'<>'["TSK"]'::jsonb or r->'metrics'->0->'amount'<>'null'::jsonb
  or r->'freshness' is distinct from '{"refreshingHotels":["TSK"],"failedHotels":["KAT"]}'::jsonb then raise exception 'mixed hotel completeness or freshness incorrect';end if;

 -- Synthetic historical fixture only; latest current attempts cannot alter historical availability/times.
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts)
 values('KAT',past,publication,past::timestamp at time zone 'Asia/Bangkok',past::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type','SYNTHETIC_FRESH','verified',true)));
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,verified)
 values('KAT',past,scope,'HISTORIC','Synthetic history','SYNTHETIC_FRESH',past-1,12.34,true);
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 r:=public.ar_dashboard_balances(actor,past,'KAT',scope);
 if r->>'mode'<>'snapshot' or r->>'complete'<>'true' or r->'metrics'->0->>'amount'<>'12.34'
  or (r->>'sourceAt')::timestamptz<>(past::timestamp at time zone 'Asia/Bangkok') or (r->>'capturedAt')::timestamptz<>(past::timestamp at time zone 'Asia/Bangkok')
  or r->'freshness' is distinct from '{"refreshingHotels":[],"failedHotels":[]}'::jsonb then raise exception 'historical result adopted latest attempt state';end if;
 r:=public.ar_dashboard_balances(actor,past+1,'KAT',scope);
 if r->>'mode'<>'unavailable' or r->'metrics'->0->'amount'<>'null'::jsonb then raise exception 'historical gap was filled from current publication';end if;
 if public.ar_dashboard_balances(gen_random_uuid(),d)->>'error'<>'dashboard_forbidden'
  or has_function_privilege('anon','public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)','execute')
  or has_function_privilege('authenticated','public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)','execute')
  then raise exception 'freshness reader authorization leaked';end if;
end$$;
rollback;
select 'Dashboard publication/freshness, atomic staging, partial account and historical regression checks passed' as result;
