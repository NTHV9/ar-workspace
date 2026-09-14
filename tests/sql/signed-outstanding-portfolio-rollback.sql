-- Synthetic signed inventory only; every mutation and historical fixture rolls back.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-SIGNED-'||gen_random_uuid();kind text:='SYNTHETIC_SIGNED';
 d date:=(current_timestamp at time zone 'Asia/Bangkok')::date;past date:=date '1901-01-01';stamp timestamptz:=clock_timestamp();
 run uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();r jsonb;a jsonb;before_accounts jsonb;before_invoices jsonb;expected integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved synthetic actor missing';end if;
 if public.ar_portfolio_accounts(null)->>'error' is distinct from 'portfolio_forbidden'
  or public.ar_portfolio_accounts(gen_random_uuid())->>'error' is distinct from 'portfolio_forbidden'
  or public.ar_dashboard_balances(null,d)->>'error' is distinct from 'dashboard_forbidden'
 then raise exception 'signed reader actor validation missing';end if;
 if has_function_privilege('anon','public.ar_portfolio_accounts(uuid)','execute') or has_function_privilege('authenticated','public.ar_portfolio_accounts(uuid)','execute')
  or not has_function_privilege('service_role','public.ar_portfolio_accounts(uuid)','execute')
  or has_table_privilege('service_role','ar_private.dashboard_current_invoices','select')
  or has_table_privilege('authenticated','ar_private.dashboard_daily_captures','select')
 then raise exception 'signed reader ACL leaked';end if;
 if not exists(select 1 from pg_proc where oid='public.ar_portfolio_accounts(uuid)'::regprocedure and provolatile='s' and prosecdef and proconfig=array['search_path=""'])
 then raise exception 'portfolio atomic stable snapshot/search path missing';end if;
 if ar_private.dashboard_metric_membership(-30,true,true,30,d-40,d-10,90,d) is distinct from array['open']::text[]
  or ar_private.dashboard_metric_membership(0,true,true,30,d-40,d-10,90,d) is distinct from '{}'::text[]
  or ar_private.dashboard_metric_membership(-30,false,true,30,d-40,d-10,90,d) is distinct from '{}'::text[]
 then raise exception 'negative credit became actionable or zero became outstanding';end if;

 update public.ar_refresh_state set last_success_at=null where hotel in('KAT','TSK');
 if public.ar_portfolio_accounts(actor)->>'status' is distinct from 'not_connected' then raise exception 'unpublished source claimed connected';end if;
 update public.ar_refresh_state set last_success_at=stamp,status='succeeded' where hotel in('KAT','TSK');
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,aging,verification_state,synced_at)
 values('KAT',scope,'Synthetic signed roots',kind,140,33,5,'{"current":140,"over90":33}','verified',stamp),
  ('TSK',scope,'Synthetic separate hotel',kind,20,0,1,null,'verified',stamp),
  ('KAT',scope||'-OTHER','Synthetic separate account',kind||'_OTHER',9,0,1,null,'verified',stamp);
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'POS','POS','POS',d-1,100,100,90,'verified','standalone',false,stamp),
  ('KAT',scope,'PARENT','PARENT','PARENT',d-1,70,70,90,'verified','parent',true,stamp),
  ('KAT',scope,'CREDIT','CREDIT','CREDIT',d-1,-40,-30,90,'verified','standalone',false,stamp),
  ('KAT',scope,'ZERO','ZERO','ZERO',d-1,12,0,90,'cleared','standalone',false,stamp),
  ('TSK',scope,'POS','POS','POS',d-1,20,20,2,'verified','standalone',false,stamp),
  ('KAT',scope||'-OTHER','POS','POS','POS',d-1,9,9,2,'verified','standalone',false,stamp);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 values('KAT',scope,'CHILD-POS',d-1,90,90,'verified','child',false,'PARENT','PARENT',70,stamp),
  ('KAT',scope,'CHILD-CREDIT',d-1,-20,-20,'verified','child',false,'PARENT','PARENT',70,stamp);
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=case when invoice_id in('PARENT','CREDIT') then d-40 end where hotel='KAT' and account_id=scope;
 insert into ar_private.mail_deliveries(id,owner,mode,stage,message_id,snapshot,state,sent_at)
 values(delivery,actor,'send','Final','synthetic-'||delivery,'{}','sent',stamp-interval '1 minute');
 insert into public.ar_sent_events(delivery_id,owner,hotel,account_id,invoice_ids,purpose,stage,sent_at,gmail_id,open_at_send)
 values(delivery,actor,'KAT',scope,array['PARENT','CREDIT','CHILD-POS'],'collection','Final',stamp-interval '1 minute','synthetic-'||delivery,40);

 select jsonb_agg(to_jsonb(x) order by hotel,id) into before_accounts from public.ar_accounts x;
 select jsonb_agg(to_jsonb(x) order by hotel,account_id,id) into before_invoices from public.ar_invoices x;
 r:=public.ar_portfolio_accounts(actor);
 select value into a from jsonb_array_elements(r->'accounts') where value->>'hotel'='KAT' and value->>'id'=scope;
 if r->>'source' is distinct from 'opera' or r->>'status' is distinct from 'connected' or r->'refresh' is distinct from public.ar_refresh_status()
  or a->>'items' is distinct from '3' or a-'items' is distinct from (select to_jsonb(x)-'items' from public.ar_accounts x where hotel='KAT' and id=scope)
 then raise exception 'portfolio child count changed native signed account values or refresh contract';end if;
 if (select value->>'items' from jsonb_array_elements(r->'accounts') where value->>'hotel'='TSK' and value->>'id'=scope) is distinct from '1'
 then raise exception 'portfolio merged hotel identity';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'open',null,0,1);
 if r->>'complete' is distinct from 'true' or r->>'total' is distinct from '3' or r->'metrics'->0 is distinct from '{"key":"open","count":3,"amount":"140.00"}'::jsonb
  or r->'openBalanceBreakdown' is distinct from '{"positive":{"count":2,"amount":"170.00"},"credit":{"count":1,"amount":"-30.00"},"creditCoverageComplete":true}'::jsonb
  or r->'rows'->0->>'invoiceId' is distinct from 'POS' or jsonb_array_length(r->'rows')<>1
 then raise exception 'signed root totals/net or full totals across page incorrect';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'open',null,2,1);
 if r->'rows'->0->>'invoiceId' is distinct from 'CREDIT' or r->'rows'->0->>'open' is distinct from '-30.00' or r->>'total' is distinct from '3'
 then raise exception 'credit lost from outstanding pagination';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'billed');
 if r->>'total' is distinct from '1' or r->'metrics'->1->>'amount' is distinct from '70.00' then raise exception 'credit counted as billed work';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'past_due');
 if r->>'total' is distinct from '1' then raise exception 'credit counted as due work';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'over60');
 if r->>'total' is distinct from '2' or r->'metrics'->6->>'amount' is distinct from '170.00' then raise exception 'credit counted as aged work';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,null,'Final');
 if r->>'total' is distinct from '1' or (select value->>'amount' from jsonb_array_elements(r->'stages') where value->>'key'='Final') is distinct from '70.00'
 then raise exception 'credit or child counted as follow-up work';end if;
 r:=public.ar_dashboard_balances(actor,d,null,null,kind,'open');
 if r->>'total' is distinct from '4' or r->'metrics'->0->>'amount' is distinct from '160.00' then raise exception 'hotel/type filter scope changed signed net';end if;
 r:=public.ar_dashboard_invoice_entries(actor,d-1,d-1,'KAT',scope);
 if r->>'total' is distinct from '4' or not exists(select 1 from jsonb_array_elements(r->'rows') where value->>'transactionId'='ZERO')
  or exists(select 1 from jsonb_array_elements(r->'rows') where value->>'transactionId' like 'CHILD-%')
 then raise exception 'New Invoices lost cleared zero or regained children';end if;
 if (select jsonb_agg(to_jsonb(x) order by hotel,id) from public.ar_accounts x) is distinct from before_accounts
  or (select jsonb_agg(to_jsonb(x) order by hotel,account_id,id) from public.ar_invoices x) is distinct from before_invoices
 then raise exception 'readers mutated actual ledger';end if;

 -- Unknown relationship is visible and counted in Portfolio, never guessed to be a child.
 update public.ar_invoices set collection_role='unverified',compressed=null where hotel='KAT' and account_id=scope and id='CREDIT';
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete' is distinct from 'false' or r->>'unverified' is distinct from '1' or r->'metrics'->0->'amount' is distinct from 'null'::jsonb
  or r->'openBalanceBreakdown'->'credit' is distinct from '{"count":null,"amount":null}'::jsonb
  or not exists(select 1 from jsonb_array_elements(r->'rows') where value->>'invoiceId'='CREDIT' and value->>'verified'='false')
 then raise exception 'unknown credit relationship was hidden or claimed known';end if;
 if (select value->>'items' from jsonb_array_elements(public.ar_portfolio_accounts(actor)->'accounts') where value->>'hotel'='KAT' and value->>'id'=scope) is distinct from '3'
 then raise exception 'unknown relation assumed child';end if;
 update public.ar_invoices set collection_role='standalone',compressed=false where hotel='KAT' and account_id=scope and id='CREDIT';

 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at) values(run,'KAT','manual','succeeded',stamp-interval '1 minute',stamp);
 update public.ar_refresh_state set run_id=run,status='succeeded',last_success_at=stamp where hotel='KAT';
 select count(*) into expected from public.ar_accounts where hotel='KAT';
 perform ar_private.dashboard_capture(run,expected);
 if not exists(select 1 from ar_private.dashboard_daily_captures where hotel='KAT' and day=d and inventory_version='signed-v1' and complete)
  or not exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='CREDIT' and open=-30)
  or exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id like 'CHILD-%')
 then raise exception 'prospective capture lost signed inventory or included child';end if;
 -- Model a pre-upgrade capture of today's positives: workflow updates must not invent credit coverage.
 update ar_private.dashboard_daily_captures set inventory_version='positive-v1' where hotel='KAT' and day=d;
 delete from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='CREDIT';
 update public.ar_invoice_workflow set first_billing_date=d-5 where hotel='KAT' and account_id=scope and invoice_id='POS';
 if not exists(select 1 from ar_private.dashboard_daily_captures where hotel='KAT' and day=d and inventory_version='positive-v1')
  or exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='CREDIT')
 then raise exception 'workflow-only update invented missing credit inventory';end if;
 perform ar_private.dashboard_capture(run,expected);
 if not exists(select 1 from ar_private.dashboard_daily_captures where hotel='KAT' and day=d and inventory_version='signed-v1')
  or not exists(select 1 from ar_private.dashboard_daily_invoices where hotel='KAT' and day=d and account_id=scope and invoice_id='CREDIT')
 then raise exception 'same-day recapture failed to upgrade actual inventory';end if;
 -- Fixture-only historical rows. Production guards are restored immediately, and all rolls back.
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts,inventory_version)
 select 'KAT',v.day,run,v.day::timestamp at time zone 'Asia/Bangkok',v.day::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type',kind,'verified',true)),v.version
 from(values(past,'positive-v1'),(past+1,'signed-v1'))v(day,version);
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,original,age,billing_required,credit_term,first_billing_date,due_date,verified)
 select 'KAT',v.day,scope,v.id,'Synthetic historical',kind,v.day-90,v.open,v.open,90,true,30,v.day-40,v.day-10,true
 from(values(past,'POS',170),(past+1,'POS',170),(past+1,'CREDIT',-30))v(day,id,open);
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 r:=public.ar_dashboard_balances(actor,past,'KAT',scope);
 if r->>'complete' is distinct from 'true' or r->>'reason' is distinct from 'credit_snapshot_unavailable'
  or r->'metrics'->0 is distinct from '{"key":"open","count":null,"amount":null}'::jsonb
  or r->'metrics'->1->>'amount' is distinct from '170.00'
  or r->'openBalanceBreakdown' is distinct from '{"positive":{"count":1,"amount":"170.00"},"credit":{"count":null,"amount":null},"creditCoverageComplete":false}'::jsonb
 then raise exception 'legacy positive-only snapshot claimed signed inventory or hid positive work';end if;
 r:=public.ar_dashboard_balances(actor,past+1,'KAT',scope,null,'open',null,1,1);
 if r->'metrics'->0->>'amount' is distinct from '140.00' or r->'metrics'->0->>'count' is distinct from '2' or r->'rows'->0->>'invoiceId' is distinct from 'CREDIT'
  or r->'openBalanceBreakdown'->>'creditCoverageComplete' is distinct from 'true'
 then raise exception 'signed historical read lost stored credit';end if;
 begin update ar_private.dashboard_daily_captures set inventory_version='signed-v1' where hotel='KAT' and day=past;raise exception 'historical version rewrite accepted';
 exception when others then if sqlerrm<>'dashboard_history_immutable' then raise;end if;end;
 begin delete from ar_private.dashboard_daily_invoices where hotel='KAT' and day=past;raise exception 'historical invoice deletion accepted';
 exception when others then if sqlerrm<>'dashboard_history_immutable' then raise;end if;end;
end$$;
rollback;
select 'Signed outstanding, native Portfolio balances, action scope, history gaps, ACL and immutable snapshot tests passed and rolled back' as result;
