-- Synthetic-only boundary and summary/matrix/drill consistency.
begin;
do $$
declare actor uuid:=ar_private.access_owner();d date:=(now() at time zone 'Asia/Bangkok')::date;a text:='SYNTHETIC_UNBILLED31_111';r jsonb;m jsonb;h jsonb;age_value integer;keys text[];
begin
 foreach age_value in array array[30,31,60,61,91] loop
 keys:=ar_private.dashboard_metric_membership(1,true,true,30,null,d-1,age_value,d);
 if ('over60_unbilled'=any(keys)) is distinct from (age_value>=31) or ('over60'=any(keys)) is distinct from (age_value>60) then raise exception 'unbilled31/general61 boundary:%',age_value;end if;
 end loop;
 if 'over60_unbilled'=any(ar_private.dashboard_metric_membership(1,true,true,30,d,d-1,31,d)) or 'over60_unbilled'=any(ar_private.dashboard_metric_membership(1,true,false,30,null,d-1,31,d)) or 'over60_unbilled'=any(ar_private.dashboard_metric_membership(-1,true,true,30,null,d-1,31,d)) or 'over60_unbilled'=any(ar_private.dashboard_metric_membership(0,true,true,30,null,d-1,31,d)) or 'over60_unbilled'=any(ar_private.dashboard_metric_membership(1,false,true,30,null,d-1,31,d)) then raise exception 'billing/positive/verification fences changed';end if;
 if not 'over60_unbilled'=any(ar_private.dashboard_metric_membership(1,true,true,30,d+1,d-1,31,d)) then raise exception 'future actual billing changed as-of semantics';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at) values('KAT',a,'Synthetic 31-day','SYNTHETIC31',355,50,9,'verified',clock_timestamp()),('KAT',a||'-DRF','Synthetic balance-only','DRF',100,0,1,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',a,v.id,d-v.age,v.amount,v.amount,v.age,'verified','standalone',false,clock_timestamp() from(values('30',30,10),('31',31,20),('60',60,30),('61',61,40),('91',91,50),('BILLED',31,60),('FUTURE',31,70),('NOT',31,80),('CREDIT',31,-5),('ZERO',31,0))v(id,age,amount);
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,parent_invoice_id,parent_invoice_no,parent_open,synced_at) values('KAT',a,'CHILD',d-31,100,100,31,'verified','child',false,'31','31',20,clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values('KAT',a||'-DRF','DRF31',d-31,100,100,31,'verified','standalone',false,clock_timestamp());
 update public.ar_invoice_workflow set billing_required=invoice_id<>'NOT',credit_term=30,first_billing_date=case invoice_id when 'BILLED' then d when 'FUTURE' then d+1 end where hotel='KAT' and account_id in(a,a||'-DRF');
 update public.ar_refresh_state set status='succeeded',last_success_at=clock_timestamp() where hotel='KAT';
 r:=public.ar_dashboard_balances(actor,d,'KAT',a,null,'over60_unbilled');select value into m from jsonb_array_elements(r->'metrics') where value->>'key'='over60_unbilled';
 if r->>'complete'<>'true' or r->>'total'<>'5' or m->>'count'<>'5' or m->>'amount'<>'210.00' or (select array_agg(x->>'invoiceId' order by x->>'invoiceId') from jsonb_array_elements(r->'rows')x)<>array['31','60','61','91','FUTURE'] then raise exception 'unbilled31 card/invoice drill inconsistency:%',r;end if;
 r:=public.ar_dashboard_balance_accounts(actor,d,'KAT',a,null,'over60_unbilled',null,0,50,null,null);
 if r->>'total'<>'1' or r->'rows'->0->>'count'<>'5' or r->'rows'->0->>'amount'<>'210.00' then raise exception 'unbilled31 account drill mismatch:%',r;end if;
 r:=public.ar_dashboard_management(actor,d-100,d,'KAT',a);h:=r->'hotels'->0;
 if h->>'unbilled31'<>'5' or h->>'unbilled61'<>'1' or h->>'over60'<>'2' or h->>'amount'<>'355.00' or r->'accountsOver60'->0->>'amount'<>'90.00' then raise exception 'hotel matrix/general age inventory mismatch:%',r;end if;
 select value into m from jsonb_array_elements(r->'metrics') where value->>'key'='over60_unbilled';if m->>'count' is distinct from h->>'unbilled31' or m->>'amount'<>'210.00' then raise exception 'card/matrix membership mismatch';end if;
 r:=public.ar_dashboard_balances(actor,d,'KAT',a||'-DRF',null,'over60_unbilled');if r->>'total'<>'0' then raise exception 'DRF entered business drill';end if;
 r:=public.ar_dashboard_management(actor,d-100,d,'KAT',a||'-DRF');if r->'hotels'->0->>'unbilled31'<>'0' then raise exception 'DRF entered matrix';end if;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at) values('KAT',a,'UNKNOWN_AGE',d,5,5,null,'verified','standalone',false,clock_timestamp());
 r:=public.ar_dashboard_balances(actor,d,'KAT',a,null,'over60_unbilled');select value into m from jsonb_array_elements(r->'metrics') where value->>'key'='over60_unbilled';if m->'count'<>'null'::jsonb or m->'amount'<>'null'::jsonb then raise exception 'unknown age represented as exact count';end if;
 r:=public.ar_dashboard_management(actor,d-100,d,'KAT',a);if r->>'agesComplete'<>'false' or r->'hotels'->0->'unbilled31'<>'null'::jsonb then raise exception 'unknown matrix age represented as zero';end if;
end$$;
rollback;
