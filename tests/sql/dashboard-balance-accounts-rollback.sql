-- Synthetic only. No providers, financial writes, or durable fixture changes.
begin;
do $$
declare actor uuid;d date:=(current_timestamp at time zone 'Asia/Bangkok')::date;scope text:='SYNTHETIC-ACCOUNTS-'||gen_random_uuid();a jsonb;i jsonb;base jsonb;k text;run uuid:=gen_random_uuid();past date:=date '1902-01-02';
begin
 select id into actor from auth.users where email='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 if public.ar_dashboard_balance_accounts(null,d)->>'error' is distinct from 'dashboard_forbidden' then raise exception 'account actor fence';end if;
 if has_function_privilege('anon','public.ar_dashboard_balance_accounts(uuid,date,text,text,text,text,text,integer,integer,integer,integer)','execute')
  or has_function_privilege('authenticated','public.ar_dashboard_balance_invoices(uuid,date,text,text,text,text,text,integer,integer,integer,integer)','execute') then raise exception 'account read ACL leak';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at)
 values('KAT',scope,'Synthetic accounts','SYNTHETIC_ACCOUNT_GROUP',420,0,4,'verified',clock_timestamp()),('TSK',scope,'Synthetic accounts','SYNTHETIC_ACCOUNT_GROUP',900,0,1,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,v.id,d-200,v.amount,v.amount,v.age,'verified','standalone',false,clock_timestamp()
 from(values('A',100,60),('B',200,61),('C',150,90),('D',-30,91))v(id,amount,age);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('TSK',scope,'A',d-200,900,900,120,'verified','standalone',false,clock_timestamp());
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,first_billing_date=case when invoice_id='B' then d-10 end,account_setup_required=false where account_id=scope;
 update public.ar_refresh_state set status='succeeded',last_success_at=clock_timestamp() where hotel in('KAT','TSK');
 a:=public.ar_dashboard_balance_accounts(actor,d,null,null,'SYNTHETIC_ACCOUNT_GROUP','open');
 if a->>'total'<>'2' or a->'rows'->0->>'hotel'<>'TSK' or a->'rows'->1->>'amount'<>'420.00' or a->'rows'->1->>'count'<>'4' then raise exception 'exact Hotel Account grouping, signed value or ordering';end if;
 foreach k in array array['All','Phuket','KhaoLak','KAT','TSK','TLKL','WAKL','TLFO','TSAN'] loop
  a:=public.ar_dashboard_balance_accounts(actor,d,k,null,'SYNTHETIC_ACCOUNT_GROUP','open');
  i:=public.ar_dashboard_balances(actor,d,k,null,'SYNTHETIC_ACCOUNT_GROUP','open');
  if a-'rows'-'total' is distinct from i-'rows'-'total' then raise exception 'report scope metadata differs: %',k;end if;
  if coalesce((select sum((x->>'count')::int) from jsonb_array_elements(a->'rows')x),0)<>(i->>'total')::int then raise exception 'report scope group count differs: %',k;end if;
 end loop;
 base:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,'open');
 a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope,null,'open',null,0,50,61,90);
 i:=public.ar_dashboard_balance_invoices(actor,d,'KAT',scope,null,'open',null,0,50,61,90);
 if a->>'total'<>'1' or a->'rows'->0->>'count'<>'2' or a->'rows'->0->>'amount'<>'350.00' or a->'rows'->0->>'oldest'<>'90' or i->>'total'<>'2' then raise exception 'inclusive age boundaries differ';end if;
 if a-'rows'-'total' is distinct from base-'rows'-'total' or i-'rows'-'total' is distinct from base-'rows'-'total' then raise exception 'summary coverage changed by age filter';end if;
 foreach k in array array['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled'] loop
  a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope,null,k);
  i:=public.ar_dashboard_balances(actor,d,'KAT',scope,null,k, null,0,200);
  if a-'rows'-'total' is distinct from i-'rows'-'total' or coalesce((a->'rows'->0->>'count')::int,0)<>(i->>'total')::int then raise exception 'account/invoice membership diverged: %',k;end if;
 end loop;
 a:=public.ar_dashboard_balance_accounts(actor,d,null,null,'SYNTHETIC_ACCOUNT_GROUP','open',null,1,1);
 if a->>'total'<>'2' or jsonb_array_length(a->'rows')<>1 or a->'rows'->0->>'hotel'<>'KAT' then raise exception 'account paging lost total';end if;
 if public.ar_dashboard_balance_accounts(actor,d,'KAT',scope,null,null,null,0,50,91,90)->>'error' is distinct from 'dashboard_invalid'
  or public.ar_dashboard_balance_invoices(actor,d,'KAT',scope,null,null,null,0,50,-1,null)->>'error' is distinct from 'dashboard_invalid' then raise exception 'SQL age validation';end if;
 update public.ar_invoices set age=null where hotel='KAT' and account_id=scope and id='A';
 a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope);
 if a->'rows'->0->'oldest'<>'null'::jsonb then raise exception 'unknown age became exact oldest';end if;
 a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope,null,'open',null,0,50,61,90);
 i:=public.ar_dashboard_balance_invoices(actor,d,'KAT',scope,null,'open',null,0,50,61,90);
 if a->>'complete'<>'false' or i->>'complete'<>'false' or a->>'reason'<>'age_scope_incomplete' or i->>'reason'<>'age_scope_incomplete' then raise exception 'age filter silently omitted unclassifiable invoice';end if;
 update public.ar_invoices set verification_state='missing' where hotel='KAT' and account_id=scope and id='A';
 a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope);
 if a->>'complete'<>'false' or a->'rows'->0->'amount'<>'null'::jsonb or a->'rows'->0->>'verified'<>'false' then raise exception 'unverified source became exact account sum';end if;
 a:=public.ar_dashboard_balance_accounts(actor,date '1902-01-01','KAT',scope);
 if a->>'mode'<>'unavailable' or a->>'complete'<>'false' or a->>'total'<>'0' then raise exception 'missing snapshot substituted current';end if;
 a:=public.ar_dashboard_balance_accounts(actor,d,'KhaoLak',null,'SYNTHETIC_ACCOUNT_GROUP');
 if a->>'total'<>'0' then raise exception 'regional identity leak';end if;
 -- Historical account grouping reads the stored money, policy and identity only.
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at) values(run,'KAT','manual','succeeded',clock_timestamp()-interval '1 minute',clock_timestamp());
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts,inventory_version)
 values('KAT',past,run,past::timestamp at time zone 'Asia/Bangkok',past::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',scope,'type','SYNTHETIC_ACCOUNT_GROUP','verified',true)),'signed-v1');
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,transaction_date,open,original,age,billing_required,credit_term,first_billing_date,due_date,latest_stage,latest_stage_label,verified)
 values('KAT',past,scope,'HISTORIC','Historical account','SYNTHETIC_ACCOUNT_GROUP',past-90,700,1000,90,true,30,past-40,past-10,'Final','Historical final',true),
 ('KAT',past,scope,'CREDIT','Historical account','SYNTHETIC_ACCOUNT_GROUP',past+2,-30,-30,-2,true,30,null,null,null,null,true);
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 a:=public.ar_dashboard_balance_accounts(actor,past,'KAT',scope,null,'open');
 i:=public.ar_dashboard_balances(actor,past,'KAT',scope,null,'open');
 if a->>'mode'<>'snapshot' or a->'rows'->0->>'accountName'<>'Historical account' or a->'rows'->0->>'amount'<>'670.00' or a-'rows'-'total' is distinct from i-'rows'-'total' then raise exception 'historical group mixed current facts';end if;
 a:=public.ar_dashboard_balance_accounts(actor,past,'KAT',scope,null,null,'Final');
 if a->'rows'->0->>'amount'<>'700.00' or a->'rows'->0->>'count'<>'1' then raise exception 'historical current-stage membership';end if;
 a:=public.ar_dashboard_balance_accounts(actor,past,'KAT',scope,null,'open',null,0,50,null,30);
 i:=public.ar_dashboard_balance_invoices(actor,past,'KAT',scope,null,'open',null,0,50,null,30);
 if a->'rows'->0->>'amount'<>'-30.00' or a->'rows'->0->>'oldest'<>'-2' or i->'rows'->0->>'age'<>'-2' then raise exception 'up-to30 excluded future-base negative ages';end if;
 update public.ar_invoices set age=60,verification_state='verified' where hotel='KAT' and account_id=scope and id='A';
 update public.ar_invoices set age=null where hotel='KAT' and account_id=scope and id='D';
 a:=public.ar_dashboard_balance_accounts(actor,d,'KAT',scope,null,'open',null,0,50,null,30);
 if a->>'complete'<>'false' or a->>'reason'<>'age_scope_incomplete' then raise exception 'unknown signed credit age hidden';end if;
end$$;
rollback;
