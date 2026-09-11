-- Synthetic-only transaction: source uncertainty must stay distinct from known nonpositive balances.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-DASH-MEMBER-'||gen_random_uuid();d date:=(clock_timestamp() at time zone 'Asia/Bangkok')::date;r jsonb;case_row record;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at) values('KAT',scope,'Synthetic membership account','SYNTHETIC_MEMBERSHIP',100,0,1,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT',scope,'ROOT',d-1,100,100,'verified','standalone',false,clock_timestamp());
 update public.ar_refresh_state set status='succeeded',last_success_at=clock_timestamp() where hotel='KAT';
 -- Reproduce the hosted population: source-confirmed zero, relationship no longer audited.
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,synced_at) values('KAT',scope,'CLEARED-UNKNOWN-ROLE',d-1,100,0,'cleared','unverified',clock_timestamp());
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->>'total'<>'1' or r->>'unverified'<>'0' or r->'metrics'->0->>'count'<>'1' or r->'metrics'->0->>'amount'<>'100.00' then raise exception 'confirmed cleared-zero unknown relationship incorrectly blocks positive totals';end if;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,synced_at)
 select 'KAT',scope,id,d-1,100,amount,state,'unverified',clock_timestamp() from(values('VERIFIED-ZERO',0,'verified'),('VERIFIED-CREDIT',-25,'verified'),('CLEARED-CREDIT',-30,'cleared'))v(id,amount,state);
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->>'total'<>'1' or r->>'unverified'<>'0' then raise exception 'confirmed nonpositive unknown relationships entered open-debt scope';end if;
 -- Relationship ambiguity on a positive balance is still unsafe, even when the source amount is verified.
 -- Missing/unknown source amounts remain explicit even at zero or credit values; no absence-to-zero inference.
 for case_row in select * from(values('POSITIVE-RELATION',50,'verified'),('MISSING-ZERO',0,'missing'),('UNKNOWN-ZERO',0,'unknown'),('UNKNOWN-CREDIT',-10,'unknown'),('MISSING-POSITIVE',20,'missing'))v(id,amount,state) loop
  insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,synced_at) values('KAT',scope,case_row.id,d-1,100,case_row.amount,case_row.state,'unverified',clock_timestamp());
  r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
  if r->>'complete'<>'false' or r->>'unverified'<>'1' or r->'metrics'->0->'count'<>'null'::jsonb or r->'metrics'->0->'amount'<>'null'::jsonb or not exists(select 1 from jsonb_array_elements(r->'rows')j where j->>'invoiceId'=case_row.id and j->>'verified'='false') then raise exception 'source or positive relationship uncertainty was discarded';end if;
  -- Simulate subsequent source confirmation; only this synthetic row is updated.
  update public.ar_invoices set open=0,verification_state='cleared' where hotel='KAT' and account_id=scope and id=case_row.id;
 end loop;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 values('KAT',scope,'CHILD',d-1,100,100,'verified','child',false,'ROOT','ROOT',100,clock_timestamp());
 r:=public.ar_dashboard_balances(actor,d,'KAT',scope);
 if r->>'complete'<>'true' or r->>'total'<>'1' or r->'metrics'->0->>'amount'<>'100.00' or exists(select 1 from jsonb_array_elements(r->'rows')j where j->>'invoiceId'='CHILD') then raise exception 'child double-count protection changed';end if;
 if has_table_privilege('anon','ar_private.dashboard_current_invoices','select') or has_table_privilege('authenticated','ar_private.dashboard_current_invoices','select') or has_table_privilege('service_role','ar_private.dashboard_current_invoices','select') then raise exception 'private view access changed';end if;
end$$;
rollback;
select 'Dashboard confirmed-zero/credit membership and source uncertainty regressions passed and rolled back' as result;
