-- Synthetic-only verified negative invoice inventory; no provider activity.
begin;
do $$
declare actor uuid:=ar_private.access_owner();a text:='SYNTHETIC_CREDIT_112';d date:=(now() at time zone 'Asia/Bangkok')::date;past date:=date '1904-10-11';run uuid:=gen_random_uuid();r jsonb;s jsonb;
begin
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at) values('KAT',a,'Synthetic Credits','SYNTHETIC_CREDIT112',50,0,3,'verified',clock_timestamp()),('KAT',a||'-DRF','Synthetic balance-only','DRF',-10,0,1,'verified',clock_timestamp()),('KAT',a||'-NATIVE','Native account credit only','SYNTHETIC_CREDIT112',-100,0,0,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',a,v.id,'INV-'||v.id,'FOL-'||v.id,d-21,v.amount,v.amount,21,'verified','standalone',false,clock_timestamp() from(values('CREDIT1',-30),('CREDIT2',-20),('POS',100),('ZERO',0))v(id,amount);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at) values('KAT',a,'CHILD',d-21,-999,-999,21,'verified','child',false,'CREDIT1','INV-CREDIT1',-30,clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values('KAT',a||'-DRF','DRFCREDIT','INV-DRF','FOL-DRF',d,-10,-10,0,'verified','standalone',false,clock_timestamp());
 update public.ar_refresh_state set last_success_at=clock_timestamp(),status='succeeded' where hotel='KAT';
 r:=public.ar_dashboard_balances(actor,d,'KAT',a,null,'credit');s:=r->'openBalanceBreakdown'->'credit';
 if r->>'complete'<>'true' or r->>'total'<>'2' or s->>'count'<>'2' or s->>'amount'<>'-50.00' or (select sum((x->>'open')::numeric) from jsonb_array_elements(r->'rows')x)<>-50 or exists(select 1 from jsonb_array_elements(r->'rows')x where (x->>'open')::numeric>=0 or x->>'invoiceNo' is null or x->>'folioNo' is null) then raise exception 'credit summary/items/identity mismatch:%',r;end if;
 r:=public.ar_dashboard_balance_accounts(actor,d,'KAT',a,null,'credit');if r->>'total'<>'1' or r->'rows'->0->>'count'<>'2' or r->'rows'->0->>'amount'<>'-50.00' then raise exception 'credit comparison mismatch:%',r;end if;
 r:=ar_private.dashboard_summary_balances(actor,d,'KAT',a,null,'credit',null,0,50);if r->>'total'<>'2' then raise exception 'summary reader credit mismatch';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',a||'-DRF',null,'credit');if r->>'total'<>'1' or r->'rows'->0->>'open'<>'-10.00' then raise exception 'DRF negative invoice wrongly excluded';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',a||'-NATIVE',null,'credit');if r->>'total'<>'0' or r->'openBalanceBreakdown'->'credit'->>'amount'<>'0.00' then raise exception 'native account credit fabricated invoice';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',a,null,'open');if r->>'total'<>'3' or r->'metrics'->0->>'amount'<>'50.00' then raise exception 'net/positive/child inventory changed';end if;
 update public.ar_invoices set verification_state='missing' where hotel='KAT' and account_id=a and id='CREDIT1';
 r:=public.ar_dashboard_balances(actor,d,'KAT',a,null,'credit');if r->>'complete'<>'false' or r->'openBalanceBreakdown'->'creditCoverageComplete'<>'false'::jsonb or r->'openBalanceBreakdown'->'credit'->'amount'<>'null'::jsonb then raise exception 'unverified credit claimed exact totals';end if;
 update public.ar_invoices set verification_state='verified' where hotel='KAT' and account_id=a and id='CREDIT1';
 insert into ar_private.refresh_runs(id,hotel,reason,status,started_at,finished_at) values(run,'KAT','manual','succeeded',clock_timestamp()-interval '1 minute',clock_timestamp());
 alter table ar_private.dashboard_daily_captures disable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices disable trigger dashboard_invoice_today;
 insert into ar_private.dashboard_daily_captures(hotel,day,run_id,source_at,captured_at,complete,policy,accounts,inventory_version)
 select 'KAT',v.day,run,v.day::timestamp at time zone 'Asia/Bangkok',v.day::timestamp at time zone 'Asia/Bangkok',true,'[]',jsonb_build_array(jsonb_build_object('id',a,'type','DRF','verified',true)),v.version from(values(past,'positive-v1'),(past+1,'signed-v1'))v(day,version);
 insert into ar_private.dashboard_daily_invoices(hotel,day,account_id,invoice_id,account_name,account_type,invoice_no,folio_no,transaction_date,open,original,age,verified)
 select 'KAT',v.day,a,v.id,'Synthetic Credits','DRF','INV-'||v.id,'FOL-'||v.id,v.day,v.amount,v.amount,0,true from(values(past,'POS',100),(past+1,'POS',100),(past+1,'CREDIT',-30))v(day,id,amount);
 alter table ar_private.dashboard_daily_captures enable trigger dashboard_capture_today;
 alter table ar_private.dashboard_daily_invoices enable trigger dashboard_invoice_today;
 r:=public.ar_dashboard_balances(actor,past,'KAT',a,null,'credit');if r->>'complete'<>'false' or r->>'reason'<>'credit_snapshot_unavailable' or r->'openBalanceBreakdown'->'credit'->'count'<>'null'::jsonb then raise exception 'unsigned history claimed credit zero';end if;
 r:=public.ar_dashboard_balance_accounts(actor,past,'KAT',a,null,'credit');if r->>'complete'<>'false' or r->>'reason'<>'credit_snapshot_unavailable' then raise exception 'unsigned account drill trusted';end if;
 r:=ar_private.dashboard_summary_balances(actor,past,'KAT',a,null,'credit',null,0,50);if r->>'complete'<>'false' then raise exception 'unsigned summary trusted';end if;
 r:=public.ar_dashboard_balances(actor,past+1,'KAT',a,null,'credit');if r->>'complete'<>'true' or r->>'total'<>'1' or r->'rows'->0->>'open'<>'-30.00' then raise exception 'signed historical DRF credit excluded';end if;
 r:=public.ar_dashboard_balance_accounts(actor,past+1,'KAT',a,null,'credit');if r->'rows'->0->>'amount'<>'-30.00' or r->'rows'->0->>'count'<>'1' then raise exception 'historical comparison mismatch';end if;
end$$;
rollback;
