-- Retired report captures must not be a side effect of current source/workflow work.
-- All identities and provider evidence below are synthetic; every mutation rolls back.
begin;
create function pg_temp.retired_capture_rows() returns jsonb language sql stable as $$
 select jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by hotel,day),'[]') from ar_private.daily_ar_captures t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by hotel,day,account_id),'[]') from ar_private.daily_ar_accounts t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by hotel,day),'[]') from ar_private.dashboard_daily_captures t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by hotel,day,account_id,invoice_id),'[]') from ar_private.dashboard_daily_invoices t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by hotel),'[]') from ar_private.dashboard_capture_state t));
$$;
create function pg_temp.current_payload(scope text,amount numeric,include_invoice boolean default true,unconfirmed jsonb default '[]') returns jsonb language sql as $$
 select jsonb_build_object('account',jsonb_build_object('hotel','TSAN','id',scope,'name','Synthetic retirement','type','SYNTHETIC_RETIRE','account_no','SYN-RETIRE','open',amount,'over90',0,'items',1,'currency','THB','creditLimit',null,'oldest',70,'agingBuckets','[]'::jsonb,'business_date',current_date),
 'invoices',case when include_invoice then jsonb_build_array(jsonb_build_object('hotel','TSAN','account_id',scope,'id','i','invoice_no','SYN-INV','folio_no','SYN-FOLIO','transaction_date',current_date-70,'original',100,'open',amount,'age',70,'collection_role','standalone','compressed',false)) else '[]'::jsonb end,'unconfirmedInvoiceIds',unconfirmed);
