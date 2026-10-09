begin;
do $$
declare actor uuid;d date:=(current_timestamp at time zone 'Asia/Bangkok')::date;scope text:='SYNTHETIC-MANAGEMENT-'||gen_random_uuid();r jsonb;row jsonb;
begin
 select id into actor from auth.users where email='ar@katathani.com' and email_confirmed_at is not null;
 if actor is null then raise exception 'fixture actor missing';end if;
 if has_function_privilege('anon','public.ar_dashboard_management(uuid,date,date,text,text,text)','execute') or has_function_privilege('authenticated','public.ar_dashboard_management(uuid,date,date,text,text,text)','execute') then raise exception 'management ACL leaked';end if;
 if public.ar_dashboard_management(null,d,d)->>'error' is distinct from 'dashboard_forbidden' or public.ar_dashboard_management(actor,d+1,d)->>'error' is distinct from 'dashboard_invalid' then raise exception 'management actor/date validation';end if;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state,synced_at)
 values('KAT',scope,'Synthetic management','SYNTHETIC_MANAGEMENT',870,400,6,'verified',clock_timestamp()),('TSK',scope,'Synthetic management','SYNTHETIC_MANAGEMENT',900,900,1,'verified',clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,v.id,v.id,'F-'||v.id,d-v.days,v.original,v.open,v.age,'verified','standalone',false,clock_timestamp()
 from(values('A',60,200,100,60),('B',61,300,50,61),('C',91,400,400,91),('D',70,-30,-30,70),('E',20,500,0,20),('F',0,100,100,1),('G',0,250,250,2))v(id,days,original,open,age);
 insert into public.ar_invoices(hotel,account_id,id,invoice_no,folio_no,transaction_date,original,open,age,verification_state,collection_role,compressed,synced_at)
 values('TSK',scope,'A','A','F-A',d-120,900,900,120,'verified','standalone',false,clock_timestamp());
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,parent_invoice_no,parent_invoice_id,parent_open,synced_at)
 values('KAT',scope,'CHILD',d,100,0,'verified','child',false,'A','A',100,clock_timestamp());
 update public.ar_invoice_workflow set billing_required=case when invoice_id='F' then false when invoice_id='G' then null else true end,credit_term=case when invoice_id='G' then null else 30 end,
  first_billing_date=case when invoice_id in('B','E') then d-10 end,account_setup_required=false where account_id=scope;
 update public.ar_refresh_state set status='succeeded',last_success_at=clock_timestamp() where hotel in('KAT','TSK');
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',scope);
 if r->>'complete'<>'true' or r->>'agesComplete'<>'true' or r->>'cohortComplete'<>'true' then raise exception 'management known coverage lost';end if;
 if r->'hotels'->0->>'amount'<>'870.00' or r->'hotels'->0->>'count'<>'6' or r->'hotels'->0->'bands'->2->>'amount'<>'20.00' then raise exception 'signed ranges/partial payments incorrect';end if;
 if jsonb_array_length(r->'accountsOver60')<>1 or r->'accountsOver60'->0->>'count'<>'2' or r->'accountsOver60'->0->>'amount'<>'450.00' or r->'accountsOver60'->0->>'unbilledAmount'<>'400.00' then raise exception 'strict 60 boundary, credit exclusion or hotel identity failed';end if;
 select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='issued';
 if row->>'count'<>'6' or row->>'amount'<>'1320.00' then raise exception 'cohort lost cleared invoices/credits or included child/out-of-period';end if;
 select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='billed';if row->>'count'<>'2' or row->>'amount'<>'800.00' then raise exception 'actual billed cohort incorrect';end if;
 select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='unbilled';if row->>'count'<>'1' or row->>'amount'<>'200.00' then raise exception 'billed/unbilled cohort mixed current balance and original value';end if;
 select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='credit';if row->>'count'<>'1' or row->>'amount'<>'-30.00' then raise exception 'period credit disappeared';end if;
 r:=public.ar_dashboard_management(actor,d-90,d,null,null,'SYNTHETIC_MANAGEMENT');
 if jsonb_array_length(r->'accountsOver60')<>2 then raise exception 'cross-hotel identical IDs combined';end if;
 update public.ar_invoice_workflow set account_setup_required=true where hotel='KAT' and account_id=scope and invoice_id='F';
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',scope);select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='setup';if row->>'count'<>'1' or row->>'amount'<>'250.00' then raise exception 'complete inherited rules incorrectly required Account confirmation';end if;
 select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='not_required';if row->>'count'<>'1' or row->>'amount'<>'100.00' then raise exception 'inherited billing-not-required cohort unavailable';end if;
 update public.ar_invoice_workflow set credit_term=null where hotel='KAT' and account_id=scope and invoice_id='F';
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',scope);select x into row from jsonb_array_elements(r->'cohort')x where x->>'key'='setup';if row->>'count'<>'2' or row->>'amount'<>'350.00' then raise exception 'incomplete inherited term incorrectly made usable';end if;
 update public.ar_invoice_workflow set credit_term=30 where hotel='KAT' and account_id=scope and invoice_id='F';
 update public.ar_invoice_workflow set account_setup_required=false where hotel='KAT' and account_id=scope and invoice_id='F';
 update public.ar_invoices set age=null where hotel='KAT' and account_id=scope and id='D';
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',scope);if r->>'agesComplete'<>'false' or r->'accountsOver60'<>'null'::jsonb or r->'hotels'->0->'bands'->0->'amount'<>'null'::jsonb then raise exception 'missing age became zero';end if;
 update public.ar_invoices set age=70,verification_state='missing' where hotel='KAT' and account_id=scope and id='D';
 r:=public.ar_dashboard_management(actor,d-90,d,'KAT',scope);if r->>'complete'<>'false' or r->'hotels'->0->'amount'<>'null'::jsonb then raise exception 'unverified credit became exact net';end if;
 r:=public.ar_dashboard_management(actor,date '1902-01-01',date '1902-01-02','KAT',scope);if r->>'mode'<>'unavailable' or r->>'complete'<>'false' then raise exception 'current data substituted for missing snapshot';end if;
 r:=public.ar_dashboard_management(actor,d,d,'KhaoLak',null,'SYNTHETIC_MANAGEMENT');if jsonb_array_length(r->'hotels')<>4 or r::text like '%Synthetic management%' then raise exception 'region scope leaked';end if;
end$$;
rollback;