$$;
do $$
#variable_conflict use_variable
declare actor uuid;scope text:='SYNTH-RETIRE-'||gen_random_uuid();run uuid:=gen_random_uuid();again uuid;bad uuid;lease uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();d date:=(now() at time zone 'Asia/Bangkok')::date;
 before_rows jsonb;published timestamptz;zero_since timestamptz;r jsonb;management jsonb;sheet jsonb;revisions bigint;before_invoice jsonb;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 before_rows:=pg_temp.retired_capture_rows();
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,lease_until) values(run,'TSAN','manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 perform public.ar_stage_account(run,pg_temp.current_payload(scope,100));
 -- Incomplete publication must keep staged/current data and publication timestamps atomic.
 begin perform public.ar_publish_refresh(run,2);raise exception 'incomplete publication accepted';exception when others then if sqlerrm<>'refresh_incomplete' then raise;end if;end;
 if exists(select 1 from public.ar_accounts where hotel='TSAN' and id=scope) or not exists(select 1 from ar_private.refresh_stage where job_id=run) or (select status from ar_private.refresh_runs where id=run)<>'running' then raise exception 'failed publication leaked partial data';end if;
 perform public.ar_publish_refresh(run,1);
 select finished_at into published from ar_private.refresh_runs where id=run;
 if not exists(select 1 from public.ar_accounts where hotel='TSAN' and id=scope and open=100 and verification_state='verified') or not exists(select 1 from public.ar_invoices where hotel='TSAN' and account_id=scope and id='i' and open=100 and verification_state='verified') or exists(select 1 from ar_private.refresh_stage where job_id=run) then raise exception 'core publication changed';end if;
 perform public.ar_publish_refresh(run,1);
 perform ar_private.dashboard_capture(run,1);
 if pg_temp.retired_capture_rows() is distinct from before_rows then raise exception 'current publication still writes retired daily report captures';end if;
 r:=public.ar_dashboard_balance_invoices(actor,d,'TSAN',scope);
 if r->>'complete'<>'true' or r->'metrics'->0->>'amount'<>'100.00' or r->'rows'->0->>'invoiceId'<>'i' or (r->>'sourceAt')::timestamptz<>published or (r->>'capturedAt')::timestamptz<published then raise exception 'current invoice Dashboard needs retired daily capture: %',r;end if;
 management:=public.ar_dashboard_management(actor,d,d,'TSAN',scope);
 if management->>'complete'<>'true' then raise exception 'current management needs retired daily capture: %',management;end if;
 if public.ar_dashboard_balance_invoices(gen_random_uuid(),d,'TSAN',scope)->>'error'<>'dashboard_forbidden' or public.ar_dashboard_management(gen_random_uuid(),d,d,'TSAN',scope)->>'error'<>'dashboard_forbidden' then raise exception 'Dashboard actor boundary widened';end if;
 if has_function_privilege('anon','public.ar_publish_refresh(uuid,integer)','execute') or has_function_privilege('authenticated','public.ar_publish_refresh(uuid,integer)','execute') or not has_function_privilege('service_role','public.ar_publish_refresh(uuid,integer)','execute') or has_function_privilege('service_role','ar_private.publish_before_retained_zero(uuid,integer)','execute') then raise exception 'publisher privilege boundary changed';end if;
 -- A later retired cache timestamp must not override current published freshness.
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts) values('TSAN',d,run,published,(d+time '23:59') at time zone 'Asia/Bangkok',true,'[]','[]');
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,verified) values('TSAN',d,scope,'i','Synthetic frozen capture','SYNTHETIC_RETIRE',d-70,987,true);
 before_rows:=pg_temp.retired_capture_rows();
 r:=public.ar_dashboard_balance_invoices(actor,d,'TSAN',scope);
 if (r->>'capturedAt')::timestamptz>clock_timestamp() or r->'metrics'->0->>'amount'<>'100.00' then raise exception 'current read still enriches from retired capture';end if;
 -- Sheet R/U/V/W remains authoritative, including employee deletion.
 perform public.ar_settings_save_v2(actor,'TSAN',scope,0,true,30,'{"to":[],"cc":[],"bcc":[]}','{"to":[],"cc":[],"bcc":[]}','{}');
 perform public.ar_tracker_connect(actor,'khao-lak','synthetic_retired_capture_12345',0);
 update ar_private.tracker_bindings set bootstrap_confirmed=true,lock_id=lease,lock_until=now()+interval '10 minutes' where region='khao-lak';
 sheet:=jsonb_build_object('rowKey',scope,'hotel','TSAN','accountNo','SYN-RETIRE','invoiceNo','SYN-INV','folio','SYN-FOLIO','transactionDate',(current_date-70)::text,'fields',jsonb_build_object('R',(d-40)::text,'S','30','T',(d-10)::text,'U',(d-3)::text,'V',(d-2)::text,'W',(d-1)::text),'locator','{}'::jsonb);
 r:=public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(sheet));
 if r?'error' then raise exception 'Sheet snapshot rejected: %',r;end if;
 r:=public.ar_dashboard_balances(actor,d,'TSAN',scope);
 if r->'rows'->0->>'dueDate'<>(d-10)::text or not exists(select 1 from jsonb_array_elements(r->'stages')s where s->>'key'='Follow 3' and s->>'count'='1' and s->>'amount'='100.00') then raise exception 'live dates/stages need daily capture: %',r;end if;
 r:=public.ar_tracker_snapshot(actor,'khao-lak',lease,jsonb_build_array(jsonb_set(sheet,'{fields}',jsonb_build_object('R',null,'S','30','T',null,'U',null,'V',null,'W',null))));
 if exists(select 1 from public.ar_invoice_workflow where hotel='TSAN' and account_id=scope and (first_billing_date is not null or due_date is not null or last_reminder_stage is not null or last_reminder_date is not null)) then raise exception 'Sheet deletion lost authority';end if;
 -- Actual verified Sent remains durable and appears once in current stage counts.
 select revision into revisions from public.ar_invoice_workflow where hotel='TSAN' and account_id=scope and invoice_id='i';
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state,gmail_id,sent_at) values(delivery,actor,'send','synthetic-'||delivery,jsonb_build_object('expected',jsonb_build_object('mailbox','khao-lak','sender','ar@thesandskhaolak.com'),'workflow',jsonb_build_array(jsonb_build_object('hotel','TSAN','account_id',scope,'invoice_id','i','revision',revisions))),'pending','synthetic-'||delivery,now()-interval '1 minute');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send) values(delivery,actor,'TSAN',scope,array['i'],'collection','Friendly',now()-interval '1 minute','synthetic-'||delivery,100);
 update ar_private.mail_deliveries set state='sent' where id=delivery;
 r:=public.ar_dashboard_balances(actor,d,'TSAN',scope);
 if not exists(select 1 from jsonb_array_elements(r->'stages')s where s->>'key'='Friendly' and s->>'count'='1' and s->>'amount'='100.00') or not exists(select 1 from ar_private.report_sent_invoices where delivery_id=delivery and workflow_revision_before_send=revisions) then raise exception 'actual Sent/revision disappeared from current stage: %',r;end if;
 if pg_temp.retired_capture_rows() is distinct from before_rows then raise exception 'workflow/Sheet/Sent still changes retired daily report snapshots';end if;
 -- Unknown/missing is never zero; real zero/reopened transitions and dates stay durable.
 again:=gen_random_uuid();insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(again,'TSAN',scope,'manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 perform public.ar_stage_account(again,pg_temp.current_payload(scope,100,false));perform public.ar_publish_refresh(again,1);
 if not exists(select 1 from public.ar_invoices where hotel='TSAN' and account_id=scope and id='i' and open=100 and verification_state='missing') or (select last_open from ar_private.invoice_verified_balances where hotel='TSAN' and account_id=scope and invoice_id='i')<>100 then raise exception 'missing became zero';end if;
 again:=gen_random_uuid();insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(again,'TSAN',scope,'manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 perform public.ar_stage_account(again,pg_temp.current_payload(scope,0));perform public.ar_publish_refresh(again,1);
 select b.zero_since into zero_since from ar_private.invoice_verified_balances b where hotel='TSAN' and account_id=scope and invoice_id='i' and last_open=0;
 if zero_since is null then raise exception 'verified-zero retention evidence lost';end if;
 again:=gen_random_uuid();insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(again,'TSAN',scope,'manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 perform public.ar_stage_account(again,pg_temp.current_payload(scope,0,false,'["i"]'));perform public.ar_publish_refresh(again,1);
 if not exists(select 1 from public.ar_invoices where hotel='TSAN' and account_id=scope and id='i' and open=0 and verification_state='missing') or (select b.zero_since from ar_private.invoice_verified_balances b where hotel='TSAN' and account_id=scope and invoice_id='i') is distinct from zero_since then raise exception 'retained zero invalidation/evidence changed';end if;
 again:=gen_random_uuid();insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(again,'TSAN',scope,'manual','running',clock_timestamp(),clock_timestamp()+interval '10 minutes');
 perform public.ar_stage_account(again,pg_temp.current_payload(scope,60));perform public.ar_publish_refresh(again,1);
 if not exists(select 1 from ar_private.invoice_exception_history where hotel='TSAN' and account_id=scope and invoice_id='i' and action='source_reopened') or not exists(select 1 from ar_private.invoice_balance_observations where hotel='TSAN' and account_id=scope and invoice_id='i' and kind='observed_reopened' and observed_open=60) or not exists(select 1 from public.ar_sent_events where delivery_id=delivery) then raise exception 'zero/reopen/Sent business evidence lost';end if;
 if pg_temp.retired_capture_rows() is distinct from before_rows then raise exception 'later scoped publications write retired captures';end if;
 -- Lease/missing-run guards are still enforced without any mutation.
 before_invoice:=(select to_jsonb(i) from public.ar_invoices i where hotel='TSAN' and account_id=scope and id='i');
 bad:=gen_random_uuid();insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,started_at,lease_until) values(bad,'TSAN',scope,'manual','running',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 minute');
 begin perform public.ar_publish_refresh(bad,1);raise exception 'expired lease accepted';exception when others then if sqlerrm<>'refresh_lease_invalid' then raise;end if;end;
 begin perform public.ar_publish_refresh(gen_random_uuid(),1);raise exception 'missing run accepted';exception when others then if sqlerrm<>'refresh_run_missing' then raise;end if;end;
 if (select to_jsonb(i) from public.ar_invoices i where hotel='TSAN' and account_id=scope and id='i') is distinct from before_invoice then raise exception 'failed publisher mutated source';end if;
end$$;
select 'Retired daily writes stopped; current Dashboard/Sheet/Sent/atomic publication/verified-zero evidence preserved; rolling back' as result;
rollback;
